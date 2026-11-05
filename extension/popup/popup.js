(function initQuickPanel() {
  "use strict";

  const shared = globalThis.Stage3Shared;
  const storage = globalThis.Stage3Storage;
  const messaging = globalThis.Stage5Messaging;
  const api = globalThis.Stage5Api;
  const appDataStore = globalThis.Stage10AppDataStore;
  const resumeRegistryStore = globalThis.Stage6ResumeRegistryStorage;
  const dataBoundary = globalThis.Stage11DataBoundary;
  const tracker = globalThis.AutoApplyTracker;

  const CONSOLE_PAGE_PATH = "options/options.html";
  const PENDING_APPLY_STORAGE_KEY = "pendingApply";
  const AUTOFILL_RUNTIME_STATE_STORAGE_KEY = "autoFillRuntimeState";

  const generateButton = document.getElementById("generate-btn");
  const autofillButton = document.getElementById("autofill-btn");
  const saveJobButton = document.getElementById("save-job-btn");
  const applicationsButton = document.getElementById("applications-btn");
  const confirmSubmittedButton = document.getElementById("confirm-submitted-btn");
  const trackerStatusEl = document.getElementById("tracker-status");
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
    activeTabUrl: "",
    trackerJob: null
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
    if (confirmSubmittedButton) confirmSubmittedButton.disabled = state.busy || !state.trackerJob;
  }

  function setStatus(text) {
    if (runtimeStatusEl) {
      runtimeStatusEl.textContent = "Status: " + cleanString(text);
    }
  }

  function setTrackerStatus(text) {
    if (trackerStatusEl) trackerStatusEl.textContent = "Tracker: " + cleanString(text);
  }

  function showTrackerJob(job) {
    state.trackerJob = job;
    setTrackerStatus([job.company, job.job_title, job.status_id].filter(Boolean).join(" · "));
    if (confirmSubmittedButton) confirmSubmittedButton.disabled = state.busy;
  }

  async function trackCurrentJob(job) {
    state.trackerJob = null;
    if (confirmSubmittedButton) confirmSubmittedButton.disabled = true;
    try {
      const saved = await tracker.createJob({
        company: cleanString(job.company),
        job_title: cleanString(job.title || job.jobTitle || job.role),
        job_url: cleanString(job.url || job.jobUrl),
        location: cleanString(job.location)
      });
      showTrackerJob(saved);
      return saved;
    } catch (error) {
      setTrackerStatus(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async function refreshTrackerJob(url) {
    state.trackerJob = null;
    if (confirmSubmittedButton) confirmSubmittedButton.disabled = true;
    if (!url) return;
    try {
      const jobs = await tracker.getJobs(url);
      if (jobs.length) showTrackerJob(jobs[0]);
      else setTrackerStatus("This job has not been saved. Use Save Job or Start Apply.");
    } catch (error) {
      setTrackerStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function uploadGeneratedPdf(job, generated) {
    if (!job) return;
    try {
      if (!generated.pdfPath) {
        setTrackerStatus("No PDF was generated; there is no resume version to upload.");
        return;
      }
      const artifact = await getLocalStorageValue(generated.pdfPath);
      const base64 = cleanString(artifact && (artifact.dataBase64 || artifact.content));
      if (!base64) throw new Error("Generated PDF could not be read for Tracker upload.");
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const fileName = cleanString(artifact.fileName || artifact.filename) || "tailored_resume.pdf";
      await tracker.uploadResume(job.id, new Blob([bytes], { type: "application/pdf" }), fileName, "Tailored resume");
      setTrackerStatus("Tailored PDF saved for " + [job.company, job.job_title].filter(Boolean).join(" · "));
    } catch (error) {
      setTrackerStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function confirmSubmitted() {
    const job = state.trackerJob;
    if (!job) return;
    setBusy(true);
    try {
      const now = new Date();
      const appliedDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      const updated = await tracker.patchJob(job.id, { status_id: "applied", applied_date: appliedDate });
      const pending = await getPendingApplyState();
      if (pending && (pending.trackerJobId === job.id || urlsMatch(pending.trackerJobUrl || pending.jobUrl, job.job_url))) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.remove(PENDING_APPLY_STORAGE_KEY, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
      }
      showTrackerJob(updated);
      setTrackerStatus("Confirmed submitted: " + [updated.company, updated.job_title, appliedDate].filter(Boolean).join(" · "));
    } catch (error) {
      setTrackerStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
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
    let activeTab;
    try {
      activeTab = await queryActiveTab();
    } catch {
      activeTab = null;
    }

    const settings = await loadRuntimeSettings();
    let extractedPayload = null;
    let extractionError = "";
    try {
      extractedPayload = await extractCurrentPagePayload();
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
      trackerJobUrl: cleanString(raw.trackerJobUrl || raw.jobUrl),
      trackerCompany: cleanString(raw.trackerCompany),
      trackerJobTitle: cleanString(raw.trackerJobTitle),
      trackerJobId: cleanString(raw.trackerJobId),
      sourceTabId: Number.isInteger(raw.sourceTabId) ? raw.sourceTabId : null,
      createdAt: cleanString(raw.createdAt),
      status: cleanString(raw.status)
    };
  }

  async function getPendingApplyForTab(tab) {
    const pending = await getPendingApplyState();
    return pending && pending.sourceTabId !== null &&
      (tab.id === pending.sourceTabId || tab.openerTabId === pending.sourceTabId)
      ? pending : null;
  }

  async function setPendingApplyState(input) {
    const safe = input && typeof input === "object" ? input : {};
    const normalized = {
      jobId: cleanString(safe.jobId),
      resumeDraftId: cleanString(safe.resumeDraftId),
      jobUrl: cleanString(safe.jobUrl),
      trackerJobUrl: cleanString(safe.trackerJobUrl || safe.jobUrl),
      trackerCompany: cleanString(safe.trackerCompany),
      trackerJobTitle: cleanString(safe.trackerJobTitle),
      trackerJobId: cleanString(safe.trackerJobId),
      sourceTabId: Number.isInteger(safe.sourceTabId) ? safe.sourceTabId : null,
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

      const pendingApplyState = await getPendingApplyForTab(activeTab);
      const trackerJob = isCurrentJobValid(state.currentJob)
        ? { company: cleanString(state.currentJob.company), job_title: cleanString(state.currentJob.title),
            job_url: cleanString(state.currentJob.url), location: cleanString(state.currentJob.location) }
        : pendingApplyState && pendingApplyState.trackerJobUrl
          ? { company: pendingApplyState.trackerCompany, job_title: pendingApplyState.trackerJobTitle,
              job_url: pendingApplyState.trackerJobUrl }
          : null;
      const response = await sendMessageToTab(activeTab.id, { type: shared.MESSAGE_TYPES.PREPARE_APPLICATION, trackerJob: trackerJob });
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
      if (resultData.trackerJob) showTrackerJob(resultData.trackerJob);
      if (resultData.trackerError) setTrackerStatus(resultData.trackerError);
      const { filledFieldCount: filledCount, formFieldCount } = resultData.autofillStats;

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
        setStatus("Autofill completed. Filled=" + String(filledCount) + "/" + String(formFieldCount));
      }

      return { ok: true, filledCount: filledCount };
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    } finally {
      setBusy(false);
    }
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

      const trackerJob = isCurrentJobValid(currentJob) ? await trackCurrentJob(currentJob) : null;

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
      request.activeResumeLanguage = canonicalData.activeResumeLanguage === "zh" ? "zh" : "en";
      request.currentResume = canonicalData.resumes && canonicalData.resumes[request.activeResumeLanguage];

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

      await uploadGeneratedPdf(trackerJob, generated);

      setDetectedJobSummaryState(currentJob, "Resume saved internally");
      const pendingApply = {
        jobId: cleanString(currentJob.jobId || jobData.jobId),
        resumeDraftId: cleanString(resumeDraftRecord && resumeDraftRecord.resumeDraftId),
        jobUrl: cleanString(currentJob.url || jobData.jobUrl || jobData.url),
        trackerJobUrl: cleanString(currentJob.url || jobData.jobUrl || jobData.url),
        trackerCompany: cleanString(currentJob.company || jobData.company),
        trackerJobTitle: cleanString(currentJob.title || jobData.title || jobData.role),
        trackerJobId: cleanString(trackerJob && trackerJob.id),
        sourceTabId: state.activeTabId,
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

  async function handleSaveJob() {
    setBusy(true);
    try {
      let currentJob = state.currentJob;
      if (!isCurrentJobValid(currentJob)) {
        const detection = await syncCurrentJobFromPage({ showExtractStatus: true });
        currentJob = detection.job;
      }
      if (!isCurrentJobValid(currentJob)) {
        setStatus("No job detected. Open a job posting page first.");
        return;
      }
      const saved = await trackCurrentJob(currentJob);
      if (saved) setStatus("Job saved to Tracker.");
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
      void tracker.openDashboard().catch((error) => setTrackerStatus(error.message));
    });
  }

  if (confirmSubmittedButton) {
    confirmSubmittedButton.addEventListener("click", () => { void confirmSubmitted(); });
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
        const pendingApply = await getPendingApplyForTab(activeTab);
        await refreshTrackerJob(cleanString(pendingApply && pendingApply.jobUrl));
        const hasPendingResume = pendingApply && pendingApply.status === "waiting_for_user_to_open_application_form";
        setApplicationFormSummaryState(hasPendingResume ? "Resume ready for AutoFill" : "Detected on this page");
        await handleAutofill({ trigger: "auto", activeTab: activeTab });
        return;
      }

      await syncCurrentJobFromPage({ showExtractStatus: true });
      await refreshTrackerJob(cleanString(state.currentJob && state.currentJob.url));
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
