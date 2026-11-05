"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const plain = value => JSON.parse(JSON.stringify(value));

function element(value = "") {
  return {
    value, textContent: "", innerHTML: "", disabled: false, hidden: false, children: [],
    appendChild(child) { this.children.push(child); },
    classList: { add() {}, remove() {}, toggle() {} }
  };
}

function loadOptions({ tracker = {}, boundary = {}, api = {} } = {}) {
  const source = readFileSync(path.join(__dirname, "../../extension/options/options.js"), "utf8");
  const boot = / {2}void boot\(\)\.catch\(\(error\) => \{[\s\S]*?\n {2}\}\);\n\}\)\(\);\s*$/;
  assert.match(source, boot);
  const ids = ["tracker-status", "status-left", "tracker-url", "tracker-token", "tracker-import-btn",
    "dashboard-stat-offer", "dashboard-stat-rejected", "dashboard-stat-pending", "tracker-notes-job",
    "tracker-notes-editor", "tracker-notes-save-btn", "notes-ai-input", "notes-ai-messages",
    "notes-ai-send-btn", "notes-ai-save-btn", "notes-ai-clear-btn", "profile-firstName", "profile-lastName",
    "profile-email", "profile-phone", "profile-location"];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  elements["tracker-url"].value = "http://127.0.0.1:8765";
  elements["tracker-token"].value = "test-token";
  const settings = { provider: "openai", providers: { openai: { model: "test-model", apiKey: "test-key" } } };
  const context = {
    Error,
    AutoApplyTracker: {
      async getJobs() { return []; }, async getStatuses() { return []; },
      async getSummary() { return { offer: 0, rejected: 0, pending: 0 }; },
      async saveSettings(value) { return value; }, ...tracker
    },
    Stage11DataBoundary: boundary,
    Stage5Api: { async selfCheckTrackerActions() { return { ok: true, approved: true }; }, ...api },
    Stage10AppDataStore: { createDefaultAppData() { return { profile: {}, resumes: {}, settings }; } },
    chrome: { storage: { local: {
      set() { throw new Error("Notes must not be written to browser storage"); },
      remove() { throw new Error("Legacy notes must not be deleted"); }
    } } },
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement() { return element(); },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    }
  };
  const exposed = "refreshTrackerData, loadTrackerNotes, saveTrackerNotes, buildNotesAiContext, handleNotesAiSend, saveLatestNotesAiReply, handleNotesAiClear, importExistingApplicationsToTracker, setActiveTab, getActiveResume, flushManualResumeEditsToSharedState, applyAiExecutionResult, saveProfileResumeStateFromSharedState, state";
  vm.createContext(context);
  vm.runInContext(readFileSync(path.join(__dirname, "../../extension/options/trackerFunctions.js"), "utf8"), context);
  vm.runInContext(source.replace(boot,
    `  globalThis.trackerOptionsTest = { ${exposed} };\n})();`), context);
  const runtime = context.trackerOptionsTest;
  runtime.state.settings = settings;
  return { ...runtime, elements };
}

const job = { id: "job-1", company: "Example Labs", job_title: "Engineer", status_id: "custom_screen", location: "Remote" };

test("dashboard counts and note picker use server summary and custom statuses", async () => {
  const run = loadOptions({ tracker: {
    async getJobs() { return [job]; },
    async getStatuses() { return [{ id: "custom_screen", label: "Custom Screening" }]; },
    async getSummary() { return { offer: 3, rejected: 2, pending: 7 }; },
    async getNotes(id) { assert.equal(id, job.id); return { notes: "Server Markdown" }; }
  } });
  await run.refreshTrackerData();
  assert.equal(run.elements["dashboard-stat-offer"].textContent, "3");
  assert.equal(run.elements["dashboard-stat-rejected"].textContent, "2");
  assert.equal(run.elements["dashboard-stat-pending"].textContent, "7");
  assert.match(run.elements["tracker-notes-job"].children[0].textContent, /Custom Screening/);
  assert.equal(run.elements["tracker-notes-editor"].value, "Server Markdown");
});

test("notes editor writes Markdown through the selected job API", async () => {
  const writes = [];
  const run = loadOptions({ tracker: {
    async saveNotes(id, notes) { writes.push({ id, notes }); return { notes }; }
  } });
  run.state.notesPage.selectedJobId = job.id;
  run.state.notesPage.loadedJobId = job.id;
  run.elements["tracker-notes-editor"].value = "Edited **Markdown**";
  await run.saveTrackerNotes();
  assert.deepEqual(writes, [{ id: job.id, notes: "Edited **Markdown**" }]);
  assert.equal(run.state.notesPage.notes, "Edited **Markdown**");
});

test("a late notes response does not overwrite the newly selected job", async () => {
  let finish;
  const run = loadOptions({ tracker: { getNotes() { return new Promise(resolve => { finish = resolve; }); } } });
  run.state.notesPage.selectedJobId = "job-1";
  const pending = run.loadTrackerNotes("job-1");
  run.state.notesPage.selectedJobId = "job-2";
  run.elements["tracker-notes-editor"].value = "Job 2 draft";
  finish({ notes: "Job 1 notes" });
  await pending;
  assert.equal(run.elements["tracker-notes-editor"].value, "Job 2 draft");
});

test("notes AI reads fresh notes across server applications and keeps chat in memory", async () => {
  let request;
  const second = { ...job, id: "job-2", company: "Other Co" };
  const run = loadOptions({ tracker: {
    async getJobs() { return [job, second]; },
    async getNotes(id) { return { notes: id === job.id ? "First job deadline" : "Second job interview" }; }
  }, api: { async planTrackerActions(value) { request = plain(value); return { ok: true, assistantMessage: "Compare both timelines.", functionCalls: [] }; } } });
  run.state.notesPage.selectedJobId = job.id;
  run.elements["notes-ai-input"].value = "Compare my applications";
  await run.handleNotesAiSend();
  assert.equal(request.notesContext.totalNotes, 2);
  assert.deepEqual(request.notesContext.applications.map(item => item.company), ["Example Labs", "Other Co"]);
  assert.equal(run.state.notesPage.aiMessages.length, 2);
  assert.equal(run.state.notesPage.aiMessages[1].content, "Compare both timelines.");
  run.handleNotesAiClear();
  assert.equal(run.state.notesPage.aiMessages.length, 0);
});

test("one request updates status and adds a reminder without requiring existing notes", async () => {
  const calls = [
    { name: "setJobStatus", args: { company: "Example Labs", status: "Interviewing" } },
    { name: "addReminder", args: { company: "Example Labs", kind: "interview", datetime: "2026-11-12T10:00", title: "Interview" } }
  ];
  const statuses = [{ id: "custom_interview", label: "Interviewing" }];
  const updated = { ...job, status_id: "custom_interview" };
  let planRequest, checkRequest, batch, summaryReads = 0, executionCount = 0;
  const run = loadOptions({ tracker: {
    async getJobs() { return [updated]; },
    async getStatuses() { return statuses; },
    async getNotes() { return { notes: "" }; },
    async getSummary() { summaryReads += 1; return { offer: 0, rejected: 0, pending: 1 }; },
    async executeActions(functionCalls, timezone) {
      executionCount += 1;
      batch = { functionCalls: plain(functionCalls), timezone };
      return { ok: true, results: [
        { name: "setJobStatus", job: updated },
        { name: "addReminder", job: updated, reminder: { title: "Interview" } }
      ] };
    }
  }, api: {
    async planTrackerActions(value) { planRequest = plain(value); return { ok: true, assistantMessage: "MODEL PLAN ONLY", functionCalls: calls }; },
    async selfCheckTrackerActions(value) { checkRequest = plain(value); return { ok: true, approved: true }; }
  } });
  run.elements["notes-ai-input"].value = "Set Example Labs to Interviewing and add an interview reminder on November 12 at 10:00";
  await run.handleNotesAiSend();
  assert.equal(planRequest.notesContext.totalNotes, 0);
  assert.equal(planRequest.selectedJob, null);
  assert.deepEqual(planRequest.statuses, statuses);
  assert.match(planRequest.currentDateTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.equal(planRequest.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.deepEqual(checkRequest.functionCalls, calls);
  assert.deepEqual(batch, { functionCalls: calls, timezone: planRequest.timezone });
  assert.equal(executionCount, 1);
  assert.equal(summaryReads, 1);
  assert.match(run.state.notesPage.aiMessages.at(-1).content, /Status updated: Example Labs — Engineer \(Interviewing\)/);
  assert.match(run.state.notesPage.aiMessages.at(-1).content, /Reminder added: Example Labs — Engineer — Interview/);
  assert.doesNotMatch(run.state.notesPage.aiMessages.at(-1).content, /MODEL PLAN ONLY/);
});

test("successful status and reminder actions refresh counts while retaining the selected unsaved notes draft", async () => {
  const updated = { ...job, status_id: "interviewing" };
  let noteReads = 0;
  const run = loadOptions({ tracker: {
    async getJobs() { return [updated]; },
    async getStatuses() { return [{ id: "interviewing", label: "Interviewing" }]; },
    async getNotes() { noteReads += 1; return { notes: "Saved notes" }; },
    async getSummary() { return { offer: 2, rejected: 1, pending: 4 }; },
    async executeActions() { return { ok: true, results: [
      { name: "setJobStatus", job: updated },
      { name: "addReminder", job: updated, reminder: { title: "Interview" } }
    ] }; }
  }, api: {
    async planTrackerActions() { return { ok: true, assistantMessage: "Planning", functionCalls: [
      { name: "setJobStatus", args: { company: job.company, status: "Interviewing" } },
      { name: "addReminder", args: { company: job.company, kind: "interview", datetime: "2026-11-12T10:00", title: "Interview" } }
    ] }; }
  } });
  run.state.notesPage.jobs = [job];
  run.state.notesPage.selectedJobId = job.id;
  run.state.notesPage.loadedJobId = job.id;
  run.state.notesPage.notes = "Saved notes";
  run.elements["tracker-notes-editor"].value = "Unsaved **draft**";
  run.elements["notes-ai-input"].value = "Set Example Labs to Interviewing and add an interview reminder";
  await run.handleNotesAiSend();
  assert.equal(run.state.notesPage.selectedJobId, job.id);
  assert.equal(run.state.notesPage.loadedJobId, job.id);
  assert.equal(run.elements["tracker-notes-editor"].value, "Unsaved **draft**");
  assert.equal(run.state.notesPage.notes, "Saved notes");
  assert.equal(run.elements["dashboard-stat-offer"].textContent, "2");
  assert.equal(run.elements["dashboard-stat-pending"].textContent, "4");
  assert.equal(noteReads, 1, "Planner reads server notes; refresh retains the dirty editor without reloading it");
  assert.match(run.elements["tracker-status"].textContent, /unsaved notes draft was retained/);
});

test("an add-note action refreshes a clean editor with the latest shared server notes", async () => {
  let notes = "Saved notes";
  const run = loadOptions({ tracker: {
    async getJobs() { return [job]; },
    async getNotes() { return { notes }; },
    async executeActions() {
      notes += "\n\nPrepare a demo.";
      return { ok: true, results: [{ name: "addJobNote", job }] };
    }
  }, api: {
    async planTrackerActions() { return { ok: true, assistantMessage: "Planning", functionCalls: [
      { name: "addJobNote", args: { company: job.company, text: "Prepare a demo." } }
    ] }; }
  } });
  run.state.notesPage.jobs = [job];
  run.state.notesPage.selectedJobId = job.id;
  run.state.notesPage.loadedJobId = job.id;
  run.state.notesPage.notes = notes;
  run.elements["tracker-notes-editor"].value = notes;
  run.elements["notes-ai-input"].value = "Add a note for Example Labs: Prepare a demo.";
  await run.handleNotesAiSend();
  assert.equal(run.elements["tracker-notes-editor"].value, "Saved notes\n\nPrepare a demo.");
  assert.equal(run.state.notesPage.notes, notes);
  assert.equal(run.state.notesPage.selectedJobId, job.id);
});

test("assistant remains usable with no selected job and reports server ambiguity without success", async () => {
  let plans = 0, executions = 0, checks = 0;
  const run = loadOptions({ tracker: {
    async executeActions() {
      executions += 1;
      return { ok: false, code: "AMBIGUOUS", error: "Multiple applications match Example Labs.", candidates: [
        { company: "Example Labs", jobTitle: "Engineer" }, { company: "Example Labs", jobTitle: "Designer" }
      ] };
    }
  }, api: {
    async planTrackerActions() { plans += 1; return { ok: true, assistantMessage: "Changed successfully!", functionCalls: [
      { name: "setJobStatus", args: { company: "Example Labs", status: "Interviewing" } }
    ] }; },
    async selfCheckTrackerActions() { checks += 1; return { ok: true, approved: true }; }
  } });
  await run.refreshTrackerData();
  assert.equal(run.elements["tracker-notes-editor"].disabled, true);
  assert.equal(run.elements["notes-ai-input"].disabled, false);
  assert.equal(run.elements["notes-ai-send-btn"].disabled, false);
  run.elements["notes-ai-input"].value = "Change Example Labs to Interviewing";
  await run.handleNotesAiSend();
  const response = run.state.notesPage.aiMessages.at(-1).content;
  assert.match(response, /No changes were made/);
  assert.match(response, /Example Labs — Engineer/);
  assert.match(response, /Example Labs — Designer/);
  assert.match(response, /Please clarify/);
  assert.doesNotMatch(response, /Changed successfully/);
  assert.deepEqual([plans, checks, executions], [1, 1, 1]);
});

test("assistant snapshots the selected job before asynchronous Tracker reads", async () => {
  let finish, selected;
  const second = { ...job, id: "job-2", company: "Other Co" };
  const run = loadOptions({ tracker: {
    getStatuses() { return new Promise(resolve => { finish = resolve; }); }
  }, api: {
    async planTrackerActions(value) { selected = plain(value.selectedJob); return { ok: true, assistantMessage: "Please specify the reminder time.", functionCalls: [] }; }
  } });
  run.state.notesPage.jobs = [job, second];
  run.state.notesPage.selectedJobId = job.id;
  run.elements["notes-ai-input"].value = "Add a reminder for the selected job";
  const pending = run.handleNotesAiSend();
  run.state.notesPage.selectedJobId = second.id;
  finish([]);
  await pending;
  assert.deepEqual(selected, { company: job.company, jobTitle: job.job_title });
});

test("nonallowlisted tracker actions never reach the self-check or server", async () => {
  let checks = 0, executions = 0;
  const run = loadOptions({ tracker: { async executeActions() { executions += 1; } }, api: {
    async planTrackerActions() { return { ok: true, assistantMessage: "Deleted.", functionCalls: [{ name: "deleteJob", args: { company: "Example Labs" } }] }; },
    async selfCheckTrackerActions() { checks += 1; return { ok: true, approved: true }; }
  } });
  run.elements["notes-ai-input"].value = "Delete Example Labs";
  await run.handleNotesAiSend();
  assert.match(run.state.notesPage.aiMessages.at(-1).content, /Unknown tracker function: deleteJob/);
  assert.deepEqual([checks, executions], [0, 0]);
});

test("rejected, failed and malformed self-checks prevent every Tracker action", async () => {
  for (const check of [
    { ok: true, approved: false, reason: "The user asked a question, not a status change." },
    { ok: false, approved: false, reason: "Model request failed." },
    { ok: false, approved: true }, {}
  ]) {
    let executions = 0;
    const run = loadOptions({ tracker: { async executeActions() { executions += 1; } }, api: {
      async planTrackerActions() { return { ok: true, assistantMessage: "Saved.", functionCalls: [
        { name: "setJobStatus", args: { company: "Example Labs", status: "Applied" } }
      ] }; },
      async selfCheckTrackerActions() { return check; }
    } });
    run.elements["notes-ai-input"].value = "What do my notes say about Example Labs?";
    await run.handleNotesAiSend();
    assert.equal(executions, 0);
    assert.match(run.state.notesPage.aiMessages.at(-1).content, /No changes were made/);
    assert.doesNotMatch(run.state.notesPage.aiMessages.at(-1).content, /Saved/);
  }
});

test("read-only answers do not self-check or execute actions and retain the visible chat context", async () => {
  let request;
  const run = loadOptions({ tracker: {
    async getJobs() { return [job]; }, async getNotes() { return { notes: "Call next week." }; },
    async executeActions() { assert.fail("A question must not write Tracker data"); }
  }, api: {
    async planTrackerActions(value) { request = plain(value); return { ok: true, assistantMessage: "Your notes say to call next week.", functionCalls: [] }; },
    async selfCheckTrackerActions() { assert.fail("A read-only answer needs no action self-check"); }
  } });
  run.state.notesPage.aiMessages = [{ role: "user", content: "Compare my deadlines" }, { role: "assistant", content: "One deadline is next week." }];
  run.elements["notes-ai-input"].value = "What should I do next?";
  await run.handleNotesAiSend();
  assert.deepEqual(request.chatHistory, [{ role: "user", text: "Compare my deadlines" }, { role: "assistant", text: "One deadline is next week." }]);
  assert.equal(run.state.notesPage.aiMessages.at(-1).content, "Your notes say to call next week.");
});

test("saving an AI reply preserves an unsaved Markdown draft and targets the selected job", async () => {
  let written;
  const run = loadOptions({ tracker: { async saveNotes(id, notes) { written = { id, notes }; return { notes }; } } });
  run.state.notesPage.selectedJobId = job.id;
  run.state.notesPage.loadedJobId = job.id;
  run.state.notesPage.aiMessages = [{ role: "assistant", content: "Prepare a demo." }];
  run.elements["tracker-notes-editor"].value = "Unsaved draft";
  await run.saveLatestNotesAiReply();
  assert.equal(written.id, job.id);
  assert.equal(written.notes, "Unsaved draft\n\n## Tracker Assistant\n\nPrepare a demo.");
  assert.equal(run.elements["tracker-notes-editor"].value, written.notes);
});

test("switching jobs clears old notes and blocks writes until the selected file loads", async () => {
  let finish;
  const writes = [];
  const run = loadOptions({ tracker: {
    getNotes() { return new Promise(resolve => { finish = resolve; }); },
    async saveNotes(id, notes) { writes.push({ id, notes }); return { notes }; }
  } });
  run.state.notesPage.selectedJobId = "job-B";
  run.state.notesPage.loadedJobId = "job-A";
  run.state.notesPage.aiMessages = [{ role: "assistant", content: "Reply" }];
  run.elements["tracker-notes-editor"].value = "Job A notes";
  const pending = run.loadTrackerNotes("job-B");
  assert.equal(run.elements["tracker-notes-editor"].value, "");
  assert.equal(run.elements["tracker-notes-editor"].disabled, true);
  assert.equal(run.elements["tracker-notes-save-btn"].disabled, true);
  assert.equal(run.elements["notes-ai-save-btn"].disabled, true);
  await run.saveTrackerNotes();
  await run.saveLatestNotesAiReply();
  assert.equal(writes.length, 0);
  finish({ notes: "Job B notes" });
  await pending;
  assert.equal(run.elements["tracker-notes-editor"].value, "Job B notes");
  assert.equal(run.elements["tracker-notes-save-btn"].disabled, false);
});

test("a failed selected-job load leaves editing and saves disabled", async () => {
  let writes = 0;
  const run = loadOptions({ tracker: {
    async getNotes() { throw new Error("Job not found."); },
    async saveNotes() { writes += 1; }
  } });
  run.state.notesPage.selectedJobId = "job-B";
  run.state.notesPage.loadedJobId = "job-A";
  run.state.notesPage.aiMessages = [{ role: "assistant", content: "Reply" }];
  run.elements["tracker-notes-editor"].value = "Job A notes";
  await assert.rejects(run.loadTrackerNotes("job-B"), /Job not found/);
  assert.equal(run.elements["tracker-notes-editor"].value, "");
  assert.equal(run.elements["tracker-notes-editor"].disabled, true);
  assert.equal(run.elements["tracker-notes-save-btn"].disabled, true);
  assert.equal(run.elements["notes-ai-save-btn"].disabled, true);
  await run.saveTrackerNotes();
  await run.saveLatestNotesAiReply();
  assert.equal(writes, 0);
});

test("legacy import reads the dedicated helper without deleting or rewriting browser data", async () => {
  const legacy = [{ applicationId: "old", company: "Old Co", status: "Interview", jobUrl: "https://example.com/job",
    notes: [{ date: "2026-11-05", title: "Call", contentMarkdown: "Bring a demo." }], formFieldCount: 3, filledFieldCount: 2 }];
  let imported;
  const run = loadOptions({ tracker: { async importJobs(records) { imported = plain(records); return [{ id: "server-id" }]; } },
    boundary: { async getLegacyApplications() { return legacy; } } });
  await run.importExistingApplicationsToTracker();
  assert.deepEqual(imported, legacy);
  assert.equal(run.elements["tracker-import-btn"].disabled, false);
});

test("tracker refresh failure leaves profile state available and exposes the actual error", async () => {
  const run = loadOptions({ tracker: { async getJobs() { throw new Error("Tracker is not running. Open dashboard."); } } });
  const before = run.state.appData;
  await run.refreshTrackerData();
  assert.equal(run.state.appData, before);
  assert.equal(run.state.trackerSummary, null);
  assert.match(run.elements["tracker-status"].textContent, /Tracker is not running/);
});

test("master resume manual edits, AI result and profile save avoid application data", async () => {
  let saved;
  const run = loadOptions({ boundary: { async saveAppData(value) { saved = plain(value); return value; } } });
  run.elements["profile-firstName"].value = "Manual";
  run.elements["profile-lastName"].value = "Applicant";
  run.elements["profile-email"].value = "demo@example.com";
  run.flushManualResumeEditsToSharedState({ markDirty: false });
  assert.equal(run.getActiveResume().header.contact.firstName, "Manual");
  const resume = plain(run.getActiveResume());
  resume.header.contact.firstName = "AI edited";
  run.applyAiExecutionResult({ resumeState: resume }, "en");
  assert.equal(run.getActiveResume().header.contact.firstName, "AI edited");
  await run.saveProfileResumeStateFromSharedState();
  assert.equal(saved.resumes.en.header.contact.firstName, "AI edited");
  assert.equal(Object.hasOwn(saved, "applications"), false);
  assert.equal(Object.hasOwn(saved, "jobs"), false);
  assert.equal(Object.hasOwn(saved, "notes"), false);
});

test("legacy Applications navigation opens dashboard without selecting a removed view", async () => {
  let opened = 0;
  const { setActiveTab, state } = loadOptions({ tracker: { async openDashboard() { opened += 1; } } });
  setActiveTab("applications");
  await Promise.resolve();
  assert.equal(opened, 1);
  assert.equal(state.activeTab, "dashboard");
});
