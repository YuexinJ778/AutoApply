(function attachStage5TailoredResumeMerger(global) {
  "use strict";

  var validation = global.Stage5Validation || {};

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

  function normalizeCandidate(candidateResumeInput) {
    var candidateResume = candidateResumeInput && typeof candidateResumeInput === "object" ? candidateResumeInput : {};

    if (global.Stage5ProfileNormalizer && typeof global.Stage5ProfileNormalizer.normalizeCandidateResume === "function") {
      return global.Stage5ProfileNormalizer.normalizeCandidateResume(candidateResume);
    }

    return candidateResume;
  }

  function entryKey(item, primaryKey, secondaryKey) {
    var source = item && typeof item === "object" ? item : {};
    var primary = cleanString(source[primaryKey]);
    var secondary = cleanString(source[secondaryKey]);
    return (primary + "|" + secondary).toLowerCase();
  }

  function normalizeLinks(value) {
    var links = ensureArray(value);
    var output = [];

    for (var index = 0; index < links.length; index += 1) {
      var item = links[index] && typeof links[index] === "object" ? links[index] : {};
      var label = cleanString(item.label);
      var url = cleanString(item.url);
      if (!label && !url) {
        continue;
      }
      output.push({ label: label, url: url });
    }

    return output;
  }

  function mergeExperience(candidateExperience, tailoredExperience) {
    var tailoredList = ensureArray(tailoredExperience);
    var tailoredByKey = {};

    for (var index = 0; index < tailoredList.length; index += 1) {
      var item = tailoredList[index] && typeof tailoredList[index] === "object" ? tailoredList[index] : {};
      var key = entryKey(item, "company", "title");
      if (!key || key === "|") {
        continue;
      }
      tailoredByKey[key] = item;
    }

    var merged = [];
    var candidateList = ensureArray(candidateExperience);
    for (var candidateIndex = 0; candidateIndex < candidateList.length; candidateIndex += 1) {
      var candidateItem = candidateList[candidateIndex] && typeof candidateList[candidateIndex] === "object" ? candidateList[candidateIndex] : {};
      var mapKey = entryKey(candidateItem, "company", "title");
      var tailored = tailoredByKey[mapKey] || {};

      merged.push({
        company: cleanString(candidateItem.company),
        title: cleanString(candidateItem.title),
        location: cleanString(candidateItem.location),
        startDate: cleanString(candidateItem.startDate),
        endDate: cleanString(candidateItem.endDate),
        bullets: toStringArray(tailored.bullets && tailored.bullets.length ? tailored.bullets : candidateItem.bullets, 12)
      });
    }

    return merged;
  }

  function mergeEducation(candidateEducation, tailoredEducation) {
    var candidateList = ensureArray(candidateEducation);
    var tailoredList = ensureArray(tailoredEducation);

    var tailoredByKey = {};
    for (var index = 0; index < tailoredList.length; index += 1) {
      var item = tailoredList[index] && typeof tailoredList[index] === "object" ? tailoredList[index] : {};
      var key = entryKey(item, "school", "degree");
      if (!key || key === "|") {
        continue;
      }
      tailoredByKey[key] = item;
    }

    var merged = [];
    for (var candidateIndex = 0; candidateIndex < candidateList.length; candidateIndex += 1) {
      var candidateItem = candidateList[candidateIndex] && typeof candidateList[candidateIndex] === "object" ? candidateList[candidateIndex] : {};
      var mapKey = entryKey(candidateItem, "school", "degree");
      var tailored = tailoredByKey[mapKey] || {};

      var mergedCoursework = "";
      var tailoredCoursework = tailored.coursework || tailored.relevantCoursework;
      var candidateCoursework = candidateItem.coursework || candidateItem.relevantCoursework;
      var rawCoursework = tailoredCoursework || candidateCoursework;
      if (Array.isArray(rawCoursework)) {
        mergedCoursework = toStringArray(rawCoursework, 24).join(", ");
      } else {
        mergedCoursework = cleanString(rawCoursework);
      }

      merged.push({
        school: cleanString(candidateItem.school),
        degree: cleanString(candidateItem.degree),
        major: cleanString(tailored.major || candidateItem.major || tailored.field || candidateItem.field || tailored.fieldOfStudy || candidateItem.fieldOfStudy),
        field: cleanString(tailored.field || candidateItem.field || tailored.major || candidateItem.major),
        location: cleanString(tailored.location || candidateItem.location),
        startDate: cleanString(tailored.startDate || candidateItem.startDate),
        endDate: cleanString(tailored.endDate || candidateItem.endDate),
        gpa: cleanString(tailored.gpa || candidateItem.gpa),
        coursework: mergedCoursework,
        description: cleanString(tailored.description || tailored.desc || candidateItem.description || candidateItem.desc)
      });
    }

    return merged;
  }

  function mergeProjects(candidateProjects, tailoredProjects) {
    var candidateList = ensureArray(candidateProjects);
    var tailoredList = ensureArray(tailoredProjects);

    var tailoredByName = {};
    for (var index = 0; index < tailoredList.length; index += 1) {
      var item = tailoredList[index] && typeof tailoredList[index] === "object" ? tailoredList[index] : {};
      var name = cleanString(item.name).toLowerCase();
      if (!name) {
        continue;
      }
      tailoredByName[name] = item;
    }

    var merged = [];
    for (var candidateIndex = 0; candidateIndex < candidateList.length; candidateIndex += 1) {
      var candidateItem = candidateList[candidateIndex] && typeof candidateList[candidateIndex] === "object" ? candidateList[candidateIndex] : {};
      var key = cleanString(candidateItem.name).toLowerCase();
      if (!key) {
        continue;
      }

      var tailored = tailoredByName[key] || {};
      merged.push({
        name: cleanString(candidateItem.name),
        role: cleanString(tailored.role || candidateItem.role),
        startDate: cleanString(tailored.startDate || candidateItem.startDate),
        endDate: cleanString(tailored.endDate || candidateItem.endDate),
        bullets: toStringArray(tailored.bullets && tailored.bullets.length ? tailored.bullets : candidateItem.bullets, 10)
      });
    }

    return merged;
  }

  function mergeTailoredResume(candidateResumeInput, tailoredDraftInput, jobTargetInput) {
    var candidateResume = normalizeCandidate(candidateResumeInput);
    var tailoredDraft = tailoredDraftInput && typeof tailoredDraftInput === "object" ? tailoredDraftInput : {};
    var jobTarget = jobTargetInput && typeof jobTargetInput === "object" ? jobTargetInput : {};

    var candidateHeader = candidateResume.header && typeof candidateResume.header === "object" ? candidateResume.header : {};

    return {
      header: {
        name: cleanString(candidateHeader.name),
        title: cleanString(candidateHeader.title),
        email: cleanString(candidateHeader.email),
        phone: cleanString(candidateHeader.phone),
        location: cleanString(candidateHeader.location),
        links: normalizeLinks(candidateHeader.links)
      },
      targetRole: cleanString(tailoredDraft.targetRole || jobTarget.role || jobTarget.title),
      professionalSummary: cleanString(tailoredDraft.professionalSummary || candidateResume.summary),
      selectedSkills: toStringArray(tailoredDraft.selectedSkills, 32),
      tailoredExperience: mergeExperience(candidateResume.experience, tailoredDraft.tailoredExperience),
      education: mergeEducation(candidateResume.education, tailoredDraft.education),
      projects: mergeProjects(candidateResume.projects, tailoredDraft.projects)
    };
  }

  global.Stage5TailoredResumeMerger = Object.freeze({
    mergeTailoredResume: mergeTailoredResume
  });
})(globalThis);
