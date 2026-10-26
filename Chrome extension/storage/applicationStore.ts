import type { ApplicationRecord } from "../lib/types.apply";

declare const chrome: any;

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

let memoryRecords: ApplicationRecord[] = [];

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toIsoString(value: unknown): string {
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

function normalizeApplicationDeadline(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = cleanString(value);
  if (!text) {
    return null;
  }

  const normalizedText = text.toLowerCase();
  if (normalizedText === "not disclosed" || normalizedText === "null" || normalizedText === "none") {
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
  if (!chrome?.storage?.local) {
    return null;
  }

  return chrome.storage.local;
}

function setLocal(items: Record<string, unknown>): Promise<void> {
  const storage = getStorageArea();
  if (!storage) {
    if (Object.prototype.hasOwnProperty.call(items, STORAGE_KEYS.APPLICATION_RECORDS)) {
      const next = items[STORAGE_KEYS.APPLICATION_RECORDS];
      memoryRecords = Array.isArray(next) ? (next as ApplicationRecord[]) : [];
    }
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    storage.set(items, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getLocal<T = unknown>(key: string): Promise<T | undefined> {
  const storage = getStorageArea();
  if (!storage) {
    return Promise.resolve(memoryRecords as unknown as T);
  }

  return new Promise((resolve, reject) => {
    storage.get([key], (result: Record<string, T>) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result ? result[key] : undefined);
    });
  });
}

function normalizeRecord(input: unknown): ApplicationRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const value = input as Record<string, unknown>;
  const applicationId = cleanString(value.applicationId);
  const createdAt = toIsoString(value.createdAt);
  const updatedAt = toIsoString(value.updatedAt || value.createdAt);
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
  const status = statusRaw as ApplicationRecord["status"];
  const mode = modeRaw as ApplicationRecord["mode"];

  const preSubmitCheckRaw = value.preSubmitCheck as Record<string, unknown> | undefined;
  const preSubmitCheck = {
    ok: Boolean(preSubmitCheckRaw?.ok),
    canSubmit: Boolean(preSubmitCheckRaw?.canSubmit ?? preSubmitCheckRaw?.ok),
    missingRequiredFields: Array.isArray(preSubmitCheckRaw?.missingRequiredFields)
      ? preSubmitCheckRaw?.missingRequiredFields.map((item) => cleanString(item)).filter(Boolean)
      : [],
    unknownRequiredFields: Array.isArray(preSubmitCheckRaw?.unknownRequiredFields)
      ? preSubmitCheckRaw?.unknownRequiredFields.map((item) => cleanString(item)).filter(Boolean)
      : [],
    pageValidationErrors: Array.isArray(preSubmitCheckRaw?.pageValidationErrors)
      ? preSubmitCheckRaw?.pageValidationErrors.map((item) => cleanString(item)).filter(Boolean)
      : [],
    warnings: Array.isArray(preSubmitCheckRaw?.warnings)
      ? preSubmitCheckRaw?.warnings.map((item) => cleanString(item)).filter(Boolean)
      : []
  };
  const formFieldCount = Number(value.formFieldCount);
  const filledFieldCount = Number(value.filledFieldCount);

  return {
    applicationId,
    jobTitle: cleanString(value.jobTitle) || cleanString(value.role) || undefined,
    jobId: cleanString(value.jobId) || undefined,
    resumeId: cleanString(value.resumeId) || undefined,
    resumeVersionId: cleanString(value.resumeVersionId) || undefined,
    resumeVersion: cleanString(value.resumeVersion) || cleanString(value.resumeVersionId) || undefined,
    company: cleanString(value.company) || undefined,
    role: cleanString(value.role) || cleanString(value.jobTitle) || undefined,
    createdAt,
    appliedAt: cleanString(value.appliedAt) ? toIsoString(value.appliedAt) : undefined,
    applicationDeadline: normalizeApplicationDeadline(value.applicationDeadline || value.deadline),
    updatedAt,
    lastActivityAt: cleanString(value.lastActivityAt) ? toIsoString(value.lastActivityAt) : updatedAt,
    jobUrl: cleanString(value.jobUrl) || undefined,
    sourceSite: cleanString(value.sourceSite) || "unknown",
    status,
    mode,
    formFieldCount: Number.isFinite(formFieldCount) ? formFieldCount : 0,
    filledFieldCount: Number.isFinite(filledFieldCount) ? filledFieldCount : 0,
    preSubmitCheck,
    notes: cleanString(value.notes) || undefined,
    reflection: cleanString(value.reflection) || undefined,
    source: cleanString(value.source) || undefined,
    sourceType: cleanString(value.sourceType) || undefined
  };
}

function sortByTimeDesc(records: ApplicationRecord[]): ApplicationRecord[] {
  return [...records].sort((a, b) => {
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    return bTime - aTime;
  });
}

export async function saveApplicationRecord(record: ApplicationRecord): Promise<ApplicationRecord> {
  const normalized = normalizeRecord(record);
  if (!normalized) {
    throw new Error("Invalid application record payload");
  }

  const current = await listApplicationRecords();
  const next = [...current, normalized];
  await setLocal({ [STORAGE_KEYS.APPLICATION_RECORDS]: next });

  return normalized;
}

export async function getLatestApplicationRecord(): Promise<ApplicationRecord | null> {
  const records = await listApplicationRecords();
  return records[0] || null;
}

export async function listApplicationRecords(): Promise<ApplicationRecord[]> {
  const raw = await getLocal<unknown>(STORAGE_KEYS.APPLICATION_RECORDS);
  const list = Array.isArray(raw) ? raw : [];

  const normalized = list
    .map((item) => normalizeRecord(item))
    .filter((item): item is ApplicationRecord => Boolean(item));

  return sortByTimeDesc(normalized);
}

export async function clearApplicationRecord(): Promise<void> {
  memoryRecords = [];
  await setLocal({ [STORAGE_KEYS.APPLICATION_RECORDS]: [] });
}
