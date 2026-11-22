/**
 * Anomaly & Fraud Detection Engine for Accounts Payable Invoices
 * Evaluates duplicate fingerprints, bank divergence, threshold tiers, and tax anomalies.
 */

const crypto = require('node:crypto');

class AnomalyDetector {
  /**
   * Generates a deterministic cryptographic fingerprint for duplicate detection.
   * @param {string} vendorId
   * @param {string} invoiceNumber
   * @returns {string} SHA-256 hash
   */
  static generateFingerprint(vendorId, invoiceNumber) {
    return crypto
      .createHash('sha256')
      .update(`${vendorId.trim().toUpperCase()}::${invoiceNumber.trim().toUpperCase()}`)
      .digest('hex');
  }

  /**
   * Evaluates invoice risk against vendor master record and processed history.
   * @param {Object} invoice - Validated invoice object
   * @param {Object} vendorMaster - Vendor record from ERP (or null if new vendor)
   * @param {Set|Array} processedFingerprints - Set of previously processed SHA-256 fingerprints
   * @returns {Object} Anomaly evaluation report
   */
  static evaluate(invoice, vendorMaster, processedFingerprints = new Set()) {
    const anomalies = [];
    let riskScore = 0;

    const fingerprint = this.generateFingerprint(invoice.vendor_id, invoice.invoice_number);

    // 1. Duplicate Invoice Check (Critical Fraud/Error)
    const isDuplicate = processedFingerprints instanceof Set 
      ? processedFingerprints.has(fingerprint)
      : processedFingerprints.includes(fingerprint);

    if (isDuplicate) {
      anomalies.push({
        code: 'DUPLICATE_INVOICE_SUBMISSION',
        severity: 'CRITICAL',
        points: 100,
        message: `Duplicate submission detected: Vendor ${invoice.vendor_id} Invoice #${invoice.invoice_number} has already been processed.`
      });
      riskScore += 100;
    }

    // 2. Vendor Verification & Bank Divergence Check
    if (!vendorMaster) {
      anomalies.push({
        code: 'UNREGISTERED_VENDOR',
        severity: 'HIGH',
        points: 40,
        message: `Vendor ID ${invoice.vendor_id} is not registered in ERP vendor master records.`
      });
      riskScore += 40;
    } else {
      // Check bank account matching (BEC / Fraud Prevention)
      const masterAccount = String(vendorMaster.bank_account_number || '').trim();
      const invoiceAccount = String(invoice.bank_details?.account_number || '').trim();

      if (!masterAccount || !invoiceAccount) {
        anomalies.push({
          code: 'UNVERIFIED_BANK_DETAILS',
          severity: 'HIGH',
          points: 40,
          message: `Vendor bank details are unverified or missing (Master: '${masterAccount}', Invoice: '${invoiceAccount}'). Automatic approval prohibited.`
        });
        riskScore += 40;
      } else if (masterAccount !== invoiceAccount) {
        anomalies.push({
          code: 'VENDOR_BANK_ACCOUNT_MISMATCH',
          severity: 'CRITICAL',
          points: 80,
          message: `Invoice bank account (${invoiceAccount}) diverges from ERP master record (${masterAccount}). Potential Business Email Compromise (BEC).`
        });
        riskScore += 80;
      }

      // Check tax ID / VAT matching
      if (vendorMaster.tax_id && invoice.vendor_tax_id) {
        if (vendorMaster.tax_id.trim().toUpperCase() !== invoice.vendor_tax_id.trim().toUpperCase()) {
          anomalies.push({
            code: 'TAX_ID_MISMATCH',
            severity: 'HIGH',
            points: 35,
            message: `Invoice Tax ID (${invoice.vendor_tax_id}) does not match master record (${vendorMaster.tax_id}).`
          });
          riskScore += 35;
        }
      }
    }

    // 2b. Arithmetic Validation Check
    if (invoice.math_valid === false) {
      anomalies.push({
        code: 'ARITHMETIC_RECONCILIATION_FAILED',
        severity: 'HIGH',
        points: 50,
        message: 'Line-item math or tax reconciliation mismatch detected. Inconsistent invoice arithmetic.'
      });
      riskScore += 50;
    }

    // 3. Tax Rate Sanity Check
    if (invoice.subtotal > 0) {
      const effectiveTaxRate = (invoice.tax_amount / invoice.subtotal) * 100;
      if (effectiveTaxRate > 25.0) {
        anomalies.push({
          code: 'SUSPICIOUS_TAX_RATE',
          severity: 'MEDIUM',
          points: 20,
          message: `Effective tax rate of ${effectiveTaxRate.toFixed(2)}% exceeds normal thresholds (max expected: 25%).`
        });
        riskScore += 20;
      }
    }

    // 4. Threshold & Governance Tiers
    let approvalTier = 'TIER_1_STANDARD';
    if (invoice.total_amount >= 50000) {
      approvalTier = 'TIER_4_CFO_EXECUTIVE';
      anomalies.push({
        code: 'CFO_THRESHOLD_EXCEEDED',
        severity: 'MEDIUM',
        points: 25,
        message: `Invoice total of $${invoice.total_amount} requires CFO / Executive sign-off (>= $50,000).`
      });
      riskScore += 25;
    } else if (invoice.total_amount >= 10000) {
      approvalTier = 'TIER_3_DIRECTOR';
      anomalies.push({
        code: 'DIRECTOR_THRESHOLD_EXCEEDED',
        severity: 'LOW',
        points: 15,
        message: `Invoice total of $${invoice.total_amount} requires Director approval (>= $10,000).`
      });
      riskScore += 15;
    } else if (invoice.total_amount >= 2500) {
      approvalTier = 'TIER_2_MANAGER';
      anomalies.push({
        code: 'MANAGER_THRESHOLD_EXCEEDED',
        severity: 'LOW',
        points: 10,
        message: `Invoice total of $${invoice.total_amount} requires Manager approval (>= $2,500).`
      });
      riskScore += 10;
    }

    // Cap score at 100
    riskScore = Math.min(100, riskScore);

    // Classification & Decision Triage
    let riskTier = 'LOW';
    let decision = 'AUTO_APPROVED';

    const hasUnverifiedBank = !vendorMaster || !String(vendorMaster.bank_account_number || '').trim() || !String(invoice.bank_details?.account_number || '').trim();
    const hasMathError = invoice.math_valid === false;

    if (riskScore >= 70) {
      riskTier = 'CRITICAL';
      decision = 'REJECTED_FRAUD_ALERT';
    } else if (riskScore >= 20 || approvalTier !== 'TIER_1_STANDARD' || hasMathError || hasUnverifiedBank) {
      riskTier = riskScore >= 40 ? 'HIGH' : 'MEDIUM';
      decision = 'MANUAL_AUDIT_REQUIRED';
    } else {
      riskTier = 'LOW';
      decision = 'AUTO_APPROVED';
    }

    // Absolute Business Invariant: Failed arithmetic or unverified bank details CANNOT qualify for AUTO_APPROVED
    if ((hasMathError || hasUnverifiedBank) && decision === 'AUTO_APPROVED') {
      decision = 'MANUAL_AUDIT_REQUIRED';
    }

    return {
      fingerprint,
      risk_score: riskScore,
      risk_tier: riskTier,
      approval_tier: approvalTier,
      decision,
      anomalies_count: anomalies.length,
      anomalies
    };
  }
}

module.exports = { AnomalyDetector };
