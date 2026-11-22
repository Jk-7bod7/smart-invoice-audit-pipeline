# Threat Model: Accounts Payable (AP) Invoice Audit Pipeline

## 1. Scope & Objective
This threat model evaluates security attack surfaces, threat actors, and mitigations for the **Intelligent AP Invoice Audit & Fraud Prevention Pipeline**. The primary objective is preventing financial leakage, Business Email Compromise (BEC) wire fraud, duplicate payouts, and Denial of Service (DoS).

---

## 2. STRIDE Threat Assessment

| STRIDE Category | Threat Description | Attack Vector | Severity | Implemented Mitigation | Verification Evidence |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Spoofing** | Attacker impersonates an existing vendor with fraudulent bank details. | Attacker compromises vendor email or submits PDF with attacker-controlled IBAN. | **CRITICAL** | `AnomalyDetector` compares invoice bank details against ERP Vendor Master. Mismatch flags `VENDOR_BANK_ACCOUNT_MISMATCH` and triggers `REJECTED_FRAUD_ALERT`. | Tested in `tests/unit/anomaly.test.js` & `tests/integration/pipeline-e2e.test.js`. |
| **Tampering** | Attacker modifies line-item subtotals or tax math to inflate payout. | Tampered JSON payload where declared subtotal exceeds line items. | **HIGH** | `validateInvoice` recomputes $\sum (\text{qty} \times \text{unit\_price})$ and enforces $\$0.01$ reconciliation tolerance before processing. | Tested in `tests/unit/validation.test.js`. |
| **Repudiation** | Dispute over who authorized an invoice payment or why it was rejected. | Unlogged triage decisions or lost approval records. | **MEDIUM** | Mock ERP records an immutable audit trail (`GET /api/invoices/audit-log`) capturing decision, risk score, flags, and timestamp. | Tested in `tests/integration/pipeline-e2e.test.js`. |
| **Information Disclosure** | Unauthorized third-party reads vendor banking details or PO records. | Snooping on unencrypted network traffic or open host ports. | **HIGH** | Services bind strictly to `127.0.0.1` (loopback). Ingress requires `x-erp-api-key`. External network access refused by OS stack. | Tested in `tests/security/negative-security.test.js`. |
| **Denial of Service** | Attacker sends huge payloads ($> 50\text{ MB}$) to crash Node.js process. | HTTP POST body flooding without size limits. | **HIGH** | Bounded streaming parser enforces hard ceiling of $262,144$ bytes ($256\text{ KB}$), terminating with `HTTP 413 Payload Too Large`. | Tested in `tests/security/negative-security.test.js` (Test 3). |
| **Elevation of Privilege** | Unauthenticated caller posts fake invoices directly into ERP ledger. | Direct API call to `/api/invoices` bypassing workflow logic. | **CRITICAL** | Fail-closed authentication middleware enforces valid `x-erp-api-key` header, rejecting unauthorized requests with `HTTP 401`. | Tested in `tests/security/negative-security.test.js` (Tests 1 & 2). |

---

## 3. Trust Boundaries & Security Zones

```text
[ External / Ingress Zone ]
        │  (Untrusted JSON Payloads)
        ▼
╔══════════════════════════════════════════════════════════════════════╗
║ TRUST BOUNDARY 1: Ingress Authentication & Stream Parser             ║
║ - HTTP 401 on missing x-webhook-token                                ║
║ - HTTP 413 on body > 256 KB                                          ║
║ - HTTP 415 on non-JSON Content-Type                                  ║
╚══════════════════════════════════════════════════════════════════════╝
        │  (Validated Payload)
        ▼
╔══════════════════════════════════════════════════════════════════════╗
║ TRUST BOUNDARY 2: Core Audit Engine (lib/)                           ║
║ - Strict math reconciliation ($0.01 tolerance)                       ║
║ - SHA-256 duplicate fingerprinting                                   ║
║ - Bank details vs ERP Vendor Master comparison                       ║
║ - Two-way PO tolerance verification                                  ║
╚══════════════════════════════════════════════════════════════════════╝
        │  (Audited Triage Decision)
        ▼
╔══════════════════════════════════════════════════════════════════════╗
║ TRUST BOUNDARY 3: ERP Accounting Ledger (127.0.0.1:3002)             ║
║ - Loopback-only interface                                            ║
║ - Idempotent event deduplication                                     ║
║ - Immutable audit log persistence                                    ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 4. Residual Risks & Future Hardening Recommendations
1. **Production Secret Management:** For cloud deployment, transition from environment variable API keys to an enterprise vault (e.g. AWS Secrets Manager or HashiCorp Vault) with periodic key rotation.
2. **mTLS for ERP Integration:** In multi-server enterprise networks, require mutual TLS (mTLS) with client certificates between workflow engines and accounting systems.
