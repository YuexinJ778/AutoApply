'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness({ pending = {}, reply = { ok: true, data: { job: { id: 'tracker-id' } } }, detected = 3 } = {}) {
  let listener;
  const sent = [];
  const result = {
    ok: true, filledFieldCount: 1,
    autofillStats: { filledFieldCount: 2, formFieldCount: detected },
    trackerContext: { company: 'Form Co', job_title: 'Engineer', job_url: 'https://ats.example/form' }
  };
  const context = vm.createContext({
    console: { log() {}, error() {} },
    window: { location: { href: 'https://ats.example/form' } },
    document: { title: 'Application', querySelectorAll: () => [] },
    chrome: {
      storage: { local: { get: async () => ({ pendingApply: pending }) } },
      runtime: {
        onMessage: { addListener(fn) { listener = fn; } },
        async sendMessage(message) { sent.push(message); return reply; }
      }
    },
    Stage6ApplyRuntime: { runPrepareOnlyApplyFlow: async () => result }
  });
  for (const file of ['lib/types.js', 'content/content.js']) {
    vm.runInContext(readFileSync(path.resolve(__dirname, '../../extension', file), 'utf8'), context);
  }
  return {
    sent,
    run(trackerJob, type = 'PREPARE_APPLICATION') {
      return new Promise(resolve => listener({ type, trackerJob }, {}, resolve));
    }
  };
}

test('content forwards autofill totals to background using explicit posting identity', async () => {
  const run = harness();
  const job = { company: 'Posting Co', job_title: 'Engineer', job_url: 'https://jobs.example/1' };
  const response = await run.run(job);
  assert.equal(response.ok, true);
  assert.equal(run.sent[0].type, 'TRACKER_AUTOFILL');
  assert.equal(run.sent[0].job.job_url, job.job_url);
  assert.equal(run.sent[0].filledFieldCount, 2);
  assert.equal(run.sent[0].formFieldCount, 3);
  assert.equal(run.sent[0].status_id, undefined);
  assert.equal(response.data.trackerJob.id, 'tracker-id');
});

test('content does not borrow a global pending job without tab association', async () => {
  const run = harness({ pending: {
    jobUrl: 'https://jobs.example/1', trackerCompany: 'Posting Co', trackerJobTitle: 'Original title'
  } });
  await run.run();
  assert.equal(run.sent[0].job.job_url, 'https://ats.example/form');
  assert.equal(run.sent[0].job.company, 'Form Co');
});

test('tracker failure preserves a completed autofill result', async () => {
  const run = harness({ reply: { ok: false, error: 'Tracker is not running. Open the dashboard.' } });
  const response = await run.run();
  assert.equal(response.ok, true);
  assert.equal(response.data.ok, true);
  assert.match(response.data.trackerError, /Tracker is not running/);
  assert.equal(response.data.autofillStats.filledFieldCount, 2);
});

test('a page without detected fields creates no tracker sample', async () => {
  const run = harness({ detected: 0 });
  const response = await run.run();
  assert.equal(response.ok, true);
  assert.equal(run.sent.length, 0);
});

test('real shared message names route form detection and page context', async () => {
  const run = harness();
  const detected = await run.run(undefined, 'DETECT_APPLICATION_FORM');
  assert.equal(detected.ok, true);
  assert.equal(detected.data.opened, false);
  const context = await run.run(undefined, 'GET_PAGE_CONTEXT');
  assert.equal(context.ok, true);
  assert.equal(context.data.pageTitle, 'Application');
});
