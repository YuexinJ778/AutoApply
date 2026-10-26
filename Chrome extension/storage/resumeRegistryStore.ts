import type { CompiledResumeRecord } from "../lib/types.apply";

declare const chrome: any;

const STORAGE_KEYS = Object.freeze({
  COMPILED_RESUME_REGISTRY: "compiledResumeRegistry",
  COMPILED_RESUME_BLOB_PREFIX: "compiledResumeBlob:"
});

const RESUME_ID_PREFIX = "resume-";
const RESUME_ID_WIDTH = 4;

export interface CompiledResumeBlobData {
  dataBase64: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

export interface SaveCompiledResumeRecordInput {
  resumeId?: string;
  versionId?: string;
  fileName: string;
  displayName?: string;
  createdAt?: string;
  jobId?: string;
  company?: string;
  role?: string;
  mimeType: string;
  storageKey?: string;
  isLatest?: boolean;
  dataBase64?: string;
}

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

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function getStorageArea() {
  if (!chrome?.storage?.local) {
    throw new Error("chrome.storage.local is unavailable");
  }

  return chrome.storage.local;
}

function setLocal(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    getStorageArea().set(items, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getLocal<T = unknown>(keys: string | string[]): Promise<Record<string, T>> {
  return new Promise((resolve, reject) => {
    getStorageArea().get(keys, (result: Record<string, T>) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result || {});
    });
  });
}

function parseResumeIdNumber(resumeId: string): number {
  const match = cleanString(resumeId).match(/^resume-(\d+)$/i);
  if (!match) {
    return 0;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildResumeId(index: number): string {
  const safe = Math.max(1, Math.floor(index));
  return `${RESUME_ID_PREFIX}${String(safe).padStart(RESUME_ID_WIDTH, "0")}`;
}

function buildNextResumeId(records: CompiledResumeRecord[]): string {
  let maxValue = 0;
  for (const record of records) {
    maxValue = Math.max(maxValue, parseResumeIdNumber(record.resumeId));
  }

  return buildResumeId(maxValue + 1);
}

function normalizeRecord(input: unknown): CompiledResumeRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const value = input as Record<string, unknown>;
  const resumeId = cleanString(value.resumeId);
  const versionId = cleanString(value.versionId);
  const fileName = cleanString(value.fileName);
  const displayName = cleanString(value.displayName) || fileName;
  const mimeType = cleanString(value.mimeType) || "application/octet-stream";
  const storageKey = cleanString(value.storageKey);

  if (!resumeId || !versionId || !fileName || !storageKey) {
    return null;
  }

  return {
    resumeId,
    versionId,
    fileName,
    displayName,
    createdAt: toIsoString(value.createdAt),
    jobId: cleanString(value.jobId) || undefined,
    company: cleanString(value.company) || undefined,
    role: cleanString(value.role) || undefined,
    mimeType,
    storageKey,
    isLatest: Boolean(value.isLatest)
  };
}

function compareRecords(a: CompiledResumeRecord, b: CompiledResumeRecord): number {
  const idDiff = parseResumeIdNumber(a.resumeId) - parseResumeIdNumber(b.resumeId);
  if (idDiff !== 0) {
    return idDiff;
  }

  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function normalizeLatestFlags(records: CompiledResumeRecord[]): CompiledResumeRecord[] {
  if (!records.length) {
    return [];
  }

  const sorted = [...records].sort(compareRecords);
  const latestResumeId = sorted[sorted.length - 1].resumeId;

  return sorted.map((record) => ({
    ...record,
    isLatest: record.resumeId === latestResumeId
  }));
}

export async function listCompiledResumeRecords(): Promise<CompiledResumeRecord[]> {
  const result = await getLocal<unknown>([STORAGE_KEYS.COMPILED_RESUME_REGISTRY]);
  const raw = result[STORAGE_KEYS.COMPILED_RESUME_REGISTRY];
  const list = Array.isArray(raw) ? raw : [];

  const normalized = list
    .map((item) => normalizeRecord(item))
    .filter((item): item is CompiledResumeRecord => Boolean(item));

  return normalizeLatestFlags(normalized);
}

export async function saveCompiledResumeRecord(
  input: SaveCompiledResumeRecordInput
): Promise<CompiledResumeRecord> {
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
  const versionId = cleanString(input.versionId) || `v-${Date.now()}`;
  const createdAt = toIsoString(input.createdAt);
  const storageKey =
    cleanString(input.storageKey) || `${STORAGE_KEYS.COMPILED_RESUME_BLOB_PREFIX}${resumeId}:${versionId}`;

  if (cleanString(input.dataBase64)) {
    const blobPayload: CompiledResumeBlobData = {
      dataBase64: cleanString(input.dataBase64),
      fileName,
      mimeType,
      createdAt
    };

    await setLocal({ [storageKey]: blobPayload });
  }

  const newRecord: CompiledResumeRecord = {
    resumeId,
    versionId,
    fileName,
    displayName: cleanString(input.displayName) || fileName,
    createdAt,
    jobId: cleanString(input.jobId) || undefined,
    company: cleanString(input.company) || undefined,
    role: cleanString(input.role) || undefined,
    mimeType,
    storageKey,
    isLatest: input.isLatest !== false
  };

  const nextRecords = normalizeLatestFlags([
    ...records.map((record) => ({ ...record, isLatest: false })),
    newRecord
  ]);

  await setLocal({ [STORAGE_KEYS.COMPILED_RESUME_REGISTRY]: nextRecords });
  return nextRecords.find((record) => record.resumeId === newRecord.resumeId) || newRecord;
}

export async function getCompiledResumeById(resumeId: string): Promise<CompiledResumeRecord | null> {
  const id = cleanString(resumeId);
  if (!id) {
    return null;
  }

  const records = await listCompiledResumeRecords();
  return records.find((record) => record.resumeId === id) || null;
}

export async function getLatestCompiledResumeRecord(): Promise<CompiledResumeRecord | null> {
  const records = await listCompiledResumeRecords();
  if (!records.length) {
    return null;
  }

  const latest = records.find((record) => record.isLatest);
  if (latest) {
    return latest;
  }

  return [...records].sort(compareRecords)[records.length - 1] || null;
}

export async function getCompiledResumeBlobData(storageKey: string): Promise<CompiledResumeBlobData | null> {
  const key = cleanString(storageKey);
  if (!key) {
    return null;
  }

  const result = await getLocal<unknown>([key]);
  const raw = result[key] as Record<string, unknown> | undefined;

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const dataBase64 = cleanString(raw.dataBase64);
  if (!dataBase64) {
    return null;
  }

  return {
    dataBase64,
    fileName: cleanString(raw.fileName) || "compiled-resume.bin",
    mimeType: cleanString(raw.mimeType) || "application/octet-stream",
    createdAt: toIsoString(raw.createdAt)
  };
}
