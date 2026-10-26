import { autofillSelectFields, autofillTextFields } from "../lib/apply/autofillFields";
import { buildApplicationRecord } from "../lib/apply/buildApplicationRecord";
import { mapFields, type FieldMapping } from "../lib/apply/mapFields";
import { detectHsbcPatch } from "../lib/apply/patches/hsbcPatch";
import { scanForm } from "../lib/apply/scanForm";
import { validateApplication } from "../lib/apply/validateApplication";
import { uploadResume, type UploadResumeResult } from "../lib/apply/uploadResume";
import { saveApplicationRecord } from "../storage/applicationStore";
import { getCompiledResumeById, getLatestCompiledResumeRecord } from "../storage/resumeRegistryStore";
import type {
  ApplicationRecord,
  ApplicationStatus,
  ApplyExecutionResult,
  FieldFillResult,
  FormField,
  PreSubmitCheck
} from "../lib/types.apply";

const PIPELINE_MODE = "prepare-only" as const;

const mockProfile = {
  name: "Test User",
  email: "test@example.com",
  password: "Test@12345",
  legalFirstName: "Test",
  legalLastName: "User",
  preferredFirstName: "",
  chineseFirstName: "",
  chineseLastName: "",
  internationalCallingCode: "+1",
  preferredContactNumber: "",
  hasRelativesAtHsbc: "No",
  relativesDetails: "",
  isFormerEmployeeOrContractor: "No",
  employeeIdOrContractorInfo: "",
  phone: "+1 555 123 4567",
  location: "New York, NY",
  linkedin: "https://www.linkedin.com/in/test-user",
  github: "https://github.com/test-user"
};

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return cleanString(String(error)) || "Unknown error";
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanString(value)).filter(Boolean)));
}

function createUploadFallback(message: string, reason: string): UploadResumeResult {
  return {
    ok: false,
    message,
    reason
  };
}

function createPreSubmitFallback(message: string): PreSubmitCheck {
  return {
    ok: false,
    canSubmit: false,
    missingRequiredFields: [],
    unknownRequiredFields: [],
    pageValidationErrors: [],
    warnings: [message]
  };
}

function logStepResult(step: string, ok: boolean, message: string): void {
  const marker = ok ? "OK" : "FAILED";
  console.log(`[applyRunner][${step}] ${marker}: ${message}`);
}

function logScanResult(formFields: FormField[]): void {
  if (!formFields.length) {
    console.log("[applyRunner] No form fields found (input/textarea/select).");
    return;
  }

  console.log(`[applyRunner] Scanned ${formFields.length} form fields.`);
  console.table(
    formFields.map((field, index) => ({
      index,
      id: field.id || "",
      type: field.type || "",
      label: field.label || "",
      name: field.name || "",
      required: Boolean(field.required),
      selector: field.selector || "",
      placeholder: field.placeholder || "",
      options: Array.isArray(field.options) ? field.options.join(" | ") : ""
    }))
  );
}

function logMappingResult(mappings: FieldMapping[]): void {
  if (!mappings.length) {
    console.log("[applyRunner] No fields available for mapping.");
    return;
  }

  const matchedCount = mappings.filter((mapping) => mapping.status === "matched").length;
  const unknownCount = mappings.filter((mapping) => mapping.status === "unknown").length;
  const skippedCount = mappings.filter((mapping) => mapping.status === "skipped").length;

  console.log(
    `[applyRunner] Mapping summary: matched=${matchedCount}, unknown=${unknownCount}, skipped=${skippedCount}`
  );
  console.table(
    mappings.map((mapping, index) => ({
      index,
      status: mapping.status,
      matchedKey: mapping.matchedKey || "",
      valuePreview: mapping.valuePreview || "",
      reason: mapping.reason || "",
      fieldType: mapping.field.type || "",
      fieldLabel: mapping.field.label || "",
      fieldName: mapping.field.name || "",
      selector: mapping.field.selector || ""
    }))
  );
}

function toFieldKey(field: FormField): string {
  return field.name || field.id || field.label || field.selector || "unknown";
}

function logAutofillResult(fillResults: FieldFillResult[]): void {
  if (!fillResults.length) {
    console.log("[applyRunner] No fields processed for autofill.");
    return;
  }

  const filledCount = fillResults.filter((result) => result.status === "filled").length;
  const skippedCount = fillResults.filter((result) => result.status === "skipped").length;
  const errorCount = fillResults.filter((result) => result.status === "error" || result.status === "failed").length;

  console.log(
    `[applyRunner] Autofill summary: filled=${filledCount}, skipped=${skippedCount}, error=${errorCount}`
  );
  console.table(
    fillResults.map((result, index) => ({
      index,
      status: result.status,
      fieldKey: result.fieldKey,
      fieldId: result.fieldId || "",
      fieldLabel: result.fieldLabel || "",
      valuePreview: result.valuePreview || "",
      reason: result.reason || "",
      errorMessage: result.errorMessage || ""
    }))
  );
}

function logHsbcPatchSummary(formFields: FormField[], mappings: FieldMapping[], fillResults: FieldFillResult[]): void {
  const detection = detectHsbcPatch(formFields, {
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
    pageTitle: typeof document !== "undefined" ? document.title : ""
  });
  const hsbcMappings = mappings.filter((mapping) => mapping.patchTag === "HSBC");
  console.log(
    `[applyRunner] HSBC patch detected=${detection.isDetected ? "true" : "false"}, signals=${detection.signals.join(" | ") || "(none)"}`
  );
  if (!detection.isDetected) {
    return;
  }
  if (!hsbcMappings.length) {
    console.warn("[applyRunner] HSBC patch detected but no HSBC-specific mapping matched.");
    return;
  }

  const rows = hsbcMappings.map((mapping) => {
    const fieldKey = toFieldKey(mapping.field);
    const fill = fillResults.find((result) => {
      const sameKey = result.fieldKey === fieldKey;
      const sameId = (result.fieldId || "") === (mapping.field.id || "");
      const sameLabel = (result.fieldLabel || "") === (mapping.field.label || "");
      return sameKey && (sameId || sameLabel || (!result.fieldId && !result.fieldLabel));
    });
    return {
      fieldLabel: mapping.field.label || "",
      fieldName: mapping.field.name || "",
      mappedTo: mapping.matchedKey || "",
      mappingStatus: mapping.status,
      mappingReason: mapping.reason || "",
      fillStatus: fill?.status || "",
      fillReason: fill?.reason || fill?.errorMessage || ""
    };
  });

  console.table(rows);
  const conditionalSkipCount = rows.filter((row) => row.fillReason.includes("CONDITIONAL_SKIP")).length;
  const unknownOrErrorCount = rows.filter((row) => row.mappingStatus === "unknown" || row.fillStatus === "error").length;
  console.log(
    `[applyRunner] HSBC summary: mapped=${rows.length}, conditional-skip=${conditionalSkipCount}, unknown-or-error=${unknownOrErrorCount}`
  );
}

function logUploadResult(uploadResult: UploadResumeResult): void {
  console.log(
    `[applyRunner] Upload summary: resumeId=${uploadResult.resumeId || "-"}, fileName=${uploadResult.fileName || "-"}, ok=${uploadResult.ok}, reason=${uploadResult.reason || "-"}`
  );

  if (!uploadResult.ok) {
    console.warn("[applyRunner] Resume upload failed", {
      reason: uploadResult.reason,
      message: uploadResult.message
    });
  }
}

function logValidationResult(preSubmitCheck: PreSubmitCheck): void {
  const canSubmit = Boolean(preSubmitCheck.canSubmit ?? preSubmitCheck.ok);
  const missingRequiredFields = preSubmitCheck.missingRequiredFields || [];
  const unknownRequiredFields = preSubmitCheck.unknownRequiredFields || [];
  const pageValidationErrors = preSubmitCheck.pageValidationErrors || [];

  console.log(`[applyRunner] Pre-submit validation: canSubmit=${canSubmit ? "true" : "false"}`);
  console.log(
    `[applyRunner] missingRequiredFields (${missingRequiredFields.length}): ${missingRequiredFields.length ? missingRequiredFields.join(" | ") : "(none)"}`
  );
  console.log(
    `[applyRunner] unknownRequiredFields (${unknownRequiredFields.length}): ${unknownRequiredFields.length ? unknownRequiredFields.join(" | ") : "(none)"}`
  );
  console.log(
    `[applyRunner] pageValidationErrors (${pageValidationErrors.length}): ${pageValidationErrors.length ? pageValidationErrors.join(" | ") : "(none)"}`
  );

  if (preSubmitCheck.warnings.length > 0) {
    console.warn("[applyRunner] Validation warnings:", preSubmitCheck.warnings);
  }
}

function getCurrentJobUrl(): string | undefined {
  if (typeof window === "undefined" || !window.location) {
    return undefined;
  }

  const url = cleanString(window.location.href);
  return url || undefined;
}

function getSourceSite(jobUrl?: string): string {
  const url = cleanString(jobUrl);
  if (!url) {
    return "unknown";
  }

  try {
    return new URL(url).hostname.toLowerCase() || "unknown";
  } catch {
    return "unknown";
  }
}

function parseTitleMetadata(): { company?: string; role?: string } {
  if (typeof document === "undefined") {
    return {};
  }

  const title = cleanString(document.title);
  if (!title) {
    return {};
  }

  if (title.includes("|")) {
    const [left, right] = title.split("|").map((item) => cleanString(item));
    return {
      role: left || undefined,
      company: right || undefined
    };
  }

  if (title.includes("-")) {
    const [left, right] = title.split("-").map((item) => cleanString(item));
    return {
      role: left || undefined,
      company: right || undefined
    };
  }

  return { role: title };
}

function logApplicationRecordResult(input: {
  applicationId?: string;
  status?: string;
  jobUrl?: string;
  resumeId?: string;
  saveOk: boolean;
  errorMessage?: string;
}): void {
  console.log(
    `[applyRunner] Application record: applicationId=${input.applicationId || "-"}, status=${input.status || "-"}, jobUrl=${input.jobUrl || "-"}, resumeId=${input.resumeId || "-"}, saved=${input.saveOk ? "true" : "false"}`
  );

  if (!input.saveOk && input.errorMessage) {
    console.warn("[applyRunner] Application record save failed", {
      message: input.errorMessage
    });
  }
}

function deriveFinalStatus(
  applicationRecord: ApplicationRecord | undefined,
  canSubmit: boolean,
  errors: string[]
): ApplicationStatus {
  if (applicationRecord?.status) {
    return applicationRecord.status;
  }
  if (canSubmit) {
    return "ready_to_submit";
  }
  if (errors.length > 0) {
    return "failed";
  }
  return "draft_prepared";
}

export async function runApplyRunner(): Promise<ApplyExecutionResult> {
  console.log("Stage 6A Step 7 runner ready");
  console.log("[applyRunner] Mode: prepare-only (auto-submit disabled)");

  const errors: string[] = [];
  const warnings: string[] = ["Mode is prepare-only. Auto-submit is disabled by design."];

  let formFields: FormField[] = [];
  let mappings: FieldMapping[] = [];
  let fillResults: FieldFillResult[] = [];
  let uploadResult: UploadResumeResult = createUploadFallback(
    "Upload step not executed.",
    "UPLOAD_STEP_NOT_EXECUTED"
  );
  let preSubmitCheck: PreSubmitCheck = createPreSubmitFallback("Validation step not executed.");

  let applicationRecord: ApplicationRecord | undefined;
  let savedRecord: ApplicationRecord | undefined;
  let recordSaved = false;

  try {
    formFields = scanForm();
    logScanResult(formFields);
    logStepResult("scan", true, `fields=${formFields.length}`);
    if (!formFields.length) {
      warnings.push("No form fields detected on current page.");
    }
  } catch (error) {
    const message = `scanForm failed: ${toErrorMessage(error)}`;
    errors.push(message);
    logStepResult("scan", false, message);
  }

  try {
    mappings = mapFields(formFields, mockProfile);
    logMappingResult(mappings);
    logStepResult("map", true, `mappings=${mappings.length}`);
    if (!mappings.length) {
      warnings.push("No field mappings produced.");
    }
  } catch (error) {
    const message = `mapFields failed: ${toErrorMessage(error)}`;
    errors.push(message);
    logStepResult("map", false, message);
  }

  try {
    const textMappings = mappings.filter((mapping) => cleanString(mapping.field.type).toLowerCase() !== "select");
    const selectMappings = mappings.filter((mapping) => cleanString(mapping.field.type).toLowerCase() === "select");

    const textFillResults = autofillTextFields(textMappings);
    const selectFillResults = autofillSelectFields(selectMappings);
    fillResults = [...textFillResults, ...selectFillResults];

    logAutofillResult(fillResults);
    logHsbcPatchSummary(formFields, mappings, fillResults);
    const filledCount = fillResults.filter((result) => result.status === "filled").length;
    logStepResult("autofill", true, `filled=${filledCount}/${fillResults.length}`);
  } catch (error) {
    const message = `autofillTextFields failed: ${toErrorMessage(error)}`;
    errors.push(message);
    logStepResult("autofill", false, message);
    fillResults = [];
  }

  try {
    uploadResult = await uploadResume();
    logUploadResult(uploadResult);
    logStepResult(
      "upload",
      uploadResult.ok,
      uploadResult.ok
        ? `resumeId=${uploadResult.resumeId || "-"}`
        : `reason=${uploadResult.reason || uploadResult.message}`
    );
    if (!uploadResult.ok) {
      warnings.push(`Resume upload failed: ${uploadResult.reason || uploadResult.message}`);
    }
  } catch (error) {
    const message = `uploadResume failed: ${toErrorMessage(error)}`;
    errors.push(message);
    uploadResult = createUploadFallback(message, "UPLOAD_STEP_EXCEPTION");
    logStepResult("upload", false, message);
  }

  try {
    preSubmitCheck = validateApplication(formFields, {
      mappings,
      fillResults,
      uploadResult
    });
    logValidationResult(preSubmitCheck);
    const canSubmit = Boolean(preSubmitCheck.canSubmit ?? preSubmitCheck.ok);
    logStepResult("validate", true, `canSubmit=${canSubmit ? "true" : "false"}`);
  } catch (error) {
    const message = `validateApplication failed: ${toErrorMessage(error)}`;
    errors.push(message);
    preSubmitCheck = createPreSubmitFallback(message);
    logStepResult("validate", false, message);
  }

  const canSubmit = Boolean(preSubmitCheck.canSubmit ?? preSubmitCheck.ok);
  const jobUrl = getCurrentJobUrl();
  const sourceSite = getSourceSite(jobUrl);
  const titleMetadata = parseTitleMetadata();

  let resumeRecord = null;
  try {
    resumeRecord = uploadResult.resumeId
      ? await getCompiledResumeById(uploadResult.resumeId)
      : await getLatestCompiledResumeRecord();
  } catch (error) {
    warnings.push(`Failed to read resume registry metadata: ${toErrorMessage(error)}`);
  }

  try {
    applicationRecord = buildApplicationRecord({
      jobUrl,
      sourceSite,
      company: titleMetadata.company,
      role: titleMetadata.role,
      resumeRecord,
      uploadResult,
      formFields,
      fillResults,
      preSubmitCheck,
      mode: PIPELINE_MODE
    });
    logStepResult("record-build", true, `applicationId=${applicationRecord.applicationId}`);
  } catch (error) {
    const message = `buildApplicationRecord failed: ${toErrorMessage(error)}`;
    errors.push(message);
    logStepResult("record-build", false, message);
  }

  if (applicationRecord) {
    try {
      savedRecord = await saveApplicationRecord(applicationRecord);
      recordSaved = true;
      logStepResult("record-save", true, `applicationId=${savedRecord.applicationId}`);
    } catch (error) {
      const message = `saveApplicationRecord failed: ${toErrorMessage(error)}`;
      errors.push(message);
      logStepResult("record-save", false, message);
    }
  } else {
    warnings.push("Application record was not built; save step skipped.");
    logStepResult("record-save", false, "skipped (no application record)");
  }

  const finalRecord = savedRecord || applicationRecord;
  const finalStatus = deriveFinalStatus(finalRecord, canSubmit, errors);
  const finalApplicationId = finalRecord?.applicationId;
  const finalResumeId = finalRecord?.resumeId || uploadResult.resumeId;
  const finalJobId = finalRecord?.jobId;
  const recordSaveErrorMessage = recordSaved ? "" : errors[errors.length - 1] || "";

  logApplicationRecordResult({
    applicationId: finalApplicationId,
    status: finalStatus,
    jobUrl: finalRecord?.jobUrl || jobUrl,
    resumeId: finalResumeId,
    saveOk: recordSaved,
    errorMessage: recordSaveErrorMessage
  });

  const filledCount = fillResults.filter((result) => result.status === "filled").length;
  const mergedWarnings = uniqueList([...warnings, ...(preSubmitCheck.warnings || [])]);
  const mergedErrors = uniqueList(errors);
  const readyFlag = canSubmit ? "true" : "false";

  return {
    ok: canSubmit,
    mode: PIPELINE_MODE,
    applicationId: finalApplicationId,
    status: finalStatus,
    resumeId: finalResumeId,
    jobId: finalJobId,
    errors: mergedErrors,
    warnings: mergedWarnings,
    uploadSummary: {
      ok: uploadResult.ok,
      resumeId: uploadResult.resumeId,
      fileName: uploadResult.fileName,
      reason: uploadResult.reason,
      message: uploadResult.message
    },
    validationSummary: {
      canSubmit,
      missingRequiredFields: preSubmitCheck.missingRequiredFields || [],
      unknownRequiredFields: preSubmitCheck.unknownRequiredFields || [],
      pageValidationErrors: preSubmitCheck.pageValidationErrors || []
    },
    recordSummary: {
      saved: recordSaved,
      applicationId: finalApplicationId,
      status: finalStatus,
      errorMessage: recordSaveErrorMessage || undefined
    },
    message: formFields.length
      ? `Stage 6A Step 7 prepare-only pipeline complete: ready_to_submit=${readyFlag}, filled=${filledCount}/${fillResults.length}, applicationId=${finalApplicationId || "-"}, status=${finalStatus}`
      : `Stage 6A Step 7 prepare-only pipeline complete: no form fields found, applicationId=${finalApplicationId || "-"}, status=${finalStatus}`,
    formFields,
    fillResults,
    preSubmitCheck,
    uploadResult,
    applicationRecord: finalRecord
  };
}
