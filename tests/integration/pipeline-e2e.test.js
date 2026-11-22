/**
 * Integration Tests: Full End-to-End Invoice Audit Pipeline
 * Tests multi-stage pipeline flow: Validation -> Vendor Lookup -> PO Match -> Anomaly Check -> ERP Sync.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');
const { start } = require('../../mock-erp/server');
const { db } = require('../../mock-erp/database');
const { InvoiceAuditPipeline } = require('../../lib/invoice-pipeline');

const TEST_PORT = 3089;
const TEST_HOST = '127.0.0.1';

(async () => {
  console.log('--- Running Integration Tests: Full Invoice Audit Pipeline E2E ---');
  let server;

  try {
    server = await start(TEST_PORT, TEST_HOST);
    db.reset();

    const pipeline = new InvoiceAuditPipeline({
      erpHost: TEST_HOST,
      erpPort: TEST_PORT
    });

    const cleanInvoice = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../sample-data/valid-clean-invoice.json'), 'utf8')
    );
    const fraudInvoice = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../sample-data/bank-mismatch-fraud-invoice.json'), 'utf8')
    );
    const overrunInvoice = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../sample-data/budget-overrun-invoice.json'), 'utf8')
    );

    // Scenario 1: Clean Valid Invoice matches PO and Auto-Approves
    {
      const res = await pipeline.processInvoice(cleanInvoice);
      assert.strictEqual(res.decision, 'AUTO_APPROVED');
      assert.strictEqual(res.risk_tier, 'LOW');
      assert.strictEqual(res.po_matching.matched, true);
      assert.strictEqual(res.po_matching.status, 'MATCHED_UNDER_BUDGET');
      console.log('✓ Scenario 1 Passed: Clean invoice successfully AUTO_APPROVED and matched with PO');
    }

    // Scenario 2: Spoofed Bank Account triggers Critical Fraud Alert
    {
      const res = await pipeline.processInvoice(fraudInvoice);
      assert.strictEqual(res.decision, 'REJECTED_FRAUD_ALERT');
      assert.strictEqual(res.risk_tier, 'CRITICAL');
      assert(res.anomalies.some(a => a.code === 'VENDOR_BANK_ACCOUNT_MISMATCH'));
      console.log('✓ Scenario 2 Passed: Divergent bank account successfully caught by BEC defense');
    }

    // Scenario 3: Budget Overrun triggers Manual Audit
    {
      const res = await pipeline.processInvoice(overrunInvoice);
      assert.strictEqual(res.decision, 'MANUAL_AUDIT_REQUIRED');
      assert.strictEqual(res.po_matching.matched, false);
      assert(res.anomalies.some(a => a.code === 'PO_BUDGET_OVERRUN'));
      console.log('✓ Scenario 3 Passed: PO budget overrun routed to MANUAL_AUDIT_REQUIRED');
    }

    // Scenario 4: Re-submitting Clean Invoice triggers Duplicate Fraud Alert
    {
      const res = await pipeline.processInvoice(cleanInvoice);
      assert.strictEqual(res.decision, 'REJECTED_FRAUD_ALERT');
      assert(res.anomalies.some(a => a.code === 'DUPLICATE_INVOICE_SUBMISSION'));
      console.log('✓ Scenario 4 Passed: Duplicate invoice submission blocked with fraud rejection');
    }

    // Scenario 5: Audit Log Integrity Verification
    {
      const auditLogs = db.getAuditLogs();
      assert(auditLogs.length >= 3, `Expected at least 3 audit logs, found ${auditLogs.length}`);
      assert(auditLogs.some(log => log.decision === 'AUTO_APPROVED'));
      assert(auditLogs.some(log => log.decision === 'REJECTED_FRAUD_ALERT'));
      console.log(`✓ Scenario 5 Passed: Auditable transaction trail verified (${auditLogs.length} events logged)`);
    }

    console.log('All Pipeline E2E Integration Tests Passed Successfully.\n');
  } catch (err) {
    console.error('Pipeline E2E Test Failure:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
})();
