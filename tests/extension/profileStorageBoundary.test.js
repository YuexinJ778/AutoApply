'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const plain = value => JSON.parse(JSON.stringify(value));

function fixture(initial = {}) {
  const stored = plain(initial);
  const writes = [];
  const context = vm.createContext({ URL, console, chrome: { runtime: {}, storage: { local: {
    get(keys, callback) { const value = Object.fromEntries(keys.map(key => [key, stored[key]])); callback(value); },
    set(value, callback) { writes.push(plain(value)); Object.assign(stored, plain(value)); callback(); }
  } } } });
  for (const file of ['storage/appDataStore.js', 'storage/localStore.js', 'lib/dataBoundary.js',
    'storage/autofillKnowledgeBase.js', 'lib/profile/profileLoader.js', 'content/keywordAutofill.js']) {
    let source = readFileSync(path.join(__dirname, '../../extension', file), 'utf8');
    if (file === 'content/keywordAutofill.js') source = source.replace('  global.Stage8KeywordAutofill =',
      '  global.syncKeywordAnswersForTest = syncQaEntriesToAppData;\n  global.Stage8KeywordAutofill =');
    vm.runInContext(source, context);
  }
  return { stored, writes, store: context.Stage10AppDataStore, boundary: context.Stage11DataBoundary,
    loader: context.Stage5ProfileLoader, knowledge: context.Stage8KnowledgeBase,
    syncKeywordAnswers: context.syncKeywordAnswersForTest };
}

function legacy() {
  const notes = [{ date: '2026-11-05', title: 'Interview notes', contentMarkdown: 'Keep this Markdown.' }];
  return {
    appDataV1: { profile: { fullName: 'Demo Applicant', email: 'demo@example.com' },
      masterResume: { summaries: [{ text: 'Original summary', isDefault: true }] },
      applications: [{ applicationId: 'app-1', company: 'Example Co', jobTitle: 'Engineer',
        jobUrl: 'https://example.com/job/1', status: 'Interview', notes }] },
    stage11CanonicalAppDataV1: { applications: [{ applicationId: 'app-1', company: 'Example Co', jobTitle: 'Engineer',
      jobUrl: 'https://example.com/job/1', status: 'Interview', notes }] },
    applicationRecords: [
      { applicationId: 'old', jobUrl: 'https://example.com/job/1', status: 'saved', formFieldCount: 5,
        filledFieldCount: 2, updatedAt: '2026-11-01T12:00:00Z' },
      { applicationId: 'new', jobUrl: 'https://example.com/job/1', status: 'applied', formFieldCount: 10,
        filledFieldCount: 9, updatedAt: '2026-11-05T12:00:00Z' },
      { applicationId: 'app-2', company: 'Other Co', role: 'Analyst', jobUrl: 'https://example.com/job/2',
        status: 'withdrawn', notes: 'Keep raw legacy text.' }
    ]
  };
}

test('Profile, resume, settings and reset save only profile data while legacy applications remain byte-identical', async () => {
  const original = legacy();
  const f = fixture(original);
  await f.boundary.getAppData();
  await f.boundary.saveAppData({ profile: { fullName: 'Updated Applicant', email: 'updated@example.com' },
    applications: [{ status: 'Offer', notes: 'Must not be persisted' }], jobs: [{ company: 'Must not be persisted' }],
    settings: { simpleMode: true } });
  await f.store.saveMasterResume({ summaries: [{ text: 'Updated summary', isDefault: true }] });
  const saved = await f.boundary.getAppData();
  assert.equal(saved.profile.fullName, 'Updated Applicant');
  assert.equal(saved.resume.summaries[0].text.en, 'Updated summary');
  assert.equal('applications' in saved, false);
  assert.equal('jobs' in saved, false);
  const loaded = await f.loader.loadCandidateProfile();
  assert.equal(loaded.candidateResume.header.email, 'updated@example.com');
  await f.boundary.resetProfileResumeData();
  assert.equal((await f.boundary.getAppData()).profile.fullName, '');
  for (const key of Object.keys(original)) assert.equal(JSON.stringify(f.stored[key]), JSON.stringify(original[key]));
  assert.ok(f.writes.length);
  for (const write of f.writes) {
    assert.equal(Object.keys(write).some(key => Object.hasOwn(original, key)), false);
    for (const value of Object.values(write)) {
      assert.equal('applications' in value, false);
      assert.equal('jobs' in value, false);
      assert.equal('notes' in value, false);
    }
  }
});

test('Legacy import reader preserves canonical notes/status with newest raw coverage and never writes', async () => {
  const original = legacy();
  const f = fixture(original);
  const imported = await f.boundary.getLegacyApplications();
  assert.equal(imported.length, 2);
  assert.equal(imported[0].status, 'Interview');
  assert.deepEqual(plain(imported[0].notes), original.appDataV1.applications[0].notes);
  assert.equal(imported[0].formFieldCount, 10);
  assert.equal(imported[0].filledFieldCount, 9);
  assert.equal(imported[1].status, 'withdrawn');
  assert.equal(imported[1].notes, 'Keep raw legacy text.');
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.stored, original);
});

test('Autofill knowledge and keyword answer saves use the profile-only store without republishing applications', async () => {
  const original = legacy();
  const f = fixture(original);
  await f.knowledge.upsertQaMemory([{ questionKey: 'portfolio', questionText: 'Portfolio', answer: 'https://example.com' }]);
  await f.syncKeywordAnswers([{ questionKey: 'availability', questionText: 'Availability', answer: 'Immediately' }]);
  const saved = await f.store.getAppData();
  assert.ok(saved.autofillAnswers.some(item => item.key === 'availability' && item.answer === 'Immediately'));
  for (const key of Object.keys(original)) assert.equal(JSON.stringify(f.stored[key]), JSON.stringify(original[key]));
  assert.equal(f.writes.some(write => Object.keys(write).some(key => Object.hasOwn(original, key))), false);
  assert.equal('applications' in f.stored.profileDataV2, false);
});

test('An upgrade with only the old canonical profile still loads its profile and resumes', async () => {
  const f = fixture({ stage11CanonicalAppDataV1: { profile: { fullName: 'Canonical Applicant', email: 'canonical@example.com' },
    resume: { summaries: [{ text: 'Canonical summary', isDefault: true }] }, applications: [{ notes: 'Keep me' }] } });
  const loaded = await f.boundary.getAppData();
  assert.equal(loaded.profile.email, 'canonical@example.com');
  assert.equal(loaded.resume.summaries[0].text.en, 'Canonical summary');
  assert.equal(f.stored.stage11CanonicalAppDataV1.applications[0].notes, 'Keep me');
});
