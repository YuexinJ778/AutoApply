(function attachResumeAiFunctions(global) {
  "use strict";

  function cs(value) {
    return typeof value === "string" ? value.trim() : (typeof value === "number" && isFinite(value) ? String(value) : "");
  }

  function createId(prefix) {
    return cs(prefix || "id") + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  var ALLOWED_FUNCTIONS = new Set([
    "setContactField", "addContactLink", "deleteContactLink",
    "addSection", "setSection", "deleteSection", "moveSection",
    "addEntry", "deleteEntry", "moveEntry",
    "addLine", "setLine", "deleteLine", "moveLine"
  ]);
  var MAX_FUNCTION_CALLS = 10;

  var CONTACT_FIELDS = new Set(["firstName", "lastName", "email", "phone", "location"]);
  var LINE_TYPES = new Set(["title", "date", "subtitle", "bullet", "paragraph"]);
  var FORBIDDEN_ARG_KEYS = new Set(["resume", "resumeJson", "resumeJSON", "resumeState", "fullResume", "profile", "application"]);

  function cloneResume(resume) {
    return JSON.parse(JSON.stringify(resume));
  }

  function enforceLineFormatting(line) {
    if (line.type === "title") { line.bold = true; }
    if (line.type === "subtitle") { line.italic = true; }
    return line;
  }

  function targetError(code, missingType, missingId, message, call) {
    return {
      ok: false,
      error: message,
      code: code,
      missingType: missingType,
      missingId: cs(missingId),
      failedCall: call || null,
      targetNotFound: true
    };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function hasForbiddenResumePayload(value) {
    if (!isPlainObject(value)) return false;
    var keys = Object.keys(value);
    if (keys.indexOf("header") !== -1 && keys.indexOf("sections") !== -1) return true;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (FORBIDDEN_ARG_KEYS.has(key)) return true;
      if (hasForbiddenResumePayload(value[key])) return true;
    }
    return false;
  }

  function validationError(message, call) {
    return { ok: false, error: message, failedCall: call || null };
  }

  function getSections(resume) {
    return Array.isArray(resume && resume.sections) ? resume.sections : [];
  }

  function findSection(resume, sectionId) {
    return getSections(resume).find(function(section) { return cs(section && section.id) === cs(sectionId); }) || null;
  }

  function findEntry(section, entryId) {
    var blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
    return blocks.find(function(block) { return cs(block && block.id) === cs(entryId); }) || null;
  }

  function findLine(entry, lineId) {
    var lines = Array.isArray(entry && entry.lines) ? entry.lines : [];
    return lines.find(function(line) { return cs(line && line.id) === cs(lineId); }) || null;
  }

  function validateSectionTarget(resume, rawSectionId, context, call) {
    var id = cs(rawSectionId);
    if (id === "$lastSection") {
      if (!context.lastSectionAvailable) {
        return targetError("LAST_SECTION_NOT_AVAILABLE", "section", "$lastSection", "$lastSection used but no previous addSection in this sequence.", call);
      }
      return { ok: true, id: "$lastSection", section: null, pending: true, key: "$lastSection" };
    }
    var section = findSection(resume, id);
    if (!section) return targetError("SECTION_NOT_FOUND", "section", id, "Section not found: " + id, call);
    return { ok: true, id: id, section: section, pending: false, key: id };
  }

  function validateEntryTarget(resume, sectionTarget, rawEntryId, context, call) {
    var id = cs(rawEntryId);
    if (id === "$lastEntry") {
      if (!context.lastEntryAvailable) {
        return targetError("LAST_ENTRY_NOT_AVAILABLE", "entry", "$lastEntry", "$lastEntry used but no previous addEntry in this sequence.", call);
      }
      if (context.lastEntrySectionKey && sectionTarget.key && context.lastEntrySectionKey !== sectionTarget.key) {
        return targetError("ENTRY_NOT_FOUND", "entry", "$lastEntry", "$lastEntry does not belong to the selected section.", call);
      }
      return { ok: true, id: "$lastEntry", entry: null, pending: true };
    }
    if (sectionTarget.pending) {
      return targetError("ENTRY_NOT_FOUND", "entry", id, "Entry cannot be found in a newly added section without $lastEntry.", call);
    }
    var entry = findEntry(sectionTarget.section, id);
    if (!entry) return targetError("ENTRY_NOT_FOUND", "entry", id, "Entry not found: " + id, call);
    return { ok: true, id: id, entry: entry, pending: false };
  }

  function validateResumeFunctionBatch(calls, resumeState) {
    if (!Array.isArray(calls)) return { ok: false, error: "functionCalls must be an array.", resumeState: resumeState };
    if (calls.length > MAX_FUNCTION_CALLS) return { ok: false, error: "A resume AI turn may execute at most 10 function calls.", resumeState: resumeState };
    var context = { lastSectionAvailable: false, lastEntryAvailable: false, lastEntrySectionKey: "" };

    for (var i = 0; i < calls.length; i++) {
      var call = calls[i];
      if (!isPlainObject(call)) return validationError("Each function call must be an object.", call);
      var name = cs(call.name);
      var args = call.args;
      if (!ALLOWED_FUNCTIONS.has(name)) return validationError("Unknown function: " + name, call);
      if (!isPlainObject(args)) return validationError("Function args must be an object for " + name + ".", call);
      if (hasForbiddenResumePayload(args)) return validationError("Function args must not include full resume JSON or profile/application objects.", call);

      var sectionTarget;
      var entryTarget;
      var lineId;
      var lineType;
      var direction;

      switch (name) {
        case "setContactField":
          if (!CONTACT_FIELDS.has(cs(args.field))) return validationError("Unknown contact field: " + cs(args.field), call);
          break;
        case "addContactLink":
          if (!cs(args.text)) return validationError("Link text is required.", call);
          if (/^https?:\/\//i.test(cs(args.text))) return validationError("Contact links must be plain text without https://.", call);
          break;
        case "deleteContactLink":
          var linkId = cs(args.linkId);
          var links = resumeState && resumeState.header && resumeState.header.contact && Array.isArray(resumeState.header.contact.links) ? resumeState.header.contact.links : [];
          if (!links.some(function(link) { return cs(link && link.id) === linkId; })) {
            return targetError("LINK_NOT_FOUND", "link", linkId, "Link not found: " + linkId, call);
          }
          break;
        case "addSection":
          if (!cs(args.name)) return validationError("Section name is required.", call);
          context.lastSectionAvailable = true;
          break;
        case "setSection":
          if (!cs(args.name)) return validationError("Section name is required.", call);
          sectionTarget = validateSectionTarget(resumeState, args.sectionId, context, call);
          if (!sectionTarget.ok) return sectionTarget;
          break;
        case "deleteSection":
        case "moveSection":
          sectionTarget = validateSectionTarget(resumeState, args.sectionId, context, call);
          if (!sectionTarget.ok) return sectionTarget;
          if (name === "moveSection" && cs(args.direction) !== "up" && cs(args.direction) !== "down") {
            return validationError("direction must be up or down", call);
          }
          break;
        case "addEntry":
          sectionTarget = validateSectionTarget(resumeState, args.sectionId, context, call);
          if (!sectionTarget.ok) return sectionTarget;
          context.lastEntryAvailable = true;
          context.lastEntrySectionKey = sectionTarget.key;
          break;
        case "deleteEntry":
        case "moveEntry":
          sectionTarget = validateSectionTarget(resumeState, args.sectionId, context, call);
          if (!sectionTarget.ok) return sectionTarget;
          entryTarget = validateEntryTarget(resumeState, sectionTarget, args.entryId, context, call);
          if (!entryTarget.ok) return entryTarget;
          if (name === "moveEntry" && cs(args.direction) !== "up" && cs(args.direction) !== "down") {
            return validationError("direction must be up or down", call);
          }
          break;
        case "addLine":
          sectionTarget = validateSectionTarget(resumeState, args.sectionId, context, call);
          if (!sectionTarget.ok) return sectionTarget;
          entryTarget = validateEntryTarget(resumeState, sectionTarget, args.entryId, context, call);
          if (!entryTarget.ok) return entryTarget;
          lineType = cs(args.type);
          if (!LINE_TYPES.has(lineType)) return validationError("Invalid line type: " + lineType, call);
          break;
        case "setLine":
        case "deleteLine":
        case "moveLine":
          sectionTarget = validateSectionTarget(resumeState, args.sectionId, context, call);
          if (!sectionTarget.ok) return sectionTarget;
          entryTarget = validateEntryTarget(resumeState, sectionTarget, args.entryId, context, call);
          if (!entryTarget.ok) return entryTarget;
          if (entryTarget.pending) return targetError("LINE_NOT_FOUND", "line", cs(args.lineId), "Line cannot be found in a newly added entry.", call);
          lineId = cs(args.lineId);
          if (!findLine(entryTarget.entry, lineId)) return targetError("LINE_NOT_FOUND", "line", lineId, "Line not found: " + lineId, call);
          if (name === "setLine" && args.type !== undefined && !LINE_TYPES.has(cs(args.type))) {
            return validationError("Invalid line type: " + cs(args.type), call);
          }
          if (name === "moveLine") {
            direction = cs(args.direction);
            if (direction !== "up" && direction !== "down") return validationError("direction must be up or down", call);
          }
          break;
        default:
          return validationError("Unknown function: " + name, call);
      }
    }
    return { ok: true };
  }

  function execSetContactField(resume, args) {
    var field = cs(args.field);
    var value = cs(args.value);
    if (!CONTACT_FIELDS.has(field)) return { ok: false, error: "Unknown contact field: " + field };
    var next = cloneResume(resume);
    if (!next.header) next.header = {};
    if (!next.header.contact) next.header.contact = {};
    next.header.contact[field] = value;
    if (field === "firstName" || field === "lastName") {
      if (!next.header.name) next.header.name = {};
      next.header.name[field] = value;
    }
    if (field === "email") next.header.email = { value: value, waived: false };
    if (field === "phone") next.header.phone = { value: value, waived: false };
    if (field === "location") next.header.location = { value: value, waived: false };
    return { ok: true, resume: next, summary: "Set " + field + " → " + value };
  }

  function execAddContactLink(resume, args) {
    var text = cs(args.text);
    if (!text) return { ok: false, error: "Link text is required." };
    var next = cloneResume(resume);
    if (!next.header) next.header = {};
    if (!next.header.contact) next.header.contact = {};
    if (!Array.isArray(next.header.contact.links)) next.header.contact.links = [];
    var newLink = { id: createId("link"), text: text, order: next.header.contact.links.length + 1 };
    next.header.contact.links.push(newLink);
    return { ok: true, resume: next, summary: "Added link: " + text };
  }

  function execDeleteContactLink(resume, args) {
    var linkId = cs(args.linkId);
    var next = cloneResume(resume);
    var links = (next.header && next.header.contact && Array.isArray(next.header.contact.links)) ? next.header.contact.links : [];
    var index = links.findIndex(function(l) { return cs(l.id) === linkId; });
    if (index < 0) return targetError("LINK_NOT_FOUND", "link", linkId, "Link not found: " + linkId);
    var removed = links.splice(index, 1)[0];
    next.header.contact.links = links.map(function(l, i) { return Object.assign({}, l, { order: i + 1 }); });
    return { ok: true, resume: next, summary: "Deleted link: " + cs(removed.text) };
  }

  function execAddSection(resume, args) {
    var name = cs(args.name);
    var next = cloneResume(resume);
    if (!Array.isArray(next.sections)) next.sections = [];
    var newSection = { id: createId("section"), sectionName: name, waived: false, order: next.sections.length + 1, blocks: [] };
    next.sections.push(newSection);
    return { ok: true, resume: next, summary: "Added section: " + name, newSectionId: newSection.id };
  }

  function execSetSection(resume, args) {
    var sectionId = cs(args.sectionId);
    var name = cs(args.name);
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var old = section.sectionName;
    section.sectionName = name;
    return { ok: true, resume: next, summary: "Renamed section: " + old + " → " + name };
  }

  function execDeleteSection(resume, args) {
    var sectionId = cs(args.sectionId);
    var next = cloneResume(resume);
    var idx = (next.sections || []).findIndex(function(s) { return cs(s.id) === sectionId; });
    if (idx < 0) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var removed = next.sections.splice(idx, 1)[0];
    next.sections = next.sections.map(function(s, i) { return Object.assign({}, s, { order: i + 1 }); });
    return { ok: true, resume: next, summary: "Deleted section: " + cs(removed.sectionName) };
  }

  function execMoveSection(resume, args) {
    var sectionId = cs(args.sectionId);
    var direction = cs(args.direction);
    if (direction !== "up" && direction !== "down") return { ok: false, error: "direction must be up or down" };
    var next = cloneResume(resume);
    var sections = (next.sections || []).slice().sort(function(a, b) { return Number(a.order) - Number(b.order); });
    var idx = sections.findIndex(function(s) { return cs(s.id) === sectionId; });
    if (idx < 0) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) {
      return { ok: true, resume: next, summary: "Section already at " + (direction === "up" ? "top" : "bottom") };
    }
    var temp = sections[idx]; sections[idx] = sections[swapIdx]; sections[swapIdx] = temp;
    next.sections = sections.map(function(s, i) { return Object.assign({}, s, { order: i + 1 }); });
    return { ok: true, resume: next, summary: "Moved section " + direction + ": " + cs(temp.sectionName) };
  }

  function execAddEntry(resume, args, context) {
    var sectionResolved = resolveSectionId(args.sectionId, context);
    if (!sectionResolved.ok) return sectionResolved;
    var sectionId = sectionResolved.id;
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    if (!Array.isArray(section.blocks)) section.blocks = [];
    var newBlock = { id: createId("block"), lines: [], waived: false, order: section.blocks.length + 1 };
    section.blocks.push(newBlock);
    return { ok: true, resume: next, summary: "Added entry to: " + cs(section.sectionName), newEntryId: newBlock.id };
  }

  function execDeleteEntry(resume, args, context) {
    var sectionResolved = resolveSectionId(args.sectionId, context);
    if (!sectionResolved.ok) return sectionResolved;
    var sectionId = sectionResolved.id;
    var entryId = cs(args.entryId);
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var idx = (section.blocks || []).findIndex(function(b) { return cs(b.id) === entryId; });
    if (idx < 0) return targetError("ENTRY_NOT_FOUND", "entry", entryId, "Entry not found: " + entryId);
    section.blocks.splice(idx, 1);
    section.blocks = section.blocks.map(function(b, i) { return Object.assign({}, b, { order: i + 1 }); });
    return { ok: true, resume: next, summary: "Deleted entry from: " + cs(section.sectionName) };
  }

  function execMoveEntry(resume, args, context) {
    var sectionResolved = resolveSectionId(args.sectionId, context);
    if (!sectionResolved.ok) return sectionResolved;
    var sectionId = sectionResolved.id;
    var entryId = cs(args.entryId);
    var direction = cs(args.direction);
    if (direction !== "up" && direction !== "down") return { ok: false, error: "direction must be up or down" };
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var blocks = (section.blocks || []).slice().sort(function(a, b) { return Number(a.order) - Number(b.order); });
    var idx = blocks.findIndex(function(b) { return cs(b.id) === entryId; });
    if (idx < 0) return targetError("ENTRY_NOT_FOUND", "entry", entryId, "Entry not found: " + entryId);
    var swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= blocks.length) {
      return { ok: true, resume: next, summary: "Entry already at " + (direction === "up" ? "top" : "bottom") };
    }
    var temp = blocks[idx]; blocks[idx] = blocks[swapIdx]; blocks[swapIdx] = temp;
    section.blocks = blocks.map(function(b, i) { return Object.assign({}, b, { order: i + 1 }); });
    return { ok: true, resume: next, summary: "Moved entry " + direction };
  }

  function resolveEntryId(rawEntryId, context) {
    var id = cs(rawEntryId);
    if (id === "$lastEntry") {
      if (!context || !cs(context.lastEntry)) {
        return targetError("LAST_ENTRY_NOT_AVAILABLE", "entry", "$lastEntry", "$lastEntry used but no previous addEntry in this sequence.");
      }
      return { ok: true, id: cs(context.lastEntry) };
    }
    return { ok: true, id: id };
  }

  function resolveSectionId(rawSectionId, context) {
    var id = cs(rawSectionId);
    if (id === "$lastSection") {
      if (!context || !cs(context.lastSection)) {
        return targetError("LAST_SECTION_NOT_AVAILABLE", "section", "$lastSection", "$lastSection used but no previous addSection in this sequence.");
      }
      return { ok: true, id: cs(context.lastSection) };
    }
    return { ok: true, id: id };
  }

  function execAddLine(resume, args, context) {
    var sectionResolved = resolveSectionId(args.sectionId, context);
    if (!sectionResolved.ok) return sectionResolved;
    var sectionId = sectionResolved.id;
    var entryResolved = resolveEntryId(args.entryId, context);
    if (!entryResolved.ok) return entryResolved;
    var entryId = entryResolved.id;
    var type = cs(args.type);
    if (!LINE_TYPES.has(type)) return { ok: false, error: "Invalid line type: " + type };
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var block = (section.blocks || []).find(function(b) { return cs(b.id) === entryId; });
    if (!block) return targetError("ENTRY_NOT_FOUND", "entry", entryId, "Entry not found: " + entryId);
    if (!Array.isArray(block.lines)) block.lines = [];
    var newLine = enforceLineFormatting({
      id: createId("line"), type: type, text: cs(args.text),
      bold: typeof args.bold === "boolean" ? args.bold : false,
      italic: typeof args.italic === "boolean" ? args.italic : false,
      order: block.lines.length + 1
    });
    block.lines.push(newLine);
    return { ok: true, resume: next, summary: "Added " + type + " line: " + cs(args.text) };
  }

  function execSetLine(resume, args, context) {
    var sectionResolved = resolveSectionId(args.sectionId, context);
    if (!sectionResolved.ok) return sectionResolved;
    var sectionId = sectionResolved.id;
    var entryResolved = resolveEntryId(args.entryId, context);
    if (!entryResolved.ok) return entryResolved;
    var entryId = entryResolved.id;
    var lineId = cs(args.lineId);
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var block = (section.blocks || []).find(function(b) { return cs(b.id) === entryId; });
    if (!block) return targetError("ENTRY_NOT_FOUND", "entry", entryId, "Entry not found: " + entryId);
    var line = (block.lines || []).find(function(l) { return cs(l.id) === lineId; });
    if (!line) return targetError("LINE_NOT_FOUND", "line", lineId, "Line not found: " + lineId);
    if (args.type !== undefined) {
      var newType = cs(args.type);
      if (!LINE_TYPES.has(newType)) return { ok: false, error: "Invalid line type: " + newType };
      line.type = newType;
    }
    if (args.text !== undefined) line.text = cs(args.text);
    if (args.bold !== undefined) line.bold = Boolean(args.bold);
    if (args.italic !== undefined) line.italic = Boolean(args.italic);
    enforceLineFormatting(line);
    return { ok: true, resume: next, summary: "Updated line: " + line.text };
  }

  function execDeleteLine(resume, args, context) {
    var sectionResolved = resolveSectionId(args.sectionId, context);
    if (!sectionResolved.ok) return sectionResolved;
    var sectionId = sectionResolved.id;
    var entryResolved = resolveEntryId(args.entryId, context);
    if (!entryResolved.ok) return entryResolved;
    var entryId = entryResolved.id;
    var lineId = cs(args.lineId);
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var block = (section.blocks || []).find(function(b) { return cs(b.id) === entryId; });
    if (!block) return targetError("ENTRY_NOT_FOUND", "entry", entryId, "Entry not found: " + entryId);
    var idx = (block.lines || []).findIndex(function(l) { return cs(l.id) === lineId; });
    if (idx < 0) return targetError("LINE_NOT_FOUND", "line", lineId, "Line not found: " + lineId);
    var removed = block.lines.splice(idx, 1)[0];
    block.lines = block.lines.map(function(l, i) { return Object.assign({}, l, { order: i + 1 }); });
    return { ok: true, resume: next, summary: "Deleted line: " + cs(removed.text) };
  }

  function execMoveLine(resume, args, context) {
    var sectionResolved = resolveSectionId(args.sectionId, context);
    if (!sectionResolved.ok) return sectionResolved;
    var sectionId = sectionResolved.id;
    var entryResolved = resolveEntryId(args.entryId, context);
    if (!entryResolved.ok) return entryResolved;
    var entryId = entryResolved.id;
    var lineId = cs(args.lineId);
    var direction = cs(args.direction);
    if (direction !== "up" && direction !== "down") return { ok: false, error: "direction must be up or down" };
    var next = cloneResume(resume);
    var section = (next.sections || []).find(function(s) { return cs(s.id) === sectionId; });
    if (!section) return targetError("SECTION_NOT_FOUND", "section", sectionId, "Section not found: " + sectionId);
    var block = (section.blocks || []).find(function(b) { return cs(b.id) === entryId; });
    if (!block) return targetError("ENTRY_NOT_FOUND", "entry", entryId, "Entry not found: " + entryId);
    var lines = (block.lines || []).slice().sort(function(a, b) { return Number(a.order) - Number(b.order); });
    var idx = lines.findIndex(function(l) { return cs(l.id) === lineId; });
    if (idx < 0) return targetError("LINE_NOT_FOUND", "line", lineId, "Line not found: " + lineId);
    var swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= lines.length) {
      return { ok: true, resume: next, summary: "Line already at " + (direction === "up" ? "top" : "bottom") };
    }
    var temp = lines[idx]; lines[idx] = lines[swapIdx]; lines[swapIdx] = temp;
    block.lines = lines.map(function(l, i) { return Object.assign({}, l, { order: i + 1 }); });
    return { ok: true, resume: next, summary: "Moved line " + direction + ": " + cs(temp.text) };
  }

  function executeOneFunction(call, resume, context) {
    var name = cs(call && call.name);
    var args = (call && call.args && typeof call.args === "object") ? call.args : {};
    if (!ALLOWED_FUNCTIONS.has(name)) return { ok: false, error: "Unknown function: " + name };
    switch (name) {
      case "setContactField": return execSetContactField(resume, args);
      case "addContactLink": return execAddContactLink(resume, args);
      case "deleteContactLink": return execDeleteContactLink(resume, args);
      case "addSection": return execAddSection(resume, args);
      case "setSection": return execSetSection(resume, args);
      case "deleteSection": return execDeleteSection(resume, args);
      case "moveSection": return execMoveSection(resume, args);
      case "addEntry": return execAddEntry(resume, args, context);
      case "deleteEntry": return execDeleteEntry(resume, args, context);
      case "moveEntry": return execMoveEntry(resume, args, context);
      case "addLine": return execAddLine(resume, args, context);
      case "setLine": return execSetLine(resume, args, context);
      case "deleteLine": return execDeleteLine(resume, args, context);
      case "moveLine": return execMoveLine(resume, args, context);
      default: return { ok: false, error: "Unknown function: " + name };
    }
  }

  function executeResumeFunctions(calls, resumeState) {
    var validation = validateResumeFunctionBatch(calls, resumeState);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        code: validation.code,
        missingType: validation.missingType,
        missingId: validation.missingId,
        failedCall: validation.failedCall,
        targetNotFound: Boolean(validation.targetNotFound),
        resumeState: resumeState,
        appliedCount: 0
      };
    }
    var current = resumeState;
    var summaries = [];
    var context = { lastEntry: "", lastSection: "" };
    for (var j = 0; j < calls.length; j++) {
      var result = executeOneFunction(calls[j], current, context);
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          code: result.code,
          missingType: result.missingType,
          missingId: result.missingId,
          failedCall: result.failedCall || calls[j],
          targetNotFound: Boolean(result.targetNotFound),
          resumeState: resumeState,
          appliedCount: j
        };
      }
      current = result.resume;
      if (result.summary) summaries.push(result.summary);
      if (result.newEntryId) context.lastEntry = result.newEntryId;
      if (result.newSectionId) context.lastSection = result.newSectionId;
    }
    return {
      ok: true,
      resumeState: current,
      changeSummary: summaries,
      lastSectionId: cs(context.lastSection),
      lastEntryId: cs(context.lastEntry)
    };
  }

  function buildCompactResumeSummary(resume) {
    if (!resume || typeof resume !== "object") return "";
    var contact = (resume.header && resume.header.contact) ? resume.header.contact : {};
    var linkList = Array.isArray(contact.links) ? contact.links : [];
    var sections = Array.isArray(resume.sections) ? resume.sections : [];
    var summary = {
      contact: {
        firstName: cs(contact.firstName),
        lastName: cs(contact.lastName),
        email: cs(contact.email),
        phone: cs(contact.phone),
        location: cs(contact.location),
        links: linkList.map(function(link) {
          return {
            id: cs(link && link.id),
            linkId: cs(link && link.id),
            text: cs(link && link.text)
          };
        })
      },
      sections: sections.map(function(section) {
        var blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
        return {
          id: cs(section && section.id),
          sectionId: cs(section && section.id),
          name: cs(section && section.sectionName),
          entries: blocks.map(function(block) {
            var blockLines = Array.isArray(block && block.lines) ? block.lines : [];
            return {
              id: cs(block && block.id),
              entryId: cs(block && block.id),
              lines: blockLines.map(function(line) {
                return {
                  id: cs(line && line.id),
                  lineId: cs(line && line.id),
                  type: cs(line && line.type),
                  text: cs(line && line.text),
                  bold: Boolean(line && line.bold),
                  italic: Boolean(line && line.italic)
                };
              })
            };
          })
        };
      })
    };
    return JSON.stringify(summary, null, 2);
  }

  global.ResumeAiFunctions = Object.freeze({
    executeResumeFunctions: executeResumeFunctions,
    validateResumeFunctionBatch: validateResumeFunctionBatch,
    buildCompactResumeSummary: buildCompactResumeSummary
  });
})(globalThis);
