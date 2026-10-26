(function attachStage3Storage(global) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    LAST_PAGE_SNAPSHOT: "LAST_PAGE_SNAPSHOT",
    PAGE_SNAPSHOT: "pageSnapshot",
    JOB_POSTING: "jobPosting",
    JOB_DATA: "jobData",
    EXTENSION_SETTINGS: "extensionSettings"
  });

  const DEFAULT_SETTINGS = Object.freeze({
    apiBaseUrl: "https://api.minimax.io/anthropic",
    requestTimeoutMs: 30000,
    autoParseOnExtract: true,
    provider: "minimax",
    model: "MiniMax-M2.5",
    aiCustomInstructions: "",
    providers: {
      openai: {
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini"
      },
      deepseek: {
        apiKey: "",
        baseUrl: "https://api.deepseek.com",
        model: ""
      },
      minimax: {
        apiKey: "",
        baseUrl: "https://api.minimax.io",
        model: "MiniMax-M2.5",
        systemPrompt: "You are a helpful assistant.",
        anthropicVersion: "2023-06-01"
      },
      ollama: {
        apiKey: "",
        baseUrl: "http://localhost:11434",
        model: ""
      }
    }
  });

  function getStorageArea() {
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }

    throw new Error("chrome.storage.local is unavailable");
  }

  function setLocal(items) {
    return new Promise((resolve, reject) => {
      try {
        getStorageArea().set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function getLocal(keys) {
    return new Promise((resolve, reject) => {
      try {
        getStorageArea().get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve(result || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function removeLocal(keys) {
    return new Promise((resolve, reject) => {
      try {
        getStorageArea().remove(keys, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function assertObjectPayload(value, fieldName) {
    if (value && typeof value === "object") {
      return;
    }

    throw new Error("Invalid " + fieldName + " payload");
  }

  async function savePageSnapshot(snapshot) {
    assertObjectPayload(snapshot, "snapshot");

    await setLocal({
      [STORAGE_KEYS.PAGE_SNAPSHOT]: snapshot,
      [STORAGE_KEYS.LAST_PAGE_SNAPSHOT]: snapshot
    });

    return snapshot;
  }

  async function saveLastPageSnapshot(snapshot) {
    return savePageSnapshot(snapshot);
  }

  async function saveJobPosting(jobPosting) {
    assertObjectPayload(jobPosting, "jobPosting");

    await setLocal({ [STORAGE_KEYS.JOB_POSTING]: jobPosting });
    return jobPosting;
  }

  async function saveParserArtifacts(pageSnapshot, jobPosting) {
    assertObjectPayload(pageSnapshot, "pageSnapshot");
    assertObjectPayload(jobPosting, "jobPosting");

    await setLocal({
      [STORAGE_KEYS.PAGE_SNAPSHOT]: pageSnapshot,
      [STORAGE_KEYS.LAST_PAGE_SNAPSHOT]: pageSnapshot,
      [STORAGE_KEYS.JOB_POSTING]: jobPosting
    });

    return { pageSnapshot: pageSnapshot, jobPosting: jobPosting };
  }

  async function getPageSnapshot() {
    const result = await getLocal([STORAGE_KEYS.PAGE_SNAPSHOT, STORAGE_KEYS.LAST_PAGE_SNAPSHOT]);

    return result[STORAGE_KEYS.PAGE_SNAPSHOT] || result[STORAGE_KEYS.LAST_PAGE_SNAPSHOT] || null;
  }

  async function getLastPageSnapshot() {
    return getPageSnapshot();
  }

  async function getJobPosting() {
    const result = await getLocal([STORAGE_KEYS.JOB_POSTING]);
    return result[STORAGE_KEYS.JOB_POSTING] || null;
  }

  async function getJobData() {
    const result = await getLocal([STORAGE_KEYS.JOB_DATA, STORAGE_KEYS.JOB_POSTING]);
    return result[STORAGE_KEYS.JOB_DATA] || result[STORAGE_KEYS.JOB_POSTING] || null;
  }

  async function setJobData(jobData) {
    assertObjectPayload(jobData, "jobData");
    await setLocal({ [STORAGE_KEYS.JOB_DATA]: jobData });
    return jobData;
  }

  async function getSettings() {
    const result = await getLocal([STORAGE_KEYS.EXTENSION_SETTINGS]);
    const stored = result[STORAGE_KEYS.EXTENSION_SETTINGS];

    if (stored && typeof stored === "object") {
      return {
        ...DEFAULT_SETTINGS,
        ...stored
      };
    }

    return { ...DEFAULT_SETTINGS };
  }

  async function setSettings(settings) {
    if (settings && typeof settings === "object") {
      const merged = {
        ...(await getSettings()),
        ...settings
      };

      await setLocal({ [STORAGE_KEYS.EXTENSION_SETTINGS]: merged });
      return merged;
    }

    throw new Error("Invalid settings payload");
  }

  async function clearStoredArtifacts() {
    await removeLocal([
      STORAGE_KEYS.PAGE_SNAPSHOT,
      STORAGE_KEYS.LAST_PAGE_SNAPSHOT,
      STORAGE_KEYS.JOB_POSTING,
      STORAGE_KEYS.JOB_DATA
    ]);
  }

  async function clearLastPageSnapshot() {
    await removeLocal([STORAGE_KEYS.PAGE_SNAPSHOT, STORAGE_KEYS.LAST_PAGE_SNAPSHOT]);
  }

  const api = Object.freeze({
    STORAGE_KEYS: STORAGE_KEYS,
    savePageSnapshot: savePageSnapshot,
    saveLastPageSnapshot: saveLastPageSnapshot,
    saveJobPosting: saveJobPosting,
    saveParserArtifacts: saveParserArtifacts,
    getPageSnapshot: getPageSnapshot,
    getLastPageSnapshot: getLastPageSnapshot,
    getJobPosting: getJobPosting,
    getJobData: getJobData,
    setJobData: setJobData,
    getSettings: getSettings,
    setSettings: setSettings,
    clearStoredArtifacts: clearStoredArtifacts,
    clearLastPageSnapshot: clearLastPageSnapshot
  });

  global.Stage3Storage = api;
  global.Stage5Storage = api;
})(globalThis);
