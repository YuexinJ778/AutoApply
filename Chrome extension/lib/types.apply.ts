export interface FormField {
  id?: string;
  name?: string;
  label?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  selector?: string;
  options?: string[];
  value?: string;
}

export interface FieldFillResult {
  fieldKey: string;
  fieldId?: string;
  fieldLabel?: string;
  status: "filled" | "skipped" | "error" | "failed";
  value?: string;
  valuePreview?: string;
  reason?: string;
  errorMessage?: string;
}

export interface ApplyProfile {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  workAuthorization?: string;
  requiresSponsorship?: string;
  password?: string;
  legalFirstName?: string;
  legalLastName?: string;
  preferredFirstName?: string;
  chineseFirstName?: string;
  chineseLastName?: string;
  internationalCallingCode?: string;
  preferredContactNumber?: string;
  hasRelativesAtHsbc?: string;
  relativesDetails?: string;
  isFormerEmployeeOrContractor?: string;
  employeeIdOrContractorInfo?: string;
}

export interface CompiledResumeRecord {
  resumeId: string;
  versionId: string;
  fileName: string;
  displayName: string;
  createdAt: string;
  jobId?: string;
  company?: string;
  role?: string;
  mimeType: string;
  storageKey: string;
  isLatest: boolean;
}

export interface ResumeUploadResult {
  ok: boolean;
  message: string;
  resumeId?: string;
  fileName?: string;
  reason?: string;
}

export interface PreSubmitCheck {
  ok: boolean;
  canSubmit?: boolean;
  missingRequiredFields: string[];
  unknownRequiredFields?: string[];
  pageValidationErrors?: string[];
  warnings: string[];
}

export type ApplicationStatus =
  | "saved"
  | "to_apply"
  | "draft"
  | "applied"
  | "interviewing"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "draft_prepared"
  | "form_filled"
  | "resume_uploaded"
  | "ready_to_submit"
  | "failed"
  | "submitted";

export type ApplicationMode = "prepare-only" | "manual" | "imported";

export interface ApplicationRecord {
  applicationId: string;
  jobTitle?: string;
  jobId?: string;
  resumeId?: string;
  resumeVersionId?: string;
  resumeVersion?: string;
  company?: string;
  role?: string;
  createdAt: string;
  appliedAt?: string;
  applicationDeadline?: string | null;
  updatedAt: string;
  lastActivityAt?: string;
  jobUrl?: string;
  sourceSite?: string;
  status: ApplicationStatus;
  mode: ApplicationMode;
  formFieldCount: number;
  filledFieldCount: number;
  preSubmitCheck: PreSubmitCheck;
  notes?: string;
  reflection?: string;
  source?: string;
  sourceType?: string;
}

export interface ApplyExecutionResult {
  ok: boolean;
  message: string;
  mode?: ApplicationMode;
  applicationId?: string;
  status?: ApplicationStatus;
  resumeId?: string;
  jobId?: string;
  errors?: string[];
  warnings?: string[];
  uploadSummary?: {
    ok: boolean;
    resumeId?: string;
    fileName?: string;
    reason?: string;
    message?: string;
  };
  validationSummary?: {
    canSubmit: boolean;
    missingRequiredFields: string[];
    unknownRequiredFields: string[];
    pageValidationErrors: string[];
  };
  recordSummary?: {
    saved: boolean;
    applicationId?: string;
    status?: ApplicationStatus;
    errorMessage?: string;
  };
  formFields: FormField[];
  fillResults: FieldFillResult[];
  preSubmitCheck: PreSubmitCheck;
  uploadResult?: ResumeUploadResult;
  applicationRecord?: ApplicationRecord;
}
