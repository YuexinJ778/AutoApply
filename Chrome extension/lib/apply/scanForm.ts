import type { FormField } from "../types.apply";

type ScanTarget = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const FIELD_SELECTOR = "input, textarea, select";
const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "reset", "button", "image"]);

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isUniqueSelector(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function getPathSegment(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (!parent) {
    return tag;
  }

  const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
  if (siblings.length <= 1) {
    return tag;
  }

  const index = siblings.indexOf(element) + 1;
  return `${tag}:nth-of-type(${index})`;
}

function buildPathSelector(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    const currentId = cleanString(current.id);
    if (currentId) {
      segments.unshift(`${current.tagName.toLowerCase()}#${escapeCssIdentifier(currentId)}`);
      return segments.join(" > ");
    }

    segments.unshift(getPathSegment(current));
    current = current.parentElement;
  }

  if (current === document.body) {
    segments.unshift("body");
  }

  return segments.join(" > ");
}

function buildStableSelector(field: ScanTarget): string {
  const tag = field.tagName.toLowerCase();
  const id = cleanString(field.id);
  if (id) {
    return `${tag}#${escapeCssIdentifier(id)}`;
  }

  const name = cleanString(field.getAttribute("name"));
  if (name) {
    const byName = `${tag}[name="${escapeAttributeValue(name)}"]`;
    if (isUniqueSelector(byName)) {
      return byName;
    }

    const form = field.closest("form");
    if (form) {
      const formId = cleanString(form.id);
      if (formId) {
        const formScoped = `form#${escapeCssIdentifier(formId)} ${byName}`;
        if (isUniqueSelector(formScoped)) {
          return formScoped;
        }
      }

      const formPath = buildPathSelector(form);
      if (formPath) {
        const formPathScoped = `${formPath} ${byName}`;
        if (isUniqueSelector(formPathScoped)) {
          return formPathScoped;
        }
      }
    }
  }

  const pathSelector = buildPathSelector(field);
  return pathSelector || tag;
}

function getLabelFromForAttribute(field: ScanTarget): string {
  const id = cleanString(field.id);
  if (!id) {
    return "";
  }

  const labels = Array.from(document.querySelectorAll("label[for]"));
  for (const label of labels) {
    if (cleanString(label.getAttribute("for")) === id) {
      return cleanString(label.textContent);
    }
  }

  return "";
}

function getFieldLabel(field: ScanTarget): string {
  const labelByFor = getLabelFromForAttribute(field);
  if (labelByFor) {
    return labelByFor;
  }

  const nativeLabels = (field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels;
  if (nativeLabels && nativeLabels.length) {
    for (const label of Array.from(nativeLabels)) {
      const text = cleanString(label.textContent);
      if (text) {
        return text;
      }
    }
  }

  const ariaLabel = cleanString(field.getAttribute("aria-label"));
  if (ariaLabel) {
    return ariaLabel;
  }

  const placeholder = cleanString(field.getAttribute("placeholder"));
  if (placeholder) {
    return placeholder;
  }

  return cleanString(field.getAttribute("name"));
}

function getFieldType(field: ScanTarget): string {
  if (field instanceof HTMLInputElement) {
    return cleanString(field.type).toLowerCase() || "text";
  }

  if (field instanceof HTMLTextAreaElement) {
    return "textarea";
  }

  return "select";
}

function getSelectOptions(field: ScanTarget): string[] | undefined {
  if (!(field instanceof HTMLSelectElement)) {
    return undefined;
  }

  const options = Array.from(field.options)
    .map((option) => cleanString(option.textContent) || cleanString(option.value))
    .filter(Boolean);

  return options;
}

function shouldScanField(field: ScanTarget): boolean {
  if (field.disabled) {
    return false;
  }

  if (field instanceof HTMLInputElement) {
    const inputType = cleanString(field.type).toLowerCase() || "text";
    if (SKIP_INPUT_TYPES.has(inputType)) {
      return false;
    }
  }

  return true;
}

export function scanForm(): FormField[] {
  if (typeof document === "undefined") {
    return [];
  }

  const fields = Array.from(document.querySelectorAll<ScanTarget>(FIELD_SELECTOR));
  const output: FormField[] = [];

  for (const field of fields) {
    if (!shouldScanField(field)) {
      continue;
    }

    const id = cleanString(field.id) || undefined;
    const name = cleanString(field.getAttribute("name")) || undefined;
    const placeholder = cleanString(field.getAttribute("placeholder")) || undefined;
    const label = getFieldLabel(field) || undefined;
    const selector = buildStableSelector(field);
    const options = getSelectOptions(field);

    const normalized: FormField = {
      id,
      selector,
      type: getFieldType(field),
      label,
      name,
      placeholder,
      required: Boolean(field.required || cleanString(field.getAttribute("aria-required")).toLowerCase() === "true")
    };

    if (Array.isArray(options)) {
      normalized.options = options;
    }

    output.push(normalized);
  }

  return output;
}
