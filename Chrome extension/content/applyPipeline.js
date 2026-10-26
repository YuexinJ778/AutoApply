(function attachStage6ApplyRuntime(global) {
  "use strict";

  const PIPELINE_MODE = "prepare-only";
  const MOCK_PROFILE_PATH = "data/mockCandidateProfile.json";
  const CANDIDATE_STORAGE_PRIORITY = Object.freeze([
    "candidateProfile",
    "candidateResume",
    "profile",
    "resumeProfile",
    "resume",
    "resumeData",
    "resumeJson"
  ]);

  const PROFILE_KEYS = Object.freeze([
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
    "employeeIdOrContractorInfo",
    "diversityConsent",
    "gender",
    "rightToWork",
    "externalAuditorEmployment",
    "countryTerritory",
    "profileVisibility",
    "dataPrivacyAccepted"
  ]);

  const KEY_CONFIGS = Object.freeze([
    { key: "email", exactAliases: ["email", "email address", "e-mail", "mail"], keywordHints: ["email", "e-mail", "mail"] },
    { key: "phone", exactAliases: ["phone", "phone number", "mobile", "mobile phone", "telephone", "tel"], keywordHints: ["phone", "mobile", "telephone", "tel", "cell"] },
    { key: "location", exactAliases: ["location", "city", "address", "current location"], keywordHints: ["location", "city", "address", "state", "country"] },
    { key: "linkedin", exactAliases: ["linkedin", "linkedin url", "linkedin profile"], keywordHints: ["linkedin"] },
    { key: "github", exactAliases: ["github", "github url", "github profile"], keywordHints: ["github"] },
    { key: "portfolio", exactAliases: ["portfolio", "portfolio url", "website", "personal site"], keywordHints: ["portfolio", "website", "personal site"] },
    { key: "workAuthorization", exactAliases: ["work authorization", "work authorised", "right to work", "eligible to work"], keywordHints: ["work authorization", "right to work", "eligible to work"] },
    { key: "requiresSponsorship", exactAliases: ["require sponsorship", "requires sponsorship", "need sponsorship", "visa sponsorship"], keywordHints: ["sponsorship", "visa sponsorship"] },
    { key: "name", exactAliases: ["name", "full name", "fullname", "your name"], keywordHints: ["full name", "your name", "name"] },
    { key: "password", exactAliases: ["password", "choose password"], keywordHints: ["password", "choose password", "retype password", "confirm password"] }
  ]);

  const PROTECTED_FIELD_RULES = Object.freeze([
    { category: "work authorization", keywords: ["work authorization", "right to work", "eligible to work", "work permit", "employment authorization"] },
    { category: "visa sponsorship", keywords: ["visa sponsorship", "require sponsorship", "need sponsorship", "sponsor visa", "sponsorship"] },
    { category: "diversity consent", keywords: ["diversity consent", "diversity and inclusion", "diversity", "equal opportunity"] },
    { category: "gender", keywords: ["gender", "sex at birth", "sex"] },
    { category: "disability", keywords: ["disability", "disabled status", "disability status"] },
    { category: "relatives at company", keywords: ["relatives at company", "relative at company", "related to employee", "family employed", "relative working"] },
    { category: "former employee", keywords: ["former employee", "previously employed", "prior employee", "previous contractor"] },
    { category: "criminal history", keywords: ["criminal history", "convicted", "felony", "background conviction"] },
    { category: "salary expectation", keywords: ["salary expectation", "expected salary", "salary requirement", "compensation expectation", "desired salary"] },
    { category: "notice period", keywords: ["notice period", "how soon can you start", "available to start", "start date availability"] }
  ]);

  const SKIPPED_INPUT_TYPES = new Set(["radio", "file", "submit", "reset", "button", "hidden"]);
  const SCAN_SKIP_INPUT_TYPES = new Set(["hidden", "submit", "reset", "button", "image"]);
  const SUPPORTED_INPUT_TYPES = new Set(["text", "email", "tel", "password"]);

  const HSBC_RULES = Object.freeze([
    { key: "email", reason: "HSBC_RETYPE_EMAIL", aliases: ["retype email address", "retype email", "confirm email", "confirm email address", "重新键入电子邮箱地址"] },
    { key: "email", reason: "HSBC_EMAIL", aliases: ["email address", "email", "电子邮箱地址"] },
    { key: "password", reason: "HSBC_RETYPE_PASSWORD", aliases: ["retype password", "confirm password", "重新键入密码"] },
    { key: "password", reason: "HSBC_CHOOSE_PASSWORD", aliases: ["choose password", "password", "选择密码"] },
    { key: "legalFirstName", reason: "HSBC_LEGAL_FIRST_NAME", aliases: ["legal first name", "first name legal", "名字"] },
    { key: "legalLastName", reason: "HSBC_LEGAL_LAST_NAME", aliases: ["legal last name", "last name legal", "姓氏"] },
    { key: "preferredFirstName", reason: "HSBC_PREFERRED_FIRST_NAME", aliases: ["preferred first name", "preferred name", "首选名字"], fallbackKey: "legalFirstName" },
    { key: "chineseFirstName", reason: "HSBC_CHINESE_FIRST_NAME", aliases: ["chinese first name", "first name in chinese", "中文名字"] },
    { key: "chineseLastName", reason: "HSBC_CHINESE_LAST_NAME", aliases: ["chinese last name", "last name in chinese", "中文姓氏"] },
    { key: "internationalCallingCode", reason: "HSBC_INTERNATIONAL_CALLING_CODE", aliases: ["international calling code", "calling code", "international dialing code", "国际电话区号"] },
    { key: "preferredContactNumber", reason: "HSBC_PREFERRED_CONTACT_NUMBER", aliases: ["preferred contact number", "contact number", "mobile number", "phone number", "首选联系电话"], fallbackKey: "phone" },
    { key: "hasRelativesAtHsbc", reason: "HSBC_RELATIVES_QUESTION", aliases: ["do you have any relatives working with hsbc group", "relatives working with hsbc group", "relatives working with hsbc", "您有没有亲戚在汇丰集团工作"] },
    {
      key: "relativesDetails",
      reason: "HSBC_RELATIVES_DETAILS",
      aliases: [
        "if you have any relative working with hsbc group please provide",
        "please provide name additional information such as location job title department",
        "relative working with hsbc group provide name additional information",
        "如果您有任何亲戚在汇丰集团工作请提供姓名和其他信息"
      ],
      conditionalOnKey: "hasRelativesAtHsbc"
    },
    {
      key: "isFormerEmployeeOrContractor",
      reason: "HSBC_FORMER_EMPLOYEE_OR_CONTRACTOR_QUESTION",
      aliases: [
        "are you a former employee or currently engaged as a contractor consultant or service provider",
        "former employee",
        "contractor consultant service provider",
        "您是前雇员还是目前受雇于承包商顾问或服务提供商"
      ]
    },
    {
      key: "employeeIdOrContractorInfo",
      reason: "HSBC_EMPLOYEE_CONTRACTOR_INFO",
      aliases: [
        "if you were formerly employed by hsbc group or currently engaged as a contractor consultant or service provider please provide your employee",
        "please provide your employee",
        "employee contractor information",
        "如果您曾是汇丰集团的员工或者目前以承包商顾问或服务提供商的身份受聘于汇丰集团请提供您的员工编号"
      ],
      conditionalOnKey: "isFormerEmployeeOrContractor"
    },
    { key: "diversityConsent", reason: "HSBC_DIVERSITY_CONSENT", aliases: ["diversity and inclusion consent", "多元化与包容性同意声明"] },
    { key: "gender", reason: "HSBC_GENDER", aliases: ["gender as shown on your national id", "gender", "性别与您的身份证件上显示的性别一致", "性别"] },
    { key: "rightToWork", reason: "HSBC_RIGHT_TO_WORK", aliases: ["are you eligible to work in the country territory where this role is based", "eligible to work", "您是否有权在该职位所在的国家地区工作"] },
    { key: "externalAuditorEmployment", reason: "HSBC_EXTERNAL_AUDITOR", aliases: ["have you been employed or are still employed by hsbc s external auditors", "external auditors", "您是否曾受雇于或仍在受雇于汇丰的外部审计师"] },
    { key: "countryTerritory", reason: "HSBC_COUNTRY_TERRITORY", aliases: ["country territory", "country", "居住国家地区"] },
    { key: "profileVisibility", reason: "HSBC_PROFILE_VISIBILITY", aliases: ["make my profile visible to", "可查看我的档案的人员"] },
    { key: "dataPrivacyAccepted", reason: "HSBC_DATA_PRIVACY_ACCEPTED", aliases: ["read and accept the data privacy statement", "data privacy", "使用条款", "阅读并接受数据隐私声明"] }
  ]);

  const HSBC_DETECTION_KEYWORDS = Object.freeze([
    "hsbc",
    "汇丰",
    "retype email address",
    "重新键入电子邮箱地址",
    "retype password",
    "重新键入密码",
    "legal first name",
    "名字",
    "service provider",
    "relatives working with hsbc group",
    "亲戚在汇丰集团工作"
  ]);
  const REQUIRED_PROFILE_KEYS_FOR_HSBC = Object.freeze([
    "email",
    "legalFirstName",
    "legalLastName"
  ]);
  const SF_HSBC_REQUIRED_SELECTORS = Object.freeze([
    "form#careerform",
    "#fieldsContainer",
    "#rcmQuickApplyAttachmentCtr"
  ]);
  const SF_HSBC_FIELD_ID_RULES = Object.freeze({
    fbclc_username: { key: "email", reason: "SF_HSBC_ID_EMAIL" },
    fbclc_emailconf: { key: "email", reason: "SF_HSBC_ID_RETYPE_EMAIL" }
  });

  const runtimeDebugState = {
    lastRun: null
  };

  function cleanString(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  }

  function toProfileValue(value) {
    if (typeof value === "string") {
      return cleanString(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return "";
  }

  function debugLog(step, payload) {
    if (payload === undefined) {
      console.log("[Stage6][HSBC] " + step);
      return;
    }
    console.log("[Stage6][HSBC] " + step, payload);
  }

  function debugLogSf(step, payload) {
    if (payload === undefined) {
      console.log("[Stage6][SF-HSBC] " + step);
      return;
    }
    console.log("[Stage6][SF-HSBC] " + step, payload);
  }

  function debugLogProfile(step, payload) {
    if (payload === undefined) {
      console.log("[Stage6][Profile] " + step);
      return;
    }
    console.log("[Stage6][Profile] " + step, payload);
  }

  function uniqueList(values) {
    return Array.from(new Set((values || []).map(function mapValue(item) {
      return cleanString(item);
    }).filter(Boolean)));
  }

  function getStorageArea() {
    if (!global.chrome || !chrome.storage || !chrome.storage.local) {
      return null;
    }
    return chrome.storage.local;
  }

  function getLocal(keys) {
    const storage = getStorageArea();
    if (!storage) {
      return Promise.resolve({});
    }

    return new Promise(function wrap(resolve, reject) {
      storage.get(keys, function onGet(result) {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function toValuePreview(value) {
    const text = cleanString(value);
    if (!text) {
      return "";
    }
    return text.length <= 48 ? text : text.slice(0, 45) + "...";
  }

  function toFieldKey(field) {
    return cleanString(field && field.name) || cleanString(field && field.id) || cleanString(field && field.label) || cleanString(field && field.selector) || "unknown";
  }

  function normalizeToken(value) {
    return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function normalizeLoose(value) {
    const text = cleanString(value)
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[：:＊*，,。；;！？!？【】\[\]（）()《》<>]/g, " ")
      .toLowerCase();

    return text.replace(/[\s_./\\'"`~!@#$%^&?+=|-]+/g, " ").trim();
  }

  function normalizeCompact(value) {
    return normalizeLoose(value).replace(/\s+/g, "");
  }

  function matchesAlias(candidate, alias) {
    const normalizedCandidate = normalizeLoose(candidate);
    const normalizedAlias = normalizeLoose(alias);
    if (!normalizedCandidate || !normalizedAlias) {
      return false;
    }

    if (normalizedCandidate === normalizedAlias || normalizedCandidate.indexOf(normalizedAlias) !== -1) {
      return true;
    }

    const compactCandidate = normalizeCompact(candidate);
    const compactAlias = normalizeCompact(alias);
    if (!compactCandidate || !compactAlias) {
      return false;
    }

    return compactCandidate === compactAlias || compactCandidate.indexOf(compactAlias) !== -1;
  }

  function findHeaderLink(header, keyword) {
    if (!header || !Array.isArray(header.links)) {
      return "";
    }

    const token = cleanString(keyword).toLowerCase();
    for (let index = 0; index < header.links.length; index += 1) {
      const item = header.links[index] && typeof header.links[index] === "object" ? header.links[index] : {};
      const label = cleanString(item.label).toLowerCase();
      const url = cleanString(item.url);
      if (url && (label.indexOf(token) !== -1 || url.toLowerCase().indexOf(token) !== -1)) {
        return url;
      }
    }

    return "";
  }

  function pickFirstNonEmpty(values) {
    for (let index = 0; index < values.length; index += 1) {
      const text = toProfileValue(values[index]);
      if (text) {
        return text;
      }
    }

    return "";
  }

  function splitName(name) {
    const text = cleanString(name);
    if (!text) {
      return { firstName: "", lastName: "" };
    }

    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return { firstName: "", lastName: "" };
    }

    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "" };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ")
    };
  }

  function readHsbcNested(raw, key) {
    if (!isObject(raw)) {
      return "";
    }

    const direct = cleanString(raw[key]);
    if (direct) {
      return direct;
    }

    const hsbc = isObject(raw.hsbc) ? raw.hsbc : {};
    const apply = isObject(raw.apply) ? raw.apply : {};

    return cleanString(hsbc[key]) || cleanString(apply[key]);
  }

  function buildApplyProfile(source) {
    const profile = {};
    const raw = isObject(source) ? source : {};
    const header = isObject(raw.header) ? raw.header : {};

    const name = pickFirstNonEmpty([
      raw.name,
      raw.fullName,
      raw.full_name,
      header.name
    ]);

    const split = splitName(name);

    profile.name = name;
    profile.email = pickFirstNonEmpty([raw.email, header.email]);
    profile.phone = pickFirstNonEmpty([raw.phone, header.phone]);
    profile.location = pickFirstNonEmpty([raw.location, header.location]);
    profile.linkedin = pickFirstNonEmpty([raw.linkedin, findHeaderLink(header, "linkedin")]);
    profile.github = pickFirstNonEmpty([raw.github, findHeaderLink(header, "github")]);
    profile.portfolio = pickFirstNonEmpty([raw.portfolio, raw.website, findHeaderLink(header, "portfolio")]);
    profile.workAuthorization = pickFirstNonEmpty([raw.workAuthorization, raw.rightToWork, readHsbcNested(raw, "workAuthorization"), readHsbcNested(raw, "rightToWork")]);
    profile.requiresSponsorship = pickFirstNonEmpty([raw.requiresSponsorship, readHsbcNested(raw, "requiresSponsorship")]);

    profile.password = pickFirstNonEmpty([raw.password, readHsbcNested(raw, "password")]);
    profile.legalFirstName = pickFirstNonEmpty([raw.legalFirstName, readHsbcNested(raw, "legalFirstName"), split.firstName]);
    profile.legalLastName = pickFirstNonEmpty([raw.legalLastName, readHsbcNested(raw, "legalLastName"), split.lastName]);
    profile.preferredFirstName = pickFirstNonEmpty([raw.preferredFirstName, readHsbcNested(raw, "preferredFirstName")]);
    profile.chineseFirstName = pickFirstNonEmpty([raw.chineseFirstName, readHsbcNested(raw, "chineseFirstName")]);
    profile.chineseLastName = pickFirstNonEmpty([raw.chineseLastName, readHsbcNested(raw, "chineseLastName")]);
    profile.internationalCallingCode = pickFirstNonEmpty([raw.internationalCallingCode, readHsbcNested(raw, "internationalCallingCode")]);
    profile.preferredContactNumber = pickFirstNonEmpty([raw.preferredContactNumber, readHsbcNested(raw, "preferredContactNumber")]);
    profile.hasRelativesAtHsbc = pickFirstNonEmpty([raw.hasRelativesAtHsbc, readHsbcNested(raw, "hasRelativesAtHsbc")]);
    profile.relativesDetails = pickFirstNonEmpty([raw.relativesDetails, readHsbcNested(raw, "relativesDetails")]);
    profile.isFormerEmployeeOrContractor = pickFirstNonEmpty([
      raw.isFormerEmployeeOrContractor,
      readHsbcNested(raw, "isFormerEmployeeOrContractor")
    ]);
    profile.employeeIdOrContractorInfo = pickFirstNonEmpty([
      raw.employeeIdOrContractorInfo,
      readHsbcNested(raw, "employeeIdOrContractorInfo")
    ]);
    profile.diversityConsent = pickFirstNonEmpty([raw.diversityConsent, readHsbcNested(raw, "diversityConsent")]);
    profile.gender = pickFirstNonEmpty([raw.gender, readHsbcNested(raw, "gender")]);
    profile.rightToWork = pickFirstNonEmpty([raw.rightToWork, readHsbcNested(raw, "rightToWork")]);
    profile.externalAuditorEmployment = pickFirstNonEmpty([
      raw.externalAuditorEmployment,
      readHsbcNested(raw, "externalAuditorEmployment")
    ]);
    profile.countryTerritory = pickFirstNonEmpty([raw.countryTerritory, raw.country, readHsbcNested(raw, "countryTerritory")]);
    profile.profileVisibility = pickFirstNonEmpty([raw.profileVisibility, readHsbcNested(raw, "profileVisibility")]);
    profile.dataPrivacyAccepted = pickFirstNonEmpty([raw.dataPrivacyAccepted, readHsbcNested(raw, "dataPrivacyAccepted")]);

    return profile;
  }

  function hasCandidateSignal(profile) {
    if (!isObject(profile)) {
      return false;
    }

    for (let index = 0; index < PROFILE_KEYS.length; index += 1) {
      const key = PROFILE_KEYS[index];
      if (cleanString(profile[key])) {
        return true;
      }
    }

    return false;
  }

  function getMissingProfileKeys(profile, keys) {
    return (keys || []).filter(function filterKey(key) {
      return !cleanString(profile && profile[key]);
    });
  }

  function detectPageLanguage(formFields) {
    const htmlLang = cleanString(document.documentElement && document.documentElement.lang).toLowerCase();
    if (htmlLang) {
      if (htmlLang.indexOf("zh") !== -1) {
        return "zh";
      }
      if (htmlLang.indexOf("en") !== -1) {
        return "en";
      }
    }

    const labels = (formFields || []).map(function mapLabel(field) {
      return cleanString(field && field.label);
    }).join(" ");

    if (/[\u4e00-\u9fff]/.test(labels)) {
      return "zh";
    }

    return "en";
  }

  function pickFirstStorageCandidate(storagePayload) {
    for (let index = 0; index < CANDIDATE_STORAGE_PRIORITY.length; index += 1) {
      const key = CANDIDATE_STORAGE_PRIORITY[index];
      const value = storagePayload && storagePayload[key];
      if (isObject(value)) {
        return {
          sourceKey: key,
          value: value
        };
      }
    }

    return null;
  }

  function getProfileKeys(profile) {
    return PROFILE_KEYS.filter(function filterKey(key) {
      return Boolean(toProfileValue(profile && profile[key]));
    });
  }

  async function loadProfileFromLocalStorage() {
    const loader = global.Stage5ProfileLoader;
    if (loader && typeof loader.loadCandidateProfile === "function") {
      const loaded = await loader.loadCandidateProfile();
      const candidate = loaded && typeof loaded === "object" ? loaded.candidateResume : null;
      const profile = buildApplyProfile(candidate);
      return {
        profile: profile,
        source: "local-storage",
        sourceDetail: loaded && typeof loaded === "object" ? cleanString(loaded.source) : "stage5-loader"
      };
    }

    const storagePayload = await getLocal(CANDIDATE_STORAGE_PRIORITY);
    const candidate = pickFirstStorageCandidate(storagePayload);
    const profile = buildApplyProfile(candidate ? candidate.value : {});

    return {
      profile: profile,
      source: "local-storage",
      sourceDetail: candidate ? "chrome.storage.local:" + candidate.sourceKey : ""
    };
  }

  async function loadProfileFromMockJson() {
    if (!global.chrome || !chrome.runtime || typeof chrome.runtime.getURL !== "function") {
      throw new Error("chrome.runtime.getURL is unavailable");
    }

    const mockUrl = chrome.runtime.getURL(MOCK_PROFILE_PATH);
    const response = await fetch(mockUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("fetch failed with status " + String(response.status));
    }

    const rawProfile = await response.json();
    const profile = buildApplyProfile(rawProfile);
    return {
      profile: profile,
      source: "mock-json",
      sourceDetail: mockUrl
    };
  }

  async function loadCandidateProfile() {
    debugLogProfile("trying local storage");
    try {
      const localResult = await loadProfileFromLocalStorage();
      const localProfile = localResult && localResult.profile ? localResult.profile : {};
      if (hasCandidateSignal(localProfile)) {
        debugLogProfile("loaded profile from local-storage", {
          sourceDetail: cleanString(localResult.sourceDetail) || "unknown"
        });
        debugLogProfile("profile keys: " + getProfileKeys(localProfile).join(", "));
        return {
          profile: localProfile,
          source: "local-storage",
          sourceDetail: cleanString(localResult.sourceDetail)
        };
      }

      debugLogProfile("local storage not found", {
        sourceDetail: cleanString(localResult && localResult.sourceDetail) || "empty"
      });
    } catch (error) {
      debugLogProfile("local storage not found", {
        reason: error instanceof Error ? error.message : String(error)
      });
    }

    debugLogProfile("trying mockCandidateProfile.json", {
      path: MOCK_PROFILE_PATH
    });

    try {
      const mockResult = await loadProfileFromMockJson();
      const mockProfile = mockResult && mockResult.profile ? mockResult.profile : {};
      if (hasCandidateSignal(mockProfile)) {
        debugLogProfile("loaded profile from mock-json", {
          path: MOCK_PROFILE_PATH,
          url: cleanString(mockResult.sourceDetail) || ""
        });
        debugLogProfile("profile keys: " + getProfileKeys(mockProfile).join(", "));
        return {
          profile: mockProfile,
          source: "mock-json",
          sourceDetail: cleanString(mockResult.sourceDetail)
        };
      }

      debugLogProfile("mockCandidateProfile.json invalid or empty", {
        path: MOCK_PROFILE_PATH
      });
    } catch (error) {
      const mockUrl = global.chrome && chrome.runtime && typeof chrome.runtime.getURL === "function"
        ? chrome.runtime.getURL(MOCK_PROFILE_PATH)
        : "";
      debugLogProfile("mockCandidateProfile.json load failed", {
        path: MOCK_PROFILE_PATH,
        url: mockUrl,
        reason: error instanceof Error ? error.message : String(error)
      });
    }

    return {
      profile: {},
      source: "",
      sourceDetail: ""
    };
  }

  function escapeCssIdentifier(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }

    return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  }

  function escapeAttributeValue(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function getPathSegment(element) {
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (!parent) {
      return tag;
    }

    const siblings = Array.from(parent.children).filter(function filterChild(child) {
      return child.tagName === element.tagName;
    });

    if (siblings.length <= 1) {
      return tag;
    }

    const index = siblings.indexOf(element) + 1;
    return tag + ":nth-of-type(" + String(index) + ")";
  }

  function buildPathSelector(element) {
    const segments = [];
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      const currentId = cleanString(current.id);
      if (currentId) {
        segments.unshift(current.tagName.toLowerCase() + "#" + escapeCssIdentifier(currentId));
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

  function buildStableSelector(field) {
    const tag = field.tagName.toLowerCase();
    const id = cleanString(field.id);
    if (id) {
      return tag + "#" + escapeCssIdentifier(id);
    }

    const name = cleanString(field.getAttribute("name"));
    if (name) {
      const byName = tag + "[name=\"" + escapeAttributeValue(name) + "\"]";
      if (isUniqueSelector(byName)) {
        return byName;
      }

      const form = field.closest("form");
      if (form) {
        const formId = cleanString(form.id);
        if (formId) {
          const formScoped = "form#" + escapeCssIdentifier(formId) + " " + byName;
          if (isUniqueSelector(formScoped)) {
            return formScoped;
          }
        }

        const formPath = buildPathSelector(form);
        if (formPath) {
          const formPathScoped = formPath + " " + byName;
          if (isUniqueSelector(formPathScoped)) {
            return formPathScoped;
          }
        }
      }
    }

    const pathSelector = buildPathSelector(field);
    return pathSelector || tag;
  }

  function getLabelFromForAttribute(field) {
    const id = cleanString(field.id);
    if (!id) {
      return "";
    }

    const labels = Array.from(document.querySelectorAll("label[for]"));
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index];
      if (cleanString(label.getAttribute("for")) === id) {
        return cleanString(label.textContent);
      }
    }

    return "";
  }

  function getFieldLabel(field) {
    const labelByFor = getLabelFromForAttribute(field);
    if (labelByFor) {
      return labelByFor;
    }

    const nativeLabels = field.labels;
    if (nativeLabels && nativeLabels.length) {
      for (let index = 0; index < nativeLabels.length; index += 1) {
        const text = cleanString(nativeLabels[index].textContent);
        if (text) {
          return text;
        }
      }
    }

    const ariaLabel = cleanString(field.getAttribute("aria-label"));
    if (ariaLabel) {
      return ariaLabel;
    }

    const title = cleanString(field.getAttribute("title"));
    if (title) {
      return title;
    }

    const placeholder = cleanString(field.getAttribute("placeholder"));
    if (placeholder) {
      return placeholder;
    }

    return cleanString(field.getAttribute("name"));
  }

  function getFieldType(field) {
    if (field instanceof HTMLInputElement) {
      return cleanString(field.type).toLowerCase() || "text";
    }

    if (field instanceof HTMLTextAreaElement) {
      return "textarea";
    }

    return "select";
  }

  function getSelectOptions(field) {
    if (!(field instanceof HTMLSelectElement)) {
      return undefined;
    }

    return Array.from(field.options).map(function mapOption(option) {
      return cleanString(option.textContent) || cleanString(option.value);
    }).filter(Boolean);
  }

  function shouldScanField(field) {
    if (field.disabled) {
      return false;
    }

    if (field instanceof HTMLInputElement) {
      const inputType = cleanString(field.type).toLowerCase() || "text";
      if (SCAN_SKIP_INPUT_TYPES.has(inputType)) {
        return false;
      }
    }

    return true;
  }

  function detectSuccessFactorsHsbcPatch() {
    const hostname = cleanString(window.location && window.location.hostname).toLowerCase();
    const signals = [];

    if (hostname.indexOf("successfactors") !== -1) {
      signals.push("HOST_SUCCESSFACTORS");
    }
    if (document.querySelector("form#careerform")) {
      signals.push("FORM_CAREERFORM");
    }
    if (document.querySelector("#fieldsContainer")) {
      signals.push("FIELDS_CONTAINER");
    }
    if (document.querySelector("#rcmQuickApplyAttachmentCtr")) {
      signals.push("UPLOAD_CONTAINER");
    }

    const companyInput = document.querySelector("#career_company");
    const companyValue = cleanString(companyInput && companyInput.getAttribute("value")).toLowerCase();
    if (companyValue === "hsbcholdin") {
      signals.push("CAREER_COMPANY_HSBCHOLDIN");
    }

    const body = document.body;
    const bodyClass = body ? cleanString(body.className).toLowerCase() : "";
    if (bodyClass.indexOf("careersite") !== -1 || bodyClass.indexOf("mobileapplyctr") !== -1) {
      signals.push("BODY_CAREER_SITE");
    }

    const isDetected =
      signals.indexOf("HOST_SUCCESSFACTORS") !== -1 &&
      (
        signals.indexOf("FORM_CAREERFORM") !== -1 ||
        signals.indexOf("FIELDS_CONTAINER") !== -1 ||
        signals.indexOf("UPLOAD_CONTAINER") !== -1 ||
        signals.indexOf("CAREER_COMPANY_HSBCHOLDIN") !== -1
      );

    return {
      isDetected: isDetected,
      signals: uniqueList(signals)
    };
  }

  function getFieldContainerSelector(field) {
    const container = field.closest("#fieldsContainer tr, #fieldsContainer td, #fieldsContainer div, #fieldsContainer li, #rcmQuickApplyAttachmentCtr, form#careerform");
    if (!container) {
      return "";
    }
    return buildPathSelector(container);
  }

  function normalizeScannedField(field) {
    return {
      id: cleanString(field.id) || undefined,
      selector: buildStableSelector(field),
      type: getFieldType(field),
      label: getFieldLabel(field) || undefined,
      name: cleanString(field.getAttribute("name")) || undefined,
      placeholder: cleanString(field.getAttribute("placeholder")) || undefined,
      required: Boolean(field.required || cleanString(field.getAttribute("aria-required")).toLowerCase() === "true"),
      containerSelector: getFieldContainerSelector(field) || undefined,
      isVisible: isLikelyVisible(field),
      isDisabled: Boolean(field.disabled)
    };
  }

  function scanSuccessFactorsHsbcForm() {
    const output = [];
    const seen = new Set();
    const selectors = [
      "#fieldsContainer input",
      "#fieldsContainer textarea",
      "#fieldsContainer select",
      "form#careerform input",
      "form#careerform textarea",
      "form#careerform select",
      "#rcmQuickApplyAttachmentCtr input[type=\"file\"]"
    ];

    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
      const selector = selectors[selectorIndex];
      const nodes = Array.from(document.querySelectorAll(selector));
      for (let index = 0; index < nodes.length; index += 1) {
        const field = nodes[index];
        if (!shouldScanField(field)) {
          continue;
        }
        if (seen.has(field)) {
          continue;
        }
        seen.add(field);

        const normalized = normalizeScannedField(field);
        const options = getSelectOptions(field);
        if (Array.isArray(options)) {
          normalized.options = options;
        }
        output.push(normalized);
      }
    }

    return output;
  }

  function scanForm() {
    const sfPatch = detectSuccessFactorsHsbcPatch();
    if (sfPatch.isDetected) {
      return scanSuccessFactorsHsbcForm();
    }

    const fields = Array.from(document.querySelectorAll("input, textarea, select"));
    const output = [];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (!shouldScanField(field)) {
        continue;
      }
      const normalized = normalizeScannedField(field);
      const options = getSelectOptions(field);
      if (Array.isArray(options)) {
        normalized.options = options;
      }
      output.push(normalized);
    }
    return output;
  }

  function getFieldCandidates(field) {
    const raw = [field.label, field.name, field.id, field.placeholder, field.type].map(cleanString).filter(Boolean);
    return Array.from(new Set(raw));
  }

  function getProtectedFieldCategory(field) {
    const candidates = getFieldCandidates(field).map(function normalize(item) {
      return normalizeLoose(item);
    }).filter(Boolean);

    if (!candidates.length) {
      return "";
    }

    for (let ruleIndex = 0; ruleIndex < PROTECTED_FIELD_RULES.length; ruleIndex += 1) {
      const rule = PROTECTED_FIELD_RULES[ruleIndex];
      for (let keywordIndex = 0; keywordIndex < rule.keywords.length; keywordIndex += 1) {
        const keyword = normalizeLoose(rule.keywords[keywordIndex]);
        if (!keyword) {
          continue;
        }

        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
          const candidate = candidates[candidateIndex];
          if (candidate === keyword || candidate.indexOf(keyword) !== -1 || keyword.indexOf(candidate) !== -1) {
            return rule.category;
          }
        }
      }
    }

    return "";
  }

  function detectHsbcPatch(formFields) {
    const sfPatch = detectSuccessFactorsHsbcPatch();
    const hostname = cleanString(window.location && window.location.hostname).toLowerCase();
    const pageTitle = cleanString(document.title).toLowerCase();
    const signals = [];

    if (hostname.indexOf("hsbc") !== -1) {
      signals.push("HOSTNAME_HSBC");
    }
    if (pageTitle.indexOf("hsbc") !== -1) {
      signals.push("TITLE_HSBC");
    }

    const allCandidates = formFields.reduce(function reduceCandidates(output, field) {
      return output.concat(getFieldCandidates(field));
    }, []).map(function mapCandidate(item) {
      return normalizeLoose(item);
    }).filter(Boolean);

    for (let index = 0; index < HSBC_DETECTION_KEYWORDS.length; index += 1) {
      const keyword = HSBC_DETECTION_KEYWORDS[index];
      const normalizedKeyword = normalizeLoose(keyword);
      if (!normalizedKeyword) {
        continue;
      }
      if (allCandidates.some(function matcher(candidate) { return candidate.indexOf(normalizedKeyword) !== -1; })) {
        signals.push("FIELD_" + normalizeCompact(keyword).slice(0, 24));
      }
    }

    if (sfPatch.isDetected) {
      signals.push("SF_HSBC_PATCH");
    }

    const isDetected = sfPatch.isDetected || signals.length >= 2 || (signals.length >= 1 && hostname.indexOf("hsbc") !== -1);
    return {
      isDetected: isDetected,
      signals: uniqueList(signals)
    };
  }

  function matchHsbcField(field) {
    const normalizedId = normalizeCompact(field && field.id);
    if (normalizedId && SF_HSBC_FIELD_ID_RULES[normalizedId]) {
      const idRule = SF_HSBC_FIELD_ID_RULES[normalizedId];
      return {
        key: idRule.key,
        reason: idRule.reason
      };
    }

    const candidates = getFieldCandidates(field);
    if (!candidates.length) {
      return null;
    }

    for (let ruleIndex = 0; ruleIndex < HSBC_RULES.length; ruleIndex += 1) {
      const rule = HSBC_RULES[ruleIndex];
      for (let aliasIndex = 0; aliasIndex < rule.aliases.length; aliasIndex += 1) {
        const alias = rule.aliases[aliasIndex];
        if (candidates.some(function matcher(candidate) { return matchesAlias(candidate, alias); })) {
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

  function normalizeYesNoValue(value) {
    const normalized = normalizeCompact(value);
    if (!normalized) {
      return "";
    }

    if (["yes", "y", "true", "1", "是", "有", "同意", "接受", "可", "可以"].indexOf(normalized) !== -1) {
      return "Yes";
    }
    if (["no", "n", "false", "0", "否", "没有", "無", "不同意", "不接受", "不可"].indexOf(normalized) !== -1) {
      return "No";
    }
    return cleanString(value);
  }

  function isNegativeAnswer(value) {
    return normalizeYesNoValue(value) === "No";
  }

  function matchesKeyword(candidateLower, hint) {
    const normalizedHint = cleanString(hint).toLowerCase();
    if (!normalizedHint) {
      return false;
    }

    if (normalizedHint.indexOf(" ") !== -1) {
      return candidateLower.indexOf(normalizedHint) !== -1;
    }

    const pattern = new RegExp("(^|[^a-z0-9])" + normalizedHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)");
    return pattern.test(candidateLower);
  }

  function resolveProfile(profileData) {
    const profile = {};

    for (let index = 0; index < PROFILE_KEYS.length; index += 1) {
      const key = PROFILE_KEYS[index];
      const value = cleanString(profileData[key]);
      if (value) {
        profile[key] = value;
      }
    }

    return profile;
  }

  function getProfileValue(profile, key, fallbackKey) {
    const primary = cleanString(profile[key]);
    if (primary) {
      if (key === "hasRelativesAtHsbc" || key === "isFormerEmployeeOrContractor") {
        return normalizeYesNoValue(primary);
      }
      return primary;
    }

    if (fallbackKey) {
      const fallback = cleanString(profile[fallbackKey]);
      if (fallback) {
        return fallback;
      }
    }

    return "";
  }

  function findMatchedKey(field) {
    const candidates = getFieldCandidates(field);
    if (!candidates.length) {
      return null;
    }

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      for (let configIndex = 0; configIndex < KEY_CONFIGS.length; configIndex += 1) {
        const config = KEY_CONFIGS[configIndex];
        if (config.exactAliases.some(function aliasMatcher(alias) { return candidate === alias; })) {
          return { key: config.key, reason: "EXACT_MATCH" };
        }
      }
    }

    const normalizedCandidates = candidates.map(normalizeToken).filter(Boolean);
    for (let candidateIndex = 0; candidateIndex < normalizedCandidates.length; candidateIndex += 1) {
      const candidate = normalizedCandidates[candidateIndex];
      for (let configIndex = 0; configIndex < KEY_CONFIGS.length; configIndex += 1) {
        const config = KEY_CONFIGS[configIndex];
        const aliases = config.exactAliases.map(normalizeToken);
        if (aliases.indexOf(candidate) !== -1) {
          return { key: config.key, reason: "NORMALIZED_MATCH" };
        }
      }
    }

    const loweredCandidates = candidates.map(function lower(item) { return item.toLowerCase(); });
    for (let candidateIndex = 0; candidateIndex < loweredCandidates.length; candidateIndex += 1) {
      const candidate = loweredCandidates[candidateIndex];
      for (let configIndex = 0; configIndex < KEY_CONFIGS.length; configIndex += 1) {
        const config = KEY_CONFIGS[configIndex];
        if (config.keywordHints.some(function hintMatcher(hint) { return matchesKeyword(candidate, hint); })) {
          return { key: config.key, reason: "KEYWORD_MATCH" };
        }
      }
    }

    return null;
  }

  function shouldSkipField(field) {
    const fieldType = cleanString(field.type).toLowerCase();
    if (!fieldType) {
      return false;
    }

    return SKIPPED_INPUT_TYPES.has(fieldType);
  }

  function mapFields(formFields, profileData) {
    const profile = resolveProfile(profileData || {});
    const hsbcDetection = detectHsbcPatch(formFields);

    return formFields.map(function mapField(field) {
      if (shouldSkipField(field)) {
        return {
          field: field,
          status: "skipped",
          valuePreview: "",
          reason: "UNSUPPORTED_FIELD_TYPE"
        };
      }

      const protectedCategory = getProtectedFieldCategory(field);
      if (protectedCategory) {
        return {
          field: field,
          status: "skipped",
          valuePreview: "",
          reason: "PROTECTED_FIELD_FALLBACK_REQUIRED",
          protectedCategory: protectedCategory
        };
      }

      if (hsbcDetection.isDetected) {
        const hsbcMatch = matchHsbcField(field);
        if (hsbcMatch) {
          const conditionalOnKey = hsbcMatch.conditionalOnKey;
          if (conditionalOnKey) {
            const controllerValue = getProfileValue(profile, conditionalOnKey);
            if (isNegativeAnswer(controllerValue)) {
              return {
                field: field,
                matchedKey: hsbcMatch.key,
                status: "skipped",
                valuePreview: "",
                reason: "CONDITIONAL_SKIP_" + conditionalOnKey,
                patchTag: "HSBC"
              };
            }
          }

          const mappedValue = getProfileValue(profile, hsbcMatch.key, hsbcMatch.fallbackKey);
          if (!mappedValue) {
            return {
              field: field,
              matchedKey: hsbcMatch.key,
              status: "unknown",
              valuePreview: "",
              reason: "PROFILE_VALUE_MISSING",
              patchTag: "HSBC"
            };
          }

          return {
            field: field,
            matchedKey: hsbcMatch.key,
            mappedValue: mappedValue,
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
          field: field,
          status: "unknown",
          valuePreview: "",
          reason: "NO_PROFILE_KEY_MATCH"
        };
      }

      const mappedValue = cleanString(profile[matched.key]);
      if (!mappedValue) {
        return {
          field: field,
          matchedKey: matched.key,
          status: "unknown",
          valuePreview: "",
          reason: "PROFILE_VALUE_MISSING"
        };
      }

      return {
        field: field,
        matchedKey: matched.key,
        mappedValue: mappedValue,
        valuePreview: toValuePreview(mappedValue),
        status: "matched",
        reason: matched.reason
      };
    });
  }

  function buildNameFallbackSelector(field, escapedName) {
    const fieldType = cleanString(field.type).toLowerCase();

    if (fieldType === "textarea") {
      return "textarea[name=\"" + escapedName + "\"]";
    }

    if (fieldType === "email") {
      return "input[type=\"email\"][name=\"" + escapedName + "\"]";
    }

    if (fieldType === "tel") {
      return "input[type=\"tel\"][name=\"" + escapedName + "\"]";
    }

    if (fieldType === "text" || fieldType === "password") {
      return "input[type=\"" + fieldType + "\"][name=\"" + escapedName + "\"], input:not([type])[name=\"" + escapedName + "\"]";
    }

    return [
      "textarea[name=\"" + escapedName + "\"]",
      "input[type=\"text\"][name=\"" + escapedName + "\"]",
      "input[type=\"password\"][name=\"" + escapedName + "\"]",
      "input:not([type])[name=\"" + escapedName + "\"]",
      "input[type=\"email\"][name=\"" + escapedName + "\"]",
      "input[type=\"tel\"][name=\"" + escapedName + "\"]",
      "select[name=\"" + escapedName + "\"]"
    ].join(", ");
  }

  function resolveFieldElement(field) {
    const id = cleanString(field.id);
    if (id) {
      const byId = document.getElementById(id);
      if (byId) {
        return byId;
      }
    }

    const selector = cleanString(field.selector);
    if (selector) {
      try {
        const bySelector = document.querySelector(selector);
        if (bySelector) {
          return bySelector;
        }
      } catch {
        // ignore invalid selector
      }
    }

    const name = cleanString(field.name);
    if (name) {
      const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      try {
        const byName = document.querySelector(buildNameFallbackSelector(field, escapedName));
        if (byName) {
          return byName;
        }
      } catch {
        // ignore invalid selector
      }
    }

    return null;
  }

  function setNativeTextValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    const setter = descriptor && descriptor.set;

    if (typeof setter === "function") {
      setter.call(element, value);
      return;
    }

    element.value = value;
  }

  function dispatchTextEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("blur", { bubbles: false, cancelable: false }));
  }

  function dispatchSelectEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("blur", { bubbles: false, cancelable: false }));
  }

  function isSupportedTextFieldElement(element) {
    if (element instanceof HTMLTextAreaElement) {
      return true;
    }

    if (!(element instanceof HTMLInputElement)) {
      return false;
    }

    const inputType = cleanString(element.type).toLowerCase() || "text";
    return SUPPORTED_INPUT_TYPES.has(inputType);
  }

  function autofillTextFields(fieldMappings) {
    return fieldMappings.map(function mapFill(mapping) {
      const field = mapping.field;
      const fieldKey = toFieldKey(field);

      if (mapping.status !== "matched" || !cleanString(mapping.mappedValue)) {
        return {
          fieldKey: fieldKey,
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
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "error",
          valuePreview: toValuePreview(mapping.mappedValue),
          errorMessage: "ELEMENT_NOT_FOUND"
        };
      }

      if (!isSupportedTextFieldElement(element)) {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "skipped",
          valuePreview: toValuePreview(mapping.mappedValue),
          reason: "UNSUPPORTED_FIELD_ELEMENT"
        };
      }

      if (element.disabled || element.readOnly) {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "skipped",
          valuePreview: toValuePreview(mapping.mappedValue),
          reason: element.disabled ? "ELEMENT_DISABLED" : "ELEMENT_READONLY"
        };
      }

      try {
        setNativeTextValue(element, mapping.mappedValue);
        dispatchTextEvents(element);

        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "filled",
          value: mapping.mappedValue,
          valuePreview: toValuePreview(mapping.mappedValue)
        };
      } catch (error) {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "error",
          valuePreview: toValuePreview(mapping.mappedValue),
          errorMessage: error instanceof Error ? error.message : String(error)
        };
      }
    });
  }

  function toSelectMatchCandidates(rawValue) {
    const base = cleanString(rawValue);
    if (!base) {
      return [];
    }

    const output = [base];
    const lower = base.toLowerCase();

    if (["yes", "y", "true", "1", "是", "有", "同意", "接受", "可以"].indexOf(lower) !== -1) {
      output.push("Yes", "Y", "True", "1", "是", "有", "同意", "接受");
    } else if (["no", "n", "false", "0", "否", "没有", "無", "不同意"].indexOf(lower) !== -1) {
      output.push("No", "N", "False", "0", "否", "没有", "無", "不同意");
    }

    return uniqueList(output);
  }

  function selectBestOption(select, rawValue) {
    const candidates = toSelectMatchCandidates(rawValue);
    if (!candidates.length) {
      return null;
    }

    const options = Array.from(select.options);

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex].toLowerCase();
      const exact = options.find(function findOption(option) {
        return cleanString(option.textContent).toLowerCase() === candidate;
      });
      if (exact) {
        return exact;
      }
    }

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const normalizedCandidate = normalizeCompact(candidates[candidateIndex]);
      const normalized = options.find(function findOption(option) {
        const byText = normalizeCompact(option.textContent);
        const byValue = normalizeCompact(option.value);
        return byText === normalizedCandidate || byValue === normalizedCandidate;
      });
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  function autofillSelectFields(fieldMappings) {
    return fieldMappings.map(function mapFill(mapping) {
      const field = mapping.field;
      const fieldKey = toFieldKey(field);

      if (mapping.status !== "matched" || !cleanString(mapping.mappedValue)) {
        return {
          fieldKey: fieldKey,
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
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "error",
          valuePreview: toValuePreview(mapping.mappedValue),
          errorMessage: "ELEMENT_NOT_FOUND"
        };
      }

      if (!(element instanceof HTMLSelectElement)) {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "skipped",
          valuePreview: toValuePreview(mapping.mappedValue),
          reason: "UNSUPPORTED_SELECT_ELEMENT"
        };
      }

      if (element.disabled) {
        return {
          fieldKey: fieldKey,
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
          fieldKey: fieldKey,
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
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "filled",
          value: cleanString(selected.textContent) || selected.value,
          valuePreview: toValuePreview(cleanString(selected.textContent) || selected.value)
        };
      } catch (error) {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "error",
          valuePreview: toValuePreview(mapping.mappedValue),
          errorMessage: error instanceof Error ? error.message : String(error)
        };
      }
    });
  }

  function shouldCheckByValue(value) {
    const normalized = normalizeCompact(value);
    if (!normalized) {
      return false;
    }

    return ["yes", "y", "true", "1", "是", "有", "同意", "接受", "checked"].indexOf(normalized) !== -1;
  }

  function setNativeChecked(input, checked) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
    const setter = descriptor && descriptor.set;
    if (typeof setter === "function") {
      setter.call(input, checked);
      return;
    }
    input.checked = checked;
  }

  function autofillCheckboxFields(fieldMappings) {
    return fieldMappings.map(function mapFill(mapping) {
      const field = mapping.field;
      const fieldKey = toFieldKey(field);

      if (mapping.status !== "matched" || !cleanString(mapping.mappedValue)) {
        return {
          fieldKey: fieldKey,
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
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "error",
          valuePreview: toValuePreview(mapping.mappedValue),
          errorMessage: "ELEMENT_NOT_FOUND"
        };
      }

      if (!(element instanceof HTMLInputElement) || cleanString(element.type).toLowerCase() !== "checkbox") {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "skipped",
          valuePreview: toValuePreview(mapping.mappedValue),
          reason: "UNSUPPORTED_CHECKBOX_ELEMENT"
        };
      }

      if (element.disabled) {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "skipped",
          valuePreview: toValuePreview(mapping.mappedValue),
          reason: "ELEMENT_DISABLED"
        };
      }

      try {
        const shouldCheck = shouldCheckByValue(mapping.mappedValue);
        setNativeChecked(element, shouldCheck);
        dispatchTextEvents(element);

        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "filled",
          value: shouldCheck ? "checked" : "unchecked",
          valuePreview: shouldCheck ? "checked" : "unchecked"
        };
      } catch (error) {
        return {
          fieldKey: fieldKey,
          fieldId: field.id,
          fieldLabel: field.label,
          status: "error",
          valuePreview: toValuePreview(mapping.mappedValue),
          errorMessage: error instanceof Error ? error.message : String(error)
        };
      }
    });
  }

  function resolveUploadContainer() {
    return document.querySelector("#rcmQuickApplyAttachmentCtr");
  }

  function resolveUploadInput(selector) {
    const uploadContainer = resolveUploadContainer();
    if (uploadContainer) {
      const inContainer = Array.from(uploadContainer.querySelectorAll('input[type="file"]'));
      for (let index = 0; index < inContainer.length; index += 1) {
        if (!inContainer[index].disabled) {
          return inContainer[index];
        }
      }
      if (inContainer[0]) {
        return inContainer[0];
      }
    }

    const preferredSelector = cleanString(selector);
    if (preferredSelector) {
      const preferred = document.querySelector(preferredSelector);
      if (preferred instanceof HTMLInputElement && preferred.type === "file") {
        return preferred;
      }
    }

    const candidates = Array.from(document.querySelectorAll('input[type="file"]'));
    for (let index = 0; index < candidates.length; index += 1) {
      if (!candidates[index].disabled) {
        return candidates[index];
      }
    }

    return candidates[0] || null;
  }

  function base64ToUint8Array(base64) {
    const decoded = atob(base64);
    const output = new Uint8Array(decoded.length);

    for (let index = 0; index < decoded.length; index += 1) {
      output[index] = decoded.charCodeAt(index);
    }

    return output;
  }

  function setInputFiles(input, files) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
    const setter = descriptor && descriptor.set;

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

  function triggerUploadEvents(input) {
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  }

  async function uploadResume(input) {
    const resumeRegistry = global.Stage6ResumeRegistryStorage;
    const uploadContainer = resolveUploadContainer();
    const uploadInput = resolveUploadInput(input && input.selector);
    const fileInputSelector = uploadInput && uploadInput.id ? "#" + uploadInput.id : uploadInput ? "input[type=file]" : "";
    const uploadContainerFound = Boolean(uploadContainer);

    if (!uploadInput) {
      return {
        ok: false,
        message: "No file input found on current page.",
        reason: "FILE_INPUT_NOT_FOUND",
        fileInputFound: false,
        uploadContainerFound: uploadContainerFound
      };
    }

    if (!resumeRegistry || typeof resumeRegistry.getLatestCompiledResumeRecord !== "function") {
      return {
        ok: false,
        message: "Resume registry module is unavailable.",
        reason: "RESUME_REGISTRY_UNAVAILABLE",
        fileInputFound: true,
        fileInputSelector: fileInputSelector,
        uploadContainerFound: uploadContainerFound
      };
    }

    try {
      const requestedResumeId = cleanString(input && input.resumeId);
      const record = requestedResumeId && typeof resumeRegistry.getCompiledResumeById === "function"
        ? await resumeRegistry.getCompiledResumeById(requestedResumeId)
        : await resumeRegistry.getLatestCompiledResumeRecord();

      if (!record) {
        return {
          ok: false,
          message: "No compiled resume available in local registry.",
          reason: requestedResumeId ? "RESUME_ID_NOT_FOUND" : "NO_COMPILED_RESUME_AVAILABLE",
          fileInputFound: true,
          fileInputSelector: fileInputSelector,
          registryHasResume: false,
          uploadContainerFound: uploadContainerFound
        };
      }

      if (typeof resumeRegistry.getCompiledResumeBlobData !== "function") {
        return {
          ok: false,
          message: "Resume blob reader is unavailable.",
          resumeId: record.resumeId,
          fileName: record.fileName,
          reason: "RESUME_BLOB_READER_UNAVAILABLE",
          fileInputFound: true,
          fileInputSelector: fileInputSelector,
          registryHasResume: true,
          uploadContainerFound: uploadContainerFound
        };
      }

      const blobData = await resumeRegistry.getCompiledResumeBlobData(record.storageKey);
      if (!blobData || !cleanString(blobData.dataBase64)) {
        return {
          ok: false,
          message: "Compiled resume payload missing.",
          resumeId: record.resumeId,
          fileName: record.fileName,
          reason: "RESUME_PAYLOAD_NOT_FOUND",
          fileInputFound: true,
          fileInputSelector: fileInputSelector,
          registryHasResume: true,
          uploadContainerFound: uploadContainerFound
        };
      }

      if (typeof DataTransfer === "undefined") {
        return {
          ok: false,
          message: "DataTransfer API is unavailable on current page.",
          resumeId: record.resumeId,
          fileName: record.fileName,
          reason: "DATATRANSFER_UNAVAILABLE",
          fileInputFound: true,
          fileInputSelector: fileInputSelector,
          registryHasResume: true,
          uploadContainerFound: uploadContainerFound
        };
      }

      const fileBytes = base64ToUint8Array(blobData.dataBase64);
      const file = new File([fileBytes], record.fileName, {
        type: record.mimeType || blobData.mimeType || "application/octet-stream",
        lastModified: Date.parse(record.createdAt) || Date.now()
      });

      const transfer = new DataTransfer();
      transfer.items.add(file);

      setInputFiles(uploadInput, transfer.files);
      triggerUploadEvents(uploadInput);

      return {
        ok: true,
        message: "Resume uploaded from registry: " + record.resumeId,
        resumeId: record.resumeId,
        fileName: record.fileName,
        reason: "UPLOAD_OK",
        fileInputFound: true,
        fileInputSelector: fileInputSelector,
        registryHasResume: true,
        uploadContainerFound: uploadContainerFound
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        reason: "REGISTRY_ACCESS_FAILED",
        fileInputFound: true,
        fileInputSelector: fileInputSelector,
        uploadContainerFound: uploadContainerFound
      };
    }
  }

  function isUnknownRequiredField(fieldType, mapping) {
    if (fieldType === "file") {
      return false;
    }

    return !mapping || mapping.status !== "matched";
  }

  function isScanTarget(value) {
    return value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement || value instanceof HTMLSelectElement;
  }

  function resolveValidationFieldElement(field) {
    const selector = cleanString(field.selector);
    if (selector) {
      try {
        const bySelector = document.querySelector(selector);
        if (isScanTarget(bySelector)) {
          return bySelector;
        }
      } catch {
        // ignore
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
      const byName = document.querySelector('[name="' + escapedName + '"]');
      if (isScanTarget(byName)) {
        return byName;
      }
    }

    return null;
  }

  function toHumanFieldName(field) {
    return cleanString(field.label) || cleanString(field.name) || cleanString(field.id) || cleanString(field.selector) || "unknown";
  }

  function isRequiredValueMissing(fieldType, element, field) {
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
        const group = Array.from(document.querySelectorAll('input[type="radio"][name="' + escapedName + '"]'));
        return !group.some(function matcher(item) { return item.checked; });
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

  function isLikelyVisible(node) {
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

  function isLikelyValidationMessage(message, node) {
    const lowerMessage = cleanString(message).toLowerCase();
    const className = cleanString(node.className).toLowerCase();
    const role = cleanString(node.getAttribute("role")).toLowerCase();
    const ariaInvalid = cleanString(node.getAttribute("aria-invalid")).toLowerCase() === "true";

    if (ariaInvalid) {
      return true;
    }
    if (className.indexOf("error") !== -1 || className.indexOf("invalid") !== -1) {
      return true;
    }
    if (role === "alert") {
      return /(error|invalid|required|please|must|missing|failed)/.test(lowerMessage);
    }

    return /(error|invalid|required|please|must|missing|failed)/.test(lowerMessage);
  }

  function toElementName(element) {
    const ariaLabel = cleanString(element.getAttribute("aria-label"));
    if (ariaLabel) {
      return ariaLabel;
    }
    return cleanString(element.getAttribute("name")) || cleanString(element.id) || element.tagName.toLowerCase();
  }

  function collectPageValidationErrors() {
    const output = [];
    const selector = '[aria-invalid="true"], [role="alert"], .error, .errors, .invalid, .field-error, .form-error, .validation-error';
    const candidates = Array.from(document.querySelectorAll(selector));

    for (let index = 0; index < candidates.length; index += 1) {
      const node = candidates[index];
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
        output.push(message.slice(0, 197) + "...");
      } else {
        output.push(message);
      }
    }

    const invalidControls = Array.from(document.querySelectorAll("input:invalid, textarea:invalid, select:invalid"));
    for (let index = 0; index < invalidControls.length; index += 1) {
      const control = invalidControls[index];
      const validationMessage = cleanString(control.validationMessage);
      if (validationMessage) {
        output.push(validationMessage);
      } else {
        output.push("Invalid field: " + toElementName(control));
      }
    }

    return uniqueList(output);
  }

  function validateApplication(formFields, input) {
    const mappings = Array.isArray(input && input.mappings) ? input.mappings : [];
    const fillResults = Array.isArray(input && input.fillResults) ? input.fillResults : [];
    const uploadResult = input && input.uploadResult ? input.uploadResult : null;

    const requiredFields = formFields.filter(function filterRequired(field) {
      return Boolean(field.required);
    });

    const mappingByKey = new Map();
    for (let index = 0; index < mappings.length; index += 1) {
      mappingByKey.set(toFieldKey(mappings[index].field), mappings[index]);
    }

    const missingRequiredFields = [];
    const unknownRequiredFields = [];

    for (let index = 0; index < requiredFields.length; index += 1) {
      const field = requiredFields[index];
      const fieldName = toHumanFieldName(field);
      const fieldType = cleanString(field.type).toLowerCase();
      const mapping = mappingByKey.get(toFieldKey(field));

      if (isUnknownRequiredField(fieldType, mapping)) {
        unknownRequiredFields.push(fieldName);
      }

      const element = resolveValidationFieldElement(field);
      if (!element || isRequiredValueMissing(fieldType, element, field)) {
        missingRequiredFields.push(fieldName);
      }
    }

    const pageValidationErrors = collectPageValidationErrors();
    const warnings = ["Stage 6A pre-submit validation only. No submit executed."];
    const fillErrorCount = fillResults.filter(function filterError(item) {
      return item.status === "error" || item.status === "failed";
    }).length;

    if (!formFields.length) {
      warnings.push("No form fields detected on current page.");
    }
    if (fillErrorCount > 0) {
      warnings.push("Autofill reported " + String(fillErrorCount) + " error(s).");
    }
    if (uploadResult && !uploadResult.ok) {
      warnings.push("Resume upload skipped/failed: " + cleanString(uploadResult.reason || uploadResult.message));
    }
    if (pageValidationErrors.length > 0) {
      warnings.push("Detected " + String(pageValidationErrors.length) + " page validation error(s).");
    }

    const canSubmit =
      missingRequiredFields.length === 0 &&
      unknownRequiredFields.length === 0 &&
      pageValidationErrors.length === 0;

    return {
      ok: canSubmit,
      canSubmit: canSubmit,
      missingRequiredFields: uniqueList(missingRequiredFields),
      unknownRequiredFields: uniqueList(unknownRequiredFields),
      pageValidationErrors: uniqueList(pageValidationErrors),
      warnings: uniqueList(warnings)
    };
  }

  function getCurrentJobUrl() {
    return cleanString(window.location && window.location.href) || undefined;
  }

  function getSourceSite(jobUrl) {
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

  function parseTitleMetadata() {
    const title = cleanString(document.title);
    if (!title) {
      return {};
    }

    if (title.indexOf("|") !== -1) {
      const chunks = title.split("|").map(cleanString);
      return {
        role: chunks[0] || undefined,
        company: chunks[1] || undefined
      };
    }

    if (title.indexOf("-") !== -1) {
      const chunks = title.split("-").map(cleanString);
      return {
        role: chunks[0] || undefined,
        company: chunks[1] || undefined
      };
    }

    return {
      role: title
    };
  }

  function deriveApplicationId() {
    return "app-" + String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function deriveJobId(jobUrl, resumeRecord) {
    const fromResume = cleanString(resumeRecord && resumeRecord.jobId);
    if (fromResume) {
      return fromResume;
    }

    const url = cleanString(jobUrl);
    if (!url) {
      return undefined;
    }

    try {
      const parsed = new URL(url);
      const queryKeys = ["jobId", "job_id", "jid", "gh_jid", "id"];

      for (let index = 0; index < queryKeys.length; index += 1) {
        const value = cleanString(parsed.searchParams.get(queryKeys[index]));
        if (value) {
          return value;
        }
      }

      const segments = parsed.pathname.split("/").map(cleanString).filter(Boolean);
      return segments[segments.length - 1] || undefined;
    } catch {
      return undefined;
    }
  }

  function deriveStatus(fillResults, uploadResult, preSubmitCheck) {
    const canSubmit = Boolean(preSubmitCheck && (preSubmitCheck.canSubmit !== undefined ? preSubmitCheck.canSubmit : preSubmitCheck.ok));
    const filledCount = fillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length;
    const fillErrorCount = fillResults.filter(function filterError(item) {
      return item.status === "error" || item.status === "failed";
    }).length;

    if (canSubmit) {
      return "ready_to_submit";
    }
    if (fillErrorCount > 0 || (uploadResult && !uploadResult.ok)) {
      return "failed";
    }
    if (uploadResult && uploadResult.ok) {
      return "resume_uploaded";
    }
    if (filledCount > 0) {
      return "form_filled";
    }
    return "draft_prepared";
  }

  function buildApplicationRecord(input) {
    const jobUrl = cleanString(input.jobUrl);
    const createdAt = new Date().toISOString();
    const uploadResult = input.uploadResult || {};
    const resumeRecord = input.resumeRecord || null;

    return {
      applicationId: deriveApplicationId(),
      jobId: deriveJobId(jobUrl, resumeRecord),
      resumeId: cleanString(uploadResult.resumeId) || cleanString(resumeRecord && resumeRecord.resumeId) || undefined,
      resumeVersionId: cleanString(resumeRecord && resumeRecord.versionId) || undefined,
      company: cleanString(input.company) || cleanString(resumeRecord && resumeRecord.company) || undefined,
      role: cleanString(input.role) || cleanString(resumeRecord && resumeRecord.role) || undefined,
      createdAt: createdAt,
      updatedAt: createdAt,
      jobUrl: jobUrl || undefined,
      sourceSite: cleanString(input.sourceSite) || "unknown",
      status: deriveStatus(input.fillResults || [], uploadResult, input.preSubmitCheck || {}),
      mode: PIPELINE_MODE,
      formFieldCount: Array.isArray(input.formFields) ? input.formFields.length : 0,
      filledFieldCount: Array.isArray(input.fillResults)
        ? input.fillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length
        : 0,
      preSubmitCheck: input.preSubmitCheck || {
        ok: false,
        canSubmit: false,
        missingRequiredFields: [],
        unknownRequiredFields: [],
        pageValidationErrors: [],
        warnings: []
      }
    };
  }

  async function getResumeRecordById(resumeId) {
    const registry = global.Stage6ResumeRegistryStorage;
    if (!registry) {
      return null;
    }

    const id = cleanString(resumeId);
    if (id && typeof registry.getCompiledResumeById === "function") {
      try {
        return await registry.getCompiledResumeById(id);
      } catch {
        return null;
      }
    }

    if (typeof registry.getLatestCompiledResumeRecord === "function") {
      try {
        return await registry.getLatestCompiledResumeRecord();
      } catch {
        return null;
      }
    }

    return null;
  }

  function createResultSummary(input) {
    const canSubmit = Boolean(input.preSubmitCheck && (input.preSubmitCheck.canSubmit !== undefined ? input.preSubmitCheck.canSubmit : input.preSubmitCheck.ok));
    const errors = uniqueList(input.errors || []);
    const warnings = uniqueList(input.warnings || []);
    const scannedFieldCount = Number(input.scannedFieldCount) || 0;
    const mappedFieldCount = Number(input.mappedFieldCount) || 0;
    const filledFieldCount = Number(input.filledFieldCount) || 0;
    const selectFilledCount = Number(input.selectFilledCount) || 0;
    const checkboxFilledCount = Number(input.checkboxFilledCount) || 0;
    const keywordFilledCount = Number(input.keywordFilledCount) || 0;
    const keywordMissingCount = Number(input.keywordMissingCount) || 0;
    const keywordProtectedCount = Number(input.keywordProtectedCount) || 0;
    const uploadSucceeded = Boolean(input.uploadResult && input.uploadResult.ok);
    const hasEffectiveFill = filledFieldCount + selectFilledCount + checkboxFilledCount + keywordFilledCount > 0;
    const ok = Boolean(input.ok);

    return {
      ok: ok,
      mode: PIPELINE_MODE,
      applicationId: input.applicationId,
      status: input.status,
      resumeId: input.resumeId,
      jobId: input.jobId,
      scannedFieldCount: scannedFieldCount,
      mappedFieldCount: mappedFieldCount,
      filledFieldCount: filledFieldCount,
      selectFilledCount: selectFilledCount,
      checkboxFilledCount: checkboxFilledCount,
      keywordFilledCount: keywordFilledCount,
      keywordMissingCount: keywordMissingCount,
      keywordProtectedCount: keywordProtectedCount,
      keywordFallbackTriggered: Boolean(input.keywordFallbackTriggered),
      keywordFallbackAction: cleanString(input.keywordFallbackAction) || undefined,
      datasetSavedCount: Number(input.datasetSavedCount) || 0,
      uploadSucceeded: uploadSucceeded,
      hasEffectiveFill: hasEffectiveFill,
      errors: errors,
      warnings: warnings,
      uploadSummary: {
        ok: uploadSucceeded,
        resumeId: input.uploadResult && input.uploadResult.resumeId,
        fileName: input.uploadResult && input.uploadResult.fileName,
        reason: input.uploadResult && input.uploadResult.reason,
        message: input.uploadResult && input.uploadResult.message,
        fileInputFound: Boolean(input.uploadResult && input.uploadResult.fileInputFound),
        fileInputSelector: input.uploadResult && input.uploadResult.fileInputSelector,
        registryHasResume: input.uploadResult && input.uploadResult.registryHasResume,
        uploadContainerFound: Boolean(input.uploadResult && input.uploadResult.uploadContainerFound)
      },
      validationSummary: {
        canSubmit: canSubmit,
        missingRequiredFields: (input.preSubmitCheck && input.preSubmitCheck.missingRequiredFields) || [],
        unknownRequiredFields: (input.preSubmitCheck && input.preSubmitCheck.unknownRequiredFields) || [],
        pageValidationErrors: (input.preSubmitCheck && input.preSubmitCheck.pageValidationErrors) || []
      },
      pendingApplicationRecord: input.pendingApplicationRecord || null,
      recordSummary: {
        saved: Boolean(input.recordSaved),
        pendingConfirmation: Boolean(input.pendingApplicationRecord),
        applicationId: input.applicationId,
        status: input.status,
        errorMessage: cleanString(input.recordError) || undefined
      },
      fillResults: input.fillResults || [],
      message:
        "prepare-only pipeline complete: status=" + cleanString(input.status) +
        ", scanned=" + String(scannedFieldCount) +
        ", mapped=" + String(mappedFieldCount) +
        ", filled=" + String(filledFieldCount) +
        ", selectFilled=" + String(selectFilledCount) +
        ", checkboxFilled=" + String(checkboxFilledCount) +
        ", keywordFilled=" + String(keywordFilledCount) +
        ", keywordMissing=" + String(keywordMissingCount) +
        ", uploadSucceeded=" + (uploadSucceeded ? "true" : "false") +
        ", canSubmit=" + (canSubmit ? "true" : "false")
    };
  }

  async function runPrepareOnlyApplyFlow() {
    const sfPatch = detectSuccessFactorsHsbcPatch();
    debugLog("message received");
    debugLog("current url", { url: window.location.href });
    debugLogSf("message received");
    debugLogSf("current url", { url: window.location.href });
    debugLogSf("site patch detected", {
      detected: sfPatch.isDetected,
      signals: sfPatch.signals
    });
    debugLog("mode", { mode: PIPELINE_MODE, submit: "disabled" });

    const errors = [];
    const warnings = ["Mode is prepare-only. Auto-submit is disabled by design."];
    if (sfPatch.isDetected) {
      warnings.push("SuccessFactors HSBC patch detected and applied.");
    }

    let profile = {};
    let profileSource = "";
    let profileSourceDetail = "";
    let missingProfileKeys = [];
    let formFields = [];
    let mappings = [];
    let textFillResults = [];
    let selectFillResults = [];
    let checkboxFillResults = [];
    let keywordFillResults = [];
    let fillResults = [];
    let keywordAutofillResult = null;
    let uploadResult = {
      ok: false,
      message: "Upload step not executed.",
      reason: "UPLOAD_STEP_NOT_EXECUTED"
    };
    let preSubmitCheck = {
      ok: false,
      canSubmit: false,
      missingRequiredFields: [],
      unknownRequiredFields: [],
      pageValidationErrors: [],
      warnings: ["Validation step not executed."]
    };

    let applicationRecord = null;
    let savedRecord = null;
    let recordError = "";
    let pageLanguage = "unknown";

    try {
      const loaded = await loadCandidateProfile();
      profile = loaded.profile || {};
      profileSource = cleanString(loaded.source);
      profileSourceDetail = cleanString(loaded.sourceDetail);
      missingProfileKeys = getMissingProfileKeys(profile, REQUIRED_PROFILE_KEYS_FOR_HSBC);
      const hasProfile = hasCandidateSignal(profile);

      debugLog("profile load result", {
        source: profileSource || "unknown",
        sourceDetail: profileSourceDetail || "",
        hasProfileSignal: hasProfile,
        missingRequiredKeys: missingProfileKeys
      });
      debugLogSf("profile load result", {
        source: profileSource || "unknown",
        sourceDetail: profileSourceDetail || "",
        hasProfileSignal: hasProfile,
        missingRequiredKeys: missingProfileKeys
      });

      if (!hasProfile) {
        errors.push("Candidate/profile data not found in local storage.");
      }
    } catch (error) {
      errors.push("Failed to load local profile: " + (error instanceof Error ? error.message : String(error)));
    }

    try {
      formFields = scanForm();
      pageLanguage = detectPageLanguage(formFields);
      debugLog("page language detected", { language: pageLanguage });
      debugLog("scanned field count", { count: formFields.length });
      debugLog("scanned labels", {
        labels: uniqueList(formFields.map(function mapLabel(field) {
          return cleanString(field.label);
        })).slice(0, 120)
      });
      debugLogSf("scanned field count", { count: formFields.length });
      debugLogSf("scanned field ids", {
        ids: uniqueList(formFields.map(function mapId(field) {
          return cleanString(field.id);
        })).slice(0, 200)
      });
    } catch (error) {
      errors.push("scanForm failed: " + (error instanceof Error ? error.message : String(error)));
    }

    try {
      mappings = mapFields(formFields, profile);
      const mappedCount = mappings.filter(function filterMapped(item) { return item.status === "matched"; }).length;
      const unknownCount = mappings.filter(function filterUnknown(item) { return item.status === "unknown"; }).length;
      const skippedCount = mappings.filter(function filterSkipped(item) { return item.status === "skipped"; }).length;
      debugLog("mapped field count", { count: mappedCount });
      debugLog("mapping summary", {
        matched: mappedCount,
        unknown: unknownCount,
        skipped: skippedCount,
        hsbcDetected: detectHsbcPatch(formFields).isDetected
      });
      debugLogSf("mapped field count", { count: mappedCount });
      debugLogSf("mapping summary", {
        matched: mappedCount,
        unknown: unknownCount,
        skipped: skippedCount,
        sfHsbcDetected: sfPatch.isDetected,
        hsbcDetected: detectHsbcPatch(formFields).isDetected
      });
    } catch (error) {
      errors.push("mapFields failed: " + (error instanceof Error ? error.message : String(error)));
    }

    try {
      const textMappings = mappings.filter(function filterText(item) {
        const fieldType = cleanString(item.field && item.field.type).toLowerCase();
        return fieldType !== "select" && fieldType !== "checkbox";
      });
      const selectMappings = mappings.filter(function filterSelect(item) {
        return cleanString(item.field && item.field.type).toLowerCase() === "select";
      });
      const checkboxMappings = mappings.filter(function filterCheckbox(item) {
        return cleanString(item.field && item.field.type).toLowerCase() === "checkbox";
      });

      textFillResults = autofillTextFields(textMappings);
      selectFillResults = autofillSelectFields(selectMappings);
      checkboxFillResults = autofillCheckboxFields(checkboxMappings);
      fillResults = textFillResults.concat(selectFillResults, checkboxFillResults);

      debugLog("filled field count", {
        textFilled: textFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
        textError: textFillResults.filter(function filterError(item) { return item.status === "error" || item.status === "failed"; }).length
      });
      debugLog("fill summary", {
        filled: fillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
        skipped: fillResults.filter(function filterSkipped(item) { return item.status === "skipped"; }).length,
        error: fillResults.filter(function filterError(item) { return item.status === "error" || item.status === "failed"; }).length
      });
      debugLogSf("filled field count", {
        textFilled: textFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
        selectFilled: selectFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
        checkboxFilled: checkboxFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length
      });
      debugLogSf("fill summary", {
        filled: fillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
        skipped: fillResults.filter(function filterSkipped(item) { return item.status === "skipped"; }).length,
        error: fillResults.filter(function filterError(item) { return item.status === "error" || item.status === "failed"; }).length
      });
      debugLog("select fill summary", {
        filled: selectFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
        skipped: selectFillResults.filter(function filterSkipped(item) { return item.status === "skipped"; }).length,
        error: selectFillResults.filter(function filterError(item) { return item.status === "error" || item.status === "failed"; }).length
      });
      debugLog("checkbox fill summary", {
        filled: checkboxFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
        skipped: checkboxFillResults.filter(function filterSkipped(item) { return item.status === "skipped"; }).length,
        error: checkboxFillResults.filter(function filterError(item) { return item.status === "error" || item.status === "failed"; }).length
      });
    } catch (error) {
      errors.push("autofill failed: " + (error instanceof Error ? error.message : String(error)));
    }

    try {
      const stage8Runtime = global.Stage8KeywordAutofill;
      if (stage8Runtime && typeof stage8Runtime.runKeywordDatasetAutofill === "function") {
        keywordAutofillResult = await stage8Runtime.runKeywordDatasetAutofill({
          profile: profile
        });
        keywordFillResults = Array.isArray(keywordAutofillResult && keywordAutofillResult.fillResults)
          ? keywordAutofillResult.fillResults
          : [];

        if (keywordFillResults.length) {
          fillResults = fillResults.concat(keywordFillResults);
        }

        debugLog("stage8 keyword autofill summary", {
          scanned: Number(keywordAutofillResult && keywordAutofillResult.scannedFields && keywordAutofillResult.scannedFields.length) || 0,
          matched: Number(keywordAutofillResult && keywordAutofillResult.matchedCount) || 0,
          totalFilled: Number(keywordAutofillResult && keywordAutofillResult.totalFilledCount) || 0,
          missing: Number(keywordAutofillResult && keywordAutofillResult.missingFields && keywordAutofillResult.missingFields.length) || 0,
          protectedCount: Number(keywordAutofillResult && keywordAutofillResult.protectedCount) || 0,
          fallbackAction: cleanString(keywordAutofillResult && keywordAutofillResult.fallbackAction) || "skipped",
          savedCount: Number(keywordAutofillResult && keywordAutofillResult.savedCount) || 0
        });

        if (keywordAutofillResult && keywordAutofillResult.fallbackTriggered) {
          warnings.push("Stage 8 fallback modal used for missing/protected fields.");
        }
      }
    } catch (error) {
      warnings.push("Stage 8 keyword autofill failed: " + (error instanceof Error ? error.message : String(error)));
    }

    try {
      uploadResult = await uploadResume({});
      debugLog("upload summary", {
        ok: uploadResult.ok,
        reason: uploadResult.reason || "",
        resumeId: uploadResult.resumeId || "",
        fileInputFound: Boolean(uploadResult.fileInputFound),
        fileInputSelector: uploadResult.fileInputSelector || "",
        registryHasResume: uploadResult.registryHasResume,
        uploadContainerFound: Boolean(uploadResult.uploadContainerFound)
      });
      debugLogSf("upload summary", {
        ok: uploadResult.ok,
        reason: uploadResult.reason || "",
        resumeId: uploadResult.resumeId || "",
        uploadContainerFound: Boolean(uploadResult.uploadContainerFound),
        fileInputFound: Boolean(uploadResult.fileInputFound),
        fileInputSelector: uploadResult.fileInputSelector || "",
        registryHasResume: uploadResult.registryHasResume
      });
      if (!uploadResult.ok) {
        warnings.push("Resume upload skipped/failed: " + cleanString(uploadResult.reason || uploadResult.message));
      }
    } catch (error) {
      uploadResult = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        reason: "UPLOAD_STEP_EXCEPTION"
      };
      warnings.push("Resume upload exception: " + cleanString(uploadResult.message));
    }

    try {
      preSubmitCheck = validateApplication(formFields, {
        mappings: mappings,
        fillResults: fillResults,
        uploadResult: uploadResult
      });
      debugLog("validation result", {
        canSubmit: Boolean(preSubmitCheck.canSubmit),
        missingRequiredFields: preSubmitCheck.missingRequiredFields.length,
        unknownRequiredFields: preSubmitCheck.unknownRequiredFields.length,
        pageValidationErrors: preSubmitCheck.pageValidationErrors.length
      });
    } catch (error) {
      preSubmitCheck = {
        ok: false,
        canSubmit: false,
        missingRequiredFields: [],
        unknownRequiredFields: [],
        pageValidationErrors: [],
        warnings: ["Validation exception: " + (error instanceof Error ? error.message : String(error))]
      };
      errors.push("validateApplication failed: " + (error instanceof Error ? error.message : String(error)));
    }

    try {
      const titleMetadata = parseTitleMetadata();
      const jobUrl = getCurrentJobUrl();
      const sourceSite = getSourceSite(jobUrl);
      const resumeRecord = await getResumeRecordById(uploadResult.resumeId);

      applicationRecord = buildApplicationRecord({
        jobUrl: jobUrl,
        sourceSite: sourceSite,
        company: titleMetadata.company,
        role: titleMetadata.role,
        resumeRecord: resumeRecord,
        uploadResult: uploadResult,
        formFields: formFields,
        fillResults: fillResults,
        preSubmitCheck: preSubmitCheck
      });

      debugLog("application record pending confirmation", {
        applicationId: applicationRecord.applicationId,
        status: applicationRecord.status,
        jobUrl: applicationRecord.jobUrl || "",
        resumeId: applicationRecord.resumeId || ""
      });
    } catch (error) {
      recordError = error instanceof Error ? error.message : String(error);
      errors.push("buildApplicationRecord failed: " + recordError);
    }

    const scannedFieldCount = formFields.length;
    const mappedFieldCount = mappings.filter(function filterMapped(item) { return item.status === "matched"; }).length;
    const filledFieldCount = textFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length;
    const selectFilledCount = selectFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length;
    const checkboxFilledCount = checkboxFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length;
    const keywordFilledCount = keywordFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length;
    const keywordMissingCount = Number(keywordAutofillResult && keywordAutofillResult.missingFields && keywordAutofillResult.missingFields.length) || 0;
    const keywordProtectedCount = Number(keywordAutofillResult && keywordAutofillResult.protectedCount) || 0;
    const uploadSucceeded = Boolean(uploadResult && uploadResult.ok);
    const hasEffectiveFill = filledFieldCount + selectFilledCount + checkboxFilledCount + keywordFilledCount > 0;
    const hasProfile = hasCandidateSignal(profile);

    if (!hasProfile) {
      errors.push("no profile");
    }
    if (scannedFieldCount === 0) {
      errors.push("no scanned fields");
    }
    if (mappedFieldCount === 0 && scannedFieldCount > 0) {
      errors.push("mapping all unknown");
    }
    if (!hasEffectiveFill && !uploadSucceeded) {
      errors.push("no effective fill and upload failed");
    }

    const finalRecord = savedRecord || applicationRecord;
    const canSubmit = Boolean(preSubmitCheck.canSubmit !== undefined ? preSubmitCheck.canSubmit : preSubmitCheck.ok);
    const hasFatal = !hasProfile || scannedFieldCount === 0 || (!hasEffectiveFill && !uploadSucceeded);
    const finalStatus = hasFatal
      ? "failed"
      : finalRecord && cleanString(finalRecord.status)
        ? finalRecord.status
        : canSubmit
          ? "ready_to_submit"
          : errors.length > 0
            ? "failed"
            : "draft_prepared";
    const ok = finalStatus !== "failed";

    debugLog("final status", {
      ok: ok,
      status: finalStatus,
      scannedFieldCount: scannedFieldCount,
      mappedFieldCount: mappedFieldCount,
      filledFieldCount: filledFieldCount,
      selectFilledCount: selectFilledCount,
      checkboxFilledCount: checkboxFilledCount,
      keywordFilledCount: keywordFilledCount,
      keywordMissingCount: keywordMissingCount,
      keywordProtectedCount: keywordProtectedCount,
      uploadSucceeded: uploadSucceeded,
      errors: uniqueList(errors),
      warnings: uniqueList(warnings.concat(preSubmitCheck.warnings || []))
    });
    debugLogSf("final status", {
      ok: ok,
      status: finalStatus,
      scannedFieldCount: scannedFieldCount,
      mappedFieldCount: mappedFieldCount,
      filledFieldCount: filledFieldCount,
      selectFilledCount: selectFilledCount,
      checkboxFilledCount: checkboxFilledCount,
      keywordFilledCount: keywordFilledCount,
      keywordMissingCount: keywordMissingCount,
      keywordProtectedCount: keywordProtectedCount,
      uploadSucceeded: uploadSucceeded,
      errors: uniqueList(errors),
      warnings: uniqueList(warnings.concat(preSubmitCheck.warnings || []))
    });

    runtimeDebugState.lastRun = {
      profile: profile,
      profileSource: profileSource,
      profileSourceDetail: profileSourceDetail,
      missingProfileKeys: missingProfileKeys,
      pageLanguage: pageLanguage,
      scannedFields: formFields,
      mappings: mappings,
      textFillResults: textFillResults,
      selectFillResults: selectFillResults,
      checkboxFillResults: checkboxFillResults,
      keywordFillResults: keywordFillResults,
      keywordAutofillResult: keywordAutofillResult,
      fillResults: fillResults,
      uploadResult: uploadResult,
      preSubmitCheck: preSubmitCheck,
      scannedFieldCount: scannedFieldCount,
      mappedFieldCount: mappedFieldCount,
      filledFieldCount: filledFieldCount,
      selectFilledCount: selectFilledCount,
      checkboxFilledCount: checkboxFilledCount,
      keywordFilledCount: keywordFilledCount,
      keywordMissingCount: keywordMissingCount,
      keywordProtectedCount: keywordProtectedCount,
      uploadSucceeded: uploadSucceeded,
      errors: uniqueList(errors),
      warnings: uniqueList(warnings.concat(preSubmitCheck.warnings || []))
    };

    return createResultSummary({
      ok: ok,
      applicationId: finalRecord && finalRecord.applicationId,
      status: finalStatus,
      resumeId: (finalRecord && finalRecord.resumeId) || uploadResult.resumeId,
      jobId: finalRecord && finalRecord.jobId,
      scannedFieldCount: scannedFieldCount,
      mappedFieldCount: mappedFieldCount,
      filledFieldCount: filledFieldCount,
      selectFilledCount: selectFilledCount,
      checkboxFilledCount: checkboxFilledCount,
      keywordFilledCount: keywordFilledCount,
      keywordMissingCount: keywordMissingCount,
      keywordProtectedCount: keywordProtectedCount,
      keywordFallbackTriggered: Boolean(keywordAutofillResult && keywordAutofillResult.fallbackTriggered),
      keywordFallbackAction: cleanString(keywordAutofillResult && keywordAutofillResult.fallbackAction),
      datasetSavedCount: Number(keywordAutofillResult && keywordAutofillResult.savedCount) || 0,
      errors: errors,
      warnings: warnings.concat(preSubmitCheck.warnings || []),
      preSubmitCheck: preSubmitCheck,
      uploadResult: uploadResult,
      fillResults: fillResults,
      recordSaved: false,
      recordError: "",
      pendingApplicationRecord: applicationRecord
    });
  }

  async function runApplyDebug() {
    const result = await runPrepareOnlyApplyFlow();
    debugLog("runApplyDebug result", result);
    return result;
  }

  function dumpApplyDebugState() {
    debugLog("dumpApplyDebugState", runtimeDebugState.lastRun || {});
    return runtimeDebugState.lastRun || null;
  }

  global.Stage6ApplyRuntime = Object.freeze({
    runPrepareOnlyApplyFlow: runPrepareOnlyApplyFlow,
    runApplyDebug: runApplyDebug,
    dumpApplyDebugState: dumpApplyDebugState
  });

  global.runApplyDebug = runApplyDebug;
  global.dumpApplyDebugState = dumpApplyDebugState;
})(globalThis);
