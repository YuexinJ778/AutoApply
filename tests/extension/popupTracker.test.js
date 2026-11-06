const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../../extension/popup/popup.js'), 'utf8');
const registrySource = readFileSync(path.join(__dirname, '../../extension/storage/resumeRegistryStore.js'), 'utf8');
const job = { id: 'server-job', company: 'Example Labs', job_title: 'Engineer',
  job_url: 'https://example.com/jobs/1', status_id: 'interviewing' };

async function settle(condition) {
  for (let i = 0; i < 50; i += 1) {
    if (condition()) return;
    await new Promise(setImmediate);
  }
  assert.fail('Popup operation did not finish');
}

async function popup({ offline = false, applicationForm = false, stored = null, patchFailure = false,
  formUrl = 'https://ats.example.com/form', tabId = 10, openerTabId, currentResume, resumeLanguage = 'en' } = {}) {
  const elements = new Map();
  const calls = { create: [], patch: [], upload: [], messages: [], generated: 0, generateRequests: [], dashboard: 0, lookups: 0, lookupUrls: [] };
  const local = stored || { 'artifact/resume.pdf': { content: btoa('%PDF-1.4\nresume'), filename: 'resume.pdf' } };
  if (applicationForm && !stored) local.pendingApply = { jobUrl: job.job_url, trackerJobUrl: job.job_url,
    trackerCompany: job.company, trackerJobTitle: job.job_title,
    sourceTabId: 10,
    status: 'waiting_for_user_to_open_application_form' };
  const canonical = { jobs: [], applications: [], profile: {}, resume: {}, settings: {}, activeResumeLanguage: 'en' };
  canonical.activeResumeLanguage = resumeLanguage;
  canonical.resumes = { [resumeLanguage]: currentResume };
  function element(id) {
    if (!elements.has(id)) elements.set(id, { disabled: false, textContent: '', hidden: false,
      classList: { add() {}, remove() {} }, addEventListener(name, fn) { this[name] = fn; } });
    return elements.get(id);
  }
  const trackerError = 'Tracker is not running. Run python -m streamlit run server/app.py and open dashboard.';
  const settings = { provider: 'minimax', model: 'test-model', apiKey: 'test-key' };
  const context = {
    document: { getElementById: element }, URL, Blob, TextEncoder, atob, btoa, structuredClone,
    chrome: {
      runtime: { sendMessage(_message, done) { done({ ok: true, data: {
        jobPosting: {}, pageSnapshot: { url: job.job_url, pageText: 'Job description '.repeat(10) }
      } }); } },
      tabs: {
        query(_query, done) { done([{ id: tabId, openerTabId, url: applicationForm ? formUrl : job.job_url }]); },
        sendMessage(_id, message, done) { calls.messages.push(message);
          done({ ok: true, data: message.type === 'PREPARE'
            ? { filledFieldCount: 4, selectFilledCount: 0, checkboxFilledCount: 0,
                autofillStats: { filledFieldCount: 5, formFieldCount: 5 } }
            : { opened: applicationForm && message.type === 'DETECT' } }); }
      },
      storage: { local: {
        get(keys, done) { done(Object.fromEntries(keys.map(key => [key, local[key]]))); },
        set(values, done) { Object.assign(local, values); done(); },
        remove(key, done) { delete local[key]; done(); }
      } }
    },
    Stage3Shared: { MESSAGE_TYPES: { EXTRACT_CURRENT_PAGE: 'EXTRACT', DETECT_APPLICATION_FORM: 'DETECT',
      GET_PAGE_CONTEXT: 'CONTEXT', PREPARE_APPLICATION: 'PREPARE' } },
    Stage3Storage: { async getSettings() { return settings; }, async setJobData() {} },
    Stage10AppDataStore: { async getAppData() { return canonical; }, async appendGeneratedResume() {} },
    Stage11DataBoundary: {
      async getAppData() { return canonical; },
      async saveAppData(patch) { Object.assign(canonical, patch); },
      evaluateGenerateResumeGuard() { return { ok: true }; }
    },
    Stage5Api: {
      async extractCurrentJobWithAi() { return { ok: true, data: { isJobPosting: true,
        company: job.company, title: job.job_title, url: job.job_url } }; },
      async generateResume(request) { calls.generated += 1; calls.generateRequests.push(request); return { ok: true, data: { pdfPath: 'artifact/resume.pdf' } }; }
    },
    AutoApplyTracker: {
      async getJobs(url) { calls.lookups += 1; calls.lookupUrls.push(url);
        if (offline) throw new Error(trackerError); return [job]; },
      async createJob(payload) { calls.create.push(payload); if (offline) throw new Error(trackerError); return job; },
      async patchJob(id, payload) { calls.patch.push({ id, payload });
        if (patchFailure) throw new Error('Tracker request failed'); return { ...job, ...payload }; },
      async uploadResume(id, blob, filename, label) { calls.upload.push({ id, blob, filename, label }); },
      async openDashboard() { calls.dashboard += 1; }
    }
  };
  vm.createContext(context);
  vm.runInContext(registrySource, context);
  vm.runInContext(source.replace('  void boot();',
    '  globalThis.popupAutofillForTest = handleAutofill;\n  void boot();'), context);
  await settle(() => !element('generate-btn').disabled);
  return { calls, local, element, runAutofill: context.popupAutofillForTest, async click(id) {
    element(id).click();
    await settle(() => !element('generate-btn').disabled);
  } };
}

test('Start Apply creates a tracker job without status and uploads the generated PDF', async () => {
  const page = await popup();
  await page.click('generate-btn');
  assert.equal(page.calls.generated, 1);
  assert.equal(page.calls.create.length, 1);
  assert.equal(page.calls.create[0].job_url, job.job_url);
  assert.equal('status_id' in page.calls.create[0], false);
  assert.equal(page.calls.upload.length, 1);
  const upload = page.calls.upload[0];
  assert.equal(upload.id, job.id);
  assert.equal(upload.filename, 'resume.pdf');
  assert.equal(await upload.blob.text(), '%PDF-1.4\nresume');
  assert.equal(page.local['artifact/resume.pdf'].content, undefined);
  assert.equal(page.local['artifact/resume.pdf'].dataBase64, btoa('%PDF-1.4\nresume'));
  assert.equal(page.local.pendingApply.trackerJobUrl, job.job_url);
  assert.equal(page.local.pendingApply.trackerCompany, job.company);
  assert.equal(page.local.pendingApply.sourceTabId, 10);
  assert.equal(page.calls.patch.length, 0);
});

test('Start Apply passes the selected saved resume and language to the real API boundary', async () => {
  const currentResume = { language: 'zh', header: { contact: { firstName: 'Demo' } },
    sections: [{ id: 'current', sectionName: '經歷', blocks: [{ lines: [{ id: 'saved-bullet', type: 'bullet', text: 'Saved current resume bullet.' }] }] }] };
  const page = await popup({ currentResume, resumeLanguage: 'zh' });
  await page.click('generate-btn');
  assert.equal(page.calls.generateRequests.length, 1);
  assert.equal(page.calls.generateRequests[0].activeResumeLanguage, 'zh');
  assert.deepEqual(page.calls.generateRequests[0].currentResume, currentResume);
});

test('Tracker failure leaves tailoring working and its error visible after generation succeeds', async () => {
  const page = await popup({ offline: true });
  await page.click('generate-btn');
  assert.equal(page.calls.generated, 1);
  assert.ok(page.local.pendingApply.resumeDraftId);
  assert.match(page.element('runtime-status').textContent, /Resume generated and saved/);
  assert.match(page.element('tracker-status').textContent, /Tracker is not running/);
  assert.equal(page.calls.upload.length, 0);
});

test('Only the explicit submitted button marks Applied; autofill carries tracker context', async () => {
  const page = await popup();
  assert.equal(page.calls.patch.length, 0);
  await page.click('autofill-btn');
  assert.equal(page.calls.patch.length, 0);
  const message = page.calls.messages.find(item => item.type === 'PREPARE');
  assert.equal(message.trackerJob.job_url, job.job_url);
  await page.click('confirm-submitted-btn');
  assert.equal(page.calls.patch.length, 1);
  assert.equal(page.calls.patch[0].id, job.id);
  assert.equal(page.calls.patch[0].payload.status_id, 'applied');
  assert.match(page.calls.patch[0].payload.applied_date, /^\d{4}-\d{2}-\d{2}$/);
});

test('manual autofill displays and returns the deduplicated coverage including a resume upload', async () => {
  const page = await popup();
  const result = await page.runAutofill();
  assert.equal(result.ok, true);
  assert.equal(result.filledCount, 5);
  assert.equal(page.element('runtime-status').textContent, 'Status: Autofill completed. Filled=5/5');
});

test('Save Job reaches the tracker and Applications opens the dashboard', async () => {
  const page = await popup();
  await page.click('save-job-btn');
  assert.equal(page.calls.create.length, 1);
  page.element('applications-btn').click();
  await settle(() => page.calls.dashboard === 1);
  assert.equal('status_id' in page.calls.create[0], false);
});

test('A reopened popup on an ATS form uses the original pending job for tracking and submission', async () => {
  const page = await popup({ applicationForm: true });
  assert.deepEqual(page.calls.lookupUrls, [job.job_url]);
  const message = page.calls.messages.find(item => item.type === 'PREPARE');
  assert.equal(message.trackerJob.job_url, job.job_url);
  assert.equal(message.trackerJob.company, job.company);
  assert.equal(page.calls.create.length, 0);
  assert.equal(page.calls.patch.length, 0);
  await page.click('confirm-submitted-btn');
  assert.equal(page.calls.patch[0].id, job.id);
});

test('Confirmed submission clears matching pending context before a later unrelated form', async () => {
  const page = await popup({ applicationForm: true });
  await page.click('confirm-submitted-btn');
  assert.equal(page.local.pendingApply, undefined);
  const next = await popup({ applicationForm: true, stored: page.local, formUrl: 'https://ats.example.com/unrelated-form' });
  assert.equal(next.calls.lookupUrls.length, 0);
  const message = next.calls.messages.find(item => item.type === 'PREPARE');
  assert.equal(message.trackerJob, null);
  assert.equal(next.element('confirm-submitted-btn').disabled, true);
});

test('Failed submission confirmation keeps pending context for an explicit retry', async () => {
  const page = await popup({ applicationForm: true, patchFailure: true });
  await page.click('confirm-submitted-btn');
  assert.equal(page.local.pendingApply.trackerJobUrl, job.job_url);
  assert.match(page.element('tracker-status').textContent, /Tracker request failed/);
});

test('An unfinished application is not reused by an unrelated form tab', async () => {
  const posting = await popup();
  await posting.click('generate-btn');
  const unrelated = await popup({ applicationForm: true, stored: posting.local, tabId: 20 });
  assert.equal(unrelated.calls.lookupUrls.length, 0);
  const message = unrelated.calls.messages.find(item => item.type === 'PREPARE');
  assert.equal(message.trackerJob, null);
  assert.equal(unrelated.element('confirm-submitted-btn').disabled, true);
  assert.equal(unrelated.calls.patch.length, 0);
  assert.equal(unrelated.local.pendingApply.sourceTabId, 10);
});

test('A child application tab retains the original posting tracker context', async () => {
  const posting = await popup();
  await posting.click('generate-btn');
  const child = await popup({ applicationForm: true, stored: posting.local, tabId: 20, openerTabId: 10 });
  assert.deepEqual(child.calls.lookupUrls, [job.job_url]);
  const message = child.calls.messages.find(item => item.type === 'PREPARE');
  assert.equal(message.trackerJob.job_url, job.job_url);
  assert.equal(child.element('confirm-submitted-btn').disabled, false);
});
