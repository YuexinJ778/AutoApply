(function attachStage11DataBoundary(global) {
  "use strict";

  const VALID_APPLICATION_STATUSES = Object.freeze([
    "Saved",
    "Applied",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn"
  ]);

  const LEGACY_STATUS_TO_CANONICAL = Object.freeze({
    saved: "Saved",
    to_apply: "Saved",
    draft: "Saved",
    applied: "Applied",
    interview: "Interview",
    interviewing: "Interview",
    offer: "Offer",
    accepted: "Offer",
    rejected: "Rejected",
    withdrawn: "Withdrawn"
  });

  const CANONICAL_STATUS_TO_LEGACY = Object.freeze({
    Saved: "saved",
    Applied: "applied",
    Interview: "interviewing",
    Offer: "offer",
    Rejected: "rejected",
    Withdrawn: "withdrawn"
  });

  const CANONICAL_DATA_KEY = "stage11CanonicalAppDataV1";
  const PROFILE_RESUME_RESET_VERSION = "2026-04-27-clean-profile-resume";

  function cleanString(value) {
    if (typeof value !== "string") {
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      return "";
    }

    return value.trim();
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function hasOwn(source, key) {
    return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function firstNonEmpty(values) {
    const list = Array.isArray(values) ? values : [];

    for (let index = 0; index < list.length; index += 1) {
      const text = cleanString(list[index]);
      if (text) {
        return text;
      }
    }

    return "";
  }

  function toIsoOrNow(value) {
    const raw = cleanString(value);
    if (!raw) {
      return new Date().toISOString();
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  function toIsoOrEmpty(value) {
    const raw = cleanString(value);
    if (!raw) {
      return "";
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toISOString();
  }

  function normalizeComparableUrl(url) {
    const raw = cleanString(url);
    if (!raw) {
      return "";
    }

    try {
      const parsed = new URL(raw);
      const pathname = cleanString(parsed.pathname).replace(/\/$/, "");
      return parsed.origin.toLowerCase() + pathname + parsed.search;
    } catch {
      return raw.replace(/\/$/, "").toLowerCase();
    }
  }

  function getChromeStorageArea() {
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  async function loadCanonicalDataFromStorage() {
    const area = getChromeStorageArea();
    if (!area) {
      return null;
    }

    return new Promise((resolve) => {
      area.get([CANONICAL_DATA_KEY], (result) => {
        if (global.chrome && chrome.runtime && chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        const candidate = result && result[CANONICAL_DATA_KEY];
        resolve(isObject(candidate) ? candidate : null);
      });
    });
  }

  async function saveCanonicalDataToStorage(canonicalData) {
    const area = getChromeStorageArea();
    if (!area) {
      return;
    }

    await new Promise((resolve, reject) => {
      area.set({ [CANONICAL_DATA_KEY]: canonicalData }, () => {
        if (global.chrome && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function isApplicationStatusValid(status) {
    const safe = cleanString(status);
    return VALID_APPLICATION_STATUSES.includes(safe);
  }

  function normalizeApplicationStatus(status) {
    const safe = cleanString(status);
    if (isApplicationStatusValid(safe)) {
      return safe;
    }

    const lowered = safe.toLowerCase();
    return LEGACY_STATUS_TO_CANONICAL[lowered] || "Saved";
  }

  function normalizeApplicationNotes(value) {
    return ensureArray(value).map((item) => {
      const safe = isObject(item) ? item : {};
      const nextAction = cleanString(safe.nextAction);
      const contentMarkdown = firstNonEmpty([safe.contentMarkdown, safe.content]) ||
        (nextAction ? "## Next Action\n" + nextAction : "");
      return {
        id: firstNonEmpty([safe.id]) || buildDeterministicId("note", [safe.date, safe.title, contentMarkdown, safe.createdAt]),
        date: firstNonEmpty([safe.date]) || new Date().toISOString().slice(0, 10),
        title: firstNonEmpty([safe.title]) || "Untitled Note",
        contentMarkdown: contentMarkdown,
        createdAt: toIsoOrNow(firstNonEmpty([safe.createdAt, safe.updatedAt])),
        updatedAt: toIsoOrNow(firstNonEmpty([safe.updatedAt, safe.createdAt]))
      };
    }).filter((item) => cleanString(item.id));
  }

  function toLegacyApplicationStatus(status) {
    const canonical = normalizeApplicationStatus(status);
    return CANONICAL_STATUS_TO_LEGACY[canonical] || "saved";
  }

  function hasAnyContent(value, depth) {
    const safeDepth = Number.isFinite(depth) ? depth : 0;
    if (safeDepth > 5) {
      return false;
    }

    if (typeof value === "string") {
      return Boolean(cleanString(value));
    }

    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (hasAnyContent(value[index], safeDepth + 1)) {
          return true;
        }
      }
      return false;
    }

    if (!isObject(value)) {
      return false;
    }

    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (hasAnyContent(value[key], safeDepth + 1)) {
        return true;
      }
    }

    return false;
  }

  function slugify(input) {
    const safe = cleanString(input).toLowerCase();
    if (!safe) {
      return "";
    }

    return safe
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function buildDeterministicId(prefix, parts) {
    const list = ensureArray(parts).map((item) => slugify(item)).filter(Boolean);
    if (!list.length) {
      return cleanString(prefix) + "-" + String(Date.now());
    }

    return cleanString(prefix) + "-" + list.join("-");
  }

  function normalizeJob(rawJob) {
    const safe = isObject(rawJob) ? rawJob : {};

    const title = firstNonEmpty([safe.title, safe.role, safe.jobTitle, safe.rawTitle]);
    const company = firstNonEmpty([safe.company, safe.companyName, safe.employer]);
    const location = firstNonEmpty([safe.location, safe.jobLocation]);
    const url = firstNonEmpty([safe.url, safe.jobUrl, safe.link]);
    const descriptionText = firstNonEmpty([safe.descriptionText, safe.description, safe.rawText, safe.pageText]);
    const pageText = firstNonEmpty([safe.pageText, safe.fullPageText]);
    const htmlSnapshot = firstNonEmpty([safe.htmlSnapshot, safe.cleanedHtml, safe.html]);
    const pageTitle = firstNonEmpty([safe.pageTitle, safe.titleText]);
    let hostname = firstNonEmpty([safe.hostname, safe.host]);
    let pathname = firstNonEmpty([safe.pathname, safe.path]);
    if (url && (!hostname || !pathname)) {
      try {
        const parsed = new URL(url);
        hostname = hostname || parsed.hostname;
        pathname = pathname || parsed.pathname;
      } catch {}
    }
    const extractedAt = toIsoOrNow(firstNonEmpty([safe.extractedAt, safe.updatedAt, safe.createdAt]));

    const jobId = firstNonEmpty([safe.jobId, safe.id]) || buildDeterministicId("job", [company, title, url, extractedAt]);

    return {
      jobId: jobId,
      company: company,
      title: title,
      location: location,
      url: url,
      hostname: hostname,
      pathname: pathname,
      pageTitle: pageTitle,
      descriptionText: descriptionText,
      pageText: pageText,
      htmlSnapshot: htmlSnapshot,
      extractedAt: extractedAt
    };
  }

  function detectLanguageFromText() {
    const combined = ensureArray(Array.prototype.slice.call(arguments)).map(cleanString).join(" ");
    if (!combined) return "en";
    const zhMatches = combined.match(/[\u3400-\u9fff]/g) || [];
    const letters = combined.replace(/\s/g, "");
    if (zhMatches.length >= 20) return "zh";
    if (letters.length && zhMatches.length / letters.length > 0.08) return "zh";
    return "en";
  }

  function normalizeApplication(rawApplication) {
    const safe = isObject(rawApplication) ? rawApplication : {};

    const createdAt = toIsoOrNow(firstNonEmpty([safe.createdAt, safe.appliedAt, safe.updatedAt]));
    const updatedAt = toIsoOrNow(firstNonEmpty([safe.updatedAt, safe.createdAt, safe.appliedAt]));
    const applicationId = firstNonEmpty([safe.applicationId, safe.id]) || buildDeterministicId("application", [safe.jobId, createdAt]);
    const appliedAt = toIsoOrEmpty(firstNonEmpty([safe.appliedAt]));
    const jobUrl = firstNonEmpty([safe.jobUrl, safe.url, safe.link]);
    let hostname = firstNonEmpty([safe.hostname, safe.host]);
    let pathname = firstNonEmpty([safe.pathname, safe.path]);
    if (jobUrl && (!hostname || !pathname)) {
      try {
        const parsed = new URL(jobUrl);
        hostname = hostname || parsed.hostname;
        pathname = pathname || parsed.pathname;
      } catch {}
    }
    const jobDescriptionText = firstNonEmpty([safe.jobDescriptionText, safe.descriptionText, safe.description, safe.rawText]);
    const pageText = firstNonEmpty([safe.pageText, safe.fullPageText]);
    const pageTitle = firstNonEmpty([safe.pageTitle, safe.titleText]);
    const detectedLanguage = cleanString(safe.detectedLanguage) === "zh"
      ? "zh"
      : cleanString(safe.detectedLanguage) === "en"
        ? "en"
        : detectLanguageFromText(jobDescriptionText, pageText, pageTitle);

    return {
      applicationId: applicationId,
      jobId: firstNonEmpty([safe.jobId]),
      status: normalizeApplicationStatus(safe.status),
      resumeDraftId: firstNonEmpty([safe.resumeDraftId, safe.resumeId, safe.resumeVersion, safe.resumeVersionId]),
      jobUrl: jobUrl,
      url: jobUrl,
      hostname: hostname,
      pathname: pathname,
      pageTitle: pageTitle,
      jobDescriptionText: jobDescriptionText,
      pageText: pageText,
      htmlSnapshot: firstNonEmpty([safe.htmlSnapshot, safe.cleanedHtml, safe.html]),
      extractedAt: toIsoOrNow(firstNonEmpty([safe.extractedAt, safe.updatedAt, safe.createdAt])),
      source: firstNonEmpty([safe.source]) || "unknown",
      detectedLanguage: detectedLanguage,
      resumeDraft: isObject(safe.resumeDraft) ? safe.resumeDraft : null,
      resumeGuidance: isObject(safe.resumeGuidance) ? safe.resumeGuidance : null,
      notes: normalizeApplicationNotes(safe.notes),
      company: firstNonEmpty([safe.company, safe.companyName, safe.employer]),
      jobTitle: firstNonEmpty([safe.jobTitle, safe.role, safe.title, safe.rawTitle]),
      location: firstNonEmpty([safe.location, safe.jobLocation]),
      appliedAt: appliedAt,
      createdAt: createdAt,
      updatedAt: updatedAt
    };
  }

  function toLegacyApplicationShape(normalizedApplication, fallback) {
    const safe = isObject(normalizedApplication) ? normalizedApplication : {};
    const extra = isObject(fallback) ? fallback : {};

    return {
      ...extra,
      id: firstNonEmpty([safe.applicationId, extra.id]),
      applicationId: firstNonEmpty([safe.applicationId, extra.applicationId]),
      company: firstNonEmpty([extra.company, safe.company]),
      role: firstNonEmpty([extra.role, extra.jobTitle, safe.jobTitle]),
      status: toLegacyApplicationStatus(safe.status),
      jobUrl: firstNonEmpty([extra.jobUrl, safe.jobUrl]),
      url: firstNonEmpty([extra.url, safe.url, safe.jobUrl]),
      hostname: firstNonEmpty([safe.hostname, extra.hostname]),
      pathname: firstNonEmpty([safe.pathname, extra.pathname]),
      pageTitle: firstNonEmpty([safe.pageTitle, extra.pageTitle]),
      jobDescriptionText: firstNonEmpty([safe.jobDescriptionText, extra.jobDescriptionText]),
      pageText: firstNonEmpty([safe.pageText, extra.pageText]),
      htmlSnapshot: firstNonEmpty([safe.htmlSnapshot, extra.htmlSnapshot]),
      extractedAt: firstNonEmpty([safe.extractedAt, extra.extractedAt]),
      detectedLanguage: firstNonEmpty([safe.detectedLanguage, extra.detectedLanguage]),
      resumeDraft: isObject(safe.resumeDraft) ? safe.resumeDraft : (isObject(extra.resumeDraft) ? extra.resumeDraft : null),
      resumeGuidance: isObject(safe.resumeGuidance) ? safe.resumeGuidance : (isObject(extra.resumeGuidance) ? extra.resumeGuidance : null),
      notes: normalizeApplicationNotes(safe.notes),
      appliedAt: firstNonEmpty([extra.appliedAt, safe.appliedAt, safe.updatedAt, safe.createdAt]),
      resumeId: firstNonEmpty([safe.resumeDraftId, extra.resumeId, extra.resumeVersion, extra.resumeVersionId]),
      location: firstNonEmpty([extra.location, safe.location]),
      createdAt: firstNonEmpty([safe.createdAt, extra.createdAt]),
      updatedAt: firstNonEmpty([safe.updatedAt, extra.updatedAt])
    };
  }

  function toLegacyJobShape(normalizedJob, fallback) {
    const safe = isObject(normalizedJob) ? normalizedJob : {};
    const extra = isObject(fallback) ? fallback : {};

    return {
      ...extra,
      jobId: firstNonEmpty([safe.jobId, extra.jobId]),
      id: firstNonEmpty([safe.jobId, extra.id]),
      title: firstNonEmpty([safe.title, extra.title]),
      role: firstNonEmpty([safe.title, extra.role]),
      rawTitle: firstNonEmpty([safe.title, extra.rawTitle]),
      company: firstNonEmpty([safe.company, extra.company]),
      location: firstNonEmpty([safe.location, extra.location]),
      jobUrl: firstNonEmpty([safe.url, extra.jobUrl]),
      url: firstNonEmpty([safe.url, extra.url]),
      description: firstNonEmpty([safe.descriptionText, extra.description]),
      rawText: firstNonEmpty([safe.descriptionText, extra.rawText]),
      descriptionText: firstNonEmpty([safe.descriptionText, extra.descriptionText]),
      extractedAt: firstNonEmpty([safe.extractedAt, extra.extractedAt])
    };
  }

  function normalizeCanonicalAppData(raw) {
    const safe = isObject(raw) ? raw : {};

    const profile = isObject(safe.profile) ? safe.profile : {};
    const resume = isObject(safe.resume)
      ? safe.resume
      : isObject(safe.masterResume)
        ? safe.masterResume
        : {};

    const jobs = ensureArray(safe.jobs)
      .map((item) => normalizeJob(item))
      .filter((item) => Boolean(cleanString(item.title) || cleanString(item.url) || cleanString(item.descriptionText)));

    const jobsById = new Map();
    const jobsByUrl = new Map();

    jobs.forEach((job) => {
      const jobId = cleanString(job.jobId);
      const jobUrl = normalizeComparableUrl(job.url);
      if (jobId && !jobsById.has(jobId)) {
        jobsById.set(jobId, job);
      }
      if (jobUrl && !jobsByUrl.has(jobUrl)) {
        jobsByUrl.set(jobUrl, job);
      }
    });

    const applications = ensureArray(safe.applications)
      .map((item) => normalizeApplication(item))
      .map((application) => {
        const next = { ...application };
        const urlKey = normalizeComparableUrl(next.jobUrl);

        if (!cleanString(next.jobId) && urlKey && jobsByUrl.has(urlKey)) {
          next.jobId = cleanString(jobsByUrl.get(urlKey).jobId);
        }

        if (!cleanString(next.jobId)) {
          const derivedJob = normalizeJob({
            title: next.jobTitle,
            company: next.company,
            location: next.location,
            url: next.jobUrl,
            hostname: next.hostname,
            pathname: next.pathname,
            pageTitle: next.pageTitle,
            descriptionText: next.jobDescriptionText,
            pageText: next.pageText,
            htmlSnapshot: next.htmlSnapshot,
            extractedAt: next.createdAt
          });
          const derivedKey = normalizeComparableUrl(derivedJob.url);
          const existingDerived = (derivedKey && jobsByUrl.get(derivedKey)) || jobsById.get(cleanString(derivedJob.jobId));
          const stableJob = existingDerived || derivedJob;

          if (!existingDerived && (cleanString(stableJob.title) || cleanString(stableJob.url) || cleanString(stableJob.descriptionText))) {
            jobs.push(stableJob);
            if (cleanString(stableJob.jobId)) {
              jobsById.set(cleanString(stableJob.jobId), stableJob);
            }
            if (derivedKey) {
              jobsByUrl.set(derivedKey, stableJob);
            }
          }

          next.jobId = cleanString(stableJob.jobId);
        }

        return next;
      });

    return {
      activeResumeLanguage: cleanString(safe.activeResumeLanguage || (profile && profile.resumeLanguage)) === "zh" ? "zh" : "en",
      resumes: isObject(safe.resumes) ? safe.resumes : {},
      profile: profile,
      resume: resume,
      jobs: jobs,
      applications: applications,
      autofillAnswers: ensureArray(safe.autofillAnswers),
      settings: isObject(safe.settings) ? safe.settings : {}
    };
  }

  function getEmptyProfileResumePatch(settingsInput) {
    const appStore = global.Stage10AppDataStore;
    const settings = isObject(settingsInput) ? settingsInput : {};
    const defaults = appStore && typeof appStore.createDefaultAppData === "function"
      ? appStore.createDefaultAppData()
      : {};
    return {
      activeResumeLanguage: "en",
      resumes: isObject(defaults.resumes) ? defaults.resumes : {},
      profile: isObject(defaults.profile) ? defaults.profile : {},
      resume: isObject(defaults.masterResume) ? defaults.masterResume : {},
      settings: {
        ...settings,
        requiredFieldWaivers: {},
        profileResumeDataResetVersion: PROFILE_RESUME_RESET_VERSION
      }
    };
  }

  function findJobIndexByIdentity(list, job) {
    const jobs = ensureArray(list);
    const safeJob = isObject(job) ? job : {};
    const targetJobId = cleanString(safeJob.jobId);
    const targetUrl = normalizeComparableUrl(safeJob.url);

    for (let index = 0; index < jobs.length; index += 1) {
      const item = isObject(jobs[index]) ? jobs[index] : {};
      const itemJobId = cleanString(item.jobId);
      const itemUrl = normalizeComparableUrl(item.url);

      if (targetUrl && itemUrl && targetUrl === itemUrl) {
        return index;
      }

      if (targetJobId && itemJobId && targetJobId === itemJobId) {
        return index;
      }
    }

    return -1;
  }

  function mergeJobs(baseJobs, incomingJobs) {
    const output = ensureArray(baseJobs).map((item) => normalizeJob(item));
    const list = ensureArray(incomingJobs).map((item) => normalizeJob(item));

    list.forEach((incoming) => {
      const index = findJobIndexByIdentity(output, incoming);
      if (index < 0) {
        output.push(incoming);
        return;
      }

      const existing = isObject(output[index]) ? output[index] : {};
      output[index] = normalizeJob({
        ...existing,
        ...incoming,
        jobId: firstNonEmpty([existing.jobId, incoming.jobId]),
        company: firstNonEmpty([incoming.company, existing.company]),
        title: firstNonEmpty([incoming.title, existing.title]),
        location: firstNonEmpty([incoming.location, existing.location]),
        url: firstNonEmpty([incoming.url, existing.url]),
        descriptionText: firstNonEmpty([incoming.descriptionText, existing.descriptionText]),
        extractedAt: firstNonEmpty([incoming.extractedAt, existing.extractedAt])
      });
    });

    return output;
  }

  function findApplicationIndexByIdentity(list, application) {
    const apps = ensureArray(list);
    const safe = isObject(application) ? application : {};
    const targetId = cleanString(safe.applicationId);
    const targetUrl = normalizeComparableUrl(firstNonEmpty([safe.jobUrl, safe.url]));
    const targetJobId = cleanString(safe.jobId);

    for (let index = 0; index < apps.length; index += 1) {
      const item = isObject(apps[index]) ? apps[index] : {};
      const itemId = cleanString(item.applicationId);
      const itemUrl = normalizeComparableUrl(firstNonEmpty([item.jobUrl, item.url]));
      const itemJobId = cleanString(item.jobId);

      if (targetId && itemId && targetId === itemId) {
        return index;
      }

      if (targetUrl && itemUrl && targetUrl === itemUrl) {
        return index;
      }

      if (targetJobId && itemJobId && targetJobId === itemJobId) {
        return index;
      }
    }

    return -1;
  }

  function mergeApplications(baseApplications, incomingApplications) {
    const output = ensureArray(baseApplications).map((item) => normalizeApplication(item));
    const list = ensureArray(incomingApplications).map((item) => normalizeApplication(item));

    list.forEach((incoming) => {
      const index = findApplicationIndexByIdentity(output, incoming);
      if (index < 0) {
        output.push(incoming);
        return;
      }

      const existing = isObject(output[index]) ? output[index] : {};
      output[index] = normalizeApplication({
        ...existing,
        ...incoming,
        applicationId: firstNonEmpty([existing.applicationId, incoming.applicationId]),
        jobId: firstNonEmpty([incoming.jobId, existing.jobId]),
        status: firstNonEmpty([incoming.status, existing.status]),
        resumeDraftId: firstNonEmpty([incoming.resumeDraftId, existing.resumeDraftId]),
        resumeDraft: isObject(existing.resumeDraft) ? existing.resumeDraft : incoming.resumeDraft,
        jobUrl: firstNonEmpty([incoming.jobUrl, existing.jobUrl]),
        hostname: firstNonEmpty([incoming.hostname, existing.hostname]),
        pathname: firstNonEmpty([incoming.pathname, existing.pathname]),
        pageTitle: firstNonEmpty([incoming.pageTitle, existing.pageTitle]),
        jobDescriptionText: firstNonEmpty([incoming.jobDescriptionText, existing.jobDescriptionText]),
        pageText: firstNonEmpty([incoming.pageText, existing.pageText]),
        htmlSnapshot: firstNonEmpty([incoming.htmlSnapshot, existing.htmlSnapshot]),
        extractedAt: firstNonEmpty([incoming.extractedAt, existing.extractedAt]),
        source: firstNonEmpty([incoming.source, existing.source]),
        detectedLanguage: firstNonEmpty([incoming.detectedLanguage, existing.detectedLanguage]),
        resumeGuidance: isObject(incoming.resumeGuidance) ? incoming.resumeGuidance : existing.resumeGuidance,
        company: firstNonEmpty([incoming.company, existing.company]),
        jobTitle: firstNonEmpty([incoming.jobTitle, existing.jobTitle]),
        location: firstNonEmpty([incoming.location, existing.location]),
        notes: ensureArray(incoming.notes).length || !ensureArray(existing.notes).length ? incoming.notes : existing.notes,
        appliedAt: firstNonEmpty([incoming.appliedAt, existing.appliedAt]),
        createdAt: firstNonEmpty([existing.createdAt, incoming.createdAt]),
        updatedAt: firstNonEmpty([incoming.updatedAt, existing.updatedAt])
      });
    });

    return output;
  }

  function hasMeaningfulProfile(profileInput) {
    return hasAnyContent(profileInput, 0);
  }

  function hasMeaningfulResume(resumeInput) {
    return hasAnyContent(resumeInput, 0);
  }

  async function getAppData() {
    const appStore = global.Stage10AppDataStore;
    const localStore = global.Stage3Storage;

    let storedAppData = {};
    let storedSettings = {};
    let currentJob = null;
    let storedCanonicalRaw = null;

    if (appStore && typeof appStore.getAppData === "function") {
      storedAppData = await appStore.getAppData();
    }

    if (localStore && typeof localStore.getSettings === "function") {
      storedSettings = await localStore.getSettings();
    }

    if (localStore && typeof localStore.getJobData === "function") {
      currentJob = await localStore.getJobData();
    }

    storedCanonicalRaw = await loadCanonicalDataFromStorage();
    if (
      isObject(storedCanonicalRaw) &&
      cleanString(storedCanonicalRaw.settings && storedCanonicalRaw.settings.profileResumeDataResetVersion) !== PROFILE_RESUME_RESET_VERSION
    ) {
      storedCanonicalRaw = {
        ...storedCanonicalRaw,
        settings: {
          ...(isObject(storedCanonicalRaw.settings) ? storedCanonicalRaw.settings : {}),
          profileResumeDataResetVersion: PROFILE_RESUME_RESET_VERSION
        }
      };
      await saveCanonicalDataToStorage(storedCanonicalRaw);
    }

    const legacyCanonical = normalizeCanonicalAppData({
      profile: storedAppData.profile,
      resume: storedAppData.resume || storedAppData.masterResume,
      activeResumeLanguage: storedAppData.activeResumeLanguage,
      resumes: storedAppData.resumes,
      jobs: storedAppData.jobs,
      applications: storedAppData.applications,
      autofillAnswers: storedAppData.autofillAnswers,
      settings: isObject(storedAppData.settings) ? storedAppData.settings : {}
    });

    const canonicalFromStorage = normalizeCanonicalAppData(storedCanonicalRaw);
    const hasStoredCanonical = isObject(storedCanonicalRaw);

    const mergedJobs = mergeJobs(
      hasStoredCanonical && hasOwn(storedCanonicalRaw, "jobs") ? canonicalFromStorage.jobs : [],
      legacyCanonical.jobs
    );

    const mergedApplications = mergeApplications(
      hasStoredCanonical && hasOwn(storedCanonicalRaw, "applications") ? canonicalFromStorage.applications : [],
      legacyCanonical.applications
    );

    const mergedAutofillAnswers =
      legacyCanonical.autofillAnswers.length > 0
        ? legacyCanonical.autofillAnswers
        : (hasStoredCanonical && hasOwn(storedCanonicalRaw, "autofillAnswers")
          ? canonicalFromStorage.autofillAnswers
          : legacyCanonical.autofillAnswers);

    const canonical = normalizeCanonicalAppData({
      profile: hasMeaningfulProfile(legacyCanonical.profile)
        ? legacyCanonical.profile
        : (hasStoredCanonical && hasOwn(storedCanonicalRaw, "profile")
          ? canonicalFromStorage.profile
          : legacyCanonical.profile),
      resume: hasMeaningfulResume(legacyCanonical.resume)
        ? legacyCanonical.resume
        : (hasStoredCanonical && hasOwn(storedCanonicalRaw, "resume")
          ? canonicalFromStorage.resume
          : legacyCanonical.resume),
      activeResumeLanguage: legacyCanonical.activeResumeLanguage || (hasStoredCanonical ? canonicalFromStorage.activeResumeLanguage : "en"),
      resumes: isObject(legacyCanonical.resumes) && Object.keys(legacyCanonical.resumes).length
        ? legacyCanonical.resumes
        : (hasStoredCanonical && hasOwn(storedCanonicalRaw, "resumes") ? canonicalFromStorage.resumes : {}),
      jobs: mergedJobs,
      applications: mergedApplications,
      autofillAnswers: mergedAutofillAnswers,
      settings: {
        ...(legacyCanonical.settings || {}),
        ...(hasStoredCanonical && hasOwn(storedCanonicalRaw, "settings") ? canonicalFromStorage.settings : {}),
        ...(isObject(storedSettings) ? storedSettings : {})
      }
    });

    if (!canonical.jobs.length && isObject(currentJob)) {
      canonical.jobs = [normalizeJob(currentJob)];
    }

    return canonical;
  }

  async function saveAppData(data) {
    const appStore = global.Stage10AppDataStore;
    const localStore = global.Stage3Storage;
    const rawInput = isObject(data) ? data : {};

    const currentCanonical = await getAppData();
    const normalizedInput = normalizeCanonicalAppData(rawInput);

    const hasProfile = Object.prototype.hasOwnProperty.call(rawInput, "profile");
    const hasResume = Object.prototype.hasOwnProperty.call(rawInput, "resume") || Object.prototype.hasOwnProperty.call(rawInput, "masterResume");
    const hasDualResumes = Object.prototype.hasOwnProperty.call(rawInput, "resumes") || Object.prototype.hasOwnProperty.call(rawInput, "activeResumeLanguage");
    const hasJobs = Object.prototype.hasOwnProperty.call(rawInput, "jobs");
    const hasApplications = Object.prototype.hasOwnProperty.call(rawInput, "applications");
    const hasAutofillAnswers = Object.prototype.hasOwnProperty.call(rawInput, "autofillAnswers");
    const hasSettings = Object.prototype.hasOwnProperty.call(rawInput, "settings");

    const mergedCanonical = normalizeCanonicalAppData({
      profile: hasProfile ? normalizedInput.profile : currentCanonical.profile,
      resume: hasResume ? normalizedInput.resume : currentCanonical.resume,
      activeResumeLanguage: hasDualResumes ? normalizedInput.activeResumeLanguage : currentCanonical.activeResumeLanguage,
      resumes: hasDualResumes ? normalizedInput.resumes : currentCanonical.resumes,
      jobs: hasJobs ? normalizedInput.jobs : currentCanonical.jobs,
      applications: hasApplications ? normalizedInput.applications : currentCanonical.applications,
      autofillAnswers: hasAutofillAnswers ? normalizedInput.autofillAnswers : currentCanonical.autofillAnswers,
      settings: hasSettings
        ? {
            ...(isObject(currentCanonical.settings) ? currentCanonical.settings : {}),
            ...(isObject(normalizedInput.settings) ? normalizedInput.settings : {})
          }
        : currentCanonical.settings
    });

    await saveCanonicalDataToStorage(mergedCanonical);

    if (appStore && typeof appStore.getAppData === "function" && typeof appStore.saveAppData === "function") {
      const currentRaw = await appStore.getAppData();
      const currentRawApplications = ensureArray(currentRaw && currentRaw.applications);
      const currentRawApplicationsById = new Map();

      currentRawApplications.forEach((item) => {
        const safe = isObject(item) ? item : {};
        const key = firstNonEmpty([safe.applicationId, safe.id]);
        if (key && !currentRawApplicationsById.has(key)) {
          currentRawApplicationsById.set(key, safe);
        }
      });

      const nextRaw = {
        ...(isObject(currentRaw) ? currentRaw : {}),
        activeResumeLanguage: mergedCanonical.activeResumeLanguage,
        resumes: mergedCanonical.resumes,
        profile: mergedCanonical.profile,
        masterResume: mergedCanonical.resume,
        resume: mergedCanonical.resume,
        applications: mergedCanonical.applications.map((item) => {
          const key = cleanString(item && item.applicationId);
          const fallback = key ? currentRawApplicationsById.get(key) : null;
          return toLegacyApplicationShape(item, fallback);
        }),
        autofillAnswers: mergedCanonical.autofillAnswers,
        settings: {
          ...(isObject(currentRaw && currentRaw.settings) ? currentRaw.settings : {}),
          ...(isObject(mergedCanonical.settings) ? mergedCanonical.settings : {})
        }
      };

      if (hasJobs) {
        nextRaw.jobs = mergedCanonical.jobs;
      }

      await appStore.saveAppData(nextRaw);
    }

    if (localStore && typeof localStore.setSettings === "function" && hasSettings) {
      await localStore.setSettings(mergedCanonical.settings);
    }

    if (localStore && typeof localStore.setJobData === "function" && hasJobs && mergedCanonical.jobs.length) {
      await localStore.setJobData(toLegacyJobShape(mergedCanonical.jobs[0], null));
    }

    return mergedCanonical;
  }

  async function resetProfileResumeData() {
    const current = await getAppData();
    const resetPatch = getEmptyProfileResumePatch(current.settings);
    return await saveAppData({
      ...current,
      activeResumeLanguage: resetPatch.activeResumeLanguage,
      resumes: resetPatch.resumes,
      profile: resetPatch.profile,
      resume: resetPatch.resume,
      settings: resetPatch.settings
    });
  }

  function hasFieldContent(source, keys) {
    const safe = isObject(source) ? source : {};
    const keyList = ensureArray(keys);

    for (let index = 0; index < keyList.length; index += 1) {
      const key = cleanString(keyList[index]);
      if (!key) {
        continue;
      }
      if (hasAnyContent(safe[key], 0)) {
        return true;
      }
    }

    return false;
  }

  function hasNonEmptyString(value) {
    return Boolean(cleanString(value));
  }

  function hasMeaningfulArrayItem(list) {
    const values = ensureArray(list);
    for (let index = 0; index < values.length; index += 1) {
      if (hasAnyContent(values[index], 0)) {
        return true;
      }
    }
    return false;
  }

  function hasAnyNonEmptyInKeys(source, keys) {
    const safe = isObject(source) ? source : {};
    const fields = ensureArray(keys);
    for (let index = 0; index < fields.length; index += 1) {
      if (hasNonEmptyString(safe[fields[index]])) {
        return true;
      }
    }
    return false;
  }

  function resolveLocalizedText(value, lang) {
    if (typeof value === "string" || typeof value === "number") {
      return cleanString(value);
    }
    if (!isObject(value)) {
      return "";
    }
    const en = cleanString(value.en);
    const zh = cleanString(value.zh);
    return lang === "zh" ? zh : en;
  }

  function resolveLocalizedName(profile, lang) {
    const safe = isObject(profile) ? profile : {};
    const name = isObject(safe.name) ? safe.name : {};
    if (name.waived) {
      return { firstName: "", lastName: "", legacyName: "", waived: true };
    }
    const en = isObject(name.en) ? name.en : {};
    const zh = isObject(name.zh) ? name.zh : {};
    const selected = lang === "zh" ? zh : en;
    const selectedFirst = cleanString(selected.firstName);
    const selectedMiddle = cleanString(selected.middleName);
    const selectedLast = cleanString(selected.lastName);
    const selectedLegacyName = selectedFirst || selectedMiddle || selectedLast
      ? ""
      : cleanString(selected.displayName || (lang === "zh" ? (safe.nameZh || safe.chineseName || safe.zhName) : safe.fullName));
    return {
      firstName: selectedFirst,
      lastName: selectedLast,
      legacyName: selectedLegacyName,
      waived: false
    };
  }

  function isLocalizedFieldComplete(value, lang) {
    if (isObject(value) && value.waived) {
      return true;
    }
    return Boolean(resolveLocalizedText(value, lang));
  }

  function hasAnyLocalizedField(source, keys, lang) {
    const safe = isObject(source) ? source : {};
    const fields = ensureArray(keys);
    for (let index = 0; index < fields.length; index += 1) {
      if (isLocalizedFieldComplete(safe[fields[index]], lang)) {
        return true;
      }
    }
    return false;
  }

  function hasMeaningfulBulletList(value, lang) {
    const list = ensureArray(value);
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (hasNonEmptyString(item)) {
        return true;
      }
      const safeItem = isObject(item) ? item : {};
      if (safeItem.waived) {
        continue;
      }
      if (resolveLocalizedText(safeItem, lang) || hasNonEmptyString(firstNonEmpty([safeItem.text, safeItem.content, safeItem.summary]))) {
        return true;
      }
    }
    return false;
  }

  function hasSelectedSponsorship(value) {
    if (typeof value === "boolean") {
      return true;
    }

    const text = cleanString(value).toLowerCase();
    return text === "true" || text === "false" || text === "yes" || text === "no";
  }

  function hasMeaningfulEducationValue(value, lang) {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const item = isObject(value[index]) ? value[index] : {};
        if (item.waived || item.enabled === false) {
          continue;
        }
        const school = isLocalizedFieldComplete(item.school, lang);
        const degree = isLocalizedFieldComplete(item.degree, lang);
        const major = isLocalizedFieldComplete(item.major || item.field || item.fieldOfStudy, lang);
        if (school && degree && major) {
          return true;
        }
      }
      return false;
    }

    if (isObject(value)) {
      if (value.waived || value.enabled === false) {
        return false;
      }
      const school = isLocalizedFieldComplete(value.school, lang);
      const degree = isLocalizedFieldComplete(value.degree, lang);
      const major = isLocalizedFieldComplete(value.major || value.field || value.fieldOfStudy, lang);
      return Boolean(school && degree && major);
    }

    const text = cleanString(value);
    if (!text || text === "[]" || text === "{}") {
      return false;
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) || isObject(parsed)) {
        return hasMeaningfulEducationValue(parsed, lang);
      }
      return false;
    } catch {
      return false;
    }
  }

  function hasMeaningfulSummaryValue(value, lang) {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (hasNonEmptyString(item)) {
          return true;
        }

        const safeItem = isObject(item) ? item : {};
        if (safeItem.waived || safeItem.enabled === false) {
          continue;
        }
        if (resolveLocalizedText(safeItem.text, lang) || hasNonEmptyString(firstNonEmpty([safeItem.summary, safeItem.content]))) {
          return true;
        }
      }
      return false;
    }

    if (isObject(value)) {
      return hasAnyContent(value, 0);
    }

    return hasNonEmptyString(value);
  }

  function hasMeaningfulSkillField(value) {
    if (Array.isArray(value)) {
      return hasMeaningfulArrayItem(value);
    }
    if (isObject(value)) {
      return hasAnyContent(value, 0);
    }
    return hasNonEmptyString(value);
  }

  function hasNonEmptyListField(value) {
    if (Array.isArray(value)) {
      return hasMeaningfulArrayItem(value);
    }
    if (isObject(value)) {
      return hasAnyContent(value, 0);
    }
    return hasNonEmptyString(value);
  }

  function hasMeaningfulExperienceValue(value, lang) {
    const list = ensureArray(value);
    for (let index = 0; index < list.length; index += 1) {
      const item = isObject(list[index]) ? list[index] : {};
      if (item.waived || item.enabled === false) {
        continue;
      }
      if (hasAnyLocalizedField(item, ["company", "title", "location", "summary"], lang) || hasAnyNonEmptyInKeys(item, ["startDate", "endDate", "employmentType", "industry"])) {
        return true;
      }
      if (hasMeaningfulBulletList(item.bullets, lang)) {
        return true;
      }
    }
    return false;
  }

  function hasMeaningfulProjectValue(value, lang) {
    const list = ensureArray(value);
    for (let index = 0; index < list.length; index += 1) {
      const item = isObject(list[index]) ? list[index] : {};
      if (item.waived || item.enabled === false) {
        continue;
      }
      if (hasAnyLocalizedField(item, ["name", "role", "organization", "description", "location"], lang) || hasAnyNonEmptyInKeys(item, ["startDate", "endDate"])) {
        return true;
      }
      if (hasMeaningfulBulletList(item.bullets, lang)) {
        return true;
      }
      const links = isObject(item.links) ? item.links : {};
      if (hasAnyNonEmptyInKeys(links, ["demo", "repo", "other"])) {
        return true;
      }
    }
    return false;
  }

  function hasWaivedItem(value) {
    const list = ensureArray(value);
    for (let index = 0; index < list.length; index += 1) {
      const item = isObject(list[index]) ? list[index] : {};
      if (item.waived || item.enabled === false) {
        return true;
      }
    }
    return false;
  }

  function validateProfileResumeComplete(appData) {
    return {
      ok: true,
      missingFields: [],
      waivedFields: []
    };
  }

  function validateCurrentJob(currentJob) {
    const normalized = normalizeJob(currentJob);

    if (!cleanString(normalized.title)) {
      return false;
    }

    if (!cleanString(normalized.url) && !cleanString(normalized.descriptionText)) {
      return false;
    }

    return true;
  }

  function validateApiSettings(settings) {
    const safe = isObject(settings) ? settings : {};
    const provider = cleanString(safe.provider);
    if (!provider) {
      return false;
    }

    const providersMap = isObject(safe.providers) ? safe.providers : {};
    const scoped = isObject(providersMap[provider]) ? providersMap[provider] : {};

    const model = firstNonEmpty([scoped.model, safe.model, safe.defaultModel]);
    const apiKey = firstNonEmpty([scoped.apiKey, safe.apiKey]);
    const baseUrl = firstNonEmpty([scoped.baseUrl, safe.apiBaseUrl, safe.baseUrl]);

    if (!model) {
      return false;
    }

    if (!apiKey) {
      return false;
    }

    const providerKey = provider.toLowerCase();
    const requiresBaseUrl = providerKey === "openai" || providerKey === "deepseek" || providerKey === "ollama" || providerKey === "minimax";
    if (requiresBaseUrl && !baseUrl) {
      return false;
    }

    return true;
  }

  function evaluateGenerateResumeGuard(input) {
    const safe = isObject(input) ? input : {};

    if (!validateCurrentJob(safe.currentJob)) {
      return {
        ok: false,
        code: "MISSING_CURRENT_JOB",
        mainMessage: "No current job detected.",
        supportingMessage: "Please open a job posting page before generating a resume."
      };
    }

    const profileCheck = validateProfileResumeComplete(safe.appData);
    if (!profileCheck.ok) {
      return {
        ok: false,
        code: "INCOMPLETE_PROFILE_RESUME",
        mainMessage: "Profile & Resume is incomplete.",
        supportingMessage: "Please complete all fields before generating a tailored resume.",
        missingFields: profileCheck.missingFields
      };
    }

    if (!validateApiSettings(safe.settings)) {
      return {
        ok: false,
        code: "INVALID_API_SETTINGS",
        mainMessage: "API settings are incomplete.",
        supportingMessage: "Please complete Provider, Model, and API Key in Settings before generating a resume."
      };
    }

    return {
      ok: true,
      code: "OK",
      mainMessage: "",
      supportingMessage: ""
    };
  }

  const api = Object.freeze({
    VALID_APPLICATION_STATUSES: VALID_APPLICATION_STATUSES,
    getAppData: getAppData,
    saveAppData: saveAppData,
    resetProfileResumeData: resetProfileResumeData,
    normalizeJob: normalizeJob,
    normalizeApplication: normalizeApplication,
    validateProfileResumeComplete: validateProfileResumeComplete,
    validateCurrentJob: validateCurrentJob,
    validateApiSettings: validateApiSettings,
    evaluateGenerateResumeGuard: evaluateGenerateResumeGuard
  });

  global.Stage11DataBoundary = api;
})(globalThis);
