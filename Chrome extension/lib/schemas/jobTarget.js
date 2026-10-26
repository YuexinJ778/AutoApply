(function attachStage5JobTargetSchema(global) {
  "use strict";

  var DEFAULT_JOB_TARGET = Object.freeze({
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
  });

  function createEmptyJobTarget() {
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

  global.Stage5JobTargetSchema = Object.freeze({
    DEFAULT_JOB_TARGET: DEFAULT_JOB_TARGET,
    createEmptyJobTarget: createEmptyJobTarget
  });
})(globalThis);
