import type { FieldFillResult, FormField, PreSubmitCheck, ResumeUploadResult } from "../types.apply";
import type { FieldMapping } from "./mapFields";

export interface ValidateApplicationInput {
  mappings?: FieldMapping[];
  fillResults?: FieldFillResult[];
  uploadResult?: ResumeUploadResult;
}

type ScanTarget = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function validateApplication(
  formFields: FormField[],
  input: ValidateApplicationInput = {}
): PreSubmitCheck {
  const mappings = input.mappings || [];
  const fillResults = input.fillResults || [];
  const uploadResult = input.uploadResult;
  const requiredFields = formFields.filter((field) => Boolean(field.required));
  const mappingByKey = new Map<string, FieldMapping>();

  for (const mapping of mappings) {
    mappingByKey.set(toFieldKey(mapping.field), mapping);
  }

  const missingRequiredFields: string[] = [];
  const unknownRequiredFields: string[] = [];

  for (const field of requiredFields) {
    const fieldName = toHumanFieldName(field);
    const fieldType = cleanString(field.type).toLowerCase();
    const mapping = mappingByKey.get(toFieldKey(field));

    if (isUnknownRequiredField(fieldType, mapping)) {
      unknownRequiredFields.push(fieldName);
    }

    const element = resolveFieldElement(field);
    if (!element || isRequiredValueMissing(fieldType, element, field)) {
      missingRequiredFields.push(fieldName);
    }
  }

  const pageValidationErrors = collectPageValidationErrors();
  const warnings: string[] = ["Stage 6A Step 5 pre-submit validation only. No submit executed."];
  const fillErrorCount = fillResults.filter((result) => result.status === "error" || result.status === "failed").length;

  if (!formFields.length) {
    warnings.push("No form fields detected on current page.");
  }
  if (fillErrorCount > 0) {
    warnings.push(`Autofill reported ${fillErrorCount} error(s).`);
  }
  if (uploadResult && !uploadResult.ok) {
    warnings.push(`Resume upload skipped/failed: ${uploadResult.reason || uploadResult.message}`);
  }
  if (pageValidationErrors.length > 0) {
    warnings.push(`Detected ${pageValidationErrors.length} page validation error(s).`);
  }

  const canSubmit =
    missingRequiredFields.length === 0 &&
    unknownRequiredFields.length === 0 &&
    pageValidationErrors.length === 0;

  return {
    ok: canSubmit,
    canSubmit,
    missingRequiredFields: uniqueList(missingRequiredFields),
    unknownRequiredFields: uniqueList(unknownRequiredFields),
    pageValidationErrors,
    warnings
  };
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toFieldKey(field: FormField): string {
  return cleanString(field.selector) || cleanString(field.name) || cleanString(field.id) || cleanString(field.label) || "unknown";
}

function toHumanFieldName(field: FormField): string {
  return cleanString(field.label) || cleanString(field.name) || cleanString(field.id) || cleanString(field.selector) || "unknown";
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function resolveFieldElement(field: FormField): ScanTarget | null {
  if (typeof document === "undefined") {
    return null;
  }

  const selector = cleanString(field.selector);
  if (selector) {
    try {
      const bySelector = document.querySelector(selector);
      if (isScanTarget(bySelector)) {
        return bySelector;
      }
    } catch {
      // ignore invalid selector and continue fallback lookup
    }
  }

  const id = cleanString(field.id);
  if (id) {
    const byId = document.getElementById(id);
    if (isScanTarget(byId)) {
      return byId;
    }
  }

  const name = cleanString(field.name);
  if (name) {
    const escapedName = escapeAttributeValue(name);
    const byName = document.querySelector(`[name="${escapedName}"]`);
    if (isScanTarget(byName)) {
      return byName;
    }
  }

  return null;
}

function isScanTarget(value: unknown): value is ScanTarget {
  return value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement || value instanceof HTMLSelectElement;
}

function isUnknownRequiredField(fieldType: string, mapping?: FieldMapping): boolean {
  if (fieldType === "file") {
    return false;
  }

  return !mapping || mapping.status !== "matched";
}

function isRequiredValueMissing(fieldType: string, element: ScanTarget, field: FormField): boolean {
  if (element instanceof HTMLInputElement && cleanString(element.type).toLowerCase() === "file") {
    return !element.files || element.files.length === 0;
  }

  if (fieldType === "file") {
    if (!(element instanceof HTMLInputElement)) {
      return true;
    }
    return !element.files || element.files.length === 0;
  }

  if (fieldType === "checkbox") {
    return !(element instanceof HTMLInputElement) || !element.checked;
  }

  if (fieldType === "radio") {
    const name = cleanString(field.name) || cleanString(element.getAttribute("name"));
    if (name) {
      const escapedName = escapeAttributeValue(name);
      const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escapedName}"]`));
      return !group.some((item) => item.checked);
    }

    return !(element instanceof HTMLInputElement) || !element.checked;
  }

  if (element instanceof HTMLSelectElement) {
    if (element.multiple) {
      return Array.from(element.selectedOptions).length === 0;
    }
    return cleanString(element.value) === "";
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return cleanString(element.value) === "";
  }

  return true;
}

function collectPageValidationErrors(): string[] {
  if (typeof document === "undefined") {
    return [];
  }

  const output: string[] = [];
  const selector =
    '[aria-invalid="true"], [role="alert"], .error, .errors, .invalid, .field-error, .form-error, .validation-error';

  const candidates = Array.from(document.querySelectorAll(selector));
  for (const node of candidates) {
    if (!isLikelyVisible(node)) {
      continue;
    }

    const message = cleanString(node.textContent);
    if (!message) {
      continue;
    }
    if (!isLikelyValidationMessage(message, node)) {
      continue;
    }
    if (message.length > 200) {
      output.push(`${message.slice(0, 197)}...`);
      continue;
    }
    output.push(message);
  }

  const invalidControls = Array.from(document.querySelectorAll<ScanTarget>("input:invalid, textarea:invalid, select:invalid"));
  for (const control of invalidControls) {
    const validationMessage = cleanString((control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).validationMessage);
    if (validationMessage) {
      output.push(validationMessage);
      continue;
    }
    output.push(`Invalid field: ${toElementName(control)}`);
  }

  return uniqueList(output);
}

function isLikelyVisible(node: Element): boolean {
  if (!(node instanceof HTMLElement)) {
    return true;
  }

  if (node.hidden) {
    return false;
  }

  const style = window.getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return node.getClientRects().length > 0;
}

function isLikelyValidationMessage(message: string, node: Element): boolean {
  const lowerMessage = message.toLowerCase();
  const className = cleanString(node.className).toLowerCase();
  const role = cleanString(node.getAttribute("role")).toLowerCase();
  const ariaInvalid = cleanString(node.getAttribute("aria-invalid")).toLowerCase() === "true";

  if (ariaInvalid) {
    return true;
  }
  if (className.includes("error") || className.includes("invalid")) {
    return true;
  }
  if (role === "alert") {
    return /(error|invalid|required|please|must|missing|failed)/.test(lowerMessage);
  }

  return /(error|invalid|required|please|must|missing|failed)/.test(lowerMessage);
}

function toElementName(element: ScanTarget): string {
  const ariaLabel = cleanString(element.getAttribute("aria-label"));
  if (ariaLabel) {
    return ariaLabel;
  }
  return cleanString(element.getAttribute("name")) || cleanString(element.id) || element.tagName.toLowerCase();
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanString(value)).filter(Boolean)));
}
