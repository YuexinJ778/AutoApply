'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../../extension/options/trackerFunctions.js'), 'utf8');
const call = (name, args) => ({ name, args });
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(reply = { ok: true, results: [] }) {
  const requests = [];
  const context = vm.createContext({ AutoApplyTracker: {
    async executeActions(functionCalls, timezone) { requests.push({ functionCalls, timezone }); return reply; }
  } });
  vm.runInContext(source, context);
  return { functions: context.TrackerAiFunctions, requests };
}

function fiveActions() {
  return [
    call('setJobStatus', { company: 'Example Labs', jobTitle: 'Engineer', status: 'Interviewing' }),
    call('setAppliedDate', { company: 'Example Labs', date: '2026-11-05' }),
    call('addJobNote', { company: 'Example Labs', text: '## Follow up\n\nBring examples.' }),
    call('addReminder', { company: 'Example Labs', kind: 'interview', datetime: '2026-11-12T10:00', title: 'Interview' }),
    call('completeReminder', { company: 'Example Labs', title: 'Interview' })
  ];
}

test('all five actions form one validated API batch with the browser timezone', async () => {
  const { functions, requests } = fixture();
  const actions = fiveActions();
  const before = JSON.stringify(actions);
  assert.equal((await functions.executeTrackerFunctions(actions, { timezone: 'America/Indiana/Indianapolis' })).ok, true);
  assert.equal(requests.length, 1);
  assert.deepEqual(plain(requests[0]), { functionCalls: actions, timezone: 'America/Indiana/Indianapolis' });
  assert.equal(JSON.stringify(actions), before);
});

test('the manual lists exactly the executable registry and supported signatures', () => {
  const { functions } = fixture();
  const expected = [
    'setJobStatus(company, jobTitle?, status)',
    'setAppliedDate(company, jobTitle?, date)',
    'addJobNote(company, jobTitle?, text)',
    'addReminder(company, jobTitle?, kind, datetime, title)',
    'completeReminder(company, jobTitle?, title)'
  ];
  const manual = functions.formatTrackerFunctionManualForPrompt();
  assert.deepEqual(manual.split('\n').map(line => line.split(' — ')[0]), expected);
  assert.deepEqual(Array.from(functions.ALLOWED_FUNCTIONS), expected.map(signature => signature.split('(')[0]));
  assert.equal(new Set(functions.ALLOWED_FUNCTIONS).size, 5);
});

test('malformed batches, calls, names and argument objects do not reach the API', async () => {
  const { functions, requests } = fixture();
  for (const actions of [null, {}, 'setJobStatus', [null], [[]], [42], [{}],
    [call('deleteJob', { company: 'Example Labs' })],
    [call('setJobStatus', null)], [call('setJobStatus', [])]]) {
    const result = await functions.executeTrackerFunctions(actions);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_ACTION');
  }
  assert.equal(requests.length, 0);
});

test('the full batch is checked before executing any earlier valid operation', async () => {
  const { functions, requests } = fixture();
  const result = await functions.executeTrackerFunctions([
    fiveActions()[0], call('addReminder', { company: 'Example Labs', title: 'Incomplete' })
  ]);
  assert.equal(result.ok, false);
  assert.match(result.error, /kind/);
  assert.equal(requests.length, 0);
});

test('the shared batch limit allows zero or ten actions and rejects eleven', () => {
  const { functions } = fixture();
  assert.equal(functions.MAX_FUNCTION_CALLS, 10);
  assert.equal(functions.validateTrackerFunctionBatch([]).ok, true);
  const ten = Array.from({ length: 10 }, () => fiveActions()[0]);
  assert.equal(functions.validateTrackerFunctionBatch(ten).ok, true);
  assert.equal(functions.validateTrackerFunctionBatch(ten.concat(fiveActions()[0])).ok, false);
});

test('required arguments reject missing, blank and nonstring values for every operation', () => {
  const { functions } = fixture();
  for (const operation of fiveActions()) {
    for (const key of Object.keys(operation.args).filter(key => key !== 'jobTitle')) {
      for (const invalid of [undefined, '', '  ', 0, false, null, {}, []]) {
        const action = { name: operation.name, args: { ...operation.args, [key]: invalid } };
        assert.equal(functions.validateTrackerFunctionBatch([action]).ok, false, `${operation.name}.${key}`);
      }
    }
  }
});

test('optional jobTitle is omitted or a nonblank string, and statuses stay server-defined', () => {
  const { functions } = fixture();
  const action = call('setJobStatus', { company: 'Example Labs', status: 'Custom hiring committee' });
  assert.equal(functions.validateTrackerFunctionBatch([action]).ok, true);
  assert.equal(functions.validateTrackerFunctionBatch([{ ...action, args: { ...action.args, jobTitle: 'Engineer' } }]).ok, true);
  for (const invalid of ['', ' ', 0, null, {}]) {
    assert.equal(functions.validateTrackerFunctionBatch([{ ...action, args: { ...action.args, jobTitle: invalid } }]).ok, false);
  }
});

test('unsupported fields and full resume or application payloads never reach the API', async () => {
  const { functions, requests } = fixture();
  const base = fiveActions()[0];
  for (const extra of [{ resume: { header: {}, sections: [] } }, { profile: {} }, { application: {} },
    { timezone: 'UTC' }, { status_id: 'applied' }]) {
    assert.equal((await functions.executeTrackerFunctions([{ ...base, args: { ...base.args, ...extra } }])).ok, false);
  }
  assert.equal((await functions.executeTrackerFunctions([{ ...base, resume: {} }])).ok, false);
  assert.equal(requests.length, 0);
});

test('application dates must be real calendar dates with the exact date-only format', () => {
  const { functions } = fixture();
  for (const date of ['0000-01-01', '2026-02-29', '2026-13-01', '2026-11-31', '2026-1-01', '2026-11-05T10:00']) {
    assert.equal(functions.validateTrackerFunctionBatch([call('setAppliedDate', { company: 'Example Labs', date })]).ok, false);
  }
  assert.equal(functions.validateTrackerFunctionBatch([call('setAppliedDate', { company: 'Example Labs', date: '2028-02-29' })]).ok, true);
});

test('reminders accept local or explicit-offset ISO times while rejecting date-only or impossible times', () => {
  const { functions } = fixture();
  const action = fiveActions()[3];
  for (const datetime of ['2026-11-12T10:00', '2026-11-12T10:00:30Z', '2026-11-12T10:00:30.123456-05:00']) {
    assert.equal(functions.validateTrackerFunctionBatch([{ ...action, args: { ...action.args, datetime } }]).ok, true);
  }
  for (const datetime of ['2026-11-12', '2026-11-12 10:00', '2026-02-29T10:00', '2026-11-12T24:00',
    '2026-11-12T10:60', '2026-11-12T10:00+24:00']) {
    assert.equal(functions.validateTrackerFunctionBatch([{ ...action, args: { ...action.args, datetime } }]).ok, false);
  }
  for (const kind of ['interview', 'assessment', 'deadline', 'follow_up', 'other']) {
    assert.equal(functions.validateTrackerFunctionBatch([{ ...action, args: { ...action.args, kind } }]).ok, true);
  }
  assert.equal(functions.validateTrackerFunctionBatch([{ ...action, args: { ...action.args, kind: 'invented' } }]).ok, false);
});

for (const code of ['AMBIGUOUS', 'NOT_FOUND']) {
  test(`${code} resolution is returned for the assistant to clarify, without browser lookup or retry`, async () => {
    const reply = { ok: false, code, error: 'Please identify the job.', candidates: [{ company: 'Example Labs', jobTitle: 'Engineer' }] };
    const { functions, requests } = fixture(reply);
    assert.equal(await functions.executeTrackerFunctions([fiveActions()[0]], { timezone: 'UTC' }), reply);
    assert.equal(requests.length, 1);
  });
}
