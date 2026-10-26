import type {
  ApplicationMode,
  ApplicationRecord,
  ApplicationStatus,
  CompiledResumeRecord,
  FieldFillResult,
  FormField,
  PreSubmitCheck,
  ResumeUploadResult
} from "../types.apply";

export interface BuildApplicationRecordInput {
  applicationId?: string;
  jobId?: string;
  resumeRecord?: CompiledResumeRecord | null;
  uploadResult?: ResumeUploadResult;
  company?: string;
  role?: string;
  jobUrl?: string;
  sourceSite?: string;
  mode?: ApplicationMode;
  formFields?: FormField[];
  fillResults?: FieldFillResult[];
  preSubmitCheck?: PreSubmitCheck;
}

const DEFAULT_PRE_SUBMIT_CHECK: PreSubmitCheck = {
  ok: false,
  canSubmit: false,
  missingRequiredFields: [],
  unknownRequiredFields: [],
  pageValidationErrors: [],
  warnings: ["Stage 6A Step 0 stub: pre-submit check not run"]
};

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function inferSourceSite(jobUrl: string): string {
  const rawUrl = cleanString(jobUrl);
  if (!rawUrl) {
    return "unknown";
  }

  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (hostname.includes("greenhouse")) {
      return "greenhouse";
    }
    if (hostname.includes("lever")) {
      return "lever";
    }
    if (hostname.includes("workday")) {
      return "workday";
    }
    if (hostname.includes("linkedin")) {
      return "linkedin";
    }
    return hostname;
  } catch {
    return "unknown";
  }
}

function deriveStatus(input: BuildApplicationRecordInput): ApplicationStatus {
  const fillResults = input.fillResults || [];
  const preSubmitCheck = input.preSubmitCheck || DEFAULT_PRE_SUBMIT_CHECK;
  const uploadResult = input.uploadResult;

  const canSubmit = Boolean(preSubmitCheck.canSubmit ?? preSubmitCheck.ok);
  const filledCount = fillResults.filter((result) => result.status === "filled").length;
  const fillErrorCount = fillResults.filter((result) => result.status === "error" || result.status === "failed").length;

  if (canSubmit) {
    return "ready_to_submit";
  }
  if (fillErrorCount > 0 || (uploadResult && !uploadResult.ok)) {
    return "failed";
  }
  if (uploadResult?.ok) {
    return "resume_uploaded";
  }
  if (filledCount > 0) {
    return "form_filled";
  }

  return "draft_prepared";
}

function deriveApplicationId(value?: string): string {
  const normalized = cleanString(value);
  if (normalized) {
    return normalized;
  }

  return `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveJobId(input: BuildApplicationRecordInput): string | undefined {
  const jobId = cleanString(input.jobId);
  if (jobId) {
    return jobId;
  }

  const fromResume = cleanString(input.resumeRecord?.jobId);
  if (fromResume) {
    return fromResume;
  }

  const jobUrl = cleanString(input.jobUrl);
  if (!jobUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(jobUrl);
    const queryKeys = ["jobId", "job_id", "jid", "gh_jid", "id"];
    for (const key of queryKeys) {
      const value = cleanString(parsed.searchParams.get(key));
      if (value) {
        return value;
      }
    }

    const segments = parsed.pathname.split("/").map((segment) => cleanString(segment)).filter(Boolean);
    return segments[segments.length - 1] || undefined;
  } catch {
    return undefined;
  }
}

export function buildApplicationRecord(input: BuildApplicationRecordInput = {}): ApplicationRecord {
  const formFields = input.formFields || [];
  const fillResults = input.fillResults || [];
  const preSubmitCheck = input.preSubmitCheck || DEFAULT_PRE_SUBMIT_CHECK;
  const createdAt = new Date().toISOString();
  const resumeRecord = input.resumeRecord || null;
  const jobUrl = cleanString(input.jobUrl);

  return {
    applicationId: deriveApplicationId(input.applicationId),
    jobId: deriveJobId({ ...input, jobUrl }),
    resumeId: cleanString(input.uploadResult?.resumeId) || cleanString(resumeRecord?.resumeId) || undefined,
    resumeVersionId: cleanString(resumeRecord?.versionId) || undefined,
    company: cleanString(input.company) || cleanString(resumeRecord?.company) || undefined,
    role: cleanString(input.role) || cleanString(resumeRecord?.role) || undefined,
    createdAt,
    updatedAt: createdAt,
    jobUrl: jobUrl || undefined,
    sourceSite: cleanString(input.sourceSite) || inferSourceSite(jobUrl),
    status: deriveStatus(input),
    mode: input.mode || "prepare-only",
    formFieldCount: formFields.length,
    filledFieldCount: fillResults.filter((result) => result.status === "filled").length,
    preSubmitCheck
  };
}
