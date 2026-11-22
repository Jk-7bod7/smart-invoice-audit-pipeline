/**
 * Mock ERP Database Store
 * In-memory / file-backed persistent data store for Vendor Master, POs, and Invoice Ledgers.
 */

class MockERPDatabase {
  constructor() {
    this.reset();
  }

  /**
   * Resets database to baseline seed state.
   */
  reset() {
    this.vendors = new Map([
      [
        'VEND-001',
        {
          vendor_id: 'VEND-001',
          name: 'Acme Cloud Infrastructure Inc',
          tax_id: 'US-EIN-123456789',
          bank_account_number: 'US-BANK-99887711',
          routing_number: '021000021',
          status: 'ACTIVE',
          payment_terms: 'NET_30'
        }
      ],
      [
        'VEND-002',
        {
          vendor_id: 'VEND-002',
          name: 'Global Logistics & Supply Chain LLC',
          tax_id: 'US-EIN-987654321',
          bank_account_number: 'US-BANK-44332211',
          routing_number: '121000358',
          status: 'ACTIVE',
          payment_terms: 'NET_60'
        }
      ],
      [
        'VEND-003',
        {
          vendor_id: 'VEND-003',
          name: 'Apex Strategic Enterprise Systems',
          tax_id: 'US-EIN-554433221',
          bank_account_number: 'US-BANK-11223344',
          routing_number: '071000013',
          status: 'ACTIVE',
          payment_terms: 'NET_15'
        }
      ]
    ]);

    this.purchaseOrders = new Map([
      [
        'PO-2026-101',
        {
          po_number: 'PO-2026-101',
          vendor_id: 'VEND-001',
          currency: 'USD',
          total_amount: 1850.00,
          status: 'APPROVED',
          description: 'Q4 Cloud Compute & Hosting Allocation',
          created_at: '2026-10-01T00:00:00Z'
        }
      ],
      [
        'PO-2026-102',
        {
          po_number: 'PO-2026-102',
          vendor_id: 'VEND-002',
          currency: 'USD',
          total_amount: 12500.00,
          status: 'APPROVED',
          description: 'Regional Warehousing and Fulfillment Retainer',
          created_at: '2026-10-15T00:00:00Z'
        }
      ],
      [
        'PO-2026-103',
        {
          po_number: 'PO-2026-103',
          vendor_id: 'VEND-003',
          currency: 'USD',
          total_amount: 55000.00,
          status: 'APPROVED',
          description: 'Enterprise ERP Architecture Migration Milestone 1',
          created_at: '2026-11-01T00:00:00Z'
        }
      ],
      [
        'PO-2026-EXHAUSTED',
        {
          po_number: 'PO-2026-EXHAUSTED',
          vendor_id: 'VEND-001',
          currency: 'USD',
          total_amount: 5000.00,
          status: 'CLOSED',
          description: 'Legacy Expired PO',
          created_at: '2026-01-01T00:00:00Z'
        }
      ]
    ]);

    this.invoices = new Map();
    this.fingerprints = new Set();
    this.auditLogs = [];
    this.notifications = [];
  }

  getVendor(vendorId) {
    if (!vendorId) return null;
    return this.vendors.get(vendorId.trim().toUpperCase()) || null;
  }

  getPurchaseOrder(poNumber) {
    if (!poNumber) return null;
    return this.purchaseOrders.get(poNumber.trim().toUpperCase()) || null;
  }

  getInvoiceByFingerprint(fingerprint) {
    return this.invoices.get(fingerprint) || null;
  }

  hasFingerprint(fingerprint) {
    return this.fingerprints.has(fingerprint);
  }

  recordInvoice(invoiceRecord) {
    const { fingerprint } = invoiceRecord;
    this.invoices.set(fingerprint, {
      ...invoiceRecord,
      recorded_at: new Date().toISOString()
    });
    this.fingerprints.add(fingerprint);

    this.addAuditLog({
      action: 'INVOICE_RECORDED',
      invoice_number: invoiceRecord.invoice_number,
      vendor_id: invoiceRecord.vendor_id,
      decision: invoiceRecord.decision,
      risk_score: invoiceRecord.risk_score,
      total_amount: invoiceRecord.total_amount,
      fingerprint
    });

    return this.invoices.get(fingerprint);
  }

  addAuditLog(entry) {
    const logEntry = {
      log_id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.auditLogs.push(logEntry);
    return logEntry;
  }

  getAuditLogs() {
    return [...this.auditLogs];
  }

  addNotification(notification) {
    const record = {
      notification_id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      channel: notification.channel || '#general',
      type: notification.type || 'INFO',
      message: notification.message || '',
      metadata: notification.metadata || {}
    };
    this.notifications.push(record);
    this.addAuditLog({
      action: 'NOTIFICATION_DISPATCHED',
      channel: record.channel,
      type: record.type,
      message: record.message
    });
    return record;
  }

  getNotifications() {
    return [...this.notifications];
  }
}

// Singleton instance
const db = new MockERPDatabase();

module.exports = { MockERPDatabase, db };
