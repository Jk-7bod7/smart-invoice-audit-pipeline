/**
 * Master QA Test Runner & Evidence Generator
 * Executes all 8 verification suites and outputs execution evidence.
 */

const { spawnSync } = require('node:child_process');
const path = require('path');

const SUITES = [
  { name: '1. Workflow Graph & Schema Integrity', script: 'validate-workflow.js', tier: 'Schema / Static' },
  { name: '2. Unit: Invoice Schema & Line-Item Math Validation', script: 'tests/unit/validation.test.js', tier: 'Unit' },
  { name: '3. Unit: Anomaly Detection & Two-Way PO Matching', script: 'tests/unit/anomaly.test.js', tier: 'Unit' },
  { name: '4. Integration: Mock ERP REST API & Idempotency', script: 'tests/integration/erp-api.test.js', tier: 'Mock Integration' },
  { name: '5. Integration: Full Invoice Audit Pipeline E2E', script: 'tests/integration/pipeline-e2e.test.js', tier: 'Pipeline E2E' },
  { name: '6. Security: Negative & Adversarial Attack Surface', script: 'tests/security/negative-security.test.js', tier: 'Adversarial Security' },
  { name: '7. Security: Zero-Secrets & Credentials Audit', script: 'tests/security/security-scan.test.js', tier: 'Static Security Audit' },
  { name: '8. Real Container E2E: Live Docker + n8n Webhook HTTP Suite', script: 'tests/e2e/real-n8n-live.js', tier: 'Real Container E2E' }
];

console.log('================================================================');
console.log('  INTELLIGENT INVOICE AUDIT PIPELINE: AUTOMATED QA TEST RUNNER');
console.log('================================================================\n');

const results = [];
let passCount = 0;
let failCount = 0;
const startTime = Date.now();

for (const suite of SUITES) {
  const scriptPath = path.join(__dirname, suite.script);
  process.stdout.write(`Executing [${suite.tier}]: ${suite.name}... `);
  const suiteStart = Date.now();

  const run = spawnSync('node', [scriptPath], {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 180000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ERP_API_KEY: 'erp_secret_test_key_8899aabbcc'
    }
  });

  const durationMs = Date.now() - suiteStart;

  if (run.status === 0) {
    passCount++;
    console.log(`PASS (${durationMs}ms)`);
    results.push({
      Suite: suite.name,
      Tier: suite.tier,
      Status: 'PASS',
      Duration: `${durationMs}ms`,
      ExitCode: 0
    });
  } else {
    failCount++;
    console.log(`FAIL (${durationMs}ms)`);
    console.error('\n--- SUITE EXECUTION ERROR ---');
    console.error(run.stdout);
    console.error(run.stderr);
    results.push({
      Suite: suite.name,
      Tier: suite.tier,
      Status: 'FAIL',
      Duration: `${durationMs}ms`,
      ExitCode: run.status
    });
  }
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n================================================================');
console.log('                     QA TEST EXECUTION SUMMARY                  ');
console.log('================================================================');
console.table(results);
console.log(`Total Suites: ${SUITES.length} | Passed: ${passCount} | Failed: ${failCount}`);
console.log(`Total Execution Time: ${totalDuration}s`);

if (failCount > 0) {
  console.log(`\nOverall Result: TEST SUITE FAILED (${failCount} failure(s))`);
  process.exit(1);
} else {
  console.log('\nOverall Result: ALL TEST SUITES PASSED (100% VERIFIED)');
  process.exit(0);
}
