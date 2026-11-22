# Demonstration & Evaluation Guide

This guide provides step-by-step instructions to run, evaluate, and test the **Intelligent AP Invoice Audit Pipeline** locally.

---

## 1. Prerequisites
- **Node.js:** v18.x or higher (Tested on Node.js v24.22.1 LTS).
- **Dependencies:** **Zero external dependencies.** Runs using Node.js built-in standard library.
- **Port Requirement:** `127.0.0.1:3002` (configurable via `ERP_PORT`).

---

## 2. Quick Automated Verification (Run All Tests)
Execute the master automated QA suite:

```bash
node run-all-tests.js
```

Expected output:
- All 7 verification suites execute sequentially.
- Pass verdict on schema validation, unit math, anomaly detection, mock integration, pipeline E2E, adversarial security, and zero-secrets audit.
- Total execution duration: $< 1.0\text{s}$.

---

## 3. Interactive Manual Demonstration

### Step 1: Start the Mock ERP Accounting Service
In your terminal, start the loopback ERP service:

```bash
node mock-erp/server.js
```
*Output:* `Mock ERP Accounting Service running on http://127.0.0.1:3002`

---

### Step 2: Test Scenario 1 — Clean Invoice Auto-Approval
Submit a clean invoice matching PO-2026-101 and verified vendor banking details:

```powershell
$headers = @{
  "x-erp-api-key" = "erp_secret_test_key_8899aabbcc"
  "Content-Type"  = "application/json"
}

$cleanPayload = Get-Content -Raw "sample-data/valid-clean-invoice.json"
Invoke-RestMethod -Uri "http://127.0.0.1:3002/api/invoices" -Method Post -Headers $headers -Body $cleanPayload
```

*Expected Result:*
- HTTP 201 Created
- Status: `INVOICE_RECORDED`
- Decision: `AUTO_APPROVED`

---

### Step 3: Test Scenario 2 — BEC / Bank Mismatch Fraud Detection
Submit an invoice from the same vendor, but with altered bank account routing:

```powershell
$fraudPayload = Get-Content -Raw "sample-data/bank-mismatch-fraud-invoice.json"
Invoke-RestMethod -Uri "http://127.0.0.1:3002/api/invoices" -Method Post -Headers $headers -Body $fraudPayload
```

*Expected Result:*
- Anomaly Engine catches bank divergence (`VENDOR_BANK_ACCOUNT_MISMATCH`).
- Risk score evaluates to $\ge 80$.
- Decision: `REJECTED_FRAUD_ALERT`.

---

### Step 4: Test Scenario 3 — Purchase Order Budget Overrun
Submit an invoice that exceeds the approved PO budget beyond the $1\%$ allowable tolerance:

```powershell
$overrunPayload = Get-Content -Raw "sample-data/budget-overrun-invoice.json"
Invoke-RestMethod -Uri "http://127.0.0.1:3002/api/invoices" -Method Post -Headers $headers -Body $overrunPayload
```

*Expected Result:*
- POMatcher detects budget overrun (`PO_BUDGET_OVERRUN`).
- Decision: `MANUAL_AUDIT_REQUIRED`.
- Routed to Accounts Payable approval queue.

---

### Step 5: Query the Audit Log
Inspect the auditable ledger of all decisions:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3002/api/invoices/audit-log" -Method Get -Headers $headers | ConvertTo-Json -Depth 5
```
