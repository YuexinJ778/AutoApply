"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const plain = value => JSON.parse(JSON.stringify(value));
const settings = { provider: "minimax", providers: { minimax: { model: "fixture", apiKey: "fake-key", baseUrl: "https://fixture.invalid/anthropic" } } };
const jobData = { company: "Example Labs", role: "Platform Engineer", title: "Platform Engineer", rawText: "Build reliable internal APIs and data workflows.", jobUrl: "https://example.test/job" };
const base = {
  id: "resume-en", language: "en",
  header: { contact: { firstName: "Demo", lastName: "Applicant", email: "demo.applicant@example.com", phone: "+1-202-555-0147", location: "San Francisco, CA", links: [{ id: "portfolio", text: "example.com/demo", order: 1 }] } },
  sections: [
    { id: "experience", sectionName: "Experience", order: 1, blocks: [{ id: "studio", order: 1, lines: [
      { id: "role", type: "title", text: "Software Engineer | Example Studio", bold: true, order: 1 },
      { id: "api-bullet", type: "bullet", text: "Built reliable internal APIs and workflow tools.", order: 2 }
    ] }] },
    { id: "skills", sectionName: "Skills", order: 2, blocks: [{ id: "skills-entry", order: 1, lines: [
      { id: "skills-line", type: "paragraph", text: "Python, JavaScript, SQL, REST APIs", order: 1 }
    ] }] }
  ]
};
const tailoredText = "Built internal workflow tools and reliable APIs.";
const edit = { name: "setLine", args: { sectionId: "experience", entryId: "studio", lineId: "api-bullet", text: tailoredText } };

function load(outputs) {
  const stored = { jobPosting: plain(jobData) }, prompts = [];
  const context = vm.createContext({
    TextEncoder, Uint8Array, URL, btoa, atob, structuredClone,
    // The browser supplies DOMParser. Preserve the rendered body's text for the real PDF builder.
    DOMParser: class {
      parseFromString(html) {
        const body = html.split(/<body[^>]*>/i)[1].split(/<\/body>/i)[0];
        return { body: { textContent: body.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'") } };
      }
    },
    chrome: { runtime: {}, storage: { local: {
      get(keys, callback) { callback(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, stored[key]]))); },
      set(values, callback) { Object.assign(stored, plain(values)); callback(); }
    } } },
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body);
      const content = payload.messages[0].content;
      prompts.push(Array.isArray(content) ? content.map(item => item.text).join("\n") : content);
      const value = outputs[prompts.length - 1];
      if (value instanceof Error) throw value;
      return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: "text", text: JSON.stringify(value) }] }) };
    }
  });
  const html = readFileSync(path.join(root, "extension/popup/popup.html"), "utf8");
  const modules = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  for (const module of modules.filter(file => file !== "popup.js")) {
    vm.runInContext(readFileSync(path.resolve(root, "extension/popup", module), "utf8"), context, { filename: module });
  }
  return { context, stored, prompts, api: context.Stage5Api };
}

function artifacts(stored) {
  return Object.entries(stored).filter(([key]) => key.startsWith("stage5_output/"));
}

test("saved manual resume reaches the planner and validated edited HTML/PDF without changing the base", async () => {
  const run = load([{ assistantMessage: "Rephrasing one existing bullet.", functionCalls: [edit] }, { approved: true, reason: "No new facts." }]);
  await run.context.Stage11DataBoundary.saveAppData({ profile: { firstName: "Demo", lastName: "Applicant", email: "demo.applicant@example.com" }, resumes: { en: base }, activeResumeLanguage: "en" });
  const saved = await run.context.Stage11DataBoundary.getAppData();
  const before = plain(run.stored);
  const currentResume = plain(saved.resumes.en);
  const result = await run.api.generateResume({ jobData, settings, currentResume, activeResumeLanguage: "en" });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.candidateSource, "request.currentResume");
  assert.equal(run.prompts.length, 2);
  for (const prompt of run.prompts) {
    assert.ok(prompt.includes(base.sections[0].blocks[0].lines[1].text));
    assert.ok(prompt.includes("Platform Engineer"));
    assert.ok(prompt.includes("api-bullet"));
    assert.ok(prompt.includes("demo.applicant@example.com"));
  }
  const html = run.stored[result.htmlPath].content;
  const pdf = Buffer.from(run.stored[result.pdfPath].content, "base64").toString("ascii");
  for (const text of [tailoredText, "Software Engineer | Example Studio", "Python, JavaScript, SQL, REST APIs", "Demo Applicant", "demo.applicant@example.com", "+1-202-555-0147", "example.com/demo"]) {
    assert.ok(html.includes(text), text + " missing from HTML");
    assert.ok(pdf.includes(text), text + " missing from PDF");
  }
  assert.ok(pdf.includes("(Experience) Tj"), "section heading must remain a separate PDF line");
  assert.ok(pdf.includes("(Software Engineer | Example Studio) Tj"), "entry title must remain a separate PDF line");
  assert.ok(pdf.includes("(" + tailoredText + ") Tj"), "edited bullet must remain a separate PDF line");
  assert.equal(artifacts(run.stored).length, 3);
  for (const [key, value] of Object.entries(before)) assert.deepEqual(run.stored[key], value, "base store changed: " + key);
  assert.deepEqual(currentResume, plain(saved.resumes.en));
  assert.equal(result.tailoredResumeDraft.sections[0].blocks[0].lines[1].text, tailoredText);
});

test("the selected Chinese resume keeps its section names and contact values", async () => {
  const run = load([{ assistantMessage: "No edits needed.", functionCalls: [] }]);
  const chinese = plain(base);
  chinese.language = "zh";
  chinese.sections[0].sectionName = "經歷";
  chinese.header.contact.location = "Taipei";
  const result = await run.api.generateResume({ jobData, settings, currentResume: chinese, activeResumeLanguage: "zh" });
  assert.equal(result.ok, true, result.error);
  const html = run.stored[result.htmlPath].content;
  assert.match(html, /lang="zh-TW"/);
  assert.ok(html.includes("經歷"));
  assert.ok(html.includes("Taipei"));
  assert.equal(run.prompts.length, 1);
  assert.deepEqual(plain(result.tailoredResumeDraft), chinese);
});

test("unknown operations and missing targets stop before self-check or artifacts", async () => {
  for (const call of [{ name: "replaceResume", args: {} }, { ...edit, args: { ...edit.args, lineId: "missing" } }]) {
    const run = load([{ assistantMessage: "Changed.", functionCalls: [call] }]);
    const result = await run.api.generateResume({ jobData, settings, currentResume: base });
    assert.equal(result.ok, false);
    assert.equal(run.prompts.length, 1);
    assert.equal(artifacts(run.stored).length, 0);
  }
});

test("a rejected self-check leaves the base and artifact store untouched", async () => {
  const run = load([{ assistantMessage: "Changed.", functionCalls: [edit] }, { approved: false, reason: "Unsupported change." }]);
  const source = plain(base);
  const result = await run.api.generateResume({ jobData, settings, currentResume: source });
  assert.equal(result.ok, false);
  assert.equal(result.code, "RESUME_SELF_CHECK_REJECTED");
  assert.equal(artifacts(run.stored).length, 0);
  assert.deepEqual(source, base);
});

test("a provider failure creates no artifacts", async () => {
  const run = load([new Error("offline")]);
  const result = await run.api.generateResume({ jobData, settings, currentResume: base });
  assert.equal(result.ok, false);
  assert.equal(artifacts(run.stored).length, 0);
});

test("an empty current resume keeps the legacy typed-master generation path", async () => {
  const typed = {
    header: { name: "Demo Applicant", email: "demo.applicant@example.com" }, targetRole: "Platform Engineer",
    professionalSummary: "Build reliable APIs.", selectedSkills: ["Python"],
    tailoredExperience: [{ company: "Example Studio", title: "Engineer", bullets: ["Built internal APIs."] }], education: [], projects: []
  };
  const run = load([typed]);
  const result = await run.api.generateResume({ jobData, settings, currentResume: { sections: [] },
    profile: { firstName: "Demo", lastName: "Applicant", email: "demo.applicant@example.com" },
    masterResume: { experiences: [{ company: { en: "Example Studio" }, title: { en: "Engineer" }, bullets: [{ en: "Built internal APIs." }] }] }
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(run.prompts.length, 1);
  assert.match(run.prompts[0], /CANDIDATE_RESUME:/);
  assert.ok(run.stored[result.htmlPath].content.includes("Example Studio"));
});
