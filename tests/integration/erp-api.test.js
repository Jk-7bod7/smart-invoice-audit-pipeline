/**
 * Integration Tests: Mock ERP REST API & Idempotent Ledger Storage
 */

const assert = require('node:assert');
const http = require('node:http');
const { start, EXPECTED_API_KEY } = require('../../mock-erp/server');
const { db } = require('../../mock-erp/database');

const TEST_PORT = 3088;
const TEST_HOST = '127.0.0.1';

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: TEST_HOST,
        port: TEST_PORT,
        path,
        method,
        headers: {
          'x-erp-api-key': EXPECTED_API_KEY,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      res => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          let data = {};
          try { data = JSON.parse(responseBody); } catch (_) { data = { raw: responseBody }; }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('--- Running Integration Tests: Mock ERP REST API & Idempotency ---');
  let server;

  try {
    server = await start(TEST_PORT, TEST_HOST);
    db.reset();

    // Test 1: Healthcheck
    {
      const res = await request('GET', '/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'UP');
      console.log('✓ Test 1 Passed: Mock ERP health endpoint responds 200 OK on loopback');
    }

    // Test 2: Fetch Known Vendor Master
    {
      const res = await request('GET', '/api/vendors/VEND-001');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.vendor_id, 'VEND-001');
      assert.strictEqual(res.data.bank_account_number, 'US-BANK-99887711');
      console.log('✓ Test 2 Passed: Known vendor master record retrieved');
    }

    // Test 3: Fetch Non-Existent Vendor returns 404
    {
      const res = await request('GET', '/api/vendors/VEND-GHOST-999');
      assert.strictEqual(res.status, 404);
      console.log('✓ Test 3 Passed: Non-existent vendor correctly returns HTTP 404');
    }

    // Test 4: Ingest and Record New Invoice
    const testInvoiceRecord = {
      fingerprint: 'test_hash_unique_112233',
      invoice_number: 'INV-TEST-999',
      vendor_id: 'VEND-001',
      total_amount: 1500.00,
      decision: 'AUTO_APPROVED',
      risk_score: 0
    };

    {
      const res = await request('POST', '/api/invoices', {}, testInvoiceRecord);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.status, 'INVOICE_RECORDED');
      console.log('✓ Test 4 Passed: Valid invoice successfully recorded in ERP ledger (HTTP 201)');
    }

    // Test 5: Idempotency - Re-submitting same invoice returns cached 200 OK
    {
      const res = await request('POST', '/api/invoices', {}, testInvoiceRecord);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'IDEMPOTENT_DUPLICATE_ACCEPTED');
      assert.strictEqual(res.data.record.invoice_number, 'INV-TEST-999');
      console.log('✓ Test 5 Passed: Duplicate invoice fingerprint handled idempotently (HTTP 200)');
    }

    console.log('All Integration Tests (Mock ERP API) Passed Successfully.\n');
  } catch (err) {
    console.error('Integration Test Failure:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
})();
