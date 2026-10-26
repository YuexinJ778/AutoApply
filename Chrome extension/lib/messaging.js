(function attachStage5Messaging(global) {
  "use strict";

  function cleanString(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim();
  }

  function buildGenerateResumeRequest(jobData, settings, candidateData) {
    const safeJobData = jobData && typeof jobData === "object" ? { ...jobData } : null;
    const safeSettings = settings && typeof settings === "object" ? { ...settings } : undefined;
    const safeCandidateData = candidateData && typeof candidateData === "object" ? candidateData : {};
    const safeProfile = safeCandidateData.profile && typeof safeCandidateData.profile === "object"
      ? { ...safeCandidateData.profile }
      : undefined;
    const safeMasterResume = safeCandidateData.masterResume && typeof safeCandidateData.masterResume === "object"
      ? { ...safeCandidateData.masterResume }
      : undefined;

    return {
      jobData: safeJobData,
      settings: safeSettings,
      profile: safeProfile,
      masterResume: safeMasterResume
    };
  }

  function validateJobData(jobData) {
    if (!jobData || typeof jobData !== "object") {
      return "Missing job data from the current page.";
    }

    const role = cleanString(jobData.role || jobData.rawTitle || jobData.title);
    const company = cleanString(jobData.company);
    const description = cleanString(jobData.rawText || jobData.description || jobData.pageText);

    if (!role) {
      return "Job data is missing role/title.";
    }

    if (!company) {
      return "Job data is missing company.";
    }

    if (!description) {
      return "Job data is missing description/raw text.";
    }

    return "";
  }

  global.Stage5Messaging = Object.freeze({
    buildGenerateResumeRequest: buildGenerateResumeRequest,
    validateJobData: validateJobData
  });
})(globalThis);
