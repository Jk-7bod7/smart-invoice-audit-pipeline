/**
 * Static Security & Zero-Secrets Scanner
 * Recursively scans project files for hardcoded secrets, private keys, and cloud credentials.
 */

const fs = require('node:fs');
const path = require('path');
const assert = require('node:assert');

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Personal Access Token', regex: /\bgh[pous]_[A-Za-z0-9_]{36,255}\b/ },
  { name: 'GitHub Fine-Grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/ },
  { name: 'OpenAI API Key', regex: /\bsk-[A-Za-z0-9]{32,64}\b/ },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z-_]{35}\b/ },
  { name: 'RSA/EC Private Key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Hardcoded Password Assignment', regex: /(?:password|passwd|pwd)\s*[:=]\s*["'][A-Za-z0-9!@#$%^&*()_+]{8,}["']/i }
];

const IGNORE_PATTERNS = [
  /\.git/,
  /node_modules/,
  /sample-output\.json/,
  /\.env\.example/
];

function getAllFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (IGNORE_PATTERNS.some(p => p.test(fullPath))) {
      continue;
    }
    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

console.log('--- Running Static Security & Zero-Secrets Audit ---');

const projectRoot = path.resolve(__dirname, '../../');
const files = getAllFiles(projectRoot);
let violations = 0;

for (const file of files) {
  // Skip this scanner itself to prevent false positives from regex literals
  if (file.endsWith('security-scan.test.js')) continue;

  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(content)) {
      console.error(`🚨 SECRET DETECTED in ${path.relative(projectRoot, file)}: Matched pattern [${pattern.name}]`);
      violations++;
    }
  }
}

console.log(`✓ Scanned ${files.length} files across repository.`);
assert.strictEqual(violations, 0, `Security scan failed: ${violations} potential secret(s) found.`);
console.log('✓ Zero Secrets Audit Passed: No hardcoded API keys, private tokens, or credentials found.\n');
