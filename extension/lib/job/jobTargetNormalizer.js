(function attachStage5JobTargetNormalizer(global) {
  "use strict";

  var validation = global.Stage5Validation || {};
  var schema = global.Stage5JobTargetSchema || {};

  function cleanString(value) {
    if (typeof validation.cleanString === "function") {
      return validation.cleanString(value);
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function toStringArray(value, maxItems) {
    if (typeof validation.toStringArray === "function") {
      return validation.toStringArray(value, maxItems);
    }

    var items = Array.isArray(value) ? value : [];
    var output = [];
    var seen = new Set();

    for (var index = 0; index < items.length; index += 1) {
      var text = cleanString(items[index]);
      if (!text) {
        continue;
      }
      var key = text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(text);
      if (maxItems && output.length >= maxItems) {
        break;
      }
    }

    return output;
  }

  function createEmptyJobTarget() {
    if (schema && typeof schema.createEmptyJobTarget === "function") {
      return schema.createEmptyJobTarget();
    }

    return {
      title: "",
      role: "",
      company: "",
      location: "",
      summary: "",
      responsibilities: [],
      requirements: [],
      preferredQualifications: [],
      keywords: [],
      skills: [],
      sourceUrl: "",
      extractedAt: ""
    };
  }

  function normalizeJobTarget(input) {
    var source = input && typeof input === "object" ? input : {};
    var defaults = createEmptyJobTarget();
    var title = cleanString(source.title || defaults.title || source.role);
    var role = cleanString(source.role || defaults.role || source.title);

    return {
      title: title || role,
      role: role || title,
      company: cleanString(source.company || defaults.company),
      location: cleanString(source.location || defaults.location),
      summary: cleanString(source.summary || defaults.summary || source.description || source.rawText),
      responsibilities: toStringArray(source.responsibilities, 32),
      requirements: toStringArray(source.requirements, 32),
      preferredQualifications: toStringArray(source.preferredQualifications, 24),
      keywords: toStringArray(source.keywords, 32),
      skills: toStringArray(source.skills, 32),
      sourceUrl: cleanString(source.sourceUrl || source.jobUrl || source.url || defaults.sourceUrl),
      extractedAt: cleanString(source.extractedAt || source.parsedAt || defaults.extractedAt || new Date().toISOString())
    };
  }

  global.Stage5JobTargetNormalizer = Object.freeze({
    normalizeJobTarget: normalizeJobTarget
  });
})(globalThis);
