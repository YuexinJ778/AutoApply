(function initQuickPanel() {
  "use strict";

  const shared = globalThis.Stage3Shared;
  const storage = globalThis.Stage3Storage;
  const messaging = globalThis.Stage5Messaging;
  const api = globalThis.Stage5Api;
  const appDataStore = globalThis.Stage10AppDataStore;
  const resumeRegistryStore = globalThis.Stage6ResumeRegistryStorage;
  const dataBoundary = globalThis.Stage11DataBoundary;

  const CONSOLE_PAGE_PATH = "options/options.html";
  const PENDING_APPLY_STORAGE_KEY = "pendingApply";
  const AUTOFILL_RUNTIME_STATE_STORAGE_KEY = "autoFillRuntimeState";

  const generateButton = document.getElementById("generate-btn");
  const autofillButton = document.getElementById("autofill-btn");
  const saveJobButton = document.getElementById("save-job-btn");
  const applicationsButton = document.getElementById("applications-btn");
  const openConsoleButton = document.getElementById("open-console-btn");
  const jobSummaryTitleEl = document.getElementById("job-summary-title");
  const jobSummarySubtitleEl = document.getElementById("job-summary-subtitle");
  const jobSummaryMetaEl = document.getElementById("job-summary-meta");
  const jobSummaryOpenSettingsBtn = document.getElementById("job-summary-open-settings-btn");
  const runtimeModelEl = document.getElementById("runtime-model");
  const runtimeStatusEl = document.getElementById("runtime-status");
  const guardNoticeEl = document.getElementById("guard-notice");
  const guardNoticeListEl = document.getElementById("guard-notice-list");
  const guardNoticeGotoBtn = document.getElementById("guard-notice-goto-btn");
  const guardNoticeDismissBtn = document.getElementById("guard-notice-dismiss-btn");

  const state = {
    busy: false,
    currentJob: null,
    currentJobRaw: null,
    isStartApplyRunning: false,
    activeTabId: null,
    activeTabUrl: ""
  };

  function cleanString(value) {
    if (typeof value !== "string") {
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      return "";
    }
    return value.trim();
  }

  function toComparableUrl(url) {
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

  function urlsMatch(left, right) {
    const a = toComparableUrl(left);
    const b = toComparableUrl(right);
    return Boolean(a && b && a === b);
  }

  function setBusy(nextBusy) {
    state.busy = Boolean(nextBusy);
    if (generateButton) generateButton.disabled = state.busy;
    if (autofillButton) autofillButton.disabled = state.busy;
    if (saveJobButton) saveJobButton.disabled = state.busy;
    if (applicationsButton) applicationsButton.disabled = state.busy;
  }

  function setStatus(text) {
    if (runtimeStatusEl) {
      runtimeStatusEl.textContent = "Status: " + cleanString(text);
    }
  }

  function setNoJobSummaryState() {
    if (jobSummaryTitleEl) {
      jobSummaryTitleEl.textContent = "No job or application form detected on this page.";
    }
    if (jobSummarySubtitleEl) {
      jobSummarySubtitleEl.textContent = "Open a job posting page or application form to start.";
    }
    if (jobSummaryMetaEl) {
      jobSummaryMetaEl.textContent = "";
      jobSummaryMetaEl.hidden = true;
    }
    if (jobSummaryOpenSettingsBtn) {
      jobSummaryOpenSettingsBtn.hidden = true;
    }
  }

  function setApplicationFormSummaryState(metaText) {
    if (jobSummaryTitleEl) {
      jobSummaryTitleEl.textContent = "Application form detected.";
    }
    if (jobSummarySubtitleEl) {
      jobSummarySubtitleEl.textContent = "AutoFill is available on this page.";
    }
    if (jobSummaryMetaEl) {
      jobSummaryMetaEl.textContent = cleanString(metaText) || "Application flow";
      jobSummaryMetaEl.hidden = false;
    }
    if (jobSummaryOpenSettingsBtn) {
      jobSummaryOpenSettingsBtn.hidden = true;
    }
  }

  function setDetectedJobSummaryState(job, metaText) {
    const safe = job && typeof job === "object" ? job : {};
    const title = cleanString(safe.title) || "Detected Job";
    const subtitle = [cleanString(safe.company), cleanString(safe.location)].filter(Boolean).join(" • ") || "Job detected on this page.";

    if (jobSummaryTitleEl) {
      jobSummaryTitleEl.textContent = title;
    }
    if (jobSummarySubtitleEl) {
      jobSummarySubtitleEl.textContent = subtitle;
    }
    if (jobSummaryMetaEl) {
      jobSummaryMetaEl.textContent = cleanString(metaText) || "Detected on this page";
      jobSummaryMetaEl.hidden = false;
    }
    if (jobSummaryOpenSettingsBtn) {
      jobSummaryOpenSettingsBtn.hidden = true;
    }
  }

  function setAiFailureSummaryState() {
    if (jobSummaryTitleEl) {
      jobSummaryTitleEl.textContent = "Unable to detect job with AI.";
    }
    if (jobSummarySubtitleEl) {
      jobSummarySubtitleEl.textContent = "Please go to Console > Settings and check your API key.";
    }
    if (jobSummaryMetaEl) {
      jobSummaryMetaEl.textContent = "";
      jobSummaryMetaEl.hidden = true;
    }
    if (jobSummaryOpenSettingsBtn) {
      jobSummaryOpenSettingsBtn.hidden = false;
    }
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || null);
      });
    });
  }

  function queryActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(Array.isArray(tabs) ? tabs[0] : null);
      });
    });
  }

  function sendMessageToTab(tabId, payload) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || null);
      });
    });
  }

  async function extractCurrentPagePayload() {
    if (!shared || !shared.MESSAGE_TYPES) {
      throw new Error("Shared message constants unavailable.");
    }

    const response = await sendRuntimeMessage({ type: shared.MESSAGE_TYPES.EXTRACT_CURRENT_PAGE });
    if (!response || response.ok !== true) {
      throw new Error(cleanString(response && response.error) || "Extraction failed.");
    }

    const payload = response && response.data && typeof response.data === "object" ? response.data : {};
    return {
      jobPosting: payload.jobPosting && typeof payload.jobPosting === "object" ? payload.jobPosting : null,
      pageSnapshot: payload.pageSnapshot && typeof payload.pageSnapshot === "object" ? payload.pageSnapshot : null
    };
  }

  function isApiSettingsComplete(settings) {
    if (dataBoundary && typeof dataBoundary.validateApiSettings === "function") {
      return dataBoundary.validateApiSettings(settings);
    }

    const safe = settings && typeof settings === "object" ? settings : {};
    const provider = cleanString(safe.provider);
    const providersMap = safe.providers && typeof safe.providers === "object" ? safe.providers : {};
    const scoped = providersMap[provider] && typeof providersMap[provider] === "object" ? providersMap[provider] : {};
    const model = cleanString(scoped.model || safe.model);
    const apiKey = cleanString(scoped.apiKey || safe.apiKey);
    return Boolean(provider && model && apiKey);
  }

  function normalizeAiJobResult(aiJob, activeTab, extractedPayload) {
    const safe = aiJob && typeof aiJob === "object" ? aiJob : {};
    const pageSnapshot = extractedPayload && extractedPayload.pageSnapshot && typeof extractedPayload.pageSnapshot === "object"
      ? extractedPayload.pageSnapshot
      : {};
    const tabUrl = cleanString(activeTab && activeTab.url);
    const pageUrl = cleanString(pageSnapshot.url);
    const url = cleanString(safe.url || safe.jobUrl) || pageUrl || tabUrl;

    return {
      jobId: "",
      company: cleanString(safe.company),
      title: cleanString(safe.title),
      location: cleanString(safe.location),
      url: url,
      hostname: cleanString(pageSnapshot.hostname),
      pathname: cleanString(pageSnapshot.pathname),
      pageTitle: cleanString(pageSnapshot.title),
      descriptionText: cleanString(safe.descriptionText) || cleanString(pageSnapshot.pageText),
      pageText: cleanString(pageSnapshot.pageText),
      htmlSnapshot: cleanString(pageSnapshot.htmlSnapshot),
      extractedAt: new Date().toISOString()
    };
  }

  function fallbackNormalizeJob(rawJob, activeTab) {
    const safe = rawJob && typeof rawJob === "object" ? rawJob : {};
    const tabUrl = cleanString(activeTab && activeTab.url);
    const url = cleanString(safe.url || safe.jobUrl) || tabUrl;
    const title = cleanString(safe.title || safe.role || safe.rawTitle || safe.jobTitle);
    const company = cleanString(safe.company);

    return {
      jobId: cleanString(safe.jobId || safe.id) || "job-" + String(Date.now()),
      company: company,
      title: title,
      location: cleanString(safe.location || safe.jobLocation),
      url: url,
      hostname: cleanString(safe.hostname),
      pathname: cleanString(safe.pathname),
      pageTitle: cleanString(safe.pageTitle || safe.titleText),
      descriptionText: cleanString(safe.descriptionText || safe.description || safe.rawText || safe.pageText),
      pageText: cleanString(safe.pageText),
      htmlSnapshot: cleanString(safe.htmlSnapshot),
      extractedAt: cleanString(safe.extractedAt || safe.updatedAt || safe.createdAt) || new Date().toISOString()
    };
  }

  function detectLanguageFromText() {
    const combined = Array.from(arguments).map(cleanString).join(" ");
    if (!combined) return "en";
    const zhMatches = combined.match(/[\u3400-\u9fff]/g) || [];
    const compactLength = combined.replace(/\s/g, "").length;
    if (zhMatches.length >= 20) return "zh";
    if (compactLength && zhMatches.length / compactLength > 0.08) return "zh";
    return "en";
  }

  function deepClone(value) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch {}
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function createEmptyResume(lang) {
    const safeLang = cleanString(lang) === "zh" ? "zh" : "en";
    return {
      id: "resume_" + safeLang + "_default",
      language: safeLang,
      header: {
        name: { firstName: "", middleName: "", lastName: "", waived: false },
        email: { value: "", waived: false },
        phone: { value: "", waived: false },
        location: { value: "", waived: false },
        linkedin: { value: "", waived: false },
        github: { value: "", waived: false },
        portfolio: { value: "", waived: false }
      },
      sections: []
    };
  }

  function normalizeProfileResumeForDraft(resume, lang) {
    const safeLang = cleanString(lang) === "zh" ? "zh" : "en";
    const raw = resume && typeof resume === "object" ? deepClone(resume) : createEmptyResume(safeLang);
    return {
      ...raw,
      id: cleanString(raw.id) || "app_resume_" + safeLang + "_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8),
      language: safeLang,
      header: raw.header && typeof raw.header === "object" ? raw.header : createEmptyResume(safeLang).header,
      sections: Array.isArray(raw.sections) ? raw.sections : []
    };
  }

  function resolveDualProfileResumeSnapshot(appData) {
    const safe = appData && typeof appData === "object" ? appData : {};
    const resumes = safe.resumes && typeof safe.resumes === "object" ? safe.resumes : {};
    const activeResumeLanguage = cleanString(safe.activeResumeLanguage) === "zh" ? "zh" : "en";

    return {
      activeResumeLanguage: activeResumeLanguage,
      resumes: {
        en: normalizeProfileResumeForDraft(resumes.en, "en"),
        zh: normalizeProfileResumeForDraft(resumes.zh, "zh")
      }
    };
  }

  function buildApplicationResumeDraftFromActiveProfile(appData, applicationId, nowIso) {
    const snapshot = resolveDualProfileResumeSnapshot(appData);
    const createdAt = cleanString(nowIso) || new Date().toISOString();
    const draftId = "resume_draft_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
    return {
      id: draftId,
      applicationId: cleanString(applicationId),
      source: "copied_from_active_profile_resume",
      baseLanguage: snapshot.activeResumeLanguage,
      activeResumeLanguage: snapshot.activeResumeLanguage,
      createdAt: createdAt,
      updatedAt: createdAt,
      resumes: snapshot.resumes,
      pdfPath: "",
      htmlPath: ""
    };
  }

  function normalizeDetectedJob(rawJob, activeTab) {
    if (dataBoundary && typeof dataBoundary.normalizeJob === "function") {
      return dataBoundary.normalizeJob({
        ...(rawJob && typeof rawJob === "object" ? rawJob : {}),
        url: cleanString(rawJob && (rawJob.url || rawJob.jobUrl)) || cleanString(activeTab && activeTab.url)
      });
    }
    return fallbackNormalizeJob(rawJob, activeTab);
  }

  function isCurrentJobValid(job) {
    if (dataBoundary && typeof dataBoundary.validateCurrentJob === "function") {
      return dataBoundary.validateCurrentJob(job);
    }

    const safe = job && typeof job === "object" ? job : {};
    const title = cleanString(safe.title || safe.role || safe.rawTitle);
    const url = cleanString(safe.url || safe.jobUrl);
    const descriptionText = cleanString(safe.descriptionText || safe.description || safe.rawText);
    return Boolean(title && (url || descriptionText));
  }

  function buildCachedJobPayload(normalizedJob, rawJob) {
    const safeJob = normalizedJob && typeof normalizedJob === "object" ? normalizedJob : {};
    const safeRaw = rawJob && typeof rawJob === "object" ? rawJob : {};

    return {
      ...safeRaw,
      jobId: cleanString(safeJob.jobId),
      title: cleanString(safeJob.title),
      role: cleanString(safeRaw.role) || cleanString(safeJob.title),
      rawTitle: cleanString(safeRaw.rawTitle) || cleanString(safeJob.title),
      company: cleanString(safeJob.company),
      location: cleanString(safeJob.location),
      jobUrl: cleanString(safeJob.url),
      url: cleanString(safeJob.url),
      hostname: cleanString(safeJob.hostname || safeRaw.hostname),
      pathname: cleanString(safeJob.pathname || safeRaw.pathname),
      pageTitle: cleanString(safeJob.pageTitle || safeRaw.pageTitle || safeRaw.title),
      descriptionText: cleanString(safeRaw.descriptionText || safeRaw.description || safeRaw.rawText) || cleanString(safeJob.descriptionText),
      pageText: cleanString(safeJob.pageText || safeRaw.pageText),
      htmlSnapshot: cleanString(safeJob.htmlSnapshot || safeRaw.htmlSnapshot),
      extractedAt: cleanString(safeJob.extractedAt || safeRaw.extractedAt),
      description: cleanString(safeRaw.description || safeRaw.rawText) || cleanString(safeJob.descriptionText),
      rawText: cleanString(safeRaw.rawText || safeRaw.description) || cleanString(safeJob.descriptionText)
    };
  }

  async function getStoredJobForActiveTab(activeTab) {
    if (!storage || typeof storage.getJobData !== "function") {
      return null;
    }

    const cachedJob = await storage.getJobData();
    if (!cachedJob || typeof cachedJob !== "object") {
      return null;
    }

    const tabUrl = cleanString(activeTab && activeTab.url);
    const jobUrl = cleanString(cachedJob.url || cachedJob.jobUrl);
    if (tabUrl && jobUrl && urlsMatch(tabUrl, jobUrl)) {
      return cachedJob;
    }

    return null;
  }

  async function loadRuntimeSettings() {
    const canonical = dataBoundary && typeof dataBoundary.getAppData === "function"
      ? await dataBoundary.getAppData()
      : null;
    const storageSettings = storage && typeof storage.getSettings === "function" ? await storage.getSettings() : {};

    return {
      ...(canonical && canonical.settings && typeof canonical.settings === "object" ? canonical.settings : {}),
      ...(storageSettings && typeof storageSettings === "object" ? storageSettings : {})
    };
  }

  async function detectCurrentJobContext() {
    let activeTab = null;
    try {
      activeTab = await queryActiveTab();
    } catch {
      activeTab = null;
    }

    const settings = await loadRuntimeSettings();
    let extractedJob = null;
    let extractedPayload = null;
    let extractionError = "";
    try {
      extractedPayload = await extractCurrentPagePayload();
      extractedJob = extractedPayload && extractedPayload.jobPosting ? extractedPayload.jobPosting : null;
    } catch (error) {
      extractionError = error instanceof Error ? error.message : String(error);
    }

    let aiExtractionUnavailable = false;
    let aiFailure = false;
    let aiError = "";
    let aiExplicitNoJob = false;
    let rawJob = null;

    const hasValidSettings = isApiSettingsComplete(settings);
    const hasAiExtractor = Boolean(api && typeof api.extractCurrentJobWithAi === "function");
    const shouldUseAiExtraction = hasValidSettings && hasAiExtractor;

    const pageSnapshot = extractedPayload && extractedPayload.pageSnapshot && typeof extractedPayload.pageSnapshot === "object"
      ? extractedPayload.pageSnapshot
      : null;
    const hasPageContent = Boolean(
      pageSnapshot && cleanString(pageSnapshot.pageText || pageSnapshot.text || "").length > 50
    );

    if (!hasValidSettings || !hasAiExtractor) {
      aiExtractionUnavailable = true;
      aiFailure = true;
      aiError = "INVALID_API_SETTINGS";
    } else if (shouldUseAiExtraction && pageSnapshot) {
      try {
        const aiResult = await api.extractCurrentJobWithAi({
          settings: settings,
          pageSnapshot: pageSnapshot,
          jobPosting: extractedPayload.jobPosting || {},
          url: cleanString(activeTab && activeTab.url)
        });

        if (aiResult && aiResult.ok === true) {
          const aiData = aiResult.data && typeof aiResult.data === "object" ? aiResult.data : {};
          if (aiData.isJobPosting === true) {
            rawJob = normalizeAiJobResult(aiData, activeTab, extractedPayload);
          } else {
            aiExplicitNoJob = true;
          }
        } else {
          aiFailure = true;
          aiError = cleanString(aiResult && aiResult.code) || "AI extraction failed.";
        }
      } catch (error) {
        aiFailure = true;
        aiError = error instanceof Error ? error.message : String(error);
      }
    } else {
      aiFailure = true;
      aiError = cleanString(extractionError) || "AI extraction failed.";
    }
    const normalizedJob = rawJob ? normalizeDetectedJob(rawJob, activeTab) : null;

    return {
      activeTab: activeTab,
      rawJob: rawJob,
      normalizedJob: normalizedJob,
      hasPageContent: hasPageContent,
      extractionError: cleanString(extractionError),
      aiExtractionUnavailable: aiExtractionUnavailable,
      aiFailure: aiFailure,
      aiError: cleanString(aiError),
      aiExplicitNoJob: aiExplicitNoJob
    };
  }

  function updateCurrentJobState(normalizedJob, rawJob) {
    state.currentJob = normalizedJob && typeof normalizedJob === "object" ? normalizedJob : null;
    state.currentJobRaw = rawJob && typeof rawJob === "object" ? rawJob : null;
  }

  async function refreshRuntimeModel() {
    try {
      const settings = await loadRuntimeSettings();

      const provider = cleanString(settings.provider) || "minimax";
      const model = cleanString(settings.model) || "-";
      if (runtimeModelEl) {
        runtimeModelEl.textContent = "Model: " + provider + " / " + model;
      }
    } catch {
      if (runtimeModelEl) {
        runtimeModelEl.textContent = "Model: -";
      }
    }
  }

  async function syncCurrentJobFromPage(options) {
    const config = options && typeof options === "object" ? options : {};
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 500;

    let lastResult = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (config.showExtractStatus !== false) {
        setStatus("Extracting current job with AI... Attempt " + attempt + " of " + MAX_ATTEMPTS);
      }

      const result = await detectCurrentJobContext();
      lastResult = result;

      // Success — stop
      if (result.normalizedJob && isCurrentJobValid(result.normalizedJob)) {
        break;
      }

      // API / settings unavailable — not retryable, show settings warning
      if (result.aiExtractionUnavailable) {
        break;
      }

      // AI gave a valid decisive "not a job page" response with usable content — not retryable
      if (result.aiExplicitNoJob && result.hasPageContent) {
        break;
      }

      // Still have attempts left — wait and retry
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    const result = lastResult;
    const normalizedJob = result.normalizedJob;
    const aiUnavailable = result.aiExtractionUnavailable === true;
    const aiNoJob = result.aiExplicitNoJob === true;

    if (aiUnavailable) {
      if (!state.isStartApplyRunning) {
        updateCurrentJobState(null, null);
        setAiFailureSummaryState();
      }
      setStatus("Unable to detect job with AI.");
      return { ok: false, job: null, rawJob: null };
    }

    if (aiNoJob || !isCurrentJobValid(normalizedJob)) {
      if (!state.isStartApplyRunning) {
        updateCurrentJobState(null, null);
        setNoJobSummaryState();
      }
      setStatus("No job or application form detected on this page.");
      return { ok: false, job: null, rawJob: null };
    }

    updateCurrentJobState(normalizedJob, result.rawJob || buildCachedJobPayload(normalizedJob, null));
    setDetectedJobSummaryState(normalizedJob, cleanString(config.metaText) || "Detected on this page");

    if (storage && typeof storage.setJobData === "function") {
      await storage.setJobData(buildCachedJobPayload(normalizedJob, result.rawJob));
    }

    setStatus(cleanString(config.successStatus) || "Ready");
    return { ok: true, job: normalizedJob, rawJob: result.rawJob || buildCachedJobPayload(normalizedJob, null) };
  }

  function defaultCanonicalData() {
    return {
      activeResumeLanguage: "en",
      resumes: {},
      profile: {},
      resume: {},
      jobs: [],
      applications: [],
      autofillAnswers: [],
      settings: {}
    };
  }

  async function getCanonicalData() {
    if (dataBoundary && typeof dataBoundary.getAppData === "function") {
      return await dataBoundary.getAppData();
    }
    return defaultCanonicalData();
  }

  function buildGuardSettings(canonicalData, storageSettings) {
    return {
      ...(canonicalData && canonicalData.settings && typeof canonicalData.settings === "object" ? canonicalData.settings : {}),
      ...(storageSettings && typeof storageSettings === "object" ? storageSettings : {})
    };
  }

  function showGuardNotice(missingFields) {
    if (!guardNoticeEl || !guardNoticeListEl) return;
    guardNoticeListEl.innerHTML = "";
    const fields = Array.isArray(missingFields) ? missingFields : [];
    fields.forEach(function (field) {
      const li = document.createElement("li");
      li.textContent = cleanString(field);
      guardNoticeListEl.appendChild(li);
    });
    guardNoticeEl.classList.remove("hidden");
  }

  function hideGuardNotice() {
    if (!guardNoticeEl) return;
    guardNoticeEl.classList.add("hidden");
    if (guardNoticeListEl) guardNoticeListEl.innerHTML = "";
  }

  function showGenerateGuardFailure(guardResult) {
    const safe = guardResult && typeof guardResult === "object" ? guardResult : {};
    const mainMessage = cleanString(safe.mainMessage);
    const supportingMessage = cleanString(safe.supportingMessage);
    const code = cleanString(safe.code);

    if (mainMessage) {
      setStatus(mainMessage);
    }

    if (code === "INCOMPLETE_PROFILE_RESUME") {
      const missingFields = Array.isArray(safe.missingFields) ? safe.missingFields.filter((item) => cleanString(item)) : [];
      showGuardNotice(missingFields);
      return;
    }

    if (supportingMessage) {
      setStatus(mainMessage + " — " + supportingMessage);
    }
  }

  function normalizeGenerateResult(result) {
    const safe = result && typeof result === "object" ? result : {};
    const payload = safe.data && typeof safe.data === "object" ? safe.data : safe;
    return {
      company: cleanString(payload.company),
      role: cleanString(payload.role),
      jobUrl: cleanString(payload.jobUrl),
      jsonPath: cleanString(payload.jsonPath || safe.jsonPath),
      htmlPath: cleanString(payload.htmlPath || safe.htmlPath),
      pdfPath: cleanString(payload.pdfPath || safe.pdfPath)
    };
  }

  function inferMimeTypeFromFileName(fileName) {
    const safeName = cleanString(fileName).toLowerCase();
    if (safeName.endsWith(".pdf")) return "application/pdf";
    if (safeName.endsWith(".html") || safeName.endsWith(".htm")) return "text/html";
    if (safeName.endsWith(".json")) return "application/json";
    return "application/octet-stream";
  }

  function fileNameFromStoragePath(storagePath) {
    const safePath = cleanString(storagePath);
    if (!safePath) return "";
    const parts = safePath.split("/");
    return cleanString(parts[parts.length - 1]);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return globalThis.btoa(binary);
  }

  function textToBase64(value) {
    const text = String(value || "");
    const encoder = new TextEncoder();
    return bytesToBase64(encoder.encode(text));
  }

  function getLocalStorageValue(key) {
    return new Promise((resolve, reject) => {
      if (!chrome.storage || !chrome.storage.local) {
        resolve(null);
        return;
      }

      chrome.storage.local.get([key], (payload) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(payload && Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : null);
      });
    });
  }

  function getLocalStorageValues(keys) {
    return new Promise((resolve, reject) => {
      if (!chrome.storage || !chrome.storage.local) {
        resolve({});
        return;
      }

      const keyList = Array.isArray(keys) ? keys : [keys];
      chrome.storage.local.get(keyList, (payload) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(payload && typeof payload === "object" ? payload : {});
      });
    });
  }

  function setLocalStorageValues(payload) {
    return new Promise((resolve, reject) => {
      if (!chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }

      const safePayload = payload && typeof payload === "object" ? payload : {};
      chrome.storage.local.set(safePayload, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async function getPendingApplyState() {
    const payload = await getLocalStorageValues([PENDING_APPLY_STORAGE_KEY]);
    const raw = payload && payload[PENDING_APPLY_STORAGE_KEY] && typeof payload[PENDING_APPLY_STORAGE_KEY] === "object"
      ? payload[PENDING_APPLY_STORAGE_KEY]
      : null;
    if (!raw) {
      return null;
    }
    return {
      jobId: cleanString(raw.jobId),
      resumeDraftId: cleanString(raw.resumeDraftId),
      jobUrl: cleanString(raw.jobUrl),
      createdAt: cleanString(raw.createdAt),
      status: cleanString(raw.status)
    };
  }

  async function setPendingApplyState(input) {
    const safe = input && typeof input === "object" ? input : {};
    const normalized = {
      jobId: cleanString(safe.jobId),
      resumeDraftId: cleanString(safe.resumeDraftId),
      jobUrl: cleanString(safe.jobUrl),
      createdAt: cleanString(safe.createdAt) || new Date().toISOString(),
      status: cleanString(safe.status) || "waiting_for_user_to_open_application_form"
    };
    await setLocalStorageValues({ [PENDING_APPLY_STORAGE_KEY]: normalized });
    return normalized;
  }

  function normalizeAutoFillRuntimeState(input) {
    const raw = input && typeof input === "object" ? input : {};
    const rawByTab = raw.autoFillCompletedForTab && typeof raw.autoFillCompletedForTab === "object"
      ? raw.autoFillCompletedForTab
      : {};
    const normalizedByTab = {};
    Object.keys(rawByTab).forEach(function normalizeTab(tabKey) {
      const safeKey = cleanString(tabKey);
      if (!safeKey) {
        return;
      }
      const entry = rawByTab[tabKey] && typeof rawByTab[tabKey] === "object" ? rawByTab[tabKey] : {};
      normalizedByTab[safeKey] = {
        url: cleanString(entry.url),
        completedAt: cleanString(entry.completedAt)
      };
    });
    return {
      lastAutoFilledUrl: cleanString(raw.lastAutoFilledUrl),
      lastAutoFilledAt: cleanString(raw.lastAutoFilledAt),
      autoFillCompletedForTab: normalizedByTab
    };
  }

  async function getAutoFillRuntimeState() {
    const payload = await getLocalStorageValues([AUTOFILL_RUNTIME_STATE_STORAGE_KEY]);
    return normalizeAutoFillRuntimeState(payload[AUTOFILL_RUNTIME_STATE_STORAGE_KEY]);
  }

  async function setAutoFillRuntimeState(input) {
    const normalized = normalizeAutoFillRuntimeState(input);
    await setLocalStorageValues({ [AUTOFILL_RUNTIME_STATE_STORAGE_KEY]: normalized });
    return normalized;
  }

  function isAutoFillAlreadyCompletedForPage(runtimeState, activeTab) {
    const safeState = normalizeAutoFillRuntimeState(runtimeState);
    const safeTab = activeTab && typeof activeTab === "object" ? activeTab : {};
    const tabId = Number(safeTab.id);
    const tabIdKey = Number.isInteger(tabId) && tabId >= 0 ? String(tabId) : "";
    const tabUrl = cleanString(safeTab.url);
    if (!tabUrl) {
      return false;
    }

    if (tabIdKey && safeState.autoFillCompletedForTab[tabIdKey] && urlsMatch(safeState.autoFillCompletedForTab[tabIdKey].url, tabUrl)) {
      return true;
    }
    if (safeState.lastAutoFilledUrl && urlsMatch(safeState.lastAutoFilledUrl, tabUrl)) {
      return true;
    }
    return false;
  }

  async function markAutoFillCompletedForPage(activeTab) {
    const safeTab = activeTab && typeof activeTab === "object" ? activeTab : {};
    const tabUrl = cleanString(safeTab.url);
    const tabId = Number(safeTab.id);
    const tabIdKey = Number.isInteger(tabId) && tabId >= 0 ? String(tabId) : "";
    if (!tabUrl || !tabIdKey) {
      return null;
    }

    const currentState = await getAutoFillRuntimeState();
    const nowIso = new Date().toISOString();
    const byTab = {
      ...currentState.autoFillCompletedForTab,
      [tabIdKey]: {
        url: tabUrl,
        completedAt: nowIso
      }
    };

    const tabKeys = Object.keys(byTab);
    if (tabKeys.length > 50) {
      tabKeys
        .sort(function sortByOldest(left, right) {
          const leftTime = new Date(cleanString(byTab[left] && byTab[left].completedAt) || 0).getTime() || 0;
          const rightTime = new Date(cleanString(byTab[right] && byTab[right].completedAt) || 0).getTime() || 0;
          return leftTime - rightTime;
        })
        .slice(0, tabKeys.length - 50)
        .forEach(function removeOverflow(key) {
          delete byTab[key];
        });
    }

    return await setAutoFillRuntimeState({
      lastAutoFilledUrl: tabUrl,
      lastAutoFilledAt: nowIso,
      autoFillCompletedForTab: byTab
    });
  }

  async function saveGeneratedResumeInternally(input) {
    const safe = input && typeof input === "object" ? input : {};
    const currentJob = safe.currentJob && typeof safe.currentJob === "object" ? safe.currentJob : {};
    const jobData = safe.jobData && typeof safe.jobData === "object" ? safe.jobData : {};
    const generated = safe.generated && typeof safe.generated === "object" ? safe.generated : {};
    const createdAt = cleanString(safe.createdAt) || new Date().toISOString();
    const updatedAt = createdAt;

    const preferredPath = cleanString(generated.pdfPath || generated.htmlPath || generated.jsonPath);
    let storageRecord = null;
    if (preferredPath) {
      try {
        const stored = await getLocalStorageValue(preferredPath);
        storageRecord = stored && typeof stored === "object" ? stored : null;
      } catch {
        storageRecord = null;
      }
    }

    let fileName = cleanString(storageRecord && storageRecord.filename) || fileNameFromStoragePath(preferredPath) || "tailored_resume.pdf";
    let mimeType = cleanString(storageRecord && storageRecord.mimeType) || inferMimeTypeFromFileName(fileName);
    let storageRef = cleanString(storageRecord && storageRecord.storageKey) || preferredPath;
    let resumeDraftId = "resume-draft-" + String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
    let registryDataBase64 = "";

    if (storageRecord && Object.prototype.hasOwnProperty.call(storageRecord, "content")) {
      if (mimeType === "application/pdf") {
        registryDataBase64 = cleanString(storageRecord.content);
      } else {
        registryDataBase64 = textToBase64(storageRecord.content);
      }
    }

    if (
      resumeRegistryStore &&
      typeof resumeRegistryStore.saveCompiledResumeRecord === "function" &&
      fileName &&
      mimeType &&
      registryDataBase64
    ) {
      const savedRecord = await resumeRegistryStore.saveCompiledResumeRecord({
        jobId: cleanString(currentJob.jobId || jobData.jobId),
        company: cleanString(jobData.company || currentJob.company),
        role: cleanString(jobData.role || jobData.rawTitle || currentJob.title),
        fileName: fileName,
        mimeType: mimeType,
        storageKey: storageRef,
        dataBase64: registryDataBase64,
        createdAt: createdAt
      });

      resumeDraftId = cleanString(savedRecord && savedRecord.resumeId) || resumeDraftId;
      fileName = cleanString(savedRecord && savedRecord.fileName) || fileName;
      mimeType = cleanString(savedRecord && savedRecord.mimeType) || mimeType;
      storageRef = cleanString(savedRecord && savedRecord.storageKey) || storageRef;
    }

    const draftRecord = {
      id: resumeDraftId,
      resumeDraftId: resumeDraftId,
      jobId: cleanString(currentJob.jobId || jobData.jobId),
      company: cleanString(jobData.company || currentJob.company),
      role: cleanString(jobData.role || jobData.rawTitle || currentJob.title),
      jobUrl: cleanString(jobData.jobUrl || jobData.url || currentJob.url),
      fileName: fileName,
      mimeType: mimeType,
      storageRef: storageRef,
      createdAt: createdAt,
      updatedAt: updatedAt,
      exportedFiles: {
        json: cleanString(generated.jsonPath),
        html: cleanString(generated.htmlPath),
        pdf: cleanString(generated.pdfPath)
      }
    };

    if (appDataStore && typeof appDataStore.appendGeneratedResume === "function") {
      await appDataStore.appendGeneratedResume(draftRecord);
    }

    return draftRecord;
  }

  function buildGenerateRequestJobData(normalizedJob, rawJob) {
    const safeJob = normalizedJob && typeof normalizedJob === "object" ? normalizedJob : {};
    const safeRaw = rawJob && typeof rawJob === "object" ? rawJob : {};
    const descriptionText = cleanString(safeRaw.descriptionText || safeRaw.description || safeRaw.rawText) || cleanString(safeJob.descriptionText);
    const jobUrl = cleanString(safeRaw.jobUrl || safeRaw.url) || cleanString(safeJob.url);

    return {
      ...safeRaw,
      title: cleanString(safeRaw.title || safeRaw.role || safeRaw.rawTitle) || cleanString(safeJob.title),
      role: cleanString(safeRaw.role || safeRaw.rawTitle) || cleanString(safeJob.title),
      rawTitle: cleanString(safeRaw.rawTitle || safeRaw.role) || cleanString(safeJob.title),
      company: cleanString(safeRaw.company) || cleanString(safeJob.company),
      location: cleanString(safeRaw.location || safeRaw.jobLocation) || cleanString(safeJob.location),
      jobUrl: jobUrl,
      url: jobUrl,
      descriptionText: descriptionText,
      description: cleanString(safeRaw.description || safeRaw.rawText) || descriptionText,
      rawText: cleanString(safeRaw.rawText || safeRaw.description) || descriptionText,
      extractedAt: cleanString(safeRaw.extractedAt || safeRaw.updatedAt || safeRaw.createdAt) || cleanString(safeJob.extractedAt)
    };
  }

  function toApplicationRecordFromAutofill(resultData, contextInput) {
    const safe = resultData && typeof resultData === "object" ? resultData : {};
    const context = contextInput && typeof contextInput === "object" ? contextInput : {};
    const contextJob = context.currentJob && typeof context.currentJob === "object" ? context.currentJob : {};
    const candidate = safe.pendingApplicationRecord && typeof safe.pendingApplicationRecord === "object"
      ? safe.pendingApplicationRecord
      : safe.applicationRecord && typeof safe.applicationRecord === "object"
        ? safe.applicationRecord
        : null;

    if (!candidate) {
      return null;
    }

    return {
      id: cleanString(candidate.applicationId),
      company: cleanString(candidate.company) || cleanString(contextJob.company),
      role: cleanString(candidate.role || candidate.jobTitle) || cleanString(contextJob.title),
      status: cleanString(candidate.status) || "Saved",
      jobUrl: cleanString(candidate.jobUrl) || cleanString(contextJob.url),
      appliedAt: cleanString(candidate.appliedAt || candidate.createdAt) || new Date().toISOString(),
      resumeId: cleanString(candidate.resumeId || candidate.resumeVersion || candidate.resumeVersionId) || cleanString(context.resumeDraftId),
      notes: cleanString(candidate.notes)
    };
  }

  async function handleGenerate() {
    if (!api || typeof api.generateResume !== "function") {
      setStatus("Generate API is unavailable.");
      return;
    }
    if (!appDataStore || typeof appDataStore.getAppData !== "function") {
      setStatus("App data storage is unavailable.");
      return;
    }

    setBusy(true);

    try {
      const detection = await syncCurrentJobFromPage({ showExtractStatus: true });
      const currentJob = detection.job;

      const canonicalData = await getCanonicalData();
      const storageSettings = storage && typeof storage.getSettings === "function" ? await storage.getSettings() : {};
      const settings = buildGuardSettings(canonicalData, storageSettings);

      const guardResult = dataBoundary && typeof dataBoundary.evaluateGenerateResumeGuard === "function"
        ? dataBoundary.evaluateGenerateResumeGuard({
            currentJob: currentJob,
            appData: canonicalData,
            settings: settings
          })
        : { ok: true };

      if (!guardResult || guardResult.ok !== true) {
        showGenerateGuardFailure(guardResult);
        return;
      }

      const appData = await appDataStore.getAppData();
      const jobData = buildGenerateRequestJobData(currentJob, detection.rawJob || state.currentJobRaw);
      const request = messaging && typeof messaging.buildGenerateResumeRequest === "function"
        ? messaging.buildGenerateResumeRequest(jobData, settings, {
            profile: appData.profile,
            masterResume: appData.masterResume
          })
        : {
            jobData: jobData,
            settings: settings,
            profile: appData.profile,
            masterResume: appData.masterResume
          };

      setStatus("Generating tailored resume...");
      const response = await api.generateResume(request);
      if (!response || response.ok !== true) {
        setStatus(cleanString(response && (response.error || response.message)) || "Resume generation failed.");
        return;
      }

      const generated = normalizeGenerateResult(response);
      await appDataStore.appendGeneratedResume({
        company: cleanString(jobData.company) || generated.company,
        role: cleanString(jobData.role || jobData.rawTitle) || generated.role,
        jobUrl: cleanString(jobData.jobUrl || jobData.url) || generated.jobUrl,
        createdAt: new Date().toISOString(),
        exportedFiles: {
          json: generated.jsonPath,
          html: generated.htmlPath,
          pdf: generated.pdfPath
        }
      });

      setDetectedJobSummaryState(currentJob, "Generated from current job");
      setStatus("Tailored resume generated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAutofill(options) {
    const config = options && typeof options === "object" ? options : {};
    const trigger = cleanString(config.trigger).toLowerCase() === "auto" ? "auto" : "manual";

    if (!shared || !shared.MESSAGE_TYPES) {
      setStatus("Shared message constants unavailable.");
      return { ok: false, reason: "shared_unavailable" };
    }

    setBusy(true);

    try {
      const activeTab = config.activeTab && typeof config.activeTab === "object"
        ? config.activeTab
        : await queryActiveTab();
      if (!activeTab || typeof activeTab.id !== "number") {
        setStatus("No active tab found.");
        return { ok: false, reason: "no_active_tab" };
      }

      state.activeTabId = activeTab.id;
      state.activeTabUrl = cleanString(activeTab.url);

      if (trigger === "auto") {
        const autoFillRuntimeState = await getAutoFillRuntimeState();
        const alreadyCompleted = isAutoFillAlreadyCompletedForPage(autoFillRuntimeState, activeTab);
        if (alreadyCompleted) {
          setApplicationFormSummaryState("AutoFill already completed for this page");
          setStatus("AutoFill already completed for this page.\n\nPlease review all information carefully before submitting your application.");
          return { ok: true, skipped: true, reason: "already_completed_for_page" };
        }
      }

      if (trigger === "auto") {
        setApplicationFormSummaryState("AutoFilling application form...");
        setStatus("Application form detected.\n\nAutoFilling application form...");
      } else {
        setStatus("Running autofill...");
      }

      const pendingApplyState = await getPendingApplyState();
      const response = await sendMessageToTab(activeTab.id, { type: shared.MESSAGE_TYPES.PREPARE_APPLICATION });
      if (!response || response.ok !== true) {
        if (trigger === "auto") {
          setApplicationFormSummaryState("AutoFill incomplete");
        }
        setStatus(
          trigger === "auto"
            ? "AutoFill could not complete.\n\nPlease review the page and fill any missing fields manually."
            : cleanString(response && response.error) || "Autofill failed."
        );
        return { ok: false, reason: cleanString(response && response.error) || "autofill_failed" };
      }

      const resultData = response.data && typeof response.data === "object" ? response.data : {};
      if (appDataStore && typeof appDataStore.upsertApplication === "function") {
        const appRecord = toApplicationRecordFromAutofill(resultData, {
          currentJob: state.currentJob,
          resumeDraftId: cleanString(pendingApplyState && pendingApplyState.resumeDraftId)
        });
        if (appRecord) {
          await appDataStore.upsertApplication(appRecord);
        }
      }

      const filledCount = Number(resultData.filledFieldCount || 0) + Number(resultData.selectFilledCount || 0) + Number(resultData.checkboxFilledCount || 0);

      if (trigger === "auto") {
        await markAutoFillCompletedForPage(activeTab);

        const pendingApply = pendingApplyState;
        if (pendingApply && pendingApply.status === "waiting_for_user_to_open_application_form") {
          await setPendingApplyState({
            ...pendingApply,
            status: "autofill_completed_review_before_submit"
          });
        }

        setApplicationFormSummaryState("AutoFill completed");
        setStatus("AutoFill completed.\n\nPlease review all information carefully before submitting your application.");
      } else {
        setStatus("Autofill completed. Filled=" + String(filledCount));
      }

      return { ok: true, filledCount: filledCount };
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    } finally {
      setBusy(false);
    }
  }

  function getTabById(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime && chrome.runtime.lastError) { resolve(null); return; }
        resolve(tab || null);
      });
    });
  }

  const APPLY_FORBIDDEN_TEXT_RE = /\b(submit application|send application|final submit|complete application|submit|finish)\b/i;
  const APPLY_ALLOWED_TEXT_RE = /\b(apply|start.{0,30}application|begin.{0,30}application|continue.{0,30}application)\b/i;
  const UNSAFE_HREF_RE = /^(javascript:|mailto:|tel:)/i;

  function isSafeApplyCandidate(text, href) {
    const safeText = cleanString(text);
    const safeHref = cleanString(href);
    if (APPLY_FORBIDDEN_TEXT_RE.test(safeText)) {
      return { safe: false, reason: "forbidden_text" };
    }
    if (!APPLY_ALLOWED_TEXT_RE.test(safeText)) {
      return { safe: false, reason: "no_allowed_text" };
    }
    if (safeHref && UNSAFE_HREF_RE.test(safeHref)) {
      return { safe: false, reason: "unsafe_href" };
    }
    return { safe: true, reason: "ok" };
  }

  function detectApplicationSignalFromContext(ctx, originalUrl, baselineCtx) {
    const context = ctx && typeof ctx === "object" ? ctx : {};
    const baseline = baselineCtx && typeof baselineCtx === "object" ? baselineCtx : {};
    const urlAfter = cleanString(context.url);
    const labels = Array.isArray(context.matchedLabels) ? context.matchedLabels : [];
    const baselineLabels = Array.isArray(baseline.matchedLabels) ? baseline.matchedLabels : [];
    const fillableCount = Number(context.fillableFieldCount) || 0;
    const baselineFillableCount = Number(baseline.fillableFieldCount) || 0;
    const hasBaseline =
      Object.prototype.hasOwnProperty.call(baseline, "hasModal") ||
      Object.prototype.hasOwnProperty.call(baseline, "hasIframe") ||
      Object.prototype.hasOwnProperty.call(baseline, "fillableFieldCount") ||
      baselineLabels.length > 0;
    const newLabelAppeared = labels.some(function hasNewLabel(label) {
      const normalized = cleanString(label).toLowerCase();
      if (!normalized) { return false; }
      return !baselineLabels.some(function matchBaseline(baseLabel) {
        return cleanString(baseLabel).toLowerCase() === normalized;
      });
    });

    if (urlAfter && originalUrl && urlAfter !== originalUrl) {
      return { opened: true, reason: "url_changed" };
    }
    if (context.hasModal && (!hasBaseline || !baseline.hasModal)) {
      return { opened: true, reason: "modal_visible" };
    }
    if (context.hasIframe && (!hasBaseline || !baseline.hasIframe)) {
      return { opened: true, reason: "iframe_visible" };
    }
    if (fillableCount >= 3 && (!hasBaseline || fillableCount > baselineFillableCount)) {
      return { opened: true, reason: "form_fields_present" };
    }
    if ((labels.length > 0 && !hasBaseline) || newLabelAppeared) {
      return { opened: true, reason: "application_labels_present" };
    }
    return { opened: false, reason: "not_detected" };
  }

  function evaluateApplicationFormContext(contextInput) {
    const context = contextInput && typeof contextInput === "object" ? contextInput : {};
    const fillableFieldCount = Number(context.fillableFieldCount) || 0;
    const formElementCount = Number(context.formElementCount) || 0;
    const fileInputCount = Number(context.fileInputCount) || 0;
    const radioGroupCount = Number(context.radioGroupCount) || 0;
    const checkboxGroupCount = Number(context.checkboxGroupCount) || 0;
    const matchedKeywords = Array.isArray(context.matchedKeywords)
      ? context.matchedKeywords
      : Array.isArray(context.matchedLabels)
        ? context.matchedLabels
        : [];
    const hasModal = Boolean(context.hasModal);
    const hasIframe = Boolean(context.hasIframe);
    const hasApplicationKeyword = matchedKeywords.length > 0;
    const hasMeaningfulFields = fillableFieldCount >= 3 || (fillableFieldCount >= 2 && (fileInputCount > 0 || radioGroupCount > 0 || checkboxGroupCount > 0));
    const hasApplicationStructure = formElementCount > 0 || radioGroupCount > 0 || checkboxGroupCount > 0;

    if (hasModal && (hasMeaningfulFields || hasApplicationKeyword || hasApplicationStructure)) {
      return { opened: true, reason: "dialog_with_application_form" };
    }
    if (hasIframe && (hasMeaningfulFields || hasApplicationKeyword)) {
      return { opened: true, reason: "application_iframe" };
    }
    if (hasMeaningfulFields && (hasApplicationKeyword || hasApplicationStructure || fileInputCount > 0)) {
      return { opened: true, reason: "application_fields_and_labels" };
    }
    if (hasApplicationKeyword && fillableFieldCount >= 2) {
      return { opened: true, reason: "application_keywords_with_fields" };
    }
    if (fileInputCount > 0 && (fillableFieldCount >= 1 || hasApplicationKeyword)) {
      return { opened: true, reason: "resume_upload_section_detected" };
    }
    return { opened: false, reason: "not_detected" };
  }

  async function detectApplicationFormOnTab(tabId) {
    if (!shared || !shared.MESSAGE_TYPES || typeof tabId !== "number") {
      return { opened: false, reason: "unavailable", data: null };
    }

    let detectData = null;
    try {
      const detectResp = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.DETECT_APPLICATION_FORM });
      if (detectResp && detectResp.ok && detectResp.data && typeof detectResp.data === "object") {
        detectData = detectResp.data;
      }
    } catch {
      detectData = null;
    }

    if (detectData && detectData.opened === true) {
      return {
        opened: true,
        reason: cleanString(detectData.reason) || "application_form_detected",
        data: detectData
      };
    }

    let contextData = null;
    if (shared.MESSAGE_TYPES.GET_PAGE_CONTEXT) {
      try {
        const contextResp = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.GET_PAGE_CONTEXT });
        if (contextResp && contextResp.ok && contextResp.data && typeof contextResp.data === "object") {
          contextData = contextResp.data;
        }
      } catch {
        contextData = null;
      }
    }

    const mergedContext = {
      ...(contextData && typeof contextData === "object" ? contextData : {}),
      ...(detectData && typeof detectData === "object" ? detectData : {})
    };
    const evaluated = evaluateApplicationFormContext(mergedContext);
    return {
      opened: evaluated.opened,
      reason: evaluated.reason,
      data: mergedContext
    };
  }

  async function pollForApplicationPageOpen(tabId, originalUrl, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let detectedNewTabId = null;

    function onTabCreated(tab) {
      if (!detectedNewTabId && tab && typeof tab.id === "number") {
        detectedNewTabId = tab.id;
      }
    }

    if (chrome.tabs && chrome.tabs.onCreated) {
      chrome.tabs.onCreated.addListener(onTabCreated);
    }

    let resultTabId = tabId;
    let opened = false;
    let reason = "timeout";
    let baselineContext = null;

    if (shared && shared.MESSAGE_TYPES && shared.MESSAGE_TYPES.GET_PAGE_CONTEXT) {
      try {
        const baselineResp = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.GET_PAGE_CONTEXT });
        if (baselineResp && baselineResp.ok && baselineResp.data) {
          baselineContext = baselineResp.data;
        }
      } catch {
        baselineContext = null;
      }
    }

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 600));

      const current = await getTabById(tabId);
      if (current && current.url && current.url !== originalUrl && current.status === "complete") {
        opened = true;
        resultTabId = tabId;
        reason = "url_changed";
        break;
      }

      if (detectedNewTabId) {
        const newTab = await getTabById(detectedNewTabId);
        if (newTab && newTab.status === "complete") {
          opened = true;
          resultTabId = detectedNewTabId;
          reason = "new_tab";
          break;
        }
      }

      if (shared && shared.MESSAGE_TYPES && shared.MESSAGE_TYPES.DETECT_APPLICATION_FORM) {
        try {
          const formResp = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.DETECT_APPLICATION_FORM });
          if (formResp && formResp.ok && formResp.data && formResp.data.opened) {
            opened = true;
            resultTabId = tabId;
            reason = cleanString(formResp.data.reason) || "form_detected";
            break;
          }
        } catch {
          // Content script may not be ready yet; keep polling.
        }
      }

      if (shared && shared.MESSAGE_TYPES && shared.MESSAGE_TYPES.GET_PAGE_CONTEXT) {
        try {
          const contextResp = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.GET_PAGE_CONTEXT });
          if (contextResp && contextResp.ok && contextResp.data) {
            const signal = detectApplicationSignalFromContext(contextResp.data, originalUrl, baselineContext);
            if (signal.opened) {
              opened = true;
              resultTabId = tabId;
              reason = signal.reason;
              break;
            }
          }
        } catch {
          // Content script may not be ready yet; keep polling.
        }
      }
    }

    if (chrome.tabs && chrome.tabs.onCreated) {
      chrome.tabs.onCreated.removeListener(onTabCreated);
    }

    return { tabId: detectedNewTabId || resultTabId, opened: opened, reason: reason };
  }

  function debuggerAttach(debugTarget, protocolVersion) {
    return new Promise((resolve, reject) => {
      if (!chrome.debugger || typeof chrome.debugger.attach !== "function") {
        reject(new Error("chrome.debugger unavailable"));
        return;
      }
      chrome.debugger.attach(debugTarget, protocolVersion, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function debuggerDetach(debugTarget) {
    return new Promise((resolve) => {
      if (!chrome.debugger || typeof chrome.debugger.detach !== "function") {
        resolve();
        return;
      }
      chrome.debugger.detach(debugTarget, () => {
        resolve();
      });
    });
  }

  function debuggerSendCommand(debugTarget, method, params) {
    return new Promise((resolve, reject) => {
      if (!chrome.debugger || typeof chrome.debugger.sendCommand !== "function") {
        reject(new Error("chrome.debugger.sendCommand unavailable"));
        return;
      }
      chrome.debugger.sendCommand(debugTarget, method, params || {}, (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  async function attemptCdpMouseClick(tabId, x, y) {
    const target = { tabId: tabId };
    let attached = false;
    try {
      await debuggerAttach(target, "1.3");
      attached = true;
      await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: x, y: y, button: "none", buttons: 0 });
      await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: y, button: "left", buttons: 1, clickCount: 1 });
      await debuggerSendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: y, button: "left", buttons: 0, clickCount: 1 });
    } finally {
      if (attached) {
        await debuggerDetach(target);
      }
    }
  }

  // ── Apply Button Tester ───────────────────────────────────────────────

  const testerState = {
    scanData: null,
    activeTabId: null,
    activeTabUrl: null,
    busy: false,
    lastDebugJson: null
  };

  function testerEsc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function testerCopyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text);
    }
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(el);
    return Promise.resolve();
  }

  async function testerPollWithEvidence(tabId, originalUrl, fillableCountBefore, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let detectedNewTabId = null;
    let opened = false;
    let reason = "timeout";
    let finalTabId = tabId;
    let baselineContext = {
      url: originalUrl,
      fillableFieldCount: fillableCountBefore,
      matchedLabels: [],
      hasModal: false,
      hasIframe: false
    };

    if (shared && shared.MESSAGE_TYPES && shared.MESSAGE_TYPES.GET_PAGE_CONTEXT) {
      try {
        const baselineResp = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.GET_PAGE_CONTEXT });
        if (baselineResp && baselineResp.ok && baselineResp.data) {
          baselineContext = baselineResp.data;
        }
      } catch {}
    }

    function onTabCreated(tab) {
      if (!detectedNewTabId && tab && typeof tab.id === "number") { detectedNewTabId = tab.id; }
    }
    if (chrome.tabs && chrome.tabs.onCreated) { chrome.tabs.onCreated.addListener(onTabCreated); }

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700));
      const current = await getTabById(tabId);
      if (current && current.url && current.url !== originalUrl && current.status === "complete") {
        opened = true; reason = "url_changed"; finalTabId = tabId; break;
      }
      if (detectedNewTabId) {
        const newTab = await getTabById(detectedNewTabId);
        if (newTab && newTab.status === "complete") {
          opened = true; reason = "new_tab"; finalTabId = detectedNewTabId; break;
        }
      }
      if (shared && shared.MESSAGE_TYPES) {
        try {
          const fr = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.DETECT_APPLICATION_FORM });
          if (fr && fr.ok && fr.data && fr.data.opened) {
            opened = true; reason = fr.data.reason || "form_detected"; break;
          }
        } catch {}
      }

      if (shared && shared.MESSAGE_TYPES && shared.MESSAGE_TYPES.GET_PAGE_CONTEXT) {
        try {
          const cr = await sendMessageToTab(tabId, { type: shared.MESSAGE_TYPES.GET_PAGE_CONTEXT });
          if (cr && cr.ok && cr.data) {
            const signal = detectApplicationSignalFromContext(cr.data, originalUrl, baselineContext);
            if (signal.opened) {
              opened = true;
              reason = signal.reason;
              break;
            }
          }
        } catch {}
      }
    }

    if (chrome.tabs && chrome.tabs.onCreated) { chrome.tabs.onCreated.removeListener(onTabCreated); }

    let ctxAfter = { url: originalUrl, fillableFieldCount: fillableCountBefore, matchedLabels: [], hasModal: false, hasIframe: false };
    if (shared && shared.MESSAGE_TYPES && shared.MESSAGE_TYPES.GET_PAGE_CONTEXT) {
      try {
        const cr = await sendMessageToTab(finalTabId, { type: shared.MESSAGE_TYPES.GET_PAGE_CONTEXT });
        if (cr && cr.ok && cr.data) { ctxAfter = cr.data; }
      } catch {}
    }

    if (!opened) {
      const fallbackSignal = detectApplicationSignalFromContext(ctxAfter, originalUrl, baselineContext);
      if (fallbackSignal.opened) {
        opened = true;
        reason = fallbackSignal.reason;
      }
    }

    return {
      opened: opened,
      reason: reason,
      urlBefore: originalUrl,
      urlAfter: cleanString(ctxAfter.url || originalUrl),
      newTabDetected: Boolean(detectedNewTabId),
      formFieldCountBefore: fillableCountBefore,
      formFieldCountAfter: Number(ctxAfter.fillableFieldCount) || 0,
      modalDetected: Boolean(ctxAfter.hasModal),
      iframeDetected: Boolean(ctxAfter.hasIframe),
      matchedApplicationLabels: Array.isArray(ctxAfter.matchedLabels) ? ctxAfter.matchedLabels : []
    };
  }

  function testerSafetyBadge(status) {
    const labels = { allowed: "✓ Allowed", forbidden: "✗ Forbidden", skipped: "~ Skipped", neutral: "? Neutral" };
    const colors = { allowed: "#1a7a1a", forbidden: "#c00", skipped: "#888", neutral: "#555" };
    const label = labels[status] || status;
    const color = colors[status] || "#555";
    return "<span style=\"color:" + color + ";font-size:10px;font-weight:700\">" + testerEsc(label) + "</span>";
  }

  function testerBuildCandidateRow(c) {
    const forbidden = c.safetyStatus === "forbidden";
    const disabledAttr = forbidden ? " disabled" : "";
    const disabledTitle = forbidden ? " title=\"Disabled for safety: candidate looks like a final submission button.\"" : "";
    const hasHref = Boolean(c.href && !/^(javascript:|mailto:|tel:|#)/i.test(c.href));
    const textShort = testerEsc(c.text.substring(0, 48) + (c.text.length > 48 ? "…" : ""));
    const hrefShort = c.href ? testerEsc(c.href.substring(0, 55) + (c.href.length > 55 ? "…" : "")) : "";
    const btnStyle = "font-size:10px;padding:2px 6px;border:1px solid #bbb;border-radius:3px;cursor:pointer;background:#fff;font-family:inherit";

    return [
      "<div style=\"border:1px solid #e0e0e0;border-radius:4px;padding:6px 8px;margin-bottom:5px\">",
      "<div style=\"display:flex;gap:5px;align-items:baseline;flex-wrap:wrap;margin-bottom:3px\">",
      "<span style=\"background:#eee;color:#555;font-size:9px;font-weight:700;padding:1px 4px;border-radius:2px\">S:" + c.score + "</span>",
      testerSafetyBadge(c.safetyStatus),
      "<span style=\"font-size:11px;font-weight:600\">" + textShort + "</span>",
      "</div>",
      "<div style=\"font-size:10px;color:#888;margin-bottom:4px\">",
      "&lt;" + testerEsc(c.tagName) + "&gt; idx:" + c.candidateIndex + " dom:" + c.domIndex,
      c.dataTestId ? " data-test-id=" + testerEsc(c.dataTestId) : "",
      c.selector && c.selector !== c.tagName ? " <code>" + testerEsc(c.selector) + "</code>" : "",
      c.id ? " id=\"" + testerEsc(c.id) + "\"" : "",
      hrefShort ? " href=" + hrefShort : "",
      !c.visible ? " <em>hidden</em>" : "",
      c.disabled ? " <em>disabled</em>" : "",
      "</div>",
      "<div style=\"display:flex;gap:4px;flex-wrap:wrap\">",
      "<button type=\"button\"" + disabledAttr + disabledTitle + " data-tester-action=\"dom\" data-tester-idx=\"" + c.candidateIndex + "\" style=\"" + btnStyle + "\">Test DOM Click</button>",
      "<button type=\"button\"" + disabledAttr + disabledTitle + " data-tester-action=\"cdp\" data-tester-idx=\"" + c.candidateIndex + "\" style=\"" + btnStyle + "\">Test CDP Click</button>",
      hasHref ? "<button type=\"button\"" + disabledAttr + disabledTitle + " data-tester-action=\"url\" data-tester-idx=\"" + c.candidateIndex + "\" style=\"" + btnStyle + "\">Test URL Nav</button>" : "",
      "</div>",
      forbidden ? "<div style=\"color:#c00;font-size:10px;margin-top:3px\">Disabled for safety: candidate looks like a final submission button.</div>" : "",
      "<div class=\"tester-result\" data-result-idx=\"" + c.candidateIndex + "\" hidden style=\"margin-top:5px;font-size:10px;padding:4px 6px;border-radius:3px;white-space:pre-wrap;word-break:break-all\"></div>",
      "</div>"
    ].join("");
  }

  function testerRenderPanel(panelEl, scanData) {
    const candidates = scanData.candidates || [];
    const ctx = scanData.pageContext || {};
    const allowedCount = candidates.filter((c) => c.safetyStatus === "allowed").length;
    const btnStyle = "font-size:10px;padding:2px 6px;border:1px solid #bbb;border-radius:3px;cursor:pointer;background:#fff;font-family:inherit";

    let html = "<div style=\"margin-bottom:8px\">";
    html += "<strong style=\"font-size:11px\">" + candidates.length + " candidates scanned";
    if (allowedCount) { html += " (" + allowedCount + " allowed)"; }
    html += "</strong>";
    html += "<div style=\"font-size:10px;color:#888;margin-top:2px\">Fields: " + (ctx.fillableFieldCount || 0);
    if (ctx.matchedLabels && ctx.matchedLabels.length) {
      html += " | Labels: " + testerEsc(ctx.matchedLabels.slice(0, 5).join(", "));
    }
    html += "</div></div>";
    html += "<div class=\"tester-cand-list\">";
    candidates.forEach(function renderRow(c) { html += testerBuildCandidateRow(c); });
    html += "</div>";
    html += "<details style=\"margin-top:8px\"><summary style=\"font-size:10px;color:#888;cursor:pointer\">Debug JSON</summary>";
    html += "<div style=\"margin-top:4px\">";
    html += "<button type=\"button\" data-tester-action=\"copy-json\" style=\"" + btnStyle + ";margin-bottom:4px\">Copy JSON</button>";
    const jsonPreview = { candidates: candidates.map((c) => ({ idx: c.candidateIndex, text: c.text, safety: c.safetyStatus, score: c.score, href: c.href || "", dataTestId: c.dataTestId || "", selector: c.selector || "", domIndex: c.domIndex })), pageContext: ctx };
    html += "<pre id=\"tester-debug-pre\" style=\"font-size:9px;max-height:180px;overflow:auto;background:#f0f0f0;padding:5px;border-radius:3px;margin:0;white-space:pre-wrap;word-break:break-all\">" + testerEsc(JSON.stringify(jsonPreview, null, 2)) + "</pre>";
    html += "</div></details>";

    panelEl.innerHTML = html;
  }

  function testerFindCandidate(idx) {
    return ((testerState.scanData && testerState.scanData.candidates) || []).find((c) => c.candidateIndex === idx) || null;
  }

  function testerGetResultEl(panelEl, idx) {
    return panelEl ? panelEl.querySelector("[data-result-idx=\"" + idx + "\"]") : null;
  }

  function testerSetResult(panelEl, idx, text, succeeded) {
    const el = testerGetResultEl(panelEl, idx);
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.style.background = succeeded ? "#e8f5e9" : "#fce8e8";
    el.style.borderLeft = succeeded ? "3px solid #1a7a1a" : "3px solid #c00";
  }

  function testerUpdateDebugPre(panelEl, entry) {
    const pre = panelEl ? panelEl.querySelector("#tester-debug-pre") : null;
    if (!pre) return;
    testerState.lastDebugJson = entry;
    try { pre.textContent = JSON.stringify(entry, null, 2); } catch {}
  }

  function testerEvidenceSummary(evidence) {
    return [
      "URL: " + evidence.urlBefore + " → " + evidence.urlAfter,
      "New tab: " + evidence.newTabDetected,
      "Fields: " + evidence.formFieldCountBefore + " → " + evidence.formFieldCountAfter,
      "Modal: " + evidence.modalDetected + " | IFrame: " + evidence.iframeDetected,
      "Labels: " + (evidence.matchedApplicationLabels.length ? evidence.matchedApplicationLabels.join(", ") : "none")
    ].join("\n");
  }

  async function testerScan() {
    const panelEl = document.getElementById("test-apply-panel");
    const scanBtn = document.getElementById("test-apply-btn");
    if (!panelEl || testerState.busy) { return; }

    testerState.busy = true;
    if (scanBtn) { scanBtn.disabled = true; }
    panelEl.hidden = false;
    panelEl.textContent = "Scanning active tab for Apply button candidates...";

    try {
      const activeTab = await queryActiveTab();
      if (!activeTab || typeof activeTab.id !== "number") {
        panelEl.textContent = "No active tab found. Open a job page and try again.";
        return;
      }
      testerState.activeTabId = activeTab.id;
      testerState.activeTabUrl = cleanString(activeTab.url);

      const resp = await sendMessageToTab(activeTab.id, { type: shared.MESSAGE_TYPES.SCAN_APPLY_CANDIDATES_FULL });
      if (!resp || resp.ok !== true) {
        panelEl.textContent = "Scan failed: " + cleanString((resp && resp.error) || "content script unavailable. Ensure you are on a job page.");
        return;
      }

      testerState.scanData = resp.data || { candidates: [], pageContext: {} };
      testerRenderPanel(panelEl, testerState.scanData);
    } catch (error) {
      panelEl.textContent = "Scan error: " + (error instanceof Error ? error.message : String(error));
    } finally {
      testerState.busy = false;
      if (scanBtn) { scanBtn.disabled = false; }
    }
  }

  async function testerRunDomClick(idx) {
    const panelEl = document.getElementById("test-apply-panel");
    if (!panelEl || testerState.busy) { return; }
    const candidate = testerFindCandidate(idx);
    if (!candidate) { testerSetResult(panelEl, idx, "Candidate not found in scan data.", false); return; }
    if (candidate.safetyStatus === "forbidden") { testerSetResult(panelEl, idx, "Disabled for safety: candidate looks like a final submission button.", false); return; }

    testerState.busy = true;
    testerSetResult(panelEl, idx, "Running DOM click — waiting up to 3.5s for page change...", null);

    const tabId = testerState.activeTabId;
    const originalUrl = testerState.activeTabUrl;
    const fillableCountBefore = (testerState.scanData && testerState.scanData.pageContext && testerState.scanData.pageContext.fillableFieldCount) || 0;
    const debugEntry = { action: "dom_click", candidateIndex: idx, candidateText: candidate.text, safetyStatus: candidate.safetyStatus, domIndex: candidate.domIndex, urlBefore: originalUrl };

    try {
      const clickResp = await sendMessageToTab(tabId, {
        type: shared.MESSAGE_TYPES.TESTER_CLICK_ELEMENT,
        data: { candidateIndex: candidate.candidateIndex, domIndex: candidate.domIndex }
      });
      if (!clickResp || clickResp.ok !== true) {
        const reason = cleanString((clickResp && clickResp.error) || "click failed");
        debugEntry.clickResult = "failed: " + reason;
        testerSetResult(panelEl, idx, "DOM click failed: " + reason, false);
        testerUpdateDebugPre(panelEl, debugEntry);
        return;
      }
      debugEntry.clickResult = "clicked";
      const href = cleanString(clickResp.data && clickResp.data.href || "");
      if (href) { debugEntry.href = href; }

      const evidence = await testerPollWithEvidence(tabId, originalUrl, fillableCountBefore, 3500);
      Object.assign(debugEntry, evidence);
      const resultText = evidence.opened
        ? "DOM click succeeded.\n\nDetection: " + evidence.reason + "\n" + testerEvidenceSummary(evidence)
        : "DOM click failed: no URL change / no form detected after click.\n\n" + testerEvidenceSummary(evidence);
      testerSetResult(panelEl, idx, resultText, evidence.opened);
      testerUpdateDebugPre(panelEl, debugEntry);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugEntry.error = msg;
      testerSetResult(panelEl, idx, "DOM click failed: " + msg, false);
      testerUpdateDebugPre(panelEl, debugEntry);
    } finally {
      testerState.busy = false;
    }
  }

  async function testerRunCdpClick(idx) {
    const panelEl = document.getElementById("test-apply-panel");
    if (!panelEl || testerState.busy) { return; }
    const candidate = testerFindCandidate(idx);
    if (!candidate) { testerSetResult(panelEl, idx, "Candidate not found in scan data.", false); return; }
    if (candidate.safetyStatus === "forbidden") { testerSetResult(panelEl, idx, "Disabled for safety: candidate looks like a final submission button.", false); return; }

    testerState.busy = true;
    testerSetResult(panelEl, idx, "Running CDP click — getting element rect...", null);

    const tabId = testerState.activeTabId;
    const originalUrl = testerState.activeTabUrl;
    const fillableCountBefore = (testerState.scanData && testerState.scanData.pageContext && testerState.scanData.pageContext.fillableFieldCount) || 0;
    const debugEntry = { action: "cdp_click", candidateIndex: idx, candidateText: candidate.text, safetyStatus: candidate.safetyStatus, domIndex: candidate.domIndex, urlBefore: originalUrl, debuggerAttached: false, cdpSent: false, clickCoords: null };

    try {
      const rectResp = await sendMessageToTab(tabId, {
        type: shared.MESSAGE_TYPES.TESTER_GET_ELEMENT_RECT,
        data: { candidateIndex: candidate.candidateIndex, domIndex: candidate.domIndex }
      });
      if (!rectResp || rectResp.ok !== true || !rectResp.data || !rectResp.data.rect) {
        const reason = cleanString((rectResp && rectResp.error) || "rect unavailable");
        debugEntry.error = "rect failed: " + reason;
        testerSetResult(panelEl, idx, "CDP click failed: " + reason, false);
        testerUpdateDebugPre(panelEl, debugEntry);
        return;
      }

      const rect = rectResp.data.rect;
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      debugEntry.rect = rect;
      debugEntry.clickCoords = { x: x, y: y };

      if (x <= 0 || y <= 0 || rect.width <= 0 || rect.height <= 0) {
        debugEntry.error = "element not in viewport";
        testerSetResult(panelEl, idx, "CDP click failed: element not visible/in-viewport.\nRect: " + JSON.stringify(rect), false);
        testerUpdateDebugPre(panelEl, debugEntry);
        return;
      }

      testerSetResult(panelEl, idx, "CDP click — attaching debugger, coords (" + x + ", " + y + ")...", null);
      await attemptCdpMouseClick(tabId, x, y);
      debugEntry.debuggerAttached = true;
      debugEntry.cdpSent = true;

      const evidence = await testerPollWithEvidence(tabId, originalUrl, fillableCountBefore, 3500);
      Object.assign(debugEntry, evidence);
      const resultText = evidence.opened
        ? "CDP click succeeded.\n\nCoords: (" + x + ", " + y + ")  Rect: " + JSON.stringify(rect) + "\nDetection: " + evidence.reason + "\n" + testerEvidenceSummary(evidence)
        : "CDP click failed: no form detected.\n\nCoords: (" + x + ", " + y + ")  Rect: " + JSON.stringify(rect) + "\nDebugger attached: " + debugEntry.debuggerAttached + "  CDP sent: " + debugEntry.cdpSent + "\n" + testerEvidenceSummary(evidence);
      testerSetResult(panelEl, idx, resultText, evidence.opened);
      testerUpdateDebugPre(panelEl, debugEntry);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugEntry.error = msg;
      testerSetResult(panelEl, idx, "CDP click failed: " + msg, false);
      testerUpdateDebugPre(panelEl, debugEntry);
    } finally {
      testerState.busy = false;
    }
  }

  async function testerRunUrlNav(idx) {
    const panelEl = document.getElementById("test-apply-panel");
    if (!panelEl || testerState.busy) { return; }
    const candidate = testerFindCandidate(idx);
    if (!candidate) { testerSetResult(panelEl, idx, "Candidate not found in scan data.", false); return; }
    if (candidate.safetyStatus === "forbidden") { testerSetResult(panelEl, idx, "Disabled for safety: candidate looks like a final submission button.", false); return; }

    const href = cleanString(candidate.href || "");
    const UNSAFE_HREF_LOCAL = /^(javascript:|mailto:|tel:|#)/i;
    if (!href || UNSAFE_HREF_LOCAL.test(href)) {
      testerSetResult(panelEl, idx, "URL nav: no safe href. href=\"" + testerEsc(href) + "\"", false);
      return;
    }

    testerState.busy = true;
    testerSetResult(panelEl, idx, "Navigating to " + testerEsc(href) + " — waiting up to 5s...", null);

    const tabId = testerState.activeTabId;
    const originalUrl = testerState.activeTabUrl;
    const fillableCountBefore = (testerState.scanData && testerState.scanData.pageContext && testerState.scanData.pageContext.fillableFieldCount) || 0;
    const debugEntry = { action: "url_nav", candidateIndex: idx, candidateText: candidate.text, href: href, urlBefore: originalUrl };

    try {
      await new Promise((resolve, reject) => {
        chrome.tabs.update(tabId, { url: href }, (tab) => {
          if (chrome.runtime && chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(tab);
        });
      });

      const evidence = await testerPollWithEvidence(tabId, originalUrl, fillableCountBefore, 5000);
      Object.assign(debugEntry, evidence);
      const resultText = evidence.opened
        ? "URL navigation succeeded.\n\nHref: " + href + "\nDetection: " + evidence.reason + "\n" + testerEvidenceSummary(evidence)
        : "URL navigation failed: no application form detected.\n\nHref: " + href + "\n" + testerEvidenceSummary(evidence);
      testerSetResult(panelEl, idx, resultText, evidence.opened);
      testerUpdateDebugPre(panelEl, debugEntry);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugEntry.error = msg;
      testerSetResult(panelEl, idx, "URL navigation failed: " + msg, false);
      testerUpdateDebugPre(panelEl, debugEntry);
    } finally {
      testerState.busy = false;
    }
  }

  async function startApplyFlow() {
    if (!api || typeof api.generateResume !== "function") {
      setStatus("Generate API is unavailable.");
      return;
    }
    if (!appDataStore || typeof appDataStore.getAppData !== "function") {
      setStatus("App data storage is unavailable.");
      return;
    }

    setBusy(true);
    hideGuardNotice();
    state.isStartApplyRunning = true;

    try {
      // ── Step 1: Guard + Generate Resume ──────────────────────────────
      setStatus("Starting application flow...");

      // Take a stable snapshot of the current job. If already valid, skip re-extraction
      // entirely so syncCurrentJobFromPage cannot clear it on AI/network failure.
      let currentJob = isCurrentJobValid(state.currentJob) ? state.currentJob : null;
      let rawJob = currentJob ? (state.currentJobRaw || null) : null;

      if (!currentJob) {
        const detection = await syncCurrentJobFromPage({ showExtractStatus: false });
        currentJob = detection.job;
        rawJob = detection.rawJob || state.currentJobRaw;
      } else {
        // Keep the UI stable — show existing job throughout the flow
        setDetectedJobSummaryState(currentJob, "Starting application...");
      }

      const canonicalData = await getCanonicalData();
      const storageSettings = storage && typeof storage.getSettings === "function" ? await storage.getSettings() : {};
      const settings = buildGuardSettings(canonicalData, storageSettings);

      const guardResult = dataBoundary && typeof dataBoundary.evaluateGenerateResumeGuard === "function"
        ? dataBoundary.evaluateGenerateResumeGuard({ currentJob: currentJob, appData: canonicalData, settings: settings })
        : { ok: true };

      if (!guardResult || guardResult.ok !== true) {
        showGenerateGuardFailure(guardResult);
        return;
      }

      const appData = await appDataStore.getAppData();
      const jobData = buildGenerateRequestJobData(currentJob, rawJob);
      const request = messaging && typeof messaging.buildGenerateResumeRequest === "function"
        ? messaging.buildGenerateResumeRequest(jobData, settings, { profile: appData.profile, masterResume: appData.masterResume })
        : { jobData: jobData, settings: settings, profile: appData.profile, masterResume: appData.masterResume };

      setStatus("Generating tailored resume...");
      setDetectedJobSummaryState(currentJob, "Generating resume...");

      const response = await api.generateResume(request);
      if (!response || response.ok !== true) {
        setDetectedJobSummaryState(currentJob, "Resume generation failed");
        setStatus(cleanString(response && (response.error || response.message)) || "Resume generation failed.");
        return;
      }

      const generated = normalizeGenerateResult(response);
      let resumeDraftRecord = null;
      try {
        resumeDraftRecord = await saveGeneratedResumeInternally({
          currentJob: currentJob,
          jobData: jobData,
          generated: generated,
          createdAt: new Date().toISOString()
        });
      } catch (storeError) {
        setDetectedJobSummaryState(currentJob, "Resume save failed");
        setStatus("Failed to save generated resume internally: " + (storeError instanceof Error ? storeError.message : String(storeError)));
        return;
      }

      setDetectedJobSummaryState(currentJob, "Resume saved internally");
      const pendingApply = {
        jobId: cleanString(currentJob.jobId || jobData.jobId),
        resumeDraftId: cleanString(resumeDraftRecord && resumeDraftRecord.resumeDraftId),
        jobUrl: cleanString(currentJob.url || jobData.jobUrl || jobData.url),
        createdAt: new Date().toISOString(),
        status: "waiting_for_user_to_open_application_form"
      };
      await setPendingApplyState(pendingApply);

      setDetectedJobSummaryState(currentJob, "Resume generated and saved");
      setStatus("Resume generated and saved.\n\nPlease click the Apply button on this job page. After the application form opens, open this extension again to autofill the form.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      state.isStartApplyRunning = false;
      setBusy(false);
    }
  }

  function upsertJobInList(jobsInput, normalizedJob) {
    const jobs = Array.isArray(jobsInput) ? jobsInput.slice() : [];
    const safeJob = normalizedJob && typeof normalizedJob === "object" ? normalizedJob : {};
    const incomingJobId = cleanString(safeJob.jobId);
    const incomingUrl = toComparableUrl(safeJob.url);

    let targetIndex = -1;
    if (incomingUrl) {
      targetIndex = jobs.findIndex((item) => urlsMatch(item && item.url, safeJob.url));
    }
    if (targetIndex < 0 && incomingJobId) {
      targetIndex = jobs.findIndex((item) => cleanString(item && item.jobId) === incomingJobId);
    }

    if (targetIndex >= 0) {
      const existing = jobs[targetIndex] && typeof jobs[targetIndex] === "object" ? jobs[targetIndex] : {};
      const merged = {
        ...existing,
        ...safeJob,
        jobId: cleanString(existing.jobId) || cleanString(safeJob.jobId)
      };
      jobs[targetIndex] = merged;
      return { jobs: jobs, job: merged };
    }

    jobs.push(safeJob);
    return { jobs: jobs, job: safeJob };
  }

  function findApplicationIndexForJob(applicationsInput, job) {
    const applications = Array.isArray(applicationsInput) ? applicationsInput : [];
    const safeJob = job && typeof job === "object" ? job : {};
    const targetJobId = cleanString(safeJob.jobId);
    const targetUrl = toComparableUrl(safeJob.url);

    return applications.findIndex((item) => {
      const safe = item && typeof item === "object" ? item : {};
      const appJobId = cleanString(safe.jobId);
      const appUrl = toComparableUrl(cleanString(safe.jobUrl || safe.url));

      if (targetUrl && appUrl && targetUrl === appUrl) {
        return true;
      }
      if (targetJobId && appJobId && targetJobId === appJobId) {
        return true;
      }
      return false;
    });
  }

  function showMissingCurrentJobForSave() {
    setStatus("No job detected. Open a job posting page first.");
  }

  function formatGuardFailureMessage(guardResult) {
    const safe = guardResult && typeof guardResult === "object" ? guardResult : {};
    const mainMessage = cleanString(safe.mainMessage);
    const supportingMessage = cleanString(safe.supportingMessage);
    return mainMessage + (supportingMessage ? " — " + supportingMessage : "");
  }

  async function handleSaveJob() {
    setBusy(true);

    try {
      let currentJob = state.currentJob;
      if (!isCurrentJobValid(currentJob)) {
        const detection = await syncCurrentJobFromPage({ showExtractStatus: true });
        currentJob = detection.job;
      }

      if (!isCurrentJobValid(currentJob)) {
        showMissingCurrentJobForSave();
        return;
      }

      const canonical = await getCanonicalData();
      let normalizedJob = dataBoundary && typeof dataBoundary.normalizeJob === "function"
        ? dataBoundary.normalizeJob(currentJob)
        : fallbackNormalizeJob(currentJob, null);
      const pageSnapshot = state.currentJobRaw && state.currentJobRaw.pageSnapshot && typeof state.currentJobRaw.pageSnapshot === "object"
        ? state.currentJobRaw.pageSnapshot
        : {};
      const jobDescriptionText = cleanString(normalizedJob.descriptionText || currentJob.descriptionText || currentJob.description || currentJob.rawText || pageSnapshot.pageText);
      const pageText = cleanString(pageSnapshot.pageText || currentJob.pageText);
      const pageTitle = cleanString(pageSnapshot.title || normalizedJob.pageTitle || currentJob.pageTitle);
      const detectedLanguage = detectLanguageFromText(jobDescriptionText, pageText, pageTitle);
      normalizedJob = dataBoundary && typeof dataBoundary.normalizeJob === "function"
        ? dataBoundary.normalizeJob({
            ...normalizedJob,
            hostname: cleanString(normalizedJob.hostname || pageSnapshot.hostname),
            pathname: cleanString(normalizedJob.pathname || pageSnapshot.pathname),
            pageTitle: pageTitle,
            descriptionText: jobDescriptionText,
            pageText: pageText,
            htmlSnapshot: cleanString(pageSnapshot.htmlSnapshot || normalizedJob.htmlSnapshot || currentJob.htmlSnapshot),
            extractedAt: cleanString(normalizedJob.extractedAt || pageSnapshot.extractedAt)
          })
        : {
            ...normalizedJob,
            hostname: cleanString(normalizedJob.hostname || pageSnapshot.hostname),
            pathname: cleanString(normalizedJob.pathname || pageSnapshot.pathname),
            pageTitle: pageTitle,
            descriptionText: jobDescriptionText,
            pageText: pageText,
            htmlSnapshot: cleanString(pageSnapshot.htmlSnapshot || normalizedJob.htmlSnapshot || currentJob.htmlSnapshot),
            extractedAt: cleanString(normalizedJob.extractedAt || pageSnapshot.extractedAt)
          };

      const upserted = upsertJobInList(canonical.jobs, normalizedJob);
      const nextJobs = upserted.jobs;
      const resolvedJob = upserted.job;

      const nextApplications = Array.isArray(canonical.applications) ? canonical.applications.slice() : [];
      const existingIndex = findApplicationIndexForJob(nextApplications, resolvedJob);

      if (existingIndex < 0) {
        const nowIso = new Date().toISOString();
        const applicationId = "app_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
        const resumeDraft = buildApplicationResumeDraftFromActiveProfile(canonical, applicationId, nowIso);
        const newApplication = dataBoundary && typeof dataBoundary.normalizeApplication === "function"
          ? dataBoundary.normalizeApplication({
              applicationId: applicationId,
              jobId: cleanString(resolvedJob.jobId),
              status: "Saved",
              createdAt: nowIso,
              updatedAt: nowIso,
              jobUrl: cleanString(resolvedJob.url),
              company: cleanString(resolvedJob.company),
              jobTitle: cleanString(resolvedJob.title),
              location: cleanString(resolvedJob.location),
              hostname: cleanString(resolvedJob.hostname || pageSnapshot.hostname),
              pathname: cleanString(resolvedJob.pathname || pageSnapshot.pathname),
              pageTitle: pageTitle,
              jobDescriptionText: jobDescriptionText,
              pageText: pageText,
              htmlSnapshot: cleanString(pageSnapshot.htmlSnapshot || resolvedJob.htmlSnapshot || currentJob.htmlSnapshot),
              extractedAt: cleanString(resolvedJob.extractedAt || pageSnapshot.extractedAt),
              source: "popup-save-job",
              detectedLanguage: detectedLanguage,
              resumeDraftId: cleanString(resumeDraft.id),
              resumeDraft: resumeDraft
            })
          : {
              id: applicationId,
              applicationId: applicationId,
              jobId: cleanString(resolvedJob.jobId),
              status: "Saved",
              createdAt: nowIso,
              updatedAt: nowIso,
              jobUrl: cleanString(resolvedJob.url),
              company: cleanString(resolvedJob.company),
              jobTitle: cleanString(resolvedJob.title),
              location: cleanString(resolvedJob.location),
              hostname: cleanString(resolvedJob.hostname || pageSnapshot.hostname),
              pathname: cleanString(resolvedJob.pathname || pageSnapshot.pathname),
              pageTitle: pageTitle,
              jobDescriptionText: jobDescriptionText,
              pageText: pageText,
              htmlSnapshot: cleanString(pageSnapshot.htmlSnapshot || resolvedJob.htmlSnapshot || currentJob.htmlSnapshot),
              extractedAt: cleanString(resolvedJob.extractedAt || pageSnapshot.extractedAt),
              source: "popup-save-job",
              detectedLanguage: detectedLanguage,
              resumeDraftId: cleanString(resumeDraft.id),
              resumeDraft: resumeDraft
            };
        nextApplications.push(newApplication);
      } else {
        const existing = nextApplications[existingIndex] && typeof nextApplications[existingIndex] === "object" ? nextApplications[existingIndex] : {};
        const existingApplicationId = cleanString(existing.applicationId || existing.id) || "app_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
        const existingResumeDraft = existing.resumeDraft && typeof existing.resumeDraft === "object" ? existing.resumeDraft : null;
        const shouldCreateMissingDraft = !existingResumeDraft && !cleanString(existing.resumeDraftId);
        const missingDraft = shouldCreateMissingDraft
          ? buildApplicationResumeDraftFromActiveProfile(canonical, existingApplicationId, new Date().toISOString())
          : null;
        nextApplications[existingIndex] = {
          ...existing,
          applicationId: existingApplicationId,
          jobId: cleanString(resolvedJob.jobId) || cleanString(existing.jobId),
          jobUrl: cleanString(resolvedJob.url) || cleanString(existing.jobUrl || existing.url),
          company: cleanString(resolvedJob.company) || cleanString(existing.company),
          jobTitle: cleanString(resolvedJob.title) || cleanString(existing.jobTitle || existing.role || existing.title),
          location: cleanString(resolvedJob.location) || cleanString(existing.location),
          hostname: cleanString(resolvedJob.hostname || pageSnapshot.hostname) || cleanString(existing.hostname),
          pathname: cleanString(resolvedJob.pathname || pageSnapshot.pathname) || cleanString(existing.pathname),
          pageTitle: pageTitle || cleanString(existing.pageTitle),
          jobDescriptionText: jobDescriptionText || cleanString(existing.jobDescriptionText),
          pageText: pageText || cleanString(existing.pageText),
          htmlSnapshot: cleanString(pageSnapshot.htmlSnapshot || resolvedJob.htmlSnapshot || currentJob.htmlSnapshot) || cleanString(existing.htmlSnapshot),
          extractedAt: cleanString(resolvedJob.extractedAt || pageSnapshot.extractedAt) || cleanString(existing.extractedAt),
          source: "popup-save-job",
          detectedLanguage: cleanString(existing.detectedLanguage) || detectedLanguage,
          resumeDraftId: cleanString(existing.resumeDraftId) || cleanString(missingDraft && missingDraft.id),
          resumeDraft: existingResumeDraft || missingDraft || null,
          updatedAt: new Date().toISOString()
        };
      }

      if (dataBoundary && typeof dataBoundary.saveAppData === "function") {
        await dataBoundary.saveAppData({
          jobs: nextJobs,
          applications: nextApplications
        });
      }

      if (storage && typeof storage.setJobData === "function") {
        await storage.setJobData(buildCachedJobPayload(resolvedJob, state.currentJobRaw));
      }

      updateCurrentJobState(resolvedJob, buildCachedJobPayload(resolvedJob, state.currentJobRaw));
      setDetectedJobSummaryState(resolvedJob, "Saved to Applications");
      setStatus("Job saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function openConsolePage(tabKey) {
    if (!globalThis.chrome || !chrome.runtime || typeof chrome.runtime.getURL !== "function") {
      return;
    }

    const baseUrl = chrome.runtime.getURL(CONSOLE_PAGE_PATH);
    const target = cleanString(tabKey).toLowerCase();
    const url = target ? baseUrl + "#" + encodeURIComponent(target) : baseUrl;

    if (chrome.tabs && typeof chrome.tabs.query === "function" && typeof chrome.tabs.update === "function") {
      chrome.tabs.query({ url: baseUrl + "*" }, (tabs) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          if (chrome.tabs && typeof chrome.tabs.create === "function") {
            chrome.tabs.create({ url: url });
          }
          return;
        }

        const existing = Array.isArray(tabs) ? tabs[0] : null;
        if (existing && typeof existing.id === "number") {
          chrome.tabs.update(existing.id, { active: true, url: url });
          if (chrome.windows && typeof chrome.windows.update === "function" && typeof existing.windowId === "number") {
            chrome.windows.update(existing.windowId, { focused: true });
          }
          return;
        }

        if (chrome.tabs && typeof chrome.tabs.create === "function") {
          chrome.tabs.create({ url: url });
        }
      });
      return;
    }

    if (chrome.tabs && typeof chrome.tabs.create === "function") {
      chrome.tabs.create({ url: url });
      return;
    }

    if (typeof globalThis.open === "function") {
      globalThis.open(url, "_blank", "noopener");
    }
  }

  function handleOpenConsole() {
    openConsolePage("");
  }

  if (generateButton) {
    generateButton.addEventListener("click", () => {
      void startApplyFlow();
    });
  }

  if (autofillButton) {
    autofillButton.addEventListener("click", () => {
      void handleAutofill();
    });
  }

  if (saveJobButton) {
    saveJobButton.addEventListener("click", () => {
      void handleSaveJob();
    });
  }

  if (applicationsButton) {
    applicationsButton.addEventListener("click", () => {
      openConsolePage("applications");
    });
  }

  if (openConsoleButton) {
    openConsoleButton.addEventListener("click", handleOpenConsole);
  }

  if (guardNoticeGotoBtn) {
    guardNoticeGotoBtn.addEventListener("click", () => {
      openConsolePage("profile-resume");
    });
  }

  if (guardNoticeDismissBtn) {
    guardNoticeDismissBtn.addEventListener("click", hideGuardNotice);
  }

  if (jobSummaryOpenSettingsBtn) {
    jobSummaryOpenSettingsBtn.addEventListener("click", () => {
      openConsolePage("settings");
    });
  }

  async function boot() {
    setBusy(true);
    try {
      await refreshRuntimeModel();

      const activeTab = await queryActiveTab();
      state.activeTabId = activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
      state.activeTabUrl = cleanString(activeTab && activeTab.url);

      if (!activeTab || typeof activeTab.id !== "number") {
        setNoJobSummaryState();
        setStatus("No job or application form detected on this page.");
        return;
      }

      const applicationFormDetection = await detectApplicationFormOnTab(activeTab.id);
      if (applicationFormDetection.opened) {
        const pendingApply = await getPendingApplyState();
        const hasPendingResume = pendingApply && pendingApply.status === "waiting_for_user_to_open_application_form";
        setApplicationFormSummaryState(hasPendingResume ? "Resume ready for AutoFill" : "Detected on this page");
        await handleAutofill({ trigger: "auto", activeTab: activeTab });
        return;
      }

      await syncCurrentJobFromPage({ showExtractStatus: true });
    } catch (error) {
      setNoJobSummaryState();
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  setNoJobSummaryState();
  setStatus("Ready");
  void boot();
})();
