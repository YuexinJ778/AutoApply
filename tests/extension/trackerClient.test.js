"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const clientSource = readFileSync(path.join(root, "extension/lib/trackerClient.js"), "utf8");

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function load(fetchImpl = async () => response([]), overrides = {}) {
  let settings = overrides.settings;
  const requests = [];
  const tabs = [];
  const context = vm.createContext({
    AbortController, Blob, FormData, URL, setTimeout, clearTimeout,
    chrome: {
      storage: { local: {
        get: async () => ({ trackerSettings: settings }),
        set: async values => { settings = values.trackerSettings; }
      } },
      tabs: { create: async values => { tabs.push(values); return values; } }
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return fetchImpl(url, options);
    },
    ...overrides.globals
  });
  vm.runInContext(clientSource, context);
  return { client: context.AutoApplyTracker, requests, tabs };
}

const configured = { settings: { url: "http://127.0.0.1:8765", token: "local-token" } };

test("tracker settings have a localhost default and save separately from provider settings", async () => {
  const { client } = load();
  assert.equal((await client.getSettings()).url, "http://127.0.0.1:8765");
  assert.equal((await client.getSettings()).token, "");
  await client.saveSettings({ url: " http://localhost:8765/ ", token: " test-token " });
  assert.equal((await client.getSettings()).url, "http://localhost:8765");
  assert.equal((await client.getSettings()).token, "test-token");
});

test("connection test authenticates against a data endpoint", async () => {
  const { client, requests } = load(async () => response([{ id: "planning" }]), configured);
  assert.equal((await client.testConnection())[0].id, "planning");
  assert.equal(requests[0].url, "http://127.0.0.1:8765/api/statuses");
  assert.equal(requests[0].options.headers.Authorization, "Bearer local-token");
});

test("missing tracker token gives an actionable error without sending a request", async () => {
  const { client, requests } = load();
  await assert.rejects(client.getJobs(), /Copy it from dashboard Settings/);
  assert.equal(requests.length, 0);
});

test("job capture sends server fields without an application status", async () => {
  const { client, requests } = load(async () => response({ id: "job-1" }), configured);
  await client.createJob({ company: "Example Labs", job_title: "Engineer", job_url: "https://example.com/jobs/1", status_id: "planning" });
  const request = requests[0];
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  const body = JSON.parse(request.options.body);
  assert.equal(body.company, "Example Labs");
  assert.equal(body.job_title, "Engineer");
  assert.equal(body.job_url, "https://example.com/jobs/1");
  assert.equal(Object.hasOwn(body, "status_id"), false);
});

test("lookup encodes the whole posting URL and updates use PATCH", async () => {
  const { client, requests } = load(async () => response([]), configured);
  const url = "https://example.com/jobs?jobId=1&source=board#apply";
  await client.getJobs(url);
  assert.equal(requests[0].url, "http://127.0.0.1:8765/api/jobs?url=" + encodeURIComponent(url));
  await client.patchJob("job-1", { status_id: "applied", applied_date: "2026-11-05" });
  assert.equal(requests[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[1].options.body), { status_id: "applied", applied_date: "2026-11-05" });
});

test("resume upload uses multipart file and label without overriding its boundary", async () => {
  const { client, requests } = load(async () => response({ source: "extension" }), configured);
  await client.uploadResume("job-1", new Blob(["%PDF-1.7"], { type: "application/pdf" }), "tailored.pdf", "Tailored resume");
  const { options } = requests[0];
  assert.equal(options.headers.Authorization, "Bearer local-token");
  assert.equal(options.headers["Content-Type"], undefined);
  assert.equal(options.body.get("file").name, "tailored.pdf");
  assert.equal(await options.body.get("file").text(), "%PDF-1.7");
  assert.equal(options.body.get("label"), "Tailored resume");
});

test("import preserves six legacy statuses, note arrays and coverage for server mapping", async () => {
  const records = ["Saved", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"].map((status, index) => ({
    company: "Example Labs", role: "Engineer", jobUrl: `https://example.com/${index}`,
    status, notes: [{ date: "2026-11-05", title: "Follow up", contentMarkdown: "**Call**" }],
    formFieldCount: 10, filledFieldCount: 9, updatedAt: "2026-11-05T12:00:00Z"
  }));
  const before = JSON.stringify(records);
  const { client, requests } = load(async () => response([]), configured);
  await client.importJobs(records);
  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.jobs.map(job => job.status), records.map(job => job.status));
  assert.deepEqual(payload.jobs[0].notes, records[0].notes);
  assert.equal(payload.jobs[0].jobTitle, "Engineer");
  assert.equal(payload.jobs[0].formFieldCount, 10);
  assert.equal(payload.jobs[0].filledFieldCount, 9);
  assert.equal(payload.jobs[0].updatedAt, "2026-11-05T12:00:00Z");
  assert.equal(payload.jobs[0].appliedAt, "");
  assert.equal(JSON.stringify(records), before);
});

test("import sends an empty legacy URL so the server can identify its record number", async () => {
  const { client, requests } = load(async () => response({ detail: "Record 3: job_url must be an HTTP URL." }, 422), configured);
  await assert.rejects(client.importJobs([{ company: "Example", role: "Engineer" }]), {
    message: "Record 3: job_url must be an HTTP URL."
  });
  assert.equal(JSON.parse(requests[0].options.body).jobs[0].jobUrl, "");
});

test("server authentication and storage reasons are shown unchanged", async () => {
  const { client } = load(async () => response({ detail: "status_id must be a configured status ID." }, 422), configured);
  await assert.rejects(client.patchJob("job-1", { status_id: "unknown" }), {
    message: "status_id must be a configured status ID."
  });
  const unauthorized = load(async () => response({ detail: "Tracker token required." }, 401), configured);
  await assert.rejects(unauthorized.client.testConnection(), { message: "Tracker token required." });
});

test("server offline reminds users to run Streamlit and open the dashboard without retrying", async () => {
  const { client, requests } = load(async () => { throw new TypeError("Failed to fetch"); }, configured);
  await assert.rejects(client.getJobs(), error => {
    assert.match(error.message, /Tracker 未啟動/);
    assert.match(error.message, /python -m streamlit run server\/app.py/);
    assert.match(error.message, /open the dashboard/);
    return true;
  });
  assert.equal(requests.length, 1);
});

test("a stalled tracker request aborts and clears its timer", async () => {
  let cleared = false;
  const { client } = load((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  }), { ...configured, globals: {
    setTimeout: callback => { queueMicrotask(callback); return 1; },
    clearTimeout: () => { cleared = true; }
  } });
  await assert.rejects(client.getJobs(), /Tracker request timed out/);
  assert.equal(cleared, true);
});

test("Applications opens the dashboard on the configured localhost host", async () => {
  const { client, tabs } = load(undefined, { settings: { url: "http://localhost:8765", token: "token" } });
  await client.openDashboard();
  assert.equal(tabs[0].url, "http://localhost:8501/");
});

function background(tracker, pendingApply = null) {
  let listener;
  const context = vm.createContext({
    console: { log() {}, error() {} }, importScripts() {},
    AutoApplyTracker: tracker, Stage4JobParser: {}, Stage3Storage: {},
    chrome: {
      storage: { local: { get: async () => ({ pendingApply }) } },
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(callback) { listener = callback; } }
      }
    }
  });
  vm.runInContext(readFileSync(path.join(root, "extension/lib/types.js"), "utf8"), context);
  vm.runInContext(readFileSync(path.join(root, "extension/background/background.js"), "utf8"), context);
  return (message, sender = {}) => new Promise(resolve => listener(message, sender, resolve));
}

test("content autofill messages use background API requests and change only coverage", async () => {
  const calls = [];
  const send = background({
    createJob: async job => { calls.push(["create", job]); return { id: "job-1" }; },
    patchJob: async (id, patch) => { calls.push(["patch", id, patch]); return { id, ...patch }; }
  });
  const result = await send({ type: "TRACKER_AUTOFILL", job: { company: "Example", job_title: "Engineer", job_url: "https://example.com/1" }, filledFieldCount: 9, formFieldCount: 10, recordedAt: "2026-11-05T12:00:00Z" });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), ["patch", "job-1", {
    autofill_stats: { filled: 9, detected: 10, recorded_at: "2026-11-05T12:00:00Z" }
  }]);
});

test("zero detected fields do not create a tracker coverage sample", async () => {
  const send = background({ createJob: () => { throw new Error("should not create"); } });
  const result = await send({ type: "TRACKER_AUTOFILL", formFieldCount: 0, filledFieldCount: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.data.skipped, true);
});

test("background forwards tracker errors to the content caller", async () => {
  const send = background({ createJob: async () => { throw new Error("Tracker 未啟動"); } });
  const result = await send({ type: "TRACKER_AUTOFILL", job: {}, formFieldCount: 1, filledFieldCount: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Tracker 未啟動");
});

for (const [description, tab] of [
  ["the original tab", { id: 10 }],
  ["an application child tab", { id: 11, openerTabId: 10 }]
]) {
  test(`background preserves the original posting for ${description}`, async () => {
    let created;
    const send = background({
      createJob: async job => { created = job; return { id: "job-a" }; },
      patchJob: async id => ({ id })
    }, {
      sourceTabId: 10, trackerCompany: "Company A", trackerJobTitle: "Engineer A",
      trackerJobUrl: "https://example.com/posting-a"
    });
    const result = await send({
      type: "TRACKER_AUTOFILL", formFieldCount: 2, filledFieldCount: 1,
      job: { company: "Form title", job_title: "Application form", job_url: "https://forms.example.com/apply" }
    }, { tab });
    assert.equal(result.ok, true);
    assert.equal(created.company, "Company A");
    assert.equal(created.job_title, "Engineer A");
    assert.equal(created.job_url, "https://example.com/posting-a");
  });
}

test("an unrelated tab cannot reuse another application's pending context", async () => {
  let created;
  const candidate = { company: "Company B", job_title: "Engineer B", job_url: "https://example.com/posting-b" };
  const send = background({
    createJob: async job => { created = job; return { id: "job-b" }; },
    patchJob: async id => ({ id })
  }, {
    sourceTabId: 10, trackerCompany: "Company A", trackerJobTitle: "Engineer A",
    trackerJobUrl: "https://example.com/posting-a"
  });
  const result = await send({
    type: "TRACKER_AUTOFILL", formFieldCount: 2, filledFieldCount: 1, job: candidate
  }, { tab: { id: 20, openerTabId: 19 } });
  assert.equal(result.ok, true);
  assert.equal(created, candidate);
  assert.equal(created.job_url, "https://example.com/posting-b");
});

test("an explicit current job takes precedence over pending context in the same tab", async () => {
  let created;
  const candidate = { company: "Company B", job_title: "Engineer B", job_url: "https://example.com/posting-b" };
  const send = background({
    createJob: async job => { created = job; return { id: "job-b" }; },
    patchJob: async id => ({ id })
  }, {
    sourceTabId: 10, trackerCompany: "Company A", trackerJobTitle: "Engineer A",
    trackerJobUrl: "https://example.com/posting-a"
  });
  const result = await send({
    type: "TRACKER_AUTOFILL", formFieldCount: 2, filledFieldCount: 1,
    hasExplicitJob: true, job: candidate
  }, { tab: { id: 10 } });
  assert.equal(result.ok, true);
  assert.equal(created, candidate);
});
