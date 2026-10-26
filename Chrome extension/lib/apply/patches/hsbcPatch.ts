import type { FormField } from "../../types.apply";

export interface HsbcPatchDetectionResult {
  isDetected: boolean;
  reason: string;
  signals: string[];
}

export interface HsbcFieldMatch {
  key:
    | "email"
    | "password"
    | "legalFirstName"
    | "legalLastName"
    | "preferredFirstName"
    | "chineseFirstName"
    | "chineseLastName"
    | "internationalCallingCode"
    | "preferredContactNumber"
    | "hasRelativesAtHsbc"
    | "relativesDetails"
    | "isFormerEmployeeOrContractor"
    | "employeeIdOrContractorInfo";
  reason: string;
  fallbackKey?: "legalFirstName" | "phone";
  conditionalOnKey?: "hasRelativesAtHsbc" | "isFormerEmployeeOrContractor";
}

interface HsbcRule {
  key: HsbcFieldMatch["key"];
  reason: string;
  aliases: string[];
  fallbackKey?: HsbcFieldMatch["fallbackKey"];
  conditionalOnKey?: HsbcFieldMatch["conditionalOnKey"];
}

const HSBC_RULES: HsbcRule[] = [
  {
    key: "email",
    reason: "HSBC_RETYPE_EMAIL",
    aliases: ["retype email address", "retype email", "confirm email", "confirm email address"]
  },
  {
    key: "email",
    reason: "HSBC_EMAIL",
    aliases: ["email address", "email"]
  },
  {
    key: "password",
    reason: "HSBC_RETYPE_PASSWORD",
    aliases: ["retype password", "confirm password"]
  },
  {
    key: "password",
    reason: "HSBC_CHOOSE_PASSWORD",
    aliases: ["choose password", "password"]
  },
  {
    key: "legalFirstName",
    reason: "HSBC_LEGAL_FIRST_NAME",
    aliases: ["legal first name", "first name legal"]
  },
  {
    key: "legalLastName",
    reason: "HSBC_LEGAL_LAST_NAME",
    aliases: ["legal last name", "last name legal"]
  },
  {
    key: "preferredFirstName",
    reason: "HSBC_PREFERRED_FIRST_NAME",
    aliases: ["preferred first name", "preferred name"],
    fallbackKey: "legalFirstName"
  },
  {
    key: "chineseFirstName",
    reason: "HSBC_CHINESE_FIRST_NAME",
    aliases: ["chinese first name", "first name in chinese"]
  },
  {
    key: "chineseLastName",
    reason: "HSBC_CHINESE_LAST_NAME",
    aliases: ["chinese last name", "last name in chinese"]
  },
  {
    key: "internationalCallingCode",
    reason: "HSBC_INTERNATIONAL_CALLING_CODE",
    aliases: ["international calling code", "calling code", "international dialing code"]
  },
  {
    key: "preferredContactNumber",
    reason: "HSBC_PREFERRED_CONTACT_NUMBER",
    aliases: ["preferred contact number", "contact number", "mobile number", "phone number"],
    fallbackKey: "phone"
  },
  {
    key: "hasRelativesAtHsbc",
    reason: "HSBC_RELATIVES_QUESTION",
    aliases: [
      "do you have any relatives working with hsbc group",
      "relatives working with hsbc group",
      "relatives working with hsbc"
    ]
  },
  {
    key: "relativesDetails",
    reason: "HSBC_RELATIVES_DETAILS",
    aliases: [
      "if you have any relative working with hsbc group please provide",
      "please provide name additional information such as location job title department",
      "relative working with hsbc group provide name additional information"
    ],
    conditionalOnKey: "hasRelativesAtHsbc"
  },
  {
    key: "isFormerEmployeeOrContractor",
    reason: "HSBC_FORMER_EMPLOYEE_OR_CONTRACTOR_QUESTION",
    aliases: [
      "are you a former employee or currently engaged as a contractor consultant or service provider",
      "former employee",
      "contractor consultant service provider"
    ]
  },
  {
    key: "employeeIdOrContractorInfo",
    reason: "HSBC_EMPLOYEE_CONTRACTOR_INFO",
    aliases: [
      "if you were formerly employed by hsbc group or currently engaged as a contractor consultant or service provider please provide your employee",
      "please provide your employee",
      "employee contractor information"
    ],
    conditionalOnKey: "isFormerEmployeeOrContractor"
  }
];

const HSBC_DETECTION_KEYWORDS = [
  "hsbc",
  "retype email address",
  "retype password",
  "legal first name",
  "service provider",
  "relatives working with hsbc group"
];

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeHsbcLabel(value: string): string {
  return cleanString(value).toLowerCase().replace(/[\s:*_.,/\\()[\]{}'"`~!@#$%^&?+=|-]+/g, " ").trim();
}

function normalizeCompact(value: string): string {
  return normalizeHsbcLabel(value).replace(/\s+/g, "");
}

function getFieldCandidates(field: FormField): string[] {
  const raw = [field.label, field.name, field.id, field.placeholder]
    .map((item) => cleanString(item))
    .filter(Boolean);
  return Array.from(new Set(raw));
}

function matchesAlias(candidate: string, alias: string): boolean {
  const normalizedCandidate = normalizeHsbcLabel(candidate);
  const normalizedAlias = normalizeHsbcLabel(alias);
  if (!normalizedCandidate || !normalizedAlias) {
    return false;
  }

  if (normalizedCandidate === normalizedAlias) {
    return true;
  }
  if (normalizedCandidate.includes(normalizedAlias)) {
    return true;
  }

  const compactCandidate = normalizeCompact(candidate);
  const compactAlias = normalizeCompact(alias);
  if (!compactCandidate || !compactAlias) {
    return false;
  }

  return compactCandidate === compactAlias || compactCandidate.includes(compactAlias);
}

export function detectHsbcPatch(
  formFields: FormField[],
  context: { hostname?: string; pageTitle?: string } = {}
): HsbcPatchDetectionResult {
  const hostname = cleanString(context.hostname).toLowerCase();
  const pageTitle = cleanString(context.pageTitle).toLowerCase();
  const signals: string[] = [];

  if (hostname.includes("hsbc")) {
    signals.push("HOSTNAME_HSBC");
  }
  if (pageTitle.includes("hsbc")) {
    signals.push("TITLE_HSBC");
  }

  const allCandidates = formFields
    .reduce<string[]>((output, field) => output.concat(getFieldCandidates(field)), [])
    .map((item) => normalizeHsbcLabel(item))
    .filter(Boolean);

  for (const keyword of HSBC_DETECTION_KEYWORDS) {
    const normalizedKeyword = normalizeHsbcLabel(keyword);
    if (allCandidates.some((candidate) => candidate.includes(normalizedKeyword))) {
      signals.push(`FIELD_${normalizeCompact(keyword).slice(0, 24)}`);
    }
  }

  const isDetected = signals.length >= 2 || (signals.length >= 1 && hostname.includes("hsbc"));
  return {
    isDetected,
    reason: isDetected ? "HSBC_PATCH_DETECTED" : "HSBC_PATCH_NOT_DETECTED",
    signals: Array.from(new Set(signals))
  };
}

export function matchHsbcField(field: FormField): HsbcFieldMatch | null {
  const candidates = getFieldCandidates(field);
  if (!candidates.length) {
    return null;
  }

  for (const rule of HSBC_RULES) {
    for (const alias of rule.aliases) {
      if (candidates.some((candidate) => matchesAlias(candidate, alias))) {
        return {
          key: rule.key,
          reason: rule.reason,
          fallbackKey: rule.fallbackKey,
          conditionalOnKey: rule.conditionalOnKey
        };
      }
    }
  }

  return null;
}

export function normalizeYesNoValue(value: string): string {
  const normalized = normalizeCompact(value);
  if (!normalized) {
    return "";
  }

  const yesSet = new Set(["yes", "y", "true", "1"]);
  const noSet = new Set(["no", "n", "false", "0"]);

  if (yesSet.has(normalized)) {
    return "Yes";
  }
  if (noSet.has(normalized)) {
    return "No";
  }
  return cleanString(value);
}

export function isNegativeAnswer(value: string): boolean {
  return normalizeYesNoValue(value) === "No";
}
