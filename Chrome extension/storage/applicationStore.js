(function attachStage6ApplicationStore(global) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    APPLICATION_RECORDS: "applicationRecords"
  });

  const ALLOWED_STATUS = new Set([
    "saved",
    "to_apply",
    "draft",
    "applied",
    "interviewing",
    "offer",
    "accepted",
    "rejected",
    "withdrawn",
    "draft_prepared",
    "form_filled",
    "resume_uploaded",
    "ready_to_submit",
    "failed",
    "submitted"
  ]);
  const ALLOWED_MODE = new Set(["prepare-only", "manual", "imported"]);

  let memoryRecords = [];

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

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  function normalizeApplicationDeadline(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const text = cleanString(value);
    if (!text) {
      return null;
    }

    if (text.toLowerCase() === "not disclosed" || text.toLowerCase() === "null" || text.toLowerCase() === "none") {
      return null;
    }

    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      return new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))).toISOString();
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  function getStorageArea() {
    if (!global.chrome || !chrome.storage || !chrome.storage.local) {
      return null;
    }

    return chrome.storage.local;
  }

  function setLocal(items) {
    const storage = getStorageArea();
    if (!storage) {
      if (Object.prototype.hasOwnProperty.call(items, STORAGE_KEYS.APPLICATION_RECORDS)) {
        const next = items[STORAGE_KEYS.APPLICATION_RECORDS];
        memoryRecords = Array.isArray(next) ? next : [];
      }
      return Promise.resolve();
    }

    return new Promise(function wrap(resolve, reject) {
      storage.set(items, function onSet() {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function getLocal(key) {
    const storage = getStorageArea();
    if (!storage) {
      return Promise.resolve(memoryRecords);
    }

    return new Promise(function wrap(resolve, reject) {
      storage.get([key], function onGet(result) {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result ? result[key] : undefined);
      });
    });
  }

  function normalizeStringList(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(function mapItem(item) {
      return cleanString(item);
    }).filter(Boolean);
  }

  function normalizePreSubmitCheck(value) {
    const raw = value && typeof value === "object" ? value : {};

    return {
      ok: Boolean(raw.ok),
      canSubmit: Boolean(raw.canSubmit !== undefined ? raw.canSubmit : raw.ok),
      missingRequiredFields: normalizeStringList(raw.missingRequiredFields),
      unknownRequiredFields: normalizeStringList(raw.unknownRequiredFields),
      pageValidationErrors: normalizeStringList(raw.pageValidationErrors),
      warnings: normalizeStringList(raw.warnings)
    };
  }

  function normalizeRecord(input) {
    if (!input || typeof input !== "object") {
      return null;
    }

    const value = input;
    const applicationId = cleanString(value.applicationId);
    const statusInput = cleanString(value.status);
    let statusRaw = statusInput;
    if (statusInput === "submitted") {
      statusRaw = "applied";
    } else if (statusInput === "draft_prepared") {
      statusRaw = "draft";
    } else if (statusInput === "form_filled" || statusInput === "resume_uploaded" || statusInput === "ready_to_submit") {
      statusRaw = "to_apply";
    } else if (statusInput === "failed") {
      statusRaw = "draft";
    }
    const modeRaw = cleanString(value.mode) || "prepare-only";

    if (!applicationId || !ALLOWED_STATUS.has(statusRaw) || !ALLOWED_MODE.has(modeRaw)) {
      return null;
    }

    const createdAt = toIsoString(value.createdAt);
    const updatedAt = toIsoString(value.updatedAt || value.createdAt);
    const appliedAt = cleanString(value.appliedAt) ? toIsoString(value.appliedAt) : undefined;
    const lastActivityAt = cleanString(value.lastActivityAt) ? toIsoString(value.lastActivityAt) : updatedAt;
    const formFieldCount = Number(value.formFieldCount);
    const filledFieldCount = Number(value.filledFieldCount);

    return {
      applicationId: applicationId,
      jobId: cleanString(value.jobId) || undefined,
      jobTitle: cleanString(value.jobTitle) || cleanString(value.role) || undefined,
      resumeId: cleanString(value.resumeId) || undefined,
      resumeVersionId: cleanString(value.resumeVersionId) || undefined,
      resumeVersion: cleanString(value.resumeVersion) || cleanString(value.resumeVersionId) || undefined,
      company: cleanString(value.company) || undefined,
      role: cleanString(value.role) || cleanString(value.jobTitle) || undefined,
      createdAt: createdAt,
      appliedAt: appliedAt,
      applicationDeadline: normalizeApplicationDeadline(value.applicationDeadline || value.deadline),
      updatedAt: updatedAt,
      lastActivityAt: lastActivityAt,
      jobUrl: cleanString(value.jobUrl) || undefined,
      sourceSite: cleanString(value.sourceSite) || "unknown",
      status: statusRaw,
      mode: modeRaw,
      formFieldCount: Number.isFinite(formFieldCount) ? formFieldCount : 0,
      filledFieldCount: Number.isFinite(filledFieldCount) ? filledFieldCount : 0,
      preSubmitCheck: normalizePreSubmitCheck(value.preSubmitCheck),
      notes: cleanString(value.notes) || undefined,
      reflection: cleanString(value.reflection) || undefined,
      source: cleanString(value.source) || undefined,
      sourceType: cleanString(value.sourceType) || undefined
    };
  }

  function sortByUpdatedAtDesc(records) {
    return records.slice().sort(function sorter(a, b) {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  }

  async function listApplicationRecords() {
    const raw = await getLocal(STORAGE_KEYS.APPLICATION_RECORDS);
    const list = Array.isArray(raw) ? raw : [];

    const normalized = list.map(function mapRecord(item) {
      return normalizeRecord(item);
    }).filter(Boolean);

    return sortByUpdatedAtDesc(normalized);
  }

  async function saveApplicationRecord(record) {
    const normalized = normalizeRecord(record);
    if (!normalized) {
      throw new Error("Invalid application record payload");
    }

    const current = await listApplicationRecords();
    const next = current.concat(normalized);
    await setLocal({
      [STORAGE_KEYS.APPLICATION_RECORDS]: next
    });

    return normalized;
  }

  async function getLatestApplicationRecord() {
    const records = await listApplicationRecords();
    return records[0] || null;
  }

  global.Stage6ApplicationStore = Object.freeze({
    saveApplicationRecord: saveApplicationRecord,
    getLatestApplicationRecord: getLatestApplicationRecord,
    listApplicationRecords: listApplicationRecords
  });
})(globalThis);
