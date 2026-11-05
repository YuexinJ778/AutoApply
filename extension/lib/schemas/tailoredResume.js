(function attachStage5TailoredResumeSchema(global) {
  "use strict";

  var DEFAULT_TAILORED_RESUME_DRAFT = Object.freeze({
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
  });

  function createEmptyTailoredResumeDraft() {
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

  global.Stage5TailoredResumeSchema = Object.freeze({
    DEFAULT_TAILORED_RESUME_DRAFT: DEFAULT_TAILORED_RESUME_DRAFT,
    createEmptyTailoredResumeDraft: createEmptyTailoredResumeDraft
  });
})(globalThis);
