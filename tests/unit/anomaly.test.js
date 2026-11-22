/**
 * Unit Tests: Anomaly Detection & Two-Way PO Matching
 */

const assert = require('node:assert');
const { AnomalyDetector } = require('../../lib/anomaly-detector');
const { POMatcher } = require('../../lib/po-matcher');

console.log('--- Running Unit Tests: Anomaly Detection & PO Matching ---');

const mockVendor = {
  vendor_id: 'VEND-001',
  name: 'Acme Cloud Infrastructure Inc',
  tax_id: 'US-EIN-123456789',
  bank_account_number: 'US-BANK-99887711'
};

const mockInvoice = {
  invoice_number: 'INV-TEST-001',
  vendor_id: 'VEND-001',
  vendor_tax_id: 'US-EIN-123456789',
  subtotal: 1000.00,
  tax_amount: 100.00,
  total_amount: 1100.00,
  bank_details: {
    account_number: 'US-BANK-99887711'
  }
};

// Test 1: Clean invoice scores low risk and auto-approves
{
  const result = AnomalyDetector.evaluate(mockInvoice, mockVendor, new Set());
  assert.strictEqual(result.decision, 'AUTO_APPROVED');
  assert.strictEqual(result.risk_tier, 'LOW');
  assert.strictEqual(result.risk_score, 0);
  assert.strictEqual(result.anomalies_count, 0);
  console.log('✓ Test 1 Passed: Clean invoice receives AUTO_APPROVED status');
}

// Test 2: Duplicate invoice fingerprint triggers CRITICAL fraud alert
{
  const fingerprint = AnomalyDetector.generateFingerprint('VEND-001', 'INV-TEST-001');
  const existingFingerprints = new Set([fingerprint]);
  const result = AnomalyDetector.evaluate(mockInvoice, mockVendor, existingFingerprints);

  assert.strictEqual(result.decision, 'REJECTED_FRAUD_ALERT');
  assert.strictEqual(result.risk_tier, 'CRITICAL');
  assert(result.risk_score >= 100);
  assert(result.anomalies.some(a => a.code === 'DUPLICATE_INVOICE_SUBMISSION'));
  console.log('✓ Test 2 Passed: Duplicate invoice fingerprint triggers REJECTED_FRAUD_ALERT');
}

// Test 3: Bank account mismatch triggers CRITICAL fraud alert (BEC protection)
{
  const spoofedInvoice = {
    ...mockInvoice,
    bank_details: { account_number: 'US-ATTACKER-ACCOUNT-999' }
  };
  const result = AnomalyDetector.evaluate(spoofedInvoice, mockVendor, new Set());

  assert.strictEqual(result.decision, 'REJECTED_FRAUD_ALERT');
  assert.strictEqual(result.risk_tier, 'CRITICAL');
  assert(result.anomalies.some(a => a.code === 'VENDOR_BANK_ACCOUNT_MISMATCH'));
  console.log('✓ Test 3 Passed: Bank account mismatch triggers REJECTED_FRAUD_ALERT');
}

// Test 4: High-value threshold escalation ($50k+ CFO approval)
{
  const highValueInvoice = {
    ...mockInvoice,
    subtotal: 50000.00,
    tax_amount: 2500.00,
    total_amount: 52500.00
  };
  const result = AnomalyDetector.evaluate(highValueInvoice, mockVendor, new Set());

  assert.strictEqual(result.approval_tier, 'TIER_4_CFO_EXECUTIVE');
  assert.strictEqual(result.decision, 'MANUAL_AUDIT_REQUIRED');
  console.log('✓ Test 4 Passed: $50k+ invoice escalates to TIER_4_CFO_EXECUTIVE approval');
}

// Test 5: Two-Way PO Matcher - Under budget vs overrun
{
  const mockPO = {
    po_number: 'PO-2026-101',
    vendor_id: 'VEND-001',
    currency: 'USD',
    total_amount: 1500.00,
    status: 'APPROVED'
  };

  // Under budget
  const matchOk = POMatcher.match({ ...mockInvoice, total_amount: 1400.00, currency: 'USD' }, mockPO);
  assert.strictEqual(matchOk.matched, true);
  assert.strictEqual(matchOk.status, 'MATCHED_UNDER_BUDGET');
  assert.strictEqual(matchOk.remaining_po_balance, 100.00);

  // Over budget beyond tolerance
  const matchOver = POMatcher.match({ ...mockInvoice, total_amount: 1800.00, currency: 'USD' }, mockPO);
  assert.strictEqual(matchOver.matched, false);
  assert.strictEqual(matchOver.status, 'BUDGET_OVERRUN');
  console.log('✓ Test 5 Passed: Two-Way PO Matcher correctly identifies under-budget and overrun');
}

console.log('All Unit Tests (Anomaly & PO Matching) Passed Successfully.\n');
