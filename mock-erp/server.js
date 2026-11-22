/**
 * Mock ERP Accounting & Purchase Order HTTP Service
 * Provides secure, loopback-only REST endpoints for Vendor Master and Invoices Ledger.
 */

const http = require('node:http');
const { db } = require('./database');

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB hard DoS cap
const DEFAULT_PORT = 3002;
const DEFAULT_HOST = process.env.HOST || '127.0.0.1';

function getRequiredApiKey() {
  return (process.env.ERP_API_KEY || '').trim();
}

/**
 * Creates the HTTP server instance.
 */
function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const method = req.method.toUpperCase();

    // Helper for JSON responses
    const sendJson = (statusCode, payload) => {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(payload));
    };

    // 1. Healthcheck (Public on loopback)
    if (method === 'GET' && url.pathname === '/health') {
      return sendJson(200, {
        status: 'UP',
        service: 'Mock ERP Accounting Service',
        timestamp: new Date().toISOString(),
        host: DEFAULT_HOST
      });
    }

    // 2. Authentication Gate (Fail-Closed, Requires Non-Empty Configured Secret)
    const expectedApiKey = getRequiredApiKey();
    const apiKey = (req.headers['x-erp-api-key'] || '').trim();
    if (!expectedApiKey || !apiKey || apiKey !== expectedApiKey) {
      return sendJson(401, {
        error: 'Unauthorized',
        message: 'Missing, empty, or invalid x-erp-api-key authentication header.'
      });
    }

    // 3. Routing
    // GET /api/vendors/:id
    const vendorMatch = url.pathname.match(/^\/api\/vendors\/([a-zA-Z0-9_-]+)$/);
    if (method === 'GET' && vendorMatch) {
      const vendorId = vendorMatch[1];
      const vendor = db.getVendor(vendorId);
      if (!vendor) {
        return sendJson(404, { error: 'NotFound', message: `Vendor ${vendorId} not found.` });
      }
      return sendJson(200, vendor);
    }

    // GET /api/purchase-orders/:poNumber
    const poMatch = url.pathname.match(/^\/api\/purchase-orders\/([a-zA-Z0-9_-]+)$/);
    if (method === 'GET' && poMatch) {
      const poNumber = poMatch[1];
      const po = db.getPurchaseOrder(poNumber);
      if (!po) {
        return sendJson(404, { error: 'NotFound', message: `Purchase Order ${poNumber} not found.` });
      }
      return sendJson(200, po);
    }

    // GET /api/invoices/audit-log
    if (method === 'GET' && url.pathname === '/api/invoices/audit-log') {
      return sendJson(200, {
        count: db.getAuditLogs().length,
        audit_logs: db.getAuditLogs()
      });
    }

    // GET /api/notifications
    if (method === 'GET' && url.pathname === '/api/notifications') {
      return sendJson(200, {
        count: db.getNotifications().length,
        notifications: db.getNotifications()
      });
    }

    // POST /api/notifications (Mock Notification Ingestion)
    if (method === 'POST' && url.pathname === '/api/notifications') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let notificationData = {};
        try {
          notificationData = body ? JSON.parse(body) : {};
        } catch (_) {}
        const recorded = db.addNotification(notificationData);
        return sendJson(201, {
          status: 'NOTIFICATION_DELIVERED',
          notification: recorded
        });
      });
      return;
    }

    // POST /api/reset (Test Isolation)
    if (method === 'POST' && url.pathname === '/api/reset') {
      db.reset();
      return sendJson(200, { status: 'RESET_COMPLETE', message: 'Mock ERP database reset to baseline seed state.' });
    }

    // POST /api/invoices (Ingest & Record Invoice)
    if (method === 'POST' && url.pathname === '/api/invoices') {
      // Content-Type validation
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        return sendJson(415, {
          error: 'UnsupportedMediaType',
          message: 'Content-Type must be application/json.'
        });
      }

      let body = '';
      let bytesReceived = 0;

      req.on('data', chunk => {
        bytesReceived += chunk.length;
        if (bytesReceived > MAX_PAYLOAD_BYTES) {
          req.pause();
          if (!res.headersSent) {
            sendJson(413, {
              error: 'PayloadTooLarge',
              message: `Request body exceeds maximum allowed size of ${MAX_PAYLOAD_BYTES} bytes.`
            });
          }
          return;
        }
        body += chunk;
      });

      req.on('end', () => {
        if (bytesReceived > MAX_PAYLOAD_BYTES) {
          return; // Already responded with 413
        }
        let invoiceData;
        try {
          invoiceData = JSON.parse(body);
        } catch (err) {
          return sendJson(400, {
            error: 'BadRequest',
            message: 'Malformed JSON payload.'
          });
        }

        const { fingerprint } = invoiceData;
        if (!fingerprint) {
          return sendJson(400, {
            error: 'BadRequest',
            message: 'fingerprint is required for idempotent invoice recording.'
          });
        }

        // Idempotency check: If already recorded, return existing record
        if (db.hasFingerprint(fingerprint)) {
          const existing = db.getInvoiceByFingerprint(fingerprint);
          return sendJson(200, {
            status: 'IDEMPOTENT_DUPLICATE_ACCEPTED',
            message: 'Invoice already processed. Returning cached ledger record.',
            record: existing
          });
        }

        const recorded = db.recordInvoice(invoiceData);
        return sendJson(201, {
          status: 'INVOICE_RECORDED',
          message: 'Invoice successfully ingested and recorded in ERP ledger.',
          record: recorded
        });
      });

      return;
    }

    // Route not found
    return sendJson(404, {
      error: 'NotFound',
      message: `Endpoint ${method} ${url.pathname} not recognized.`
    });
  });
}

function start(port = DEFAULT_PORT, host = DEFAULT_HOST) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`Mock ERP Accounting Service running on http://${host}:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// Standalone execution
if (require.main === module) {
  const port = process.env.ERP_PORT ? parseInt(process.env.ERP_PORT, 10) : DEFAULT_PORT;
  start(port, DEFAULT_HOST);
}

module.exports = { createServer, start, DEFAULT_PORT, DEFAULT_HOST, getRequiredApiKey };
