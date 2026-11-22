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
    this.erpApiKey = options.erpApiKey || 'erp_secret_test_key_8899aabbcc';
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
      total_amount: invoice.total_amount,
      currency: invoice.currency,
      decision: finalDecision,
      risk_score: anomalyReport.risk_score,
      risk_tier: anomalyReport.risk_tier,
      approval_tier: anomalyReport.approval_tier,
      anomalies: flags,
      po_match: poMatchResult,
      processed_duration_ms: Date.now() - startTime
    };

    const erpPostRes = await this._erpRequest('POST', '/api/invoices', ledgerRecordPayload);

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
