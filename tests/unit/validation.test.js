/**
 * Unit Tests: Invoice Schema & Math Validation
 */

const assert = require('node:assert');
const { validateInvoice, ValidationError } = require('../../lib/invoice-validator');

console.log('--- Running Unit Tests: Invoice Schema & Math Validation ---');

const baseValidInvoice = {
  invoice_number: 'INV-VALID-100',
  vendor_id: 'VEND-001',
  invoice_date: '2026-11-01T00:00:00Z',
  due_date: '2026-12-01T00:00:00Z',
  currency: 'USD',
  line_items: [
    { description: 'Cloud Engine Core', quantity: 2, unit_price: 500.00 },
    { description: 'Memory Allocation', quantity: 4, unit_price: 125.00 }
  ],
  subtotal: 1500.00,
  tax_amount: 150.00,
  total_amount: 1650.00,
  bank_details: {
    account_number: 'US-BANK-99887711',
    routing_number: '021000021'
  }
};

// Test 1: Valid invoice passes normalization
{
  const res = validateInvoice(baseValidInvoice);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.normalized.subtotal, 1500.00);
  assert.strictEqual(res.normalized.total_amount, 1650.00);
  console.log('✓ Test 1 Passed: Valid invoice normalized cleanly');
}

// Test 2: Line item arithmetic mismatch detected
{
  const invalidMathInvoice = {
    ...baseValidInvoice,
    subtotal: 1400.00 // Intentionally incorrect
  };
  assert.throws(
    () => validateInvoice(invalidMathInvoice),
    err => err instanceof ValidationError && err.field === 'subtotal'
  );
  console.log('✓ Test 2 Passed: Line-item math discrepancy correctly rejected');
}

// Test 3: Total reconciliation mismatch detected
{
  const invalidTotalInvoice = {
    ...baseValidInvoice,
    total_amount: 1700.00 // 1500 + 150 should be 1650, not 1700
  };
  assert.throws(
    () => validateInvoice(invalidTotalInvoice),
    err => err instanceof ValidationError && err.field === 'total_amount'
  );
  console.log('✓ Test 3 Passed: Subtotal + Tax vs Total mismatch correctly rejected');
}

// Test 4: Inverted dates rejected (due_date < invoice_date)
{
  const invertedDateInvoice = {
    ...baseValidInvoice,
    invoice_date: '2026-12-01T00:00:00Z',
    due_date: '2026-11-01T00:00:00Z'
  };
  assert.throws(
    () => validateInvoice(invertedDateInvoice),
    err => err instanceof ValidationError && err.field === 'due_date'
  );
  console.log('✓ Test 4 Passed: Due date earlier than invoice date rejected');
}

// Test 5: Missing required field rejected
{
  const missingFieldInvoice = { ...baseValidInvoice };
  delete missingFieldInvoice.bank_details;
  assert.throws(
    () => validateInvoice(missingFieldInvoice),
    err => err instanceof ValidationError && err.field === 'bank_details'
  );
  console.log('✓ Test 5 Passed: Missing required field throws ValidationError');
}

console.log('All Unit Tests (Invoice Validation) Passed Successfully.\n');
