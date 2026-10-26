(function attachStage5ResumeHtmlBuilder(global) {
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

  function normalizeEntryList(items, mapFn) {
    var source = ensureArray(items);
    var output = [];

    for (var index = 0; index < source.length; index += 1) {
      var mapped = mapFn(source[index] && typeof source[index] === "object" ? source[index] : {});
      if (!mapped) {
        continue;
      }
      output.push(mapped);
    }

    return output;
  }

  function buildTailoredResumeHtml(tailoredResumeDraft, options) {
    var source = tailoredResumeDraft && typeof tailoredResumeDraft === "object" ? tailoredResumeDraft : {};
    var opts = options && typeof options === "object" ? options : {};
    var header = source.header && typeof source.header === "object" ? source.header : {};

    var normalized = {
      header: {
        name: cleanString(header.name),
        title: cleanString(header.title),
        email: cleanString(header.email),
        phone: cleanString(header.phone),
        location: cleanString(header.location),
        links: normalizeLinks(header.links)
      },
      targetRole: cleanString(source.targetRole || (opts.jobTarget && opts.jobTarget.role) || (opts.jobTarget && opts.jobTarget.title)),
      professionalSummary: cleanString(source.professionalSummary || source.summary),
      selectedSkills: toStringArray(source.selectedSkills || source.skills, 48),
      tailoredExperience: normalizeEntryList(source.tailoredExperience, function mapExperience(item) {
        var company = cleanString(item.company);
        var title = cleanString(item.title);
        if (!company && !title) {
          return null;
        }
        return {
          company: company,
          title: title,
          location: cleanString(item.location),
          startDate: cleanString(item.startDate),
          endDate: cleanString(item.endDate),
          bullets: toStringArray(item.bullets, 12)
        };
      }),
      education: normalizeEntryList(source.education, function mapEducation(item) {
        var school = cleanString(item.school);
        var degree = cleanString(item.degree);
        if (!school && !degree) {
          return null;
        }
        var major = cleanString(item.major || item.field || item.fieldOfStudy || item.majorName);
        var coursework = "";
        if (Array.isArray(item.coursework)) {
          coursework = toStringArray(item.coursework, 24).join(", ");
        } else if (Array.isArray(item.relevantCoursework)) {
          coursework = toStringArray(item.relevantCoursework, 24).join(", ");
        } else {
          coursework = cleanString(item.coursework || item.relevantCoursework);
        }
        return {
          school: school,
          degree: degree,
          major: major,
          field: cleanString(item.field || item.fieldOfStudy || major),
          location: cleanString(item.location),
          startDate: cleanString(item.startDate),
          endDate: cleanString(item.endDate),
          gpa: cleanString(item.gpa),
          coursework: coursework,
          description: cleanString(item.description || item.desc)
        };
      }),
      projects: normalizeEntryList(source.projects, function mapProjects(item) {
        var name = cleanString(item.name);
        if (!name) {
          return null;
        }
        return {
          name: name,
          role: cleanString(item.role),
          startDate: cleanString(item.startDate),
          endDate: cleanString(item.endDate),
          bullets: toStringArray(item.bullets, 10)
        };
      })
    };

    if (global.Stage5ResumeHtmlTemplate && typeof global.Stage5ResumeHtmlTemplate.renderTailoredResumeHtml === "function") {
      return global.Stage5ResumeHtmlTemplate.renderTailoredResumeHtml(normalized);
    }

    return "<html><body><pre>" + JSON.stringify(normalized, null, 2) + "</pre></body></html>";
  }

  global.Stage5ResumeHtmlBuilder = Object.freeze({
    buildTailoredResumeHtml: buildTailoredResumeHtml
  });
})(globalThis);
