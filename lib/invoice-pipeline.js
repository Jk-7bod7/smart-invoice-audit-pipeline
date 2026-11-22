/**
 * Master Invoice Audit & Triage Pipeline Coordinator
 * Coordinates validation, ERP master data lookup, PO matching, anomaly scoring, and ledger recording.
 */

const { validateInvoice } = require('./invoice-validator');
const { AnomalyDetector } = require('./anomaly-detector');
const { POMatcher } = require('./po-matcher');
const http = require('node:http');

class InvoiceAuditPipeline {
  constructor(options = {}) {
    this.erpHost = options.erpHost || '127.0.0.1';
    this.erpPort = options.erpPort || 3002;
    this.erpApiKey = (options.erpApiKey || process.env.ERP_API_KEY || '').trim();
    this.processedFingerprints = new Set();
  }

  /**
   * Internal helper to make HTTP requests to the Mock ERP service.
   */
  async _erpRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const options = {
        hostname: this.erpHost,
        port: this.erpPort,
        path,
        method,
        headers: {
          'x-erp-api-key': this.erpApiKey,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      };

      const req = http.request(options, res => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const parsed = responseBody ? JSON.parse(responseBody) : {};
            resolve({ statusCode: res.statusCode, data: parsed });
          } catch (err) {
            resolve({ statusCode: res.statusCode, data: { raw: responseBody } });
          }
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  /**
   * Processes an incoming invoice through the entire multi-stage audit pipeline.
   * @param {Object} rawInvoice - Inbound invoice payload
   * @returns {Object} Comprehensive audit and triage decision report
   */
  async processInvoice(rawInvoice) {
    const startTime = Date.now();

    // Stage 1: Schema & Mathematical Validation
    const validationResult = validateInvoice(rawInvoice);
    const invoice = validationResult.normalized;

    // Stage 2: ERP Vendor Master Data Lookup
    const vendorRes = await this._erpRequest('GET', `/api/vendors/${invoice.vendor_id}`);
    const vendorMaster = vendorRes.statusCode === 200 ? vendorRes.data : null;

    // Stage 3: Two-Way Purchase Order Matching
    let poMatchResult = null;
    if (invoice.po_number) {
      const poRes = await this._erpRequest('GET', `/api/purchase-orders/${invoice.po_number}`);
      const poRecord = poRes.statusCode === 200 ? poRes.data : null;
      poMatchResult = POMatcher.match(invoice, poRecord);
    } else {
      poMatchResult = {
        matched: false,
        status: 'NO_PO_PROVIDED',
        message: 'No purchase order number was specified on this invoice.',
        requires_review: true
      };
    }

    // Stage 4: Anomaly & Fraud Detection Engine
    const anomalyReport = AnomalyDetector.evaluate(invoice, vendorMaster, this.processedFingerprints);

    // Stage 5: Decision Synthesis & Routing
    let finalDecision = anomalyReport.decision;
    const flags = [...anomalyReport.anomalies];

    // If PO check failed or overrun, ensure it requires audit or rejection
    if (!poMatchResult.matched) {
      if (finalDecision !== 'REJECTED_FRAUD_ALERT') {
        finalDecision = 'MANUAL_AUDIT_REQUIRED';
      }
      flags.push({
        code: `PO_${poMatchResult.status}`,
        severity: poMatchResult.status === 'BUDGET_OVERRUN' ? 'HIGH' : 'MEDIUM',
        message: poMatchResult.message
      });
    }

    // Stage 6: Idempotent Ledger Recording in ERP
    const ledgerRecordPayload = {
      fingerprint: anomalyReport.fingerprint,
      invoice_number: invoice.invoice_number,
      vendor_id: invoice.vendor_id,
      po_number: invoice.po_number || null,
      currency: invoice.currency || 'USD',
      subtotal: invoice.subtotal,
      tax_amount: invoice.tax_amount,
      total_amount: invoice.total_amount,
      due_date: invoice.due_date || null,
      invoice_date: invoice.invoice_date || null,
      bank_details: invoice.bank_details || null,
      line_items: invoice.line_items || null,
      decision: finalDecision,
      risk_score: anomalyReport.risk_score,
      risk_tier: anomalyReport.risk_tier,
      approval_tier: anomalyReport.approval_tier,
      anomalies: flags,
      po_match: poMatchResult,
      processed_duration_ms: Date.now() - startTime
    };

    const erpPostRes = await this._erpRequest('POST', '/api/invoices', ledgerRecordPayload);
    const isDuplicate = erpPostRes.data && erpPostRes.data.is_duplicate;
    const isConflict = erpPostRes.data && erpPostRes.data.is_conflict;

    if (isConflict) {
      finalDecision = 'REJECTED_FRAUD_ALERT';
      flags.push({
        code: 'CONFLICTING_IDENTITY_DETECTED',
        severity: 'CRITICAL',
        message: 'Invoice submitted with identity matching existing invoice but conflicting data.'
      });
    }

    // Stage 7: Mock Notification Delivery (Zero duplicate alert storm on replay)
    if (!isDuplicate) {
      if (finalDecision === 'REJECTED_FRAUD_ALERT') {
        await this._erpRequest('POST', '/api/notifications', {
          channel: '#sec-fraud-alerts',
          type: 'CRITICAL_FRAUD',
          invoice_number: invoice.invoice_number,
          message: `CRITICAL AP FRAUD ALERT: Invoice #${invoice.invoice_number} from Vendor ${invoice.vendor_id} rejected. Flags: ${flags.map(f => f.code || f).join(', ')}`,
          metadata: { invoice_number: invoice.invoice_number, vendor_id: invoice.vendor_id }
        });
      } else if (finalDecision === 'MANUAL_AUDIT_REQUIRED') {
        await this._erpRequest('POST', '/api/notifications', {
          channel: '#ap-audit-queue',
          type: 'MANUAL_AUDIT',
          invoice_number: invoice.invoice_number,
          message: `AP Manual Review Required: Invoice #${invoice.invoice_number} ($${invoice.total_amount}) needs approval.`,
          metadata: { invoice_number: invoice.invoice_number, vendor_id: invoice.vendor_id }
        });
      }
    }

    // Track fingerprint in memory cache
    this.processedFingerprints.add(anomalyReport.fingerprint);

    return {
      status: 'AUDIT_COMPLETE',
      decision: finalDecision,
      fingerprint: anomalyReport.fingerprint,
      risk_score: anomalyReport.risk_score,
      risk_tier: anomalyReport.risk_tier,
      approval_tier: anomalyReport.approval_tier,
      po_matching: poMatchResult,
      anomalies: flags,
      ledger_status: erpPostRes.statusCode,
      ledger_response: erpPostRes.data,
      execution_time_ms: Date.now() - startTime
    };
  }
}

module.exports = { InvoiceAuditPipeline };
