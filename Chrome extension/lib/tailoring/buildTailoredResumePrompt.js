(function attachStage5TailoredPromptBuilder(global) {
  "use strict";

  var validation = global.Stage5Validation || {};
  var MAX_CUSTOM_INSTRUCTIONS_LENGTH = 800;

  var TAILORED_OUTPUT_SCHEMA = Object.freeze({
    header: {
      name: "string",
      title: "string",
      email: "string",
      phone: "string",
      location: "string",
      links: [
        {
          label: "string",
          url: "string"
        }
      ]
    },
    targetRole: "string",
    professionalSummary: "string",
    selectedSkills: ["string"],
    tailoredExperience: [
      {
        company: "string",
        title: "string",
        location: "string",
        startDate: "string",
        endDate: "string",
        bullets: ["string"]
      }
    ],
    education: [
      {
        school: "string",
        degree: "string",
        field: "string",
        location: "string",
        startDate: "string",
        endDate: "string"
      }
    ],
    projects: [
      {
        name: "string",
        role: "string",
        startDate: "string",
        endDate: "string",
        bullets: ["string"]
      }
    ]
  });

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

  function trimExperience(value) {
    var items = ensureArray(value);
    var output = [];

    for (var index = 0; index < items.length && output.length < 8; index += 1) {
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
        bullets: toStringArray(item.bullets, 8)
      });
    }

    return output;
  }

  function trimEducation(value) {
    var items = ensureArray(value);
    var output = [];

    for (var index = 0; index < items.length && output.length < 5; index += 1) {
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

  function trimProjects(value) {
    var items = ensureArray(value);
    var output = [];

    for (var index = 0; index < items.length && output.length < 8; index += 1) {
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
        bullets: toStringArray(item.bullets, 6)
      });
    }

    return output;
  }

  function buildJobContext(jobTargetInput) {
    var jobTarget = jobTargetInput && typeof jobTargetInput === "object" ? jobTargetInput : {};
    return {
      title: cleanString(jobTarget.title),
      role: cleanString(jobTarget.role || jobTarget.title),
      company: cleanString(jobTarget.company),
      location: cleanString(jobTarget.location),
      summary: cleanString(jobTarget.summary),
      responsibilities: toStringArray(jobTarget.responsibilities, 24),
      requirements: toStringArray(jobTarget.requirements, 24),
      preferredQualifications: toStringArray(jobTarget.preferredQualifications, 20),
      keywords: toStringArray(jobTarget.keywords, 32),
      skills: toStringArray(jobTarget.skills, 32),
      sourceUrl: cleanString(jobTarget.sourceUrl),
      extractedAt: cleanString(jobTarget.extractedAt)
    };
  }

  function buildCandidateContext(candidateResumeInput) {
    var candidateResume = candidateResumeInput && typeof candidateResumeInput === "object" ? candidateResumeInput : {};
    var header = candidateResume.header && typeof candidateResume.header === "object" ? candidateResume.header : {};
    var links = ensureArray(header.links);

    var safeLinks = [];
    for (var index = 0; index < links.length && safeLinks.length < 8; index += 1) {
      var item = links[index] && typeof links[index] === "object" ? links[index] : {};
      var label = cleanString(item.label);
      var url = cleanString(item.url);
      if (!label && !url) {
        continue;
      }
      safeLinks.push({
        label: label,
        url: url
      });
    }

    return {
      header: {
        name: cleanString(header.name),
        title: cleanString(header.title),
        email: cleanString(header.email),
        phone: cleanString(header.phone),
        location: cleanString(header.location),
        links: safeLinks
      },
      summary: cleanString(candidateResume.summary),
      experience: trimExperience(candidateResume.experience),
      education: trimEducation(candidateResume.education),
      projects: trimProjects(candidateResume.projects),
      skills: toStringArray(candidateResume.skills, 48)
    };
  }

  function normalizeCustomInstructions(value) {
    var text = cleanString(typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : "");
    if (!text) {
      return "";
    }
    return text.length <= MAX_CUSTOM_INSTRUCTIONS_LENGTH ? text : text.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH);
  }

  function extractCustomInstructions(options) {
    if (typeof options === "string") {
      return normalizeCustomInstructions(options);
    }

    var safeOptions = options && typeof options === "object" ? options : {};
    return normalizeCustomInstructions(safeOptions.customInstructions);
  }

  function buildTailoredResumePrompt(jobTarget, candidateResume, options) {
    var customInstructions = extractCustomInstructions(options);
    var promptLines = [
      "You are tailoring a resume draft using ONLY candidate facts plus target job context.",
      "You must produce a tailored resume draft JSON object, not a job summary.",
      "",
      "The user has provided additional preferences below. Follow them only when they do not conflict with the required output schema and formatting rules.",
      "",
      "User additional instructions:",
      customInstructions || "(none)",
      "",
      "Hard output rules:",
      "1) Output must be one and only one valid JSON object.",
      "2) The first character must be { and the last character must be }.",
      "3) Do not output explanations, analysis, reasoning, markdown, or code fences.",
      "4) Do not fabricate new employers, dates, projects, education, or certifications.",
      "5) You may rewrite wording, reorder emphasis, and select relevant bullets from candidate facts.",
      "6) If data is missing, use empty string or empty array.",
      "7) Output must strictly follow OUTPUT_SCHEMA.",
      "",
      "Fact constraints:",
      "- Candidate facts are source of truth.",
      "- Keep candidate header identity unchanged.",
      "- tailoredExperience must map to candidate experience entries; no invented companies.",
      "- projects must come from candidate projects; no invented project names.",
      "- education must come from candidate education; no invented schools/degrees.",
      "",
      "OUTPUT_SCHEMA:",
      JSON.stringify(TAILORED_OUTPUT_SCHEMA, null, 2),
      "",
      "JOB_TARGET:",
      JSON.stringify(buildJobContext(jobTarget), null, 2),
      "",
      "CANDIDATE_RESUME:",
      JSON.stringify(buildCandidateContext(candidateResume), null, 2),
      "",
      "Return only the JSON object."
    ];

    return promptLines.join("\n");
  }

  global.Stage5TailoredPromptBuilder = Object.freeze({
    TAILORED_OUTPUT_SCHEMA: TAILORED_OUTPUT_SCHEMA,
    buildTailoredResumePrompt: buildTailoredResumePrompt
  });
})(globalThis);
