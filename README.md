# Intelligent Accounts Payable (AP) Invoice Audit & Fraud Prevention Engine

A zero-dependency reference implementation for automated inbound invoice ingestion, line-item mathematical verification, two-way Purchase Order (PO) matching, and fraud anomaly detection.

---

## 1. Core Engineering Highlights
- **Mathematical Integrity:** Reconciles line-item quantities and unit prices against declared subtotal and tax amounts within $0.01 tolerance.
- **BEC & Fraud Defense:** Detects divergence between invoice bank account details and ERP vendor master records.
- **Two-Way PO Matching:** Compares invoice totals against approved purchase orders with configurable tolerance rules.
- **Cryptographic Deduplication:** Generates deterministic SHA-256 fingerprints (`vendor_id::invoice_number`) to prevent duplicate payouts.
- **Strict Security:** Loopback-only service binding (`127.0.0.1`), fail-closed header authentication, and bounded streaming request limits (256 KB).

---

## 2. Directory Layout
```text
smart-invoice-audit-pipeline/
├── docs/                      # Enterprise documentation suite
│   ├── ARCHITECTURE.md        # System topology and sequence flow
│   ├── THREAT_MODEL.md        # STRIDE security analysis
│   ├── SECURITY_HARDENING_REPORT.md # Audit and static scan findings
│   ├── TEST_EVIDENCE.md       # Verifiable test execution records
│   ├── DEMO-GUIDE.md          # Local reproduction instructions
│   └── RELEASE_READINESS_MATRIX.md # Quality gate scorecard
├── lib/                       # Core validation and evaluation logic
│   ├── invoice-validator.js   # Schema and math validation
│   ├── anomaly-detector.js    # Fraud and threshold scoring
│   ├── po-matcher.js          # Two-way PO reconciliation
│   └── invoice-pipeline.js    # Master pipeline orchestrator
├── mock-erp/                  # Local mock ERP service
│   ├── database.js            # In-memory vendor & PO store
│   └── server.js              # HTTP server (127.0.0.1:3002)
├── sample-data/               # Test fixtures (clean, fraud, overrun)
├── tests/                     # 7-tier test harness
├── workflow/                  # n8n workflow definitions
├── run-all-tests.js           # Automated QA runner
└── validate-workflow.js       # Workflow graph integrity checker
```

---

## 3. Quick Start & Testing
Execute the complete test harness locally:

```bash
node run-all-tests.js
```
