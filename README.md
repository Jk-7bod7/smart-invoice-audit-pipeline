# Intelligent AP Invoice Audit — n8n + Node.js

**Portfolio reference implementation** for Accounts Payable (AP) invoice screening, purchase-order reconciliation and suspicious payment-detail checks. Built using **n8n, Node.js, Docker Compose and an isolated Mock ERP** with synthetic data.

> **Demo only:** This repository is source code, **not** a hosted service, a certified financial control, or a production payment platform. No real payments are initiated.

## What it demonstrates

- Webhook intake protected by a non-empty shared token, with HTTP 401 for unauthorized requests.
- Invoice subtotal/tax reconciliation and purchase-order matching.
- Comparison of invoice bank details against a vendor master record.
- Decision routing: `AUTO_APPROVED` (simulation only), `MANUAL_AUDIT_REQUIRED`, or `REJECTED_FRAUD_ALERT`.
- Idempotent replays, conflicting-invoice detection and SHA-256 material-content checks.
- Mock ledger, audit log and notification queues; no external ERP or Slack account required.

## Architecture

```text
Invoice JSON -> n8n webhook/auth -> validation -> Mock ERP vendor + PO lookup
             -> risk scoring & triage -> Mock ERP ledger / mock alert queue
             -> webhook response
```

The included n8n workflow has **17 nodes**. Host ports are bound to `127.0.0.1`; services communicate over a Docker bridge network.

## Reproduce the local tests

**Requirements:** Node.js, Docker Desktop with the Docker engine running, and the Docker Compose CLI.

```bash
node run-all-tests.js
```

This runs static/schema checks, unit tests, API integration tests, negative/security cases, and a **real Docker + n8n webhook HTTP end-to-end suite**. To run only the live suite:

```bash
node tests/e2e/real-n8n-live.js
```

**Latest locally reported run (November 22, 2026): 8/8 suites passing, including 11 live HTTP scenarios.** These results were reported by the local automation runner; there is no independent GitHub Actions CI run for this commit. See [test evidence](docs/TEST_EVIDENCE.md) for the recorded output and [demo guide](docs/DEMO-GUIDE.md) for reproduction notes.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Security test scope](docs/SECURITY_HARDENING_REPORT.md)
- [Test evidence](docs/TEST_EVIDENCE.md)
- [Release-readiness matrix](docs/RELEASE_READINESS_MATRIX.md)

## Security and important limitations

- Only **synthetic** invoices and vendors are included; no live accounting/payment integrations.
- The Mock ERP data, deduplication state, audit log and notifications are **in-memory and lost on restart**.
- Fixed-point/decimal money arithmetic, robust authorization roles, durable audit storage and independent review would be required for a real financial deployment.
- The tests and regex-based secret scan are **not** a guarantee of zero vulnerabilities.
- This repo is not intended to be exposed as a public network service; never reuse test values as real credentials.
- The code is publicly viewable if the owner makes the repository public; **no open-source license has been granted** unless a separate license is explicitly added.
