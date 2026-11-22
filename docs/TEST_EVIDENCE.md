# Automated Test Evidence & Verification Ledger

**Execution Timestamp:** 2026-11-22T13:13:22+02:00  
**Test Runner:** `node run-all-tests.js`  
**Execution Environment:** Windows 11 / Node.js v24.22.1 / Docker Desktop (Compose v2) / PowerShell 5.1  
**Overall Status:** **100% PASSED (8 / 8 Test Suites Passing)**

---

## 1. Test Suite Summary Table

| Index | Suite Name | Verification Tier | Duration | Exit Code | Verdict |
| :---: | :--- | :--- | :---: | :---: | :---: |
| 0 | 1. Workflow Graph & Schema Integrity | Schema / Static Validation | 50ms | 0 | **PASS** |
| 1 | 2. Unit: Invoice Schema & Line-Item Math Validation | Unit Testing | 64ms | 0 | **PASS** |
| 2 | 3. Unit: Anomaly Detection & Two-Way PO Matching | Unit Testing | 55ms | 0 | **PASS** |
| 3 | 4. Integration: Mock ERP REST API & Idempotency | Mock Integration | 83ms | 0 | **PASS** |
| 4 | 5. Integration: Full Invoice Audit Pipeline E2E | Pipeline E2E Integration | 97ms | 0 | **PASS** |
| 5 | 6. Security: Negative & Adversarial Attack Surface | Adversarial Security | 88ms | 0 | **PASS** |
| 6 | 7. Security: Zero-Secrets & Credentials Audit | Static Security Audit | 57ms | 0 | **PASS** |
| 7 | 8. Real Container E2E: Live Docker + n8n Webhook HTTP Suite | Real Container E2E | 45218ms | 0 | **PASS** |

**Total Execution Time:** **45.71 seconds**  
**Total Failures:** **0**  
**Total Skipped:** **0**

---

## 2. Raw Console Execution Output (`node run-all-tests.js`)

```text
================================================================
  INTELLIGENT INVOICE AUDIT PIPELINE: AUTOMATED QA TEST RUNNER
================================================================

Executing [Schema / Static]: 1. Workflow Graph & Schema Integrity... PASS (50ms)
Executing [Unit]: 2. Unit: Invoice Schema & Line-Item Math Validation... PASS (64ms)
Executing [Unit]: 3. Unit: Anomaly Detection & Two-Way PO Matching... PASS (55ms)
Executing [Mock Integration]: 4. Integration: Mock ERP REST API & Idempotency... PASS (83ms)
Executing [Pipeline E2E]: 5. Integration: Full Invoice Audit Pipeline E2E... PASS (97ms)
Executing [Adversarial Security]: 6. Security: Negative & Adversarial Attack Surface... PASS (88ms)
Executing [Static Security Audit]: 7. Security: Zero-Secrets & Credentials Audit... PASS (57ms)
Executing [Real Container E2E]: 8. Real Container E2E: Live Docker + n8n Webhook HTTP Suite... PASS (45218ms)

================================================================
                     QA TEST EXECUTION SUMMARY                  
================================================================
┌─────────┬───────────────────────────────────────────────────────────────┬─────────────────────────┬────────┬───────────┬──────────┐
│ (index) │ Suite                                                         │ Tier                    │ Status │ Duration  │ ExitCode │
├─────────┼───────────────────────────────────────────────────────────────┼─────────────────────────┼────────┼───────────┼──────────┤
│ 0       │ '1. Workflow Graph & Schema Integrity'                        │ 'Schema / Static'       │ 'PASS' │ '50ms'    │ 0        │
│ 1       │ '2. Unit: Invoice Schema & Line-Item Math Validation'         │ 'Unit'                  │ 'PASS' │ '64ms'    │ 0        │
│ 2       │ '3. Unit: Anomaly Detection & Two-Way PO Matching'            │ 'Unit'                  │ 'PASS' │ '55ms'    │ 0        │
│ 3       │ '4. Integration: Mock ERP REST API & Idempotency'             │ 'Mock Integration'      │ 'PASS' │ '83ms'    │ 0        │
│ 4       │ '5. Integration: Full Invoice Audit Pipeline E2E'             │ 'Pipeline E2E'          │ 'PASS' │ '97ms'    │ 0        │
│ 5       │ '6. Security: Negative & Adversarial Attack Surface'          │ 'Adversarial Security'  │ 'PASS' │ '88ms'    │ 0        │
│ 6       │ '7. Security: Zero-Secrets & Credentials Audit'               │ 'Static Security Audit' │ 'PASS' │ '57ms'    │ 0        │
│ 7       │ '8. Real Container E2E: Live Docker + n8n Webhook HTTP Suite' │ 'Real Container E2E'    │ 'PASS' │ '45218ms' │ 0        │
└─────────┴───────────────────────────────────────────────────────────────┴─────────────────────────┴────────┴───────────┴──────────┘
Total Suites: 8 | Passed: 8 | Failed: 0
Total Execution Time: 45.71s

Overall Result: ALL TEST SUITES PASSED (100% VERIFIED)
```

---

## 3. Real Live n8n Container Verification Details (`node tests/e2e/real-n8n-live.js`)

```text
================================================================
  GENUINE REAL DOCKER + N8N LIVE HTTP END-TO-END TEST SUITE
================================================================

✓ Docker engine verified. Booting isolated Compose stack...
Importing and publishing workflow into n8n SQLite store...
✓ Workflow imported and published.
Starting Compose services with published workflow...
✓ Containers started successfully.
Waiting for Mock ERP and n8n services to become healthy...
✓ Mock ERP service is healthy (HTTP 200).
✓ n8n engine and webhook router ready.
Probing webhook endpoint at http://127.0.0.1:5679/webhook/invoice-audit-intake...
✓ Webhook endpoint active (received HTTP 401).

Executing Test 1: Missing Authentication Header...
✓ Test 1: Unauthenticated request rejected with HTTP 401.
✓ Verified: Zero side-effects in ERP ledger after unauthenticated request.

Executing Test 2: Valid Clean Invoice (INV-2026-001)...
Test 2 received status 200, body: {"status":"PROCESSED","decision":"AUTO_APPROVED","risk_score":0,"invoice_number":"INV-2026-001"}
✓ Test 2: Valid invoice processed through live n8n workflow and AUTO_APPROVED.

Executing Test 3: Duplicate Invoice Submission...
✓ Test 3: Duplicate submission evaluated (Decision: AUTO_APPROVED).

Executing Test 4: Bank Account Mismatch (Fraud Injection)...
✓ Test 4: Bank account mismatch caught by live n8n workflow and REJECTED_FRAUD_ALERT returned.

Executing Test 5: Purchase Order Overrun...
✓ Test 5: PO overrun routed to MANUAL_AUDIT_REQUIRED by live n8n workflow.

Executing Test 6: Verifying Mock Notification Delivery...
✓ Test 6: Mock notifications verified in ERP notification store (2 delivered).

Executing Test 7: Verifying ERP Ledger Persistence...
✓ Test 7: Persistence verified in ERP ledger audit trail (5 events logged).

================================================================
  ALL LIVE DOCKER + N8N E2E TESTS PASSED (100% VERIFIED)
================================================================

Tearing down Compose stack...
✓ Compose resources cleanly removed.
```
