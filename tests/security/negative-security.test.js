/**
 * Adversarial & Negative Security Test Suite
 * Tests fail-closed authentication, DoS payload limits, media type validation, and input poisoning.
 */

const assert = require('node:assert');
const http = require('node:http');
const { start, EXPECTED_API_KEY } = require('../../mock-erp/server');
const { validateInvoice, ValidationError } = require('../../lib/invoice-validator');

const TEST_PORT = 3090;
const TEST_HOST = '127.0.0.1';

function rawRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: TEST_HOST,
        port: TEST_PORT,
        ...options
      },
      res => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          let data = {};
          try { data = JSON.parse(responseBody); } catch (_) { data = { raw: responseBody }; }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('--- Running Adversarial & Negative Security Tests ---');
  let server;

  try {
    server = await start(TEST_PORT, TEST_HOST);

    // Test 1: Ingress Authentication - Missing API Key returns HTTP 401
    {
      const res = await rawRequest({
        method: 'GET',
        path: '/api/vendors/VEND-001',
        headers: {} // No x-erp-api-key
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.error, 'Unauthorized');
      console.log('✓ Test 1 Passed: Missing authentication header rejected with HTTP 401');
    }

    // Test 2: Ingress Authentication - Invalid API Key returns HTTP 401
    {
      const res = await rawRequest({
        method: 'GET',
        path: '/api/vendors/VEND-001',
        headers: { 'x-erp-api-key': 'attacker_fake_token_12345' }
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.error, 'Unauthorized');
      console.log('✓ Test 2 Passed: Invalid authentication token rejected with HTTP 401');
    }

    // Test 3: DoS Protection - Bounded streaming body (Exceeding 256 KB returns HTTP 413)
    {
      const oversizedPayload = JSON.stringify({
        fingerprint: 'dos_test_fingerprint',
        garbage: 'A'.repeat(270 * 1024) // 270 KB payload
      });

      const res = await rawRequest(
        {
          method: 'POST',
          path: '/api/invoices',
          headers: {
            'x-erp-api-key': EXPECTED_API_KEY,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(oversizedPayload)
          }
        },
        oversizedPayload
      );
      assert.strictEqual(res.status, 413);
      assert.strictEqual(res.data.error, 'PayloadTooLarge');
      console.log('✓ Test 3 Passed: Oversized payload (> 256 KB) terminated with HTTP 413');
    }

    // Test 4: Content-Type Validation - Non-JSON media type returns HTTP 415
    {
      const res = await rawRequest({
        method: 'POST',
        path: '/api/invoices',
        headers: {
          'x-erp-api-key': EXPECTED_API_KEY,
          'Content-Type': 'text/plain'
        }
      }, 'This is plain text');
      assert.strictEqual(res.status, 415);
      assert.strictEqual(res.data.error, 'UnsupportedMediaType');
      console.log('✓ Test 4 Passed: Non-JSON Content-Type rejected with HTTP 415');
    }

    // Test 5: Malformed JSON syntax returns HTTP 400
    {
      const malformedJson = '{ "invoice_number": "INV-100", broken_json: ';
      const res = await rawRequest({
        method: 'POST',
        path: '/api/invoices',
        headers: {
          'x-erp-api-key': EXPECTED_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(malformedJson)
        }
      }, malformedJson);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error, 'BadRequest');
      console.log('✓ Test 5 Passed: Malformed JSON syntax safely rejected with HTTP 400');
    }

    // Test 6: Missing fingerprint field returns HTTP 400
    {
      const payloadWithoutFingerprint = JSON.stringify({ invoice_number: 'INV-NO-FP' });
      const res = await rawRequest({
        method: 'POST',
        path: '/api/invoices',
        headers: {
          'x-erp-api-key': EXPECTED_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadWithoutFingerprint)
        }
      }, payloadWithoutFingerprint);
      assert.strictEqual(res.status, 400);
      assert(res.data.message.includes('fingerprint is required'));
      console.log('✓ Test 6 Passed: Missing fingerprint rejected with HTTP 400');
    }

    // Test 7: Type Poisoning - Passing NaN for price throws ValidationError
    {
      const poisonedInvoice = {
        invoice_number: 'INV-POISON-001',
        vendor_id: 'VEND-001',
        invoice_date: '2026-11-01T00:00:00Z',
        due_date: '2026-12-01T00:00:00Z',
        currency: 'USD',
        line_items: [{ description: 'Poisoned Item', quantity: 'NaN', unit_price: 100 }],
        subtotal: 100,
        tax_amount: 10,
        total_amount: 110,
        bank_details: { account_number: '123' }
      };
      assert.throws(
        () => validateInvoice(poisonedInvoice),
        err => err instanceof ValidationError && err.field.includes('quantity')
      );
      console.log('✓ Test 7 Passed: Type poisoning (NaN quantity) caught by validator');
    }

    // Test 8: SQL Injection Injection in Notes safely contained
    {
      const sqlInjectionInvoice = {
        invoice_number: 'INV-SQLI-001',
        vendor_id: 'VEND-001',
        invoice_date: '2026-11-01T00:00:00Z',
        due_date: '2026-12-01T00:00:00Z',
        currency: 'USD',
        line_items: [{ description: 'Standard Service', quantity: 1, unit_price: 100 }],
        subtotal: 100,
        tax_amount: 10,
        total_amount: 110,
        bank_details: { account_number: 'US-BANK-99887711' },
        notes: "'; DROP TABLE invoices; --"
      };
      const validated = validateInvoice(sqlInjectionInvoice);
      assert.strictEqual(validated.valid, true);
      assert.strictEqual(typeof validated.normalized.notes, 'string');
      console.log('✓ Test 8 Passed: SQL injection payload safely stored as inert string');
    }

    console.log('All Adversarial & Negative Security Tests Passed Successfully.\n');
  } catch (err) {
    console.error('Negative Security Test Failure:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
})();
