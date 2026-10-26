import type { FieldFillResult, FormField } from "../types.apply";
import type { FieldMapping } from "./mapFields";

type TextFieldElement = HTMLInputElement | HTMLTextAreaElement;

const SUPPORTED_INPUT_TYPES = new Set(["text", "email", "tel", "password"]);

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function toFieldKey(field: FormField): string {
  return field.name || field.id || field.label || field.selector || "unknown";
}

function toValuePreview(value: string): string {
  if (!value) {
    return "";
  }

  return value.length <= 48 ? value : `${value.slice(0, 45)}...`;
}

function normalizeToken(value: string): string {
  return cleanString(value).toLowerCase().replace(/[\s:*_.,/\\()[\]{}'"`~!@#$%^&?+=|-]+/g, "");
}

function isSupportedTextFieldElement(element: Element): element is TextFieldElement {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  const inputType = cleanString(element.type).toLowerCase() || "text";
  return SUPPORTED_INPUT_TYPES.has(inputType);
}

function buildNameFallbackSelector(field: FormField, escapedName: string): string {
  const fieldType = cleanString(field.type).toLowerCase();

  if (fieldType === "textarea") {
    return `textarea[name="${escapedName}"]`;
  }

  if (fieldType === "email") {
    return `input[type="email"][name="${escapedName}"]`;
  }

  if (fieldType === "tel") {
    return `input[type="tel"][name="${escapedName}"]`;
  }

  if (fieldType === "text") {
    return `input[type="text"][name="${escapedName}"], input:not([type])[name="${escapedName}"]`;
  }

  return [
    `textarea[name="${escapedName}"]`,
    `input[type="text"][name="${escapedName}"]`,
    `input:not([type])[name="${escapedName}"]`,
    `input[type="email"][name="${escapedName}"]`,
    `input[type="tel"][name="${escapedName}"]`
  ].join(", ");
}

function resolveFieldElement(field: FormField): Element | null {
  const selector = cleanString(field.selector);
  if (selector) {
    try {
      const bySelector = document.querySelector(selector);
      if (bySelector) {
        return bySelector;
      }
    } catch {
      // ignore invalid selector and continue fallback lookup
    }
  }

  const id = cleanString(field.id);
  if (id) {
    const byId = document.getElementById(id);
    if (byId) {
      return byId;
    }
  }

  const name = cleanString(field.name);
  if (name) {
    const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    try {
      const selectorByName = buildNameFallbackSelector(field, escapedName);
      const byName = document.querySelector(selectorByName);
      if (byName) {
        return byName;
      }
    } catch {
      // ignore invalid selector and continue
    }
  }

  return null;
}

function setNativeTextValue(element: TextFieldElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  const setter = descriptor && descriptor.set;

  if (typeof setter === "function") {
    setter.call(element, value);
    return;
  }

  element.value = value;
}

function dispatchAutofillEvents(element: TextFieldElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event("blur", { bubbles: false, cancelable: false }));
}

function dispatchSelectEvents(element: HTMLSelectElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event("blur", { bubbles: false, cancelable: false }));
}

function toSelectMatchCandidates(rawValue: string): string[] {
  const base = cleanString(rawValue);
  if (!base) {
    return [];
  }

  const output = [base];
  const lower = base.toLowerCase();
  if (["yes", "y", "true", "1"].includes(lower)) {
    output.push("Yes", "Y", "True", "1");
  } else if (["no", "n", "false", "0"].includes(lower)) {
    output.push("No", "N", "False", "0");
  }

  return Array.from(new Set(output.map((item) => cleanString(item)).filter(Boolean)));
}

function selectBestOption(select: HTMLSelectElement, rawValue: string): HTMLOptionElement | null {
  const candidates = toSelectMatchCandidates(rawValue);
  if (!candidates.length) {
    return null;
  }

  const options = Array.from(select.options);

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase();
    const exact = options.find((option) => cleanString(option.textContent).toLowerCase() === normalizedCandidate);
    if (exact) {
      return exact;
    }
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeToken(candidate);
    const normalized = options.find((option) => {
      const byText = normalizeToken(cleanString(option.textContent));
      const byValue = normalizeToken(cleanString(option.value));
      return byText === normalizedCandidate || byValue === normalizedCandidate;
    });
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function autofillTextFields(fieldMappings: FieldMapping[]): FieldFillResult[] {
  if (typeof document === "undefined") {
    return fieldMappings.map((mapping) => ({
      fieldKey: toFieldKey(mapping.field),
      fieldId: mapping.field.id,
      fieldLabel: mapping.field.label,
      status: "error",
      valuePreview: "",
      errorMessage: "DOCUMENT_UNAVAILABLE"
    }));
  }

  return fieldMappings.map((mapping) => {
    const field = mapping.field;
    const fieldKey = toFieldKey(field);

    if (mapping.status !== "matched" || !cleanString(mapping.mappedValue)) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "skipped",
        valuePreview: "",
        reason: mapping.reason || "MAPPING_NOT_MATCHED"
      };
    }

    const element = resolveFieldElement(field);
    if (!element) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "error",
        valuePreview: toValuePreview(mapping.mappedValue),
        errorMessage: "ELEMENT_NOT_FOUND"
      };
    }

    if (!isSupportedTextFieldElement(element)) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "skipped",
        valuePreview: toValuePreview(mapping.mappedValue),
        reason: "UNSUPPORTED_FIELD_ELEMENT"
      };
    }

    if (element.disabled || element.readOnly) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "skipped",
        valuePreview: toValuePreview(mapping.mappedValue),
        reason: element.disabled ? "ELEMENT_DISABLED" : "ELEMENT_READONLY"
      };
    }

    try {
      setNativeTextValue(element, mapping.mappedValue);
      dispatchAutofillEvents(element);

      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "filled",
        value: mapping.mappedValue,
        valuePreview: toValuePreview(mapping.mappedValue)
      };
    } catch (error) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "error",
        valuePreview: toValuePreview(mapping.mappedValue),
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

export function autofillSelectFields(fieldMappings: FieldMapping[]): FieldFillResult[] {
  if (typeof document === "undefined") {
    return fieldMappings.map((mapping) => ({
      fieldKey: toFieldKey(mapping.field),
      fieldId: mapping.field.id,
      fieldLabel: mapping.field.label,
      status: "error",
      valuePreview: "",
      errorMessage: "DOCUMENT_UNAVAILABLE"
    }));
  }

  return fieldMappings.map((mapping) => {
    const field = mapping.field;
    const fieldKey = toFieldKey(field);

    if (mapping.status !== "matched" || !cleanString(mapping.mappedValue)) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "skipped",
        valuePreview: "",
        reason: mapping.reason || "MAPPING_NOT_MATCHED"
      };
    }

    const element = resolveFieldElement(field);
    if (!element) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "error",
        valuePreview: toValuePreview(mapping.mappedValue),
        errorMessage: "ELEMENT_NOT_FOUND"
      };
    }

    if (!(element instanceof HTMLSelectElement)) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "skipped",
        valuePreview: toValuePreview(mapping.mappedValue),
        reason: "UNSUPPORTED_SELECT_ELEMENT"
      };
    }

    if (element.disabled) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "skipped",
        valuePreview: toValuePreview(mapping.mappedValue),
        reason: "ELEMENT_DISABLED"
      };
    }

    const selected = selectBestOption(element, mapping.mappedValue);
    if (!selected) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "skipped",
        valuePreview: toValuePreview(mapping.mappedValue),
        reason: "SELECT_OPTION_NOT_FOUND"
      };
    }

    try {
      element.value = selected.value;
      dispatchSelectEvents(element);

      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "filled",
        value: cleanString(selected.textContent) || selected.value,
        valuePreview: toValuePreview(cleanString(selected.textContent) || selected.value)
      };
    } catch (error) {
      return {
        fieldKey,
        fieldId: field.id,
        fieldLabel: field.label,
        status: "error",
        valuePreview: toValuePreview(mapping.mappedValue),
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

// Backward-compatible alias.
export function autofillFields(fieldMappings: FieldMapping[]): FieldFillResult[] {
  return autofillTextFields(fieldMappings);
}
