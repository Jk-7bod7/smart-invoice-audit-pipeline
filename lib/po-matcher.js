/**
 * Two-Way Purchase Order (PO) Matching Engine
 * Validates invoice against approved purchase orders with tolerance thresholds.
 */

class POMatcher {
  /**
   * Matches an invoice against a Purchase Order record.
   * @param {Object} invoice - Validated invoice object
   * @param {Object} purchaseOrder - PO record from ERP (or null)
   * @param {Object} options - Matching configuration (tolerance percentage and ceiling)
   * @returns {Object} PO matching result
   */
  static match(invoice, purchaseOrder, options = {}) {
    const tolerancePercent = options.tolerancePercent !== undefined ? options.tolerancePercent : 1.0; // 1%
    const toleranceMaxAmount = options.toleranceMaxAmount !== undefined ? options.toleranceMaxAmount : 25.0; // $25 max tolerance

    if (!purchaseOrder) {
      return {
        matched: false,
        status: 'PO_NOT_FOUND',
        po_number: invoice.po_number || null,
        message: `Purchase Order ${invoice.po_number || 'NONE'} was not found in ERP records.`,
        requires_review: true,
        variance_amount: 0,
        variance_percent: 0
      };
    }

    // 1. PO Status Check
    const activeStatuses = ['OPEN', 'APPROVED', 'PARTIALLY_FULFILLED'];
    if (!activeStatuses.includes(purchaseOrder.status?.toUpperCase())) {
      return {
        matched: false,
        status: 'PO_INACTIVE',
        po_number: purchaseOrder.po_number,
        message: `Purchase Order ${purchaseOrder.po_number} is in ${purchaseOrder.status} state (must be OPEN or APPROVED).`,
        requires_review: true,
        variance_amount: 0,
        variance_percent: 0
      };
    }

    // 2. Vendor ID Matching
    if (purchaseOrder.vendor_id.trim().toUpperCase() !== invoice.vendor_id.trim().toUpperCase()) {
      return {
        matched: false,
        status: 'VENDOR_MISMATCH',
        po_number: purchaseOrder.po_number,
        message: `PO vendor (${purchaseOrder.vendor_id}) does not match invoice vendor (${invoice.vendor_id}).`,
        requires_review: true,
        variance_amount: 0,
        variance_percent: 0
      };
    }

    // 3. Currency Matching
    if (purchaseOrder.currency.toUpperCase() !== invoice.currency.toUpperCase()) {
      return {
        matched: false,
        status: 'CURRENCY_MISMATCH',
        po_number: purchaseOrder.po_number,
        message: `PO currency (${purchaseOrder.currency}) does not match invoice currency (${invoice.currency}).`,
        requires_review: true,
        variance_amount: 0,
        variance_percent: 0
      };
    }

    // 4. Amount Matching & Tolerance Calculation
    const poBudget = Number(purchaseOrder.total_amount || 0);
    const invoiceTotal = Number(invoice.total_amount || 0);
    const varianceAmount = Math.round((invoiceTotal - poBudget) * 100) / 100;
    const variancePercent = poBudget > 0 ? Math.round(((invoiceTotal - poBudget) / poBudget) * 10000) / 100 : 100;

    // Invoiced within PO budget
    if (invoiceTotal <= poBudget) {
      const remainingBalance = Math.round((poBudget - invoiceTotal) * 100) / 100;
      return {
        matched: true,
        status: 'MATCHED_UNDER_BUDGET',
        po_number: purchaseOrder.po_number,
        po_budget: poBudget,
        invoice_total: invoiceTotal,
        variance_amount: varianceAmount,
        variance_percent: variancePercent,
        remaining_po_balance: remainingBalance,
        message: `Invoice matches PO ${purchaseOrder.po_number} within approved budget ($${remainingBalance} remaining).`,
        requires_review: false
      };
    }

    // Invoiced over PO budget - Evaluate tolerance
    const allowableToleranceDollars = Math.min((poBudget * tolerancePercent) / 100, toleranceMaxAmount);

    if (varianceAmount <= allowableToleranceDollars) {
      return {
        matched: true,
        status: 'MATCHED_WITHIN_TOLERANCE',
        po_number: purchaseOrder.po_number,
        po_budget: poBudget,
        invoice_total: invoiceTotal,
        variance_amount: varianceAmount,
        variance_percent: variancePercent,
        allowable_tolerance: allowableToleranceDollars,
        message: `Invoice exceeds PO by $${varianceAmount} (${variancePercent}%), which is within approved ${tolerancePercent}% tolerance.`,
        requires_review: true // Still flagged for review due to variance
      };
    }

    // Unacceptable Overrun
    return {
      matched: false,
      status: 'BUDGET_OVERRUN',
      po_number: purchaseOrder.po_number,
      po_budget: poBudget,
      invoice_total: invoiceTotal,
      variance_amount: varianceAmount,
      variance_percent: variancePercent,
      allowable_tolerance: allowableToleranceDollars,
      message: `Invoice exceeds PO budget by $${varianceAmount} (${variancePercent}%), surpassing allowable tolerance of $${allowableToleranceDollars}.`,
      requires_review: true
    };
  }
}

module.exports = { POMatcher };
