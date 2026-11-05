"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadOptions(tracker = {}) {
  const source = readFileSync(path.join(__dirname, "../../extension/options/options.js"), "utf8");
  const boot = / {2}void boot\(\)\.catch\(\(error\) => \{[\s\S]*?\n {2}\}\);\n\}\)\(\);\s*$/;
  assert.match(source, boot);
  const context = {
    AutoApplyTracker: tracker,
    document: {
      getElementById() { return null; },
      querySelectorAll() { return []; }
    }
  };
  vm.runInNewContext(source.replace(boot,
    "  globalThis.trackerOptionsTest = { mergeTrackerImportRecords, setActiveTab, state };\n})();"), context);
  return context.trackerOptionsTest;
}

const plain = value => JSON.parse(JSON.stringify(value));

test("tracker import keeps canonical notes and status alongside newest legacy coverage", () => {
  const { mergeTrackerImportRecords } = loadOptions();
  const notes = [{ date: "2026-11-05", title: "Interview", contentMarkdown: "Bring examples." }];
  const canonical = [{ applicationId: "app", company: "Example Labs", jobTitle: "Engineer",
    jobUrl: "https://example.com/job", status: "Interview", notes }];
  const records = [
    { applicationId: "new", jobUrl: canonical[0].jobUrl, status: "applied", formFieldCount: 10, filledFieldCount: 9 },
    { applicationId: "old", jobUrl: canonical[0].jobUrl, status: "saved", formFieldCount: 5, filledFieldCount: 3 }
  ];
  const merged = mergeTrackerImportRecords(canonical, records);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "Interview");
  assert.equal(merged[0].formFieldCount, 10);
  assert.equal(merged[0].filledFieldCount, 9);
  assert.deepEqual(plain(merged[0].notes), notes);
  assert.equal(canonical[0].formFieldCount, undefined);
});

test("tracker import includes standalone legacy applications and retains their note text", () => {
  const { mergeTrackerImportRecords } = loadOptions();
  const legacy = { applicationId: "legacy", company: "Old Co", role: "Engineer", jobUrl: "https://example.com/old", notes: "Follow up", formFieldCount: 0 };
  assert.deepEqual(plain(mergeTrackerImportRecords([], [legacy])), [legacy]);
  const merged = mergeTrackerImportRecords([{ applicationId: "legacy", company: "", notes: [] }], [legacy]);
  assert.equal(merged[0].company, "Old Co");
  assert.equal(merged[0].notes, "Follow up");
});

test("legacy Applications navigation opens dashboard without selecting a removed view", async () => {
  let opened = 0;
  const { setActiveTab, state } = loadOptions({ async openDashboard() { opened += 1; } });
  setActiveTab("applications");
  await Promise.resolve();
  assert.equal(opened, 1);
  assert.equal(state.activeTab, "dashboard");
});
