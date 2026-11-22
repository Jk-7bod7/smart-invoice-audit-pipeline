/**
 * Mock ERP Database Store
 * Explicitly In-Memory (Session-Scoped Transient Store) for Vendor Master, POs, and Invoice Ledgers.
 * Note: Storage is transient and resets upon container/process restart.
 */

const crypto = require('node:crypto');

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
    this.invoicesByIdentity = new Map();
    this.fingerprints = new Set();
    this.dispatchedNotificationKeys = new Set();
    this.auditLogs = [];
    this.notifications = [];
  }

  static computeContentHash(data) {
    const payload = `${data.vendor_id || ''}|${data.invoice_number || ''}|${Number(data.total_amount || 0).toFixed(2)}|${data.currency || 'USD'}|${data.decision || ''}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
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

  evaluateOrRecordInvoice(invoiceRecord) {
    const identityKey = `${String(invoiceRecord.vendor_id || '').trim().toUpperCase()}::${String(invoiceRecord.invoice_number || '').trim().toUpperCase()}`;
    const contentHash = MockERPDatabase.computeContentHash(invoiceRecord);

    if (this.invoicesByIdentity.has(identityKey)) {
      const existing = this.invoicesByIdentity.get(identityKey);
      if (existing.contentHash === contentHash) {
        // True identical replay: Idempotent return without duplicate side-effects
        return {
          status: 'IDEMPOTENT_DUPLICATE_ACCEPTED',
          is_duplicate: true,
          is_conflict: false,
          message: 'Invoice already processed with identical data. Returning cached record.',
          record: existing.record
        };
      } else {
        // Conflicting submission with same identity but different data (e.g. modified amount, status, etc.)
        this.addAuditLog({
          action: 'CONFLICTING_IDENTITY_REJECTED',
          invoice_number: invoiceRecord.invoice_number,
          vendor_id: invoiceRecord.vendor_id,
          attempted_total: invoiceRecord.total_amount,
          existing_total: existing.record.total_amount,
          decision: 'REJECTED_FRAUD_ALERT',
          identityKey
        });
        return {
          status: 'CONFLICTING_IDENTITY_REJECTED',
          is_duplicate: false,
          is_conflict: true,
          error: 'ConflictingIdentityError',
          message: `Conflicting submission detected for existing invoice ${identityKey}. Potential tampering or duplicate billing.`,
          decision: 'REJECTED_FRAUD_ALERT',
          record: existing.record
        };
      }
    }

    const { fingerprint } = invoiceRecord;
    const finalRecord = {
      ...invoiceRecord,
      recorded_at: new Date().toISOString()
    };

    this.invoices.set(fingerprint, finalRecord);
    this.fingerprints.add(fingerprint);
    this.invoicesByIdentity.set(identityKey, {
      contentHash,
      record: finalRecord
    });

    this.addAuditLog({
      action: 'INVOICE_RECORDED',
      invoice_number: invoiceRecord.invoice_number,
      vendor_id: invoiceRecord.vendor_id,
      decision: invoiceRecord.decision,
      risk_score: invoiceRecord.risk_score,
      total_amount: invoiceRecord.total_amount,
      fingerprint,
      flags: invoiceRecord.flags || invoiceRecord.anomalies || []
    });

    return {
      status: 'INVOICE_RECORDED',
      is_duplicate: false,
      is_conflict: false,
      message: 'Invoice successfully ingested and recorded in ERP ledger.',
      record: finalRecord
    };
  }

  recordInvoice(invoiceRecord) {
    const res = this.evaluateOrRecordInvoice(invoiceRecord);
    return res.record;
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
    const channel = notification.channel || '#general';
    const type = notification.type || 'INFO';
    const invoiceNum = notification.metadata?.invoice_number || notification.invoice_number || '';
    const notifKey = `${channel}::${type}::${invoiceNum || notification.message}`;

    if (this.dispatchedNotificationKeys.has(notifKey)) {
      // Prevent duplicate notification alerts on replay
      return {
        status: 'NOTIFICATION_ALREADY_DELIVERED',
        duplicate: true,
        channel,
        type
      };
    }

    this.dispatchedNotificationKeys.add(notifKey);
    const record = {
      notification_id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      channel,
      type,
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

  getStorageInfo() {
    return {
      storage_type: 'IN_MEMORY_TRANSIENT',
      persistent_across_restarts: false,
      audit_trail_scope: 'EPHEMERAL_PER_CONTAINER_SESSION',
      invoices_count: this.invoices.size,
      audit_logs_count: this.auditLogs.length,
      notifications_count: this.notifications.length,
      warning: 'Mock ERP state is in-memory only. All ledger, audit, and notification records reset upon process or container restart.'
    };
  }
}

// Singleton instance
const db = new MockERPDatabase();

module.exports = { MockERPDatabase, db };
