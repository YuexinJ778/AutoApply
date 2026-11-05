'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('tool documentation and README count match the executable allowlist', () => {
  const source = readFileSync(path.join(root, 'extension/options/resumeFunctions.js'), 'utf8');
  const registry = source.match(/\b(?:var|let|const) ALLOWED_FUNCTIONS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(registry, 'The executable ALLOWED_FUNCTIONS registry must be readable');
  const allowed = [...registry[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(allowed).size, allowed.length, 'Allowlist names must be unique');

  const tools = readFileSync(path.join(root, 'docs/tools.md'), 'utf8');
  const documented = [...tools.matchAll(/^\| (?:Contact|Sections|Entries|Lines) \| `([^`]+)` \|/gm)]
    .map(match => match[1]);
  assert.deepEqual(documented.toSorted(), allowed.toSorted(), 'tools.md must list each allowed operation exactly once');

  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  const headline = readme.match(/\b(\d+) resume tools\b/);
  const total = readme.match(/^\| \*\*Total\*\* \| \*\*(\d+)\*\*/m);
  assert.ok(headline, 'README must state the resume-tool count');
  assert.ok(total, 'README must include the category total');
  assert.equal(Number(headline[1]), allowed.length, 'README headline count must match the allowlist');
  assert.equal(Number(total[1]), allowed.length, 'README category total must match the allowlist');
});
