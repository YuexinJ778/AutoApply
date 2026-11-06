"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = {};
const source = readFileSync(path.join(__dirname, "../../extension/content/applyPipeline.js"), "utf8");
const exportsMarker = "global.Stage6ApplyRuntime = Object.freeze({";
assert.ok(source.includes(exportsMarker));
// Inspect the private resolver without adding a production runtime API.
vm.runInNewContext(source.replace(exportsMarker,
  "global.resolveAutofillFieldForTest = resolveFieldElement;\n" + exportsMarker), context);
const { countAutofillStats } = context.Stage6ApplyRuntime;
const stats = (fields, results, upload) => JSON.parse(JSON.stringify(countAutofillStats(fields, results, upload)));

test("the shared selector builder distinguishes same-name inputs without IDs", () => {
  const body = { tagName: "BODY", children: [] };
  const fields = [1, 2].map(() => ({
    tagName: "INPUT", id: "", parentElement: body,
    getAttribute(name) { return name === "name" ? "email" : ""; },
    closest() { return null; }
  }));
  body.children = fields;
  context.document = { body, documentElement: {}, querySelectorAll() { return fields; } };
  const selectors = fields.map(context.Stage6ApplyRuntime.getFieldSelector);
  assert.equal(selectors[0], "body > input:nth-of-type(1)");
  assert.equal(selectors[1], "body > input:nth-of-type(2)");
});

test("distinct no-ID fields with the same name both count by their selectors", () => {
  const fields = [
    { name: "email", selector: "form > input:nth-of-type(1)" },
    { name: "email", selector: "form > input:nth-of-type(2)" }
  ];
  const results = fields.map(field => ({ status: "filled", fieldKey: "email", fieldSelector: field.selector }));
  assert.deepEqual(stats(fields, results), { formFieldCount: 2, filledFieldCount: 2 });
});

test("duplicate-ID controls resolve by distinct paths and one filled control counts one of two", () => {
  const body = { tagName: "BODY", children: [] };
  const controls = [1, 2].map(() => ({
    tagName: "INPUT", id: "repeated-id", parentElement: body,
    getAttribute() { return ""; },
    closest() { return null; }
  }));
  body.children = controls;
  context.document = {
    body, documentElement: {}, querySelectorAll() { return controls; },
    getElementById() { return controls[0]; },
    querySelector(selector) {
      if (selector === "body > input:nth-of-type(1)") return controls[0];
      if (selector === "body > input:nth-of-type(2)") return controls[1];
      return null;
    }
  };
  const fields = controls.map(control => ({ id: control.id, selector: context.Stage6ApplyRuntime.getFieldSelector(control) }));
  assert.equal(fields[0].selector, "body > input:nth-of-type(1)");
  assert.equal(fields[1].selector, "body > input:nth-of-type(2)");
  assert.equal(context.resolveAutofillFieldForTest(fields[0]), controls[0]);
  assert.equal(context.resolveAutofillFieldForTest(fields[1]), controls[1]);
  assert.equal(context.resolveAutofillFieldForTest({ ...fields[1], selector: "#stale-selector" }), controls[0]);
  assert.deepEqual(stats(fields, [{ status: "filled", fieldSelector: fields[0].selector }]),
    { formFieldCount: 2, filledFieldCount: 1 });
});

test("base and keyword passes filling the same DOM field count once", () => {
  assert.deepEqual(stats([{ selector: "input#email" }], [
    { status: "filled", fieldSelector: "input#email", reason: "PROFILE_MATCHED" },
    { status: "filled", fieldSelector: "input#email", reason: "STAGE8_MATCHED" }
  ]), { formFieldCount: 1, filledFieldCount: 1 });
});

test("failed, skipped, missing-identity, and unscanned results do not count", () => {
  assert.deepEqual(stats([{ id: "email", selector: "input#email" }], [
    { status: "error", fieldSelector: "input#email" },
    { status: "skipped", fieldSelector: "input#email" },
    { status: "filled", fieldId: "email" },
    { status: "filled", fieldSelector: "input#unscanned" }
  ]), { formFieldCount: 1, filledFieldCount: 0 });
});

test("repeated scan metadata counts one detected DOM field", () => {
  assert.deepEqual(stats([{ selector: "input#email" }, { selector: "input#email" }], [
    { status: "filled", fieldSelector: "input#email" }
  ]), { formFieldCount: 1, filledFieldCount: 1 });
});

test("successful scanned resume uploads count once alongside other fill passes", () => {
  const fields = [{ type: "file", selector: "input#resume" }];
  const upload = { ok: true, fileInputSelector: "input#resume" };
  assert.deepEqual(stats(fields, [], upload), { formFieldCount: 1, filledFieldCount: 1 });
  assert.deepEqual(stats(fields, [
    { status: "filled", fieldSelector: "input#resume" },
    { status: "filled", fieldSelector: "input#resume" }
  ], upload), { formFieldCount: 1, filledFieldCount: 1 });
});

test("failed, skipped, unidentified and unscanned uploads do not count", () => {
  for (const upload of [
    { ok: false, reason: "REGISTRY_ACCESS_FAILED", fileInputSelector: "input#resume" },
    { ok: false, reason: "NO_COMPILED_RESUME_AVAILABLE", fileInputSelector: "input#resume" },
    { ok: true },
    { ok: true, fileInputSelector: "input#unscanned" }
  ]) {
    assert.deepEqual(stats([{ type: "file", selector: "input#resume" }], [], upload),
      { formFieldCount: 1, filledFieldCount: 0 });
  }
});

function uploadFlow(ids) {
  const body = { tagName: "BODY", children: [] };
  class Input {
    constructor(id) {
      this.id = id;
      this.tagName = "INPUT";
      this.type = "file";
      this.parentElement = body;
    }
    getAttribute() { return ""; }
    closest() { return null; }
    dispatchEvent() {}
  }
  const inputs = ids.map(id => new Input(id));
  body.children = inputs;
  const runtime = {
    console: { log() {} },
    window: { location: { href: "https://example.com/apply", hostname: "example.com" } },
    document: {
      body, documentElement: {}, title: "Engineer | Example Labs",
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === 'input[type="file"]') return inputs;
        return inputs.filter(input => input.id && selector === "input#" + input.id);
      }
    },
    HTMLInputElement: Input, atob,
    File: class { constructor(_parts, name) { this.name = name; } },
    Event: class {},
    DataTransfer: class {
      constructor() {
        this.files = [];
        this.items = { add: file => this.files.push(file) };
      }
    },
    Stage6ResumeRegistryStorage: {
      async getLatestCompiledResumeRecord() { return { resumeId: "demo", fileName: "resume.pdf", storageKey: "pdf" }; },
      async getCompiledResumeBlobData() { return { dataBase64: "JVBERg==", mimeType: "application/pdf" }; }
    }
  };
  const setup = `
    global.runCoverageFlowForTest = function(fields, results) {
      loadCandidateProfile = async function() { return { profile: { name: "Demo Candidate" } }; };
      scanForm = function() { return fields; };
      mapFields = function() { return fields.map(field => ({ field, status: "matched" })); };
      autofillTextFields = function() { return results; };
      autofillSelectFields = function() { return []; };
      autofillCheckboxFields = function() { return []; };
      validateApplication = function() { return { canSubmit: true, warnings: [] }; };
      return runPrepareOnlyApplyFlow();
    };
  `;
  vm.runInNewContext(source.replace(exportsMarker, setup + exportsMarker), runtime);
  return { runtime, inputs };
}

test("the full flow includes a successful PDF upload in four-text-plus-file coverage", async () => {
  const { runtime, inputs } = uploadFlow(["resume"]);
  const fields = ["name", "email", "phone", "location"].map(id => ({ type: "text", selector: "input#" + id }));
  fields.push({ type: "file", selector: runtime.Stage6ApplyRuntime.getFieldSelector(inputs[0]) });
  const fills = fields.slice(0, 4).map(field => ({ status: "filled", fieldSelector: field.selector }));
  const result = await runtime.runCoverageFlowForTest(fields, fills);
  assert.equal(inputs[0].files[0].name, "resume.pdf");
  assert.equal(result.uploadSummary.fileInputSelector, "input#resume");
  assert.deepEqual(JSON.parse(JSON.stringify(result.autofillStats)), { formFieldCount: 5, filledFieldCount: 5 });
});

test("uploads to one of multiple no-ID file inputs use the distinct scanned selector", async () => {
  const { runtime, inputs } = uploadFlow(["", ""]);
  inputs[0].disabled = true;
  const fields = inputs.map(input => ({ type: "file", selector: runtime.Stage6ApplyRuntime.getFieldSelector(input) }));
  const result = await runtime.runCoverageFlowForTest(fields, []);
  assert.equal(inputs[0].files, undefined);
  assert.equal(inputs[1].files[0].name, "resume.pdf");
  assert.equal(result.uploadSummary.fileInputSelector, fields[1].selector);
  assert.deepEqual(JSON.parse(JSON.stringify(result.autofillStats)), { formFieldCount: 2, filledFieldCount: 1 });
});
