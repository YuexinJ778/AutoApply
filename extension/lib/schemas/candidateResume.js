(function attachStage5CandidateResumeSchema(global) {
  "use strict";

  var DEFAULT_CANDIDATE_RESUME = Object.freeze({
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
  });

  function createEmptyCandidateResume() {
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

  global.Stage5CandidateResumeSchema = Object.freeze({
    DEFAULT_CANDIDATE_RESUME: DEFAULT_CANDIDATE_RESUME,
    createEmptyCandidateResume: createEmptyCandidateResume
  });
})(globalThis);
