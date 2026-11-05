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
const stats = (fields, results) => JSON.parse(JSON.stringify(countAutofillStats(fields, results)));

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
