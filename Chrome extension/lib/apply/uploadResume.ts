import type { ResumeUploadResult } from "../types.apply";
import {
  getCompiledResumeBlobData,
  getCompiledResumeById,
  getLatestCompiledResumeRecord
} from "../../storage/resumeRegistryStore";

export interface UploadResumeInput {
  resumeId?: string;
  selector?: string;
}

export interface UploadResumeResult extends ResumeUploadResult {
  selector?: string;
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function base64ToUint8Array(base64: string): Uint8Array {
  const decoded = atob(base64);
  const output = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    output[index] = decoded.charCodeAt(index);
  }

  return output;
}

function resolveUploadInput(selector?: string): HTMLInputElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const preferredSelector = cleanString(selector);
  if (preferredSelector) {
    const preferred = document.querySelector(preferredSelector);
    if (preferred instanceof HTMLInputElement && preferred.type === "file") {
      return preferred;
    }
  }

  const candidates = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  for (const input of candidates) {
    if (!input.disabled) {
      return input;
    }
  }

  return candidates[0] || null;
}

function setInputFiles(input: HTMLInputElement, files: FileList): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
  const setter = descriptor?.set;

  if (typeof setter === "function") {
    setter.call(input, files);
    return;
  }

  Object.defineProperty(input, "files", {
    configurable: true,
    enumerable: true,
    writable: false,
    value: files
  });
}

function triggerUploadEvents(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

export async function uploadResume(input: UploadResumeInput = {}): Promise<UploadResumeResult> {
  const uploadInput = resolveUploadInput(input.selector);
  if (!uploadInput) {
    return {
      ok: false,
      message: "No file input found on current page.",
      reason: "FILE_INPUT_NOT_FOUND"
    };
  }

  try {
    const record = cleanString(input.resumeId)
      ? await getCompiledResumeById(cleanString(input.resumeId))
      : await getLatestCompiledResumeRecord();

    if (!record) {
      return {
        ok: false,
        message: "No compiled resume available in local registry.",
        reason: cleanString(input.resumeId) ? "RESUME_ID_NOT_FOUND" : "NO_COMPILED_RESUME_AVAILABLE"
      };
    }

    const blobData = await getCompiledResumeBlobData(record.storageKey);
    if (!blobData) {
      return {
        ok: false,
        message: `Compiled resume payload missing for ${record.resumeId}.`,
        resumeId: record.resumeId,
        fileName: record.fileName,
        reason: "RESUME_PAYLOAD_NOT_FOUND"
      };
    }

    if (typeof DataTransfer === "undefined") {
      return {
        ok: false,
        message: "DataTransfer API is unavailable on current page.",
        resumeId: record.resumeId,
        fileName: record.fileName,
        reason: "DATATRANSFER_UNAVAILABLE"
      };
    }

    const fileBytes = base64ToUint8Array(blobData.dataBase64);
    const file = new File([fileBytes], record.fileName, {
      type: record.mimeType || blobData.mimeType || "application/octet-stream",
      lastModified: Date.parse(record.createdAt) || Date.now()
    });

    const transfer = new DataTransfer();
    transfer.items.add(file);

    try {
      setInputFiles(uploadInput, transfer.files);
      triggerUploadEvents(uploadInput);

      return {
        ok: true,
        message: `Resume uploaded from registry: ${record.resumeId}`,
        resumeId: record.resumeId,
        fileName: record.fileName,
        selector: uploadInput.id ? `#${uploadInput.id}` : "input[type=file]"
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        resumeId: record.resumeId,
        fileName: record.fileName,
        reason: "UPLOAD_INJECTION_FAILED"
      };
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      reason: "REGISTRY_ACCESS_FAILED"
    };
  }
}
