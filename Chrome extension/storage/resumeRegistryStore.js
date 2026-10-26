(function attachStage6ResumeRegistryStorage(global) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    COMPILED_RESUME_REGISTRY: "compiledResumeRegistry",
    COMPILED_RESUME_BLOB_PREFIX: "compiledResumeBlob:"
  });

  const RESUME_ID_PREFIX = "resume-";
  const RESUME_ID_WIDTH = 4;

  function cleanString(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim();
  }

  function toIsoString(value) {
    const text = cleanString(value);
    if (!text) {
      return new Date().toISOString();
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString();
    }

    return date.toISOString();
  }

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
          if (chrome.runtime && chrome.runtime.lastError) {
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
          if (chrome.runtime && chrome.runtime.lastError) {
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

  function parseResumeIdNumber(resumeId) {
    const match = cleanString(resumeId).match(/^resume-(\d+)$/i);
    if (!match) {
      return 0;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function buildResumeId(index) {
    const safe = Math.max(1, Math.floor(index || 0));
    return RESUME_ID_PREFIX + String(safe).padStart(RESUME_ID_WIDTH, "0");
  }

  function buildNextResumeId(records) {
    let maxValue = 0;

    for (let index = 0; index < records.length; index += 1) {
      maxValue = Math.max(maxValue, parseResumeIdNumber(records[index].resumeId));
    }

    return buildResumeId(maxValue + 1);
  }

  function normalizeRecord(input) {
    if (!input || typeof input !== "object") {
      return null;
    }

    const resumeId = cleanString(input.resumeId);
    const versionId = cleanString(input.versionId);
    const fileName = cleanString(input.fileName);
    const displayName = cleanString(input.displayName) || fileName;
    const storageKey = cleanString(input.storageKey);

    if (!resumeId || !versionId || !fileName || !storageKey) {
      return null;
    }

    return {
      resumeId: resumeId,
      versionId: versionId,
      fileName: fileName,
      displayName: displayName,
      createdAt: toIsoString(input.createdAt),
      jobId: cleanString(input.jobId) || undefined,
      company: cleanString(input.company) || undefined,
      role: cleanString(input.role) || undefined,
      mimeType: cleanString(input.mimeType) || "application/octet-stream",
      storageKey: storageKey,
      isLatest: Boolean(input.isLatest)
    };
  }

  function compareRecords(a, b) {
    const idDiff = parseResumeIdNumber(a.resumeId) - parseResumeIdNumber(b.resumeId);
    if (idDiff !== 0) {
      return idDiff;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  function normalizeLatestFlags(records) {
    if (!Array.isArray(records) || !records.length) {
      return [];
    }

    const sorted = records.slice().sort(compareRecords);
    const latestResumeId = sorted[sorted.length - 1].resumeId;

    return sorted.map((record) => ({
      ...record,
      isLatest: record.resumeId === latestResumeId
    }));
  }

  async function listCompiledResumeRecords() {
    const result = await getLocal([STORAGE_KEYS.COMPILED_RESUME_REGISTRY]);
    const list = Array.isArray(result[STORAGE_KEYS.COMPILED_RESUME_REGISTRY])
      ? result[STORAGE_KEYS.COMPILED_RESUME_REGISTRY]
      : [];

    const normalized = list
      .map((item) => normalizeRecord(item))
      .filter((item) => Boolean(item));

    return normalizeLatestFlags(normalized);
  }

  async function saveCompiledResumeRecord(input) {
    if (!input || typeof input !== "object") {
      throw new Error("Invalid compiled resume record payload");
    }

    const fileName = cleanString(input.fileName);
    const mimeType = cleanString(input.mimeType);

    if (!fileName) {
      throw new Error("fileName is required");
    }

    if (!mimeType) {
      throw new Error("mimeType is required");
    }

    const records = await listCompiledResumeRecords();
    const resumeId = cleanString(input.resumeId) || buildNextResumeId(records);
    const versionId = cleanString(input.versionId) || "v-" + String(Date.now());
    const createdAt = toIsoString(input.createdAt);
    const storageKey = cleanString(input.storageKey) || STORAGE_KEYS.COMPILED_RESUME_BLOB_PREFIX + resumeId + ":" + versionId;

    const dataBase64 = cleanString(input.dataBase64);
    if (dataBase64) {
      await setLocal({
        [storageKey]: {
          dataBase64: dataBase64,
          fileName: fileName,
          mimeType: mimeType,
          createdAt: createdAt
        }
      });
    }

    const newRecord = {
      resumeId: resumeId,
      versionId: versionId,
      fileName: fileName,
      displayName: cleanString(input.displayName) || fileName,
      createdAt: createdAt,
      jobId: cleanString(input.jobId) || undefined,
      company: cleanString(input.company) || undefined,
      role: cleanString(input.role) || undefined,
      mimeType: mimeType,
      storageKey: storageKey,
      isLatest: input.isLatest !== false
    };

    const nextRecords = normalizeLatestFlags(
      records
        .map((record) => ({
          ...record,
          isLatest: false
        }))
        .concat(newRecord)
    );

    await setLocal({
      [STORAGE_KEYS.COMPILED_RESUME_REGISTRY]: nextRecords
    });

    const saved = nextRecords.find((record) => record.resumeId === newRecord.resumeId);
    return saved || newRecord;
  }

  async function getCompiledResumeById(resumeId) {
    const id = cleanString(resumeId);
    if (!id) {
      return null;
    }

    const records = await listCompiledResumeRecords();
    return records.find((record) => record.resumeId === id) || null;
  }

  async function getLatestCompiledResumeRecord() {
    const records = await listCompiledResumeRecords();
    if (!records.length) {
      return null;
    }

    const latest = records.find((record) => record.isLatest);
    if (latest) {
      return latest;
    }

    return records.slice().sort(compareRecords)[records.length - 1] || null;
  }

  async function getCompiledResumeBlobData(storageKey) {
    const key = cleanString(storageKey);
    if (!key) {
      return null;
    }

    const result = await getLocal([key]);
    const raw = result[key];

    if (!raw || typeof raw !== "object") {
      return null;
    }

    const dataBase64 = cleanString(raw.dataBase64);
    if (!dataBase64) {
      return null;
    }

    return {
      dataBase64: dataBase64,
      fileName: cleanString(raw.fileName) || "compiled-resume.bin",
      mimeType: cleanString(raw.mimeType) || "application/octet-stream",
      createdAt: toIsoString(raw.createdAt)
    };
  }

  const api = Object.freeze({
    saveCompiledResumeRecord: saveCompiledResumeRecord,
    listCompiledResumeRecords: listCompiledResumeRecords,
    getLatestCompiledResumeRecord: getLatestCompiledResumeRecord,
    getCompiledResumeById: getCompiledResumeById,
    getCompiledResumeBlobData: getCompiledResumeBlobData
  });

  global.Stage6ResumeRegistryStorage = api;
})(globalThis);
