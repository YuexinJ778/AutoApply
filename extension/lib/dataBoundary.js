(function attachStage11DataBoundary(global) {
  "use strict";

  const CANONICAL_DATA_KEY = "stage11ProfileDataV1";
  const LEGACY_CANONICAL_DATA_KEY = "stage11CanonicalAppDataV1";
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
      area.get([CANONICAL_DATA_KEY, LEGACY_CANONICAL_DATA_KEY], (result) => {
        if (global.chrome && chrome.runtime && chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        const candidate = result && (result[CANONICAL_DATA_KEY] || result[LEGACY_CANONICAL_DATA_KEY]);
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
      area.set({ [CANONICAL_DATA_KEY]: normalizeCanonicalAppData(canonicalData) }, () => {
        if (global.chrome && chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
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
      } catch {
        // Keep the supplied host and path when the URL cannot be parsed.
      }
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

  function normalizeCanonicalAppData(raw) {
    const safe = isObject(raw) ? raw : {};
    return {
      activeResumeLanguage: cleanString(safe.activeResumeLanguage || (safe.profile && safe.profile.resumeLanguage)) === "zh" ? "zh" : "en",
      resumes: isObject(safe.resumes) ? safe.resumes : {},
      profile: isObject(safe.profile) ? safe.profile : {},
      resume: isObject(safe.resume) ? safe.resume : (isObject(safe.masterResume) ? safe.masterResume : {}),
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

  function hasMeaningfulProfile(profileInput) {
    return hasAnyContent(profileInput, 0);
  }

  function hasMeaningfulResume(resumeInput) {
    return hasAnyContent(resumeInput, 0);
  }

  async function getAppData() {
    const appStore = global.Stage10AppDataStore;
    const localStore = global.Stage3Storage;
    const stored = appStore ? await appStore.getAppData() : {};
    const canonical = normalizeCanonicalAppData(await loadCanonicalDataFromStorage());
    const localSettings = localStore ? await localStore.getSettings() : {};
    const hasCanonicalResumes = Object.keys(canonical.resumes).length > 0;
    return normalizeCanonicalAppData({
      profile: hasMeaningfulProfile(stored.profile) ? stored.profile : canonical.profile,
      resume: hasMeaningfulResume(stored.masterResume) ? stored.masterResume : canonical.resume,
      activeResumeLanguage: hasCanonicalResumes ? canonical.activeResumeLanguage : stored.activeResumeLanguage,
      resumes: hasCanonicalResumes ? canonical.resumes : stored.resumes,
      autofillAnswers: ensureArray(stored.autofillAnswers).length ? stored.autofillAnswers : canonical.autofillAnswers,
      settings: { ...(stored.settings || {}), ...canonical.settings, ...localSettings }
    });
  }

  async function saveAppData(data) {
    const raw = isObject(data) ? data : {};
    const current = await getAppData();
    const merged = normalizeCanonicalAppData({
      ...current,
      ...raw,
      resume: hasOwn(raw, "masterResume") ? raw.masterResume : (hasOwn(raw, "resume") ? raw.resume : current.resume),
      settings: { ...current.settings, ...(raw.settings || {}) }
    });
    await saveCanonicalDataToStorage(merged);
    const appStore = global.Stage10AppDataStore;
    if (appStore) {
      const currentRaw = await appStore.getAppData();
      await appStore.saveAppData({ ...currentRaw, ...merged, masterResume: merged.resume });
    }
    const localStore = global.Stage3Storage;
    if (localStore && hasOwn(raw, "settings")) await localStore.setSettings(merged.settings);
    return merged;
  }

  async function getLegacyApplications() {
    const area = getChromeStorageArea();
    if (!area) return [];
    const stored = await new Promise((resolve, reject) => {
      area.get([LEGACY_CANONICAL_DATA_KEY, "appDataV1", "applicationRecords"], (value) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(value || {});
      });
    });
    const canonical = ensureArray(stored[LEGACY_CANONICAL_DATA_KEY] && stored[LEGACY_CANONICAL_DATA_KEY].applications);
    const appData = ensureArray(stored.appDataV1 && stored.appDataV1.applications);
    const records = ensureArray(stored.applicationRecords).slice().sort((left, right) =>
      String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")));
    const output = [];
    for (const record of canonical.concat(appData, records)) {
      const id = cleanString(record.applicationId || record.id);
      const url = normalizeComparableUrl(record.jobUrl || record.url);
      const existing = output.find(item =>
        (id && id === cleanString(item.applicationId || item.id)) ||
        (url && url === normalizeComparableUrl(item.jobUrl || item.url)));
      if (!existing) { output.push({ ...record }); continue; }
      for (const [key, value] of Object.entries(record)) {
        if (existing[key] === undefined || existing[key] === "" ||
            (Array.isArray(existing[key]) && existing[key].length === 0)) existing[key] = value;
      }
    }
    return output;
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

  function validateProfileResumeComplete() {
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
    getAppData: getAppData,
    getLegacyApplications: getLegacyApplications,
    saveAppData: saveAppData,
    resetProfileResumeData: resetProfileResumeData,
    normalizeJob: normalizeJob,
    validateProfileResumeComplete: validateProfileResumeComplete,
    validateCurrentJob: validateCurrentJob,
    validateApiSettings: validateApiSettings,
    evaluateGenerateResumeGuard: evaluateGenerateResumeGuard
  });

  global.Stage11DataBoundary = api;
})(globalThis);
