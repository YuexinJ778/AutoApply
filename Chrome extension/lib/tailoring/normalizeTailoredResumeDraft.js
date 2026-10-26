(function attachStage5TailoredResumeNormalizer(global) {
  "use strict";

  var validation = global.Stage5Validation || {};
  var schema = global.Stage5TailoredResumeSchema || {};

  function cleanString(value) {
    if (typeof validation.cleanString === "function") {
      return validation.cleanString(value);
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function ensureArray(value) {
    if (typeof validation.ensureArray === "function") {
      return validation.ensureArray(value);
    }
    return Array.isArray(value) ? value : [];
  }

  function toStringArray(value, maxItems) {
    if (typeof validation.toStringArray === "function") {
      return validation.toStringArray(value, maxItems);
    }

    var items = ensureArray(value);
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

  function createDefaultDraft() {
    if (schema && typeof schema.createEmptyTailoredResumeDraft === "function") {
      return schema.createEmptyTailoredResumeDraft();
    }

    return {
      header: {
        name: "",
        title: "",
        email: "",
        phone: "",
        location: "",
        links: []
      },
      targetRole: "",
      professionalSummary: "",
      selectedSkills: [],
      tailoredExperience: [],
      education: [],
      projects: []
    };
  }

  function normalizeLinks(value) {
    var items = ensureArray(value);
    var output = [];

    for (var index = 0; index < items.length; index += 1) {
      var item = items[index] && typeof items[index] === "object" ? items[index] : {};
      var label = cleanString(item.label);
      var url = cleanString(item.url);
      if (!label && !url) {
        continue;
      }
      output.push({ label: label, url: url });
    }

    return output;
  }

  function normalizeExperience(value) {
    var items = ensureArray(value);
    var output = [];

    for (var index = 0; index < items.length; index += 1) {
      var item = items[index] && typeof items[index] === "object" ? items[index] : {};
      var company = cleanString(item.company);
      var title = cleanString(item.title);
      if (!company && !title) {
        continue;
      }
      output.push({
        company: company,
        title: title,
        location: cleanString(item.location),
        startDate: cleanString(item.startDate),
        endDate: cleanString(item.endDate),
        bullets: toStringArray(item.bullets, 12)
      });
    }

    return output;
  }

  function normalizeEducation(value) {
    var items = ensureArray(value);
    var output = [];

    for (var index = 0; index < items.length; index += 1) {
      var item = items[index] && typeof items[index] === "object" ? items[index] : {};
      var school = cleanString(item.school);
      var degree = cleanString(item.degree);
      if (!school && !degree) {
        continue;
      }
      output.push({
        school: school,
        degree: degree,
        field: cleanString(item.field),
        location: cleanString(item.location),
        startDate: cleanString(item.startDate),
        endDate: cleanString(item.endDate)
      });
    }

    return output;
  }

  function normalizeProjects(value) {
    var items = ensureArray(value);
    var output = [];

    for (var index = 0; index < items.length; index += 1) {
      var item = items[index] && typeof items[index] === "object" ? items[index] : {};
      var name = cleanString(item.name);
      if (!name) {
        continue;
      }
      output.push({
        name: name,
        role: cleanString(item.role),
        startDate: cleanString(item.startDate),
        endDate: cleanString(item.endDate),
        bullets: toStringArray(item.bullets, 10)
      });
    }

    return output;
  }

  function normalizeTailoredResumeDraft(input, candidateResumeInput, jobTargetInput) {
    var source = input && typeof input === "object" ? input : {};
    var candidateResume = candidateResumeInput && typeof candidateResumeInput === "object" ? candidateResumeInput : {};
    var jobTarget = jobTargetInput && typeof jobTargetInput === "object" ? jobTargetInput : {};
    var defaults = createDefaultDraft();

    var sourceHeader = source.header && typeof source.header === "object" ? source.header : {};
    var candidateHeader = candidateResume.header && typeof candidateResume.header === "object" ? candidateResume.header : {};

    var targetRole = cleanString(source.targetRole || jobTarget.role || jobTarget.title || defaults.targetRole);

    return {
      header: {
        name: cleanString(sourceHeader.name || candidateHeader.name || defaults.header.name),
        title: cleanString(sourceHeader.title || candidateHeader.title || defaults.header.title),
        email: cleanString(sourceHeader.email || candidateHeader.email || defaults.header.email),
        phone: cleanString(sourceHeader.phone || candidateHeader.phone || defaults.header.phone),
        location: cleanString(sourceHeader.location || candidateHeader.location || defaults.header.location),
        links: normalizeLinks(sourceHeader.links && sourceHeader.links.length ? sourceHeader.links : candidateHeader.links)
      },
      targetRole: targetRole,
      professionalSummary: cleanString(source.professionalSummary || source.summary || candidateResume.summary || defaults.professionalSummary),
      selectedSkills: toStringArray(source.selectedSkills || source.skills || candidateResume.skills, 40),
      tailoredExperience: normalizeExperience(source.tailoredExperience || source.experience),
      education: normalizeEducation(source.education || candidateResume.education),
      projects: normalizeProjects(source.projects || candidateResume.projects)
    };
  }

  global.Stage5TailoredResumeNormalizer = Object.freeze({
    normalizeTailoredResumeDraft: normalizeTailoredResumeDraft
  });
})(globalThis);
