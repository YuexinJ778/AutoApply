(function attachStage5TailoredJsonRepair(global) {
  "use strict";

  var validation = global.Stage5Validation || {};

  function cleanString(value) {
    if (typeof validation.cleanString === "function") {
      return validation.cleanString(value);
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function clipText(text, maxLength) {
    var source = typeof text === "string" ? text : String(text || "");
    if (!maxLength || source.length <= maxLength) {
      return source;
    }
    return source.slice(0, maxLength);
  }

  function getTailoredSchema() {
    if (global.Stage5TailoredPromptBuilder && global.Stage5TailoredPromptBuilder.TAILORED_OUTPUT_SCHEMA) {
      return global.Stage5TailoredPromptBuilder.TAILORED_OUTPUT_SCHEMA;
    }

    return {
      header: {
        name: "string",
        title: "string",
        email: "string",
        phone: "string",
        location: "string",
        links: [{ label: "string", url: "string" }]
      },
      targetRole: "string",
      professionalSummary: "string",
      selectedSkills: ["string"],
      tailoredExperience: [{ company: "string", title: "string", location: "string", startDate: "string", endDate: "string", bullets: ["string"] }],
      education: [{ school: "string", degree: "string", field: "string", location: "string", startDate: "string", endDate: "string" }],
      projects: [{ name: "string", role: "string", startDate: "string", endDate: "string", bullets: ["string"] }]
    };
  }

  function buildTailoredResumeRepairPrompt(nonJsonText, options) {
    var maxSourceLength = options && typeof options.maxSourceLength === "number" ? options.maxSourceLength : 12000;
    var schema = getTailoredSchema();

    return [
      "Convert the following content into one valid JSON object only.",
      "The output must strictly follow OUTPUT_SCHEMA.",
      "The first character must be { and the last character must be }.",
      "Do not output markdown, comments, explanations, or extra text.",
      "Do not invent candidate facts not present in SOURCE_TEXT.",
      "",
      "OUTPUT_SCHEMA:",
      JSON.stringify(schema, null, 2),
      "",
      "SOURCE_TEXT:",
      clipText(cleanString(nonJsonText), maxSourceLength)
    ].join("\n");
  }

  global.Stage5TailoredJsonRepair = Object.freeze({
    buildTailoredResumeRepairPrompt: buildTailoredResumeRepairPrompt,
    getTailoredSchema: getTailoredSchema
  });
})(globalThis);
