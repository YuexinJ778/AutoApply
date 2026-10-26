(function attachStage5ProfileNormalizer(global) {
  "use strict";

  var validation = global.Stage5Validation || {};
  var schema = global.Stage5CandidateResumeSchema || {};

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

  function createDefaultCandidateResume() {
    if (schema && typeof schema.createEmptyCandidateResume === "function") {
      return schema.createEmptyCandidateResume();
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
      summary: "",
      experience: [],
      education: [],
      projects: [],
      skills: []
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

      output.push({
        label: label,
        url: url
      });
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
        bullets: toStringArray(item.bullets, 20)
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
      var major = cleanString(item.major || item.field || item.fieldOfStudy || item.majorName);
      var coursework = "";
      if (Array.isArray(item.coursework)) {
        coursework = toStringArray(item.coursework, 24).join(", ");
      } else if (Array.isArray(item.relevantCoursework)) {
        coursework = toStringArray(item.relevantCoursework, 24).join(", ");
      } else {
        coursework = cleanString(item.coursework || item.relevantCoursework);
      }
      var description = cleanString(item.description || item.desc);

      if (!school && !degree && !major && !description) {
        continue;
      }

      output.push({
        school: school,
        degree: degree,
        major: major,
        field: cleanString(item.field || item.fieldOfStudy || major),
        location: cleanString(item.location),
        startDate: cleanString(item.startDate),
        endDate: cleanString(item.endDate),
        coursework: coursework,
        description: description
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
        bullets: toStringArray(item.bullets, 20)
      });
    }

    return output;
  }

  function normalizeSkills(value) {
    var items = ensureArray(value);
    var flattened = [];

    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];

      if (typeof item === "string") {
        flattened.push(item);
        continue;
      }

      if (item && typeof item === "object") {
        if (Array.isArray(item.items)) {
          flattened = flattened.concat(item.items);
          continue;
        }

        if (typeof item.category === "string" && item.category.trim()) {
          flattened.push(item.category.trim());
        }
      }
    }

    return toStringArray(flattened, 60);
  }

  function normalizeCandidateResume(input) {
    var source = input && typeof input === "object" ? input : {};
    var defaults = createDefaultCandidateResume();
    var header = source.header && typeof source.header === "object" ? source.header : {};

    return {
      header: {
        name: cleanString(header.name || defaults.header.name),
        title: cleanString(header.title || defaults.header.title),
        email: cleanString(header.email || defaults.header.email),
        phone: cleanString(header.phone || defaults.header.phone),
        location: cleanString(header.location || defaults.header.location),
        links: normalizeLinks(header.links)
      },
      summary: cleanString(source.summary || defaults.summary),
      experience: normalizeExperience(source.experience),
      education: normalizeEducation(source.education),
      projects: normalizeProjects(source.projects),
      skills: normalizeSkills(source.skills)
    };
  }

  global.Stage5ProfileNormalizer = Object.freeze({
    normalizeCandidateResume: normalizeCandidateResume
  });
})(globalThis);
