import type { ApplyProfile, FormField } from "../types.apply";
import { detectHsbcPatch, isNegativeAnswer, matchHsbcField, normalizeYesNoValue } from "./patches/hsbcPatch";

const PROFILE_KEYS = [
  "name",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "portfolio",
  "workAuthorization",
  "requiresSponsorship",
  "password",
  "legalFirstName",
  "legalLastName",
  "preferredFirstName",
  "chineseFirstName",
  "chineseLastName",
  "internationalCallingCode",
  "preferredContactNumber",
  "hasRelativesAtHsbc",
  "relativesDetails",
  "isFormerEmployeeOrContractor",
  "employeeIdOrContractorInfo"
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];
export type MappingStatus = "matched" | "unknown" | "skipped";

export interface FieldMapping {
  field: FormField;
  matchedKey?: ProfileKey;
  mappedValue?: string;
  valuePreview: string;
  status: MappingStatus;
  reason?: string;
  patchTag?: "HSBC";
}

interface KeyConfig {
  key: ProfileKey;
  exactAliases: string[];
  keywordHints: string[];
}

const KEY_CONFIGS: KeyConfig[] = [
  {
    key: "email",
    exactAliases: ["email", "email address", "e-mail", "mail"],
    keywordHints: ["email", "e-mail", "mail"]
  },
  {
    key: "phone",
    exactAliases: ["phone", "phone number", "mobile", "mobile phone", "telephone", "tel"],
    keywordHints: ["phone", "mobile", "telephone", "tel", "cell"]
  },
  {
    key: "location",
    exactAliases: ["location", "city", "address", "current location"],
    keywordHints: ["location", "city", "address", "state", "country"]
  },
  {
    key: "linkedin",
    exactAliases: ["linkedin", "linkedin url", "linkedin profile"],
    keywordHints: ["linkedin"]
  },
  {
    key: "github",
    exactAliases: ["github", "github url", "github profile"],
    keywordHints: ["github"]
  },
  {
    key: "portfolio",
    exactAliases: ["portfolio", "portfolio url", "website", "personal site"],
    keywordHints: ["portfolio", "website", "personal site"]
  },
  {
    key: "workAuthorization",
    exactAliases: ["work authorization", "right to work", "eligible to work"],
    keywordHints: ["work authorization", "right to work", "eligible to work"]
  },
  {
    key: "requiresSponsorship",
    exactAliases: ["require sponsorship", "requires sponsorship", "need sponsorship", "visa sponsorship"],
    keywordHints: ["sponsorship", "visa sponsorship"]
  },
  {
    key: "name",
    exactAliases: ["name", "full name", "fullname", "your name"],
    keywordHints: ["full name", "your name", "name"]
  },
  {
    key: "legalFirstName",
    exactAliases: ["legal first name"],
    keywordHints: ["legal first name"]
  },
  {
    key: "legalLastName",
    exactAliases: ["legal last name"],
    keywordHints: ["legal last name"]
  },
  {
    key: "preferredFirstName",
    exactAliases: ["preferred first name"],
    keywordHints: ["preferred first name", "preferred name"]
  },
  {
    key: "chineseFirstName",
    exactAliases: ["chinese first name"],
    keywordHints: ["chinese first name"]
  },
  {
    key: "chineseLastName",
    exactAliases: ["chinese last name"],
    keywordHints: ["chinese last name"]
  },
  {
    key: "internationalCallingCode",
    exactAliases: ["international calling code", "calling code"],
    keywordHints: ["calling code", "international calling code"]
  },
  {
    key: "preferredContactNumber",
    exactAliases: ["preferred contact number", "contact number"],
    keywordHints: ["preferred contact number", "contact number", "phone number"]
  },
  {
    key: "password",
    exactAliases: ["password", "choose password"],
    keywordHints: ["password", "choose password", "retype password", "confirm password"]
  },
  {
    key: "hasRelativesAtHsbc",
    exactAliases: ["relatives working with hsbc group"],
    keywordHints: ["relatives", "hsbc group"]
  },
  {
    key: "relativesDetails",
    exactAliases: ["relative details"],
    keywordHints: ["relative", "job title", "department"]
  },
  {
    key: "isFormerEmployeeOrContractor",
    exactAliases: ["former employee"],
    keywordHints: ["former employee", "contractor", "service provider"]
  },
  {
    key: "employeeIdOrContractorInfo",
    exactAliases: ["employee contractor information"],
    keywordHints: ["employee", "contractor", "service provider"]
  }
];

const SKIPPED_INPUT_TYPES = new Set(["checkbox", "radio", "file", "submit", "reset", "button", "hidden"]);

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeToken(value: string): string {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(candidateLower: string, hint: string): boolean {
  const normalizedHint = cleanString(hint).toLowerCase();
  if (!normalizedHint) {
    return false;
  }

  if (normalizedHint.includes(" ")) {
    return candidateLower.includes(normalizedHint);
  }

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedHint)}([^a-z0-9]|$)`);
  return pattern.test(candidateLower);
}

function toValuePreview(value: string): string {
  if (!value) {
    return "";
  }

  return value.length <= 48 ? value : `${value.slice(0, 45)}...`;
}

function getFieldCandidates(field: FormField): string[] {
  const raw = [field.label, field.name, field.id, field.placeholder, field.type]
    .map((item) => cleanString(item))
    .filter(Boolean);

  return Array.from(new Set(raw));
}

function resolveProfile(profileData: Record<string, unknown>): ApplyProfile {
  const profile: ApplyProfile = {};

  for (const key of PROFILE_KEYS) {
    const value = cleanString(profileData[key]);
    if (value) {
      profile[key] = value;
    }
  }

  return profile;
}

function getProfileValue(profile: ApplyProfile, key: ProfileKey, fallbackKey?: ProfileKey): string {
  const primary = cleanString(profile[key]);
  if (primary) {
    return key === "hasRelativesAtHsbc" || key === "isFormerEmployeeOrContractor" ? normalizeYesNoValue(primary) : primary;
  }

  if (fallbackKey) {
    const fallback = cleanString(profile[fallbackKey]);
    if (fallback) {
      return fallback;
    }
  }

  return "";
}

function findMatchedKey(field: FormField): { key: ProfileKey; reason: string } | null {
  const candidates = getFieldCandidates(field);
  if (!candidates.length) {
    return null;
  }

  for (const candidate of candidates) {
    for (const config of KEY_CONFIGS) {
      if (config.exactAliases.some((alias) => candidate === alias)) {
        return { key: config.key, reason: "EXACT_MATCH" };
      }
    }
  }

  const normalizedCandidates = candidates.map((candidate) => normalizeToken(candidate)).filter(Boolean);
  for (const candidate of normalizedCandidates) {
    for (const config of KEY_CONFIGS) {
      if (config.exactAliases.map((alias) => normalizeToken(alias)).includes(candidate)) {
        return { key: config.key, reason: "NORMALIZED_MATCH" };
      }
    }
  }

  const loweredCandidates = candidates.map((candidate) => candidate.toLowerCase());
  for (const candidate of loweredCandidates) {
    for (const config of KEY_CONFIGS) {
      if (config.keywordHints.some((hint) => matchesKeyword(candidate, hint))) {
        return { key: config.key, reason: "KEYWORD_MATCH" };
      }
    }
  }

  return null;
}

function shouldSkipField(field: FormField): boolean {
  const fieldType = cleanString(field.type).toLowerCase();
  if (!fieldType) {
    return false;
  }

  return SKIPPED_INPUT_TYPES.has(fieldType);
}

export function mapFields(
  formFields: FormField[],
  profileData: Record<string, unknown> = {}
): FieldMapping[] {
  const profile = resolveProfile(profileData);
  const hsbcDetection = detectHsbcPatch(formFields, {
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
    pageTitle: typeof document !== "undefined" ? document.title : ""
  });

  return formFields.map((field) => {
    if (shouldSkipField(field)) {
      return {
        field,
        status: "skipped",
        valuePreview: "",
        reason: "UNSUPPORTED_FIELD_TYPE"
      };
    }

    if (hsbcDetection.isDetected) {
      const hsbcMatch = matchHsbcField(field);
      if (hsbcMatch) {
        const conditionalOnKey = hsbcMatch.conditionalOnKey as ProfileKey | undefined;
        if (conditionalOnKey) {
          const controllerValue = getProfileValue(profile, conditionalOnKey);
          if (isNegativeAnswer(controllerValue)) {
            return {
              field,
              matchedKey: hsbcMatch.key,
              status: "skipped",
              valuePreview: "",
              reason: `CONDITIONAL_SKIP_${conditionalOnKey}`,
              patchTag: "HSBC"
            };
          }
        }

        const fallbackKey = hsbcMatch.fallbackKey as ProfileKey | undefined;
        const mappedValue = getProfileValue(profile, hsbcMatch.key as ProfileKey, fallbackKey);
        if (!mappedValue) {
          return {
            field,
            matchedKey: hsbcMatch.key,
            status: "unknown",
            valuePreview: "",
            reason: "PROFILE_VALUE_MISSING",
            patchTag: "HSBC"
          };
        }

        return {
          field,
          matchedKey: hsbcMatch.key,
          mappedValue,
          valuePreview: toValuePreview(mappedValue),
          status: "matched",
          reason: hsbcMatch.reason,
          patchTag: "HSBC"
        };
      }
    }

    const matched = findMatchedKey(field);
    if (!matched) {
      return {
        field,
        status: "unknown",
        valuePreview: "",
        reason: "NO_PROFILE_KEY_MATCH"
      };
    }

    const mappedValue = cleanString(profile[matched.key]);
    if (!mappedValue) {
      return {
        field,
        matchedKey: matched.key,
        status: "unknown",
        valuePreview: "",
        reason: "PROFILE_VALUE_MISSING"
      };
    }

    return {
      field,
      matchedKey: matched.key,
      mappedValue,
      valuePreview: toValuePreview(mappedValue),
      status: "matched",
      reason: matched.reason
    };
  });
}
