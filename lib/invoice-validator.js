/**
 * Invoice Validator & Math Integrity Engine
 * Validates invoice schema, line-item arithmetic, and tax calculations.
 */

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validates invoice payload schema and mathematical consistency.
 * @param {Object} invoice - Raw invoice object
 * @returns {Object} Normalized invoice with validation metadata
 */
function validateInvoice(invoice) {
  if (!invoice || typeof invoice !== 'object') {
    throw new ValidationError('Invoice payload must be a non-null object', 'payload');
  }

  // Required top-level fields
  const requiredFields = [
    'invoice_number',
    'vendor_id',
    'invoice_date',
    'due_date',
    'currency',
    'line_items',
    'subtotal',
    'tax_amount',
    'total_amount',
    'bank_details'
  ];

  for (const field of requiredFields) {
    if (invoice[field] === undefined || invoice[field] === null || invoice[field] === '') {
      throw new ValidationError(`Missing required field: ${field}`, field);
    }
  }

  // Type & format checks
  if (typeof invoice.invoice_number !== 'string' || invoice.invoice_number.trim().length === 0) {
    throw new ValidationError('invoice_number must be a non-empty string', 'invoice_number');
  }

  if (typeof invoice.vendor_id !== 'string' || invoice.vendor_id.trim().length === 0) {
    throw new ValidationError('vendor_id must be a non-empty string', 'vendor_id');
  }

  // Dates validation
  const invoiceDate = new Date(invoice.invoice_date);
  const dueDate = new Date(invoice.due_date);

  if (isNaN(invoiceDate.getTime())) {
    throw new ValidationError('Invalid invoice_date format', 'invoice_date');
  }
  if (isNaN(dueDate.getTime())) {
    throw new ValidationError('Invalid due_date format', 'due_date');
  }
  if (dueDate < invoiceDate) {
    throw new ValidationError('due_date cannot be earlier than invoice_date', 'due_date');
  }

  // Currency check
  const allowedCurrencies = ['USD', 'EUR', 'GBP', 'CAD'];
  if (!allowedCurrencies.includes(invoice.currency.toUpperCase())) {
    throw new ValidationError(`Unsupported currency: ${invoice.currency}. Must be one of ${allowedCurrencies.join(', ')}`, 'currency');
  }

  // Line items validation
  if (!Array.isArray(invoice.line_items) || invoice.line_items.length === 0) {
    throw new ValidationError('line_items must be a non-empty array', 'line_items');
  }

  let calculatedSubtotal = 0;
  invoice.line_items.forEach((item, index) => {
    if (!item.description || typeof item.description !== 'string') {
      throw new ValidationError(`Line item [${index}] must have a valid description`, `line_items[${index}].description`);
    }

    const qty = Number(item.quantity);
    const unitPrice = Number(item.unit_price);

    if (isNaN(qty) || qty <= 0) {
      throw new ValidationError(`Line item [${index}] quantity must be a positive number`, `line_items[${index}].quantity`);
    }

    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new ValidationError(`Line item [${index}] unit_price must be a non-negative number`, `line_items[${index}].unit_price`);
    }

    calculatedSubtotal += qty * unitPrice;
  });

  calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;

  const declaredSubtotal = Number(invoice.subtotal);
  const declaredTax = Number(invoice.tax_amount);
  const declaredTotal = Number(invoice.total_amount);

  if (isNaN(declaredSubtotal) || declaredSubtotal < 0) {
    throw new ValidationError('subtotal must be a non-negative number', 'subtotal');
  }
  if (isNaN(declaredTax) || declaredTax < 0) {
    throw new ValidationError('tax_amount must be a non-negative number', 'tax_amount');
  }
  if (isNaN(declaredTotal) || declaredTotal <= 0) {
    throw new ValidationError('total_amount must be a positive number', 'total_amount');
  }

  // Math reconciliation (tolerance: $0.01)
  if (Math.abs(calculatedSubtotal - declaredSubtotal) > 0.01) {
    throw new ValidationError(
      `Line item total mismatch: calculated $${calculatedSubtotal} vs declared subtotal $${declaredSubtotal}`,
      'subtotal'
    );
  }

  const expectedTotal = Math.round((declaredSubtotal + declaredTax) * 100) / 100;
  if (Math.abs(expectedTotal - declaredTotal) > 0.01) {
    throw new ValidationError(
      `Total reconciliation mismatch: subtotal + tax ($${expectedTotal}) does not match declared total ($${declaredTotal})`,
      'total_amount'
    );
  }

  // Bank details verification
  if (typeof invoice.bank_details !== 'object' || !invoice.bank_details.account_number) {
    throw new ValidationError('bank_details must include account_number', 'bank_details.account_number');
  }

  return {
    valid: true,
    normalized: {
      ...invoice,
      currency: invoice.currency.toUpperCase(),
      subtotal: declaredSubtotal,
      tax_amount: declaredTax,
      total_amount: declaredTotal,
      line_items: invoice.line_items.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        amount: Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100
      }))
    }
  };
}

module.exports = {
  validateInvoice,
  ValidationError
};
