'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = name => readFileSync(path.join(root, name), 'utf8');

test('resume and tracker documentation counts match both executable registries', () => {
  const source = read('extension/options/resumeFunctions.js');
  const registry = source.match(/\b(?:var|let|const) ALLOWED_FUNCTIONS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(registry, 'The resume allowlist must be readable');
  const resume = [...registry[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  const context = {};
  vm.runInNewContext(read('extension/options/trackerFunctions.js'), context);
  const tracker = Array.from(context.TrackerAiFunctions.ALLOWED_FUNCTIONS);
  const tools = read('docs/tools.md');
  const resumeDocs = [...tools.matchAll(/^\| (?:Contact|Sections|Entries|Lines) \| `([^`]+)` \|/gm)].map(match => match[1]);
  const trackerDocs = [...tools.matchAll(/^\| Tracker \| `([^`]+)` \|/gm)].map(match => match[1]);
  for (const [names, documented] of [[resume, resumeDocs], [tracker, trackerDocs]]) {
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual(documented.toSorted(), names.toSorted());
  }
  assert.equal(new Set([...resume, ...tracker]).size, resume.length + tracker.length);
  const readme = read('README.md');
  const headline = readme.match(/\b(\d+) tools: (\d+) resume and (\d+) tracker\b/);
  const total = readme.match(/^\| \*\*Total\*\* \| \*\*(\d+)\*\*/m);
  assert.ok(headline, 'README must state the total and both registry counts');
  assert.ok(total, 'README must include the category total');
  assert.equal(Number(headline[1]), resume.length + tracker.length);
  assert.equal(Number(headline[2]), resume.length);
  assert.equal(Number(headline[3]), tracker.length);
  assert.equal(Number(total[1]), resume.length + tracker.length);
  assert.match(tools, new RegExp(`\\*\\*${resume.length + tracker.length} operations\\*\\*`));
});
