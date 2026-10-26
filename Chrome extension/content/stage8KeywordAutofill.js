(function attachStage8KeywordAutofill(global) {
  "use strict";

  const KNOWLEDGE_BASE_KEY = "autofillKnowledgeBase";
  const LEGACY_DATASET_KEY = "autofillDataset";
  const APP_DATA_KEY = "appDataV1";
  const MODAL_ROOT_ID = "stage8-autofill-review-root";
  const MODAL_STYLE_ID = "stage8-autofill-review-style";
  const SCAN_SELECTOR = "input, textarea, select";
  const SCAN_SKIP_INPUT_TYPES = new Set(["hidden", "submit", "reset", "button", "image", "file"]);
  const AUTO_FILL_INPUT_TYPES = new Set(["text", "email", "tel", "search", "url", "number", "password"]);
  const RESERVED_CANDIDATES = new Set(["field", "input", "required", "optional", "select", "textarea", "text"]);
  const REVIEW_MAX_FIELDS = 30;
  const SUGGESTION_TIMEOUT_MS = 25000;
  const MAX_AI_INPUT_LENGTH = 12000;

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

  const PROFILE_FIELD_RULES = Object.freeze([
    // Basic identity
    { key: "fullName", aliases: ["full name", "name", "legal name", "your name", "applicant name", "full legal name"] },
    { key: "firstName", aliases: ["first name", "given name", "legal first name", "firstname", "forename"] },
    { key: "lastName", aliases: ["last name", "surname", "family name", "legal last name", "lastname"] },
    { key: "email", aliases: ["email", "email address", "e-mail", "email id"] },
    { key: "phone", aliases: ["phone", "phone number", "mobile", "telephone", "tel", "contact number", "mobile number", "cell phone"] },
    { key: "location", aliases: ["location", "city", "current location", "country", "country territory", "address", "state", "city state", "zip", "zip code", "postal code"] },
    { key: "linkedin", aliases: ["linkedin", "linkedin profile", "linkedin url", "linkedin profile url"] },
    { key: "github", aliases: ["github", "github profile", "github url", "github profile url"] },
    { key: "portfolio", aliases: ["portfolio", "website", "personal site", "portfolio url", "personal website", "website url"] },
    // Work eligibility
    { key: "workAuthorization", aliases: ["work authorization", "right to work", "eligible to work", "employment authorization", "authorized to work", "work eligibility", "are you authorized"] },
    { key: "requiresSponsorship", aliases: ["require sponsorship", "requires sponsorship", "visa sponsorship", "need sponsorship", "require visa sponsorship", "do you require sponsorship"] },
    // Summary
    { key: "summary", aliases: ["summary", "professional summary", "about me", "bio", "about yourself", "tell us about yourself", "introduce yourself", "personal statement", "cover letter summary", "brief introduction"] },
    // Education
    { key: "schoolName", aliases: ["school", "university", "college", "institution", "school or university", "educational institution", "alma mater", "school name", "institution name"] },
    { key: "degree", aliases: ["degree", "degree type", "degree level", "highest degree", "qualification", "highest qualification", "highest level of education", "education level", "academic degree"] },
    { key: "major", aliases: ["major", "field of study", "area of study", "program", "concentration", "field", "course of study", "major or field", "area of study or major"] },
    { key: "gpa", aliases: ["gpa", "grade point average", "cumulative gpa", "academic gpa"] },
    // Skills
    { key: "skillsLanguages", aliases: ["programming languages", "coding languages", "computer languages", "language skills"] },
    { key: "skillsFrameworks", aliases: ["frameworks", "libraries", "frameworks and libraries", "framework"] },
    { key: "skillsTools", aliases: ["tools", "developer tools", "development tools", "devtools", "software tools"] },
    { key: "skillsAll", aliases: ["skills", "technical skills", "relevant skills", "key skills", "technologies", "tech stack", "areas of expertise", "competencies"] },
    // Job preferences
    { key: "preferredRoles", aliases: ["desired role", "preferred role", "position applying for", "role interest", "interested role", "job interest", "target role", "roles interested in", "career interest"] },
    { key: "preferredLocations", aliases: ["preferred location", "desired location", "location preference", "work location preference", "desired work location"] },
    { key: "remotePreference", aliases: ["remote preference", "work type", "work mode", "work arrangement", "remote work", "work from home preference", "on-site preference", "hybrid preference"] },
    { key: "salaryExpectation", aliases: ["salary expectation", "expected salary", "desired salary", "compensation expectation", "salary requirement", "salary range", "expected compensation", "pay expectation"] },
    { key: "relocationPreference", aliases: ["willing to relocate", "relocation", "open to relocation", "relocation preference", "can you relocate", "relocate"] },
    { key: "headline", aliases: ["headline", "tagline", "professional title", "current title", "professional headline", "job title", "title"] }
  ]);

  function cleanString(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  }

  function normalizeBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(lowered)) {
        return true;
      }
      if (["false", "no", "n", "0"].includes(lowered)) {
        return false;
      }
    }
    return false;
  }

  function normalizeKeyword(value) {
    return cleanString(value)
      .toLowerCase()
      .replace(/[_\-:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeCompact(value) {
    return normalizeKeyword(value).replace(/\s+/g, "");
  }

  function uniqueList(values) {
    return Array.from(new Set((values || []).map(function mapItem(item) {
      return cleanString(item);
    }).filter(Boolean)));
  }

  function uniqueNormalizedList(values) {
    const seen = new Set();
    const output = [];

    (values || []).forEach(function walk(item) {
      const normalized = normalizeKeyword(item);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      output.push(normalized);
    });

    return output;
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

  function setLocal(payload) {
    const storage = getStorageArea();
    if (!storage) {
      return Promise.resolve();
    }

    return new Promise(function wrap(resolve, reject) {
      storage.set(payload, function onSet() {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function toIsoOrNow(value) {
    const text = cleanString(value);
    if (!text) {
      return new Date().toISOString();
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  function splitName(fullName) {
    const text = cleanString(fullName);
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

  function normalizeProfile(input) {
    const raw = input && typeof input === "object" ? input : {};
    const fullName = cleanString(raw.fullName || raw.name);
    const split = splitName(fullName);

    const profile = {
      // Basic identity
      fullName: fullName,
      firstName: cleanString(raw.firstName || raw.legalFirstName) || split.firstName,
      lastName: cleanString(raw.lastName || raw.legalLastName) || split.lastName,
      email: cleanString(raw.email),
      phone: cleanString(raw.phone || raw.preferredContactNumber),
      location: cleanString(raw.location || raw.country || raw.countryTerritory),
      linkedin: cleanString(raw.linkedin),
      github: cleanString(raw.github),
      portfolio: cleanString(raw.portfolio || raw.website),
      // Work eligibility — empty string when not set so unset fields are skipped
      workAuthorization: cleanString(raw.workAuthorization || raw.rightToWork),
      requiresSponsorship: (raw.requiresSponsorship === undefined || raw.requiresSponsorship === null)
        ? ""
        : (normalizeBoolean(raw.requiresSponsorship) ? "Yes" : "No"),
      // Summary
      summary: cleanString(raw.summary),
      // Education
      schoolName: cleanString(raw.schoolName || raw.school),
      degree: cleanString(raw.degree),
      major: cleanString(raw.major || raw.fieldOfStudy || raw.field),
      gpa: cleanString(raw.gpa),
      // Skills (comma-separated strings)
      skillsLanguages: cleanString(raw.skillsLanguages),
      skillsFrameworks: cleanString(raw.skillsFrameworks),
      skillsTools: cleanString(raw.skillsTools),
      skillsAll: cleanString(raw.skillsAll),
      // Job preferences
      preferredRoles: cleanString(raw.preferredRoles),
      preferredLocations: cleanString(raw.preferredLocations),
      remotePreference: cleanString(raw.remotePreference),
      salaryExpectation: cleanString(raw.salaryExpectation),
      relocationPreference: cleanString(raw.relocationPreference),
      headline: cleanString(raw.headline)
    };

    if (!profile.fullName) {
      profile.fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    }

    return profile;
  }

  function mergeProfiles(baseProfile, incomingProfile, options) {
    const config = options && typeof options === "object" ? options : {};
    const override = Boolean(config.override);

    const base = normalizeProfile(baseProfile);
    const incoming = normalizeProfile(incomingProfile);
    const merged = { ...base };

    Object.keys(merged).forEach(function eachKey(key) {
      if (override) {
        if (incoming[key] || incoming[key] === "") {
          merged[key] = incoming[key];
        }
        return;
      }
      if (!merged[key] && incoming[key]) {
        merged[key] = incoming[key];
      }
    });

    if (!merged.fullName) {
      merged.fullName = [merged.firstName, merged.lastName].filter(Boolean).join(" ");
    }

    if (!merged.firstName || !merged.lastName) {
      const split = splitName(merged.fullName);
      if (!merged.firstName) {
        merged.firstName = split.firstName;
      }
      if (!merged.lastName) {
        merged.lastName = split.lastName;
      }
    }

    return merged;
  }

  function normalizeQaEntry(input, indexHint) {
    const raw = input && typeof input === "object" ? input : {};
    const answer = cleanString(raw.answer || raw.value);
    if (!answer) {
      return null;
    }

    const questionText = cleanString(raw.questionText || raw.question || raw.label);
    const questionKey = cleanString(raw.questionKey || raw.key || normalizeKeyword(questionText).replace(/\s+/g, "_"));
    if (!questionKey) {
      return null;
    }

    const aliases = uniqueNormalizedList(
      []
        .concat(Array.isArray(raw.aliases) ? raw.aliases : [])
        .concat(Array.isArray(raw.keywords) ? raw.keywords : [])
        .concat(questionText ? [questionText] : [])
    );

    return {
      id: cleanString(raw.id) || "qa_" + String(indexHint || Date.now()) + "_" + Math.random().toString(36).slice(2, 8),
      questionKey: questionKey,
      questionText: questionText,
      answer: answer,
      source: cleanString(raw.source) || "manual_confirmed",
      updatedAt: toIsoOrNow(raw.updatedAt),
      aliases: aliases,
      askEveryTime: normalizeBoolean(raw.askEveryTime)
    };
  }

  function normalizeQaMemory(input) {
    const list = Array.isArray(input) ? input : [];
    const output = [];

    for (let index = 0; index < list.length; index += 1) {
      const normalized = normalizeQaEntry(list[index], index + 1);
      if (normalized) {
        output.push(normalized);
      }
    }

    return output;
  }

  function normalizeKnowledgeBase(input) {
    const raw = input && typeof input === "object" ? input : {};
    const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
    return {
      profile: normalizeProfile(raw.profile),
      qaMemory: normalizeQaMemory(raw.qaMemory),
      meta: {
        version: Number(meta.version) > 0 ? Number(meta.version) : 1,
        updatedAt: toIsoOrNow(meta.updatedAt)
      }
    };
  }

  function buildProfileFromKnowledgeBaseInput(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const nestedProfile = source.profile && typeof source.profile === "object" ? source.profile : {};
    const header = source.header && typeof source.header === "object" ? source.header : {};

    return normalizeProfile({
      fullName: source.fullName || source.name || nestedProfile.fullName || nestedProfile.name || header.name,
      firstName: source.firstName || source.legalFirstName || nestedProfile.firstName || nestedProfile.legalFirstName,
      lastName: source.lastName || source.legalLastName || nestedProfile.lastName || nestedProfile.legalLastName,
      email: source.email || nestedProfile.email || header.email,
      phone: source.phone || source.preferredContactNumber || nestedProfile.phone || nestedProfile.preferredContactNumber || header.phone,
      location: source.location || nestedProfile.location || header.location,
      linkedin: source.linkedin || nestedProfile.linkedin,
      github: source.github || nestedProfile.github,
      portfolio: source.portfolio || source.website || nestedProfile.portfolio || nestedProfile.website
    });
  }

  function buildExtendedProfileFromAppData(appData) {
    const safe = appData && typeof appData === "object" ? appData : {};
    const rawProfile = safe.profile && typeof safe.profile === "object" ? safe.profile : {};
    const masterResume = safe.masterResume && typeof safe.masterResume === "object" ? safe.masterResume : {};
    const skills = masterResume.skills && typeof masterResume.skills === "object" ? masterResume.skills : {};

    function joinList(val) {
      if (Array.isArray(val)) {
        return val.map(function s(x) { return cleanString(x); }).filter(Boolean).join(", ");
      }
      return cleanString(val);
    }

    // Education: first item with meaningful data
    const educationList = Array.isArray(masterResume.education) ? masterResume.education : [];
    const firstEdu = educationList.find(function findEdu(item) {
      const e = item && typeof item === "object" ? item : {};
      return cleanString(e.school) || cleanString(e.degree) || cleanString(e.major || e.field || e.fieldOfStudy);
    }) || {};

    // Summary: first item with text
    const summaries = Array.isArray(masterResume.summaries) ? masterResume.summaries : [];
    const firstSummary = summaries.find(function findSummary(item) {
      const s = item && typeof item === "object" ? item : {};
      return cleanString(s.text || s.summary || s.content);
    }) || {};
    const summaryText = cleanString(
      (typeof firstSummary === "object" ? (firstSummary.text || firstSummary.summary || firstSummary.content) : "") ||
      (typeof firstSummary === "string" ? firstSummary : "")
    );

    // Skills strings
    const skillsLanguages = joinList(skills.languages);
    const skillsFrameworks = joinList(skills.frameworks);
    const skillsTools = joinList(skills.tools);
    const skillsOther = joinList(skills.other);
    const skillsAllParts = [skillsLanguages, skillsFrameworks, skillsTools, skillsOther].filter(Boolean);

    // Base identity from profile
    const baseIdentity = buildProfileFromKnowledgeBaseInput(rawProfile);

    return normalizeProfile({
      ...baseIdentity,
      workAuthorization: cleanString(rawProfile.workAuthorization || rawProfile.rightToWork),
      requiresSponsorship: rawProfile.requiresSponsorship,
      // Summary
      summary: summaryText,
      // Education
      schoolName: cleanString(firstEdu.school),
      degree: cleanString(firstEdu.degree),
      major: cleanString(firstEdu.major || firstEdu.field || firstEdu.fieldOfStudy),
      gpa: cleanString(firstEdu.gpa),
      // Skills
      skillsLanguages: skillsLanguages,
      skillsFrameworks: skillsFrameworks,
      skillsTools: skillsTools,
      skillsAll: skillsAllParts.join(", "),
      // Job preferences
      preferredRoles: joinList(rawProfile.preferredRoles),
      preferredLocations: joinList(rawProfile.preferredLocations),
      remotePreference: cleanString(rawProfile.remotePreference),
      salaryExpectation: cleanString(rawProfile.salaryExpectation),
      relocationPreference: cleanString(rawProfile.relocationPreference),
      headline: cleanString(rawProfile.headline)
    });
  }

  function convertLegacyDatasetToQaMemory(dataset) {
    const raw = dataset && typeof dataset === "object" ? dataset : {};
    const fields = Array.isArray(raw.fields) ? raw.fields : [];
    const output = [];

    fields.forEach(function eachField(field, index) {
      const safeField = field && typeof field === "object" ? field : {};
      const value = cleanString(safeField.value);
      if (!value) {
        return;
      }
      const keywords = uniqueNormalizedList(Array.isArray(safeField.keywords) ? safeField.keywords : []);
      const key = cleanString(safeField.key) || (keywords[0] || "").replace(/\s+/g, "_");
      const questionText = cleanString(safeField.questionText) || (keywords[0] || "").replace(/_/g, " ") || key;
      const normalized = normalizeQaEntry({
        questionKey: key,
        questionText: questionText,
        answer: value,
        aliases: keywords,
        source: "legacy_dataset"
      }, index + 1);
      if (normalized) {
        output.push(normalized);
      }
    });

    return output;
  }

  function findQaIndex(memory, entry) {
    const list = Array.isArray(memory) ? memory : [];
    const candidate = entry && typeof entry === "object" ? entry : {};
    const key = normalizeKeyword(candidate.questionKey).replace(/\s+/g, "_");
    const text = normalizeKeyword(candidate.questionText);

    for (let index = 0; index < list.length; index += 1) {
      const current = list[index] && typeof list[index] === "object" ? list[index] : {};
      const currentKey = normalizeKeyword(current.questionKey).replace(/\s+/g, "_");
      const currentText = normalizeKeyword(current.questionText);
      if (key && currentKey && key === currentKey) {
        return index;
      }
      if (text && currentText && text === currentText) {
        return index;
      }
    }

    return -1;
  }

  function upsertQaMemoryInMemory(memory, incomingEntries) {
    const list = normalizeQaMemory(memory);
    const incoming = normalizeQaMemory(incomingEntries);

    incoming.forEach(function eachEntry(entry) {
      const index = findQaIndex(list, entry);
      if (index < 0) {
        list.push(entry);
        return;
      }

      const existing = list[index];
      list[index] = {
        ...existing,
        answer: entry.answer,
        source: entry.source,
        updatedAt: toIsoOrNow(entry.updatedAt),
        questionKey: cleanString(entry.questionKey) || cleanString(existing.questionKey),
        questionText: cleanString(entry.questionText) || cleanString(existing.questionText),
        aliases: uniqueNormalizedList([].concat(existing.aliases || []).concat(entry.aliases || [])),
        id: cleanString(existing.id) || cleanString(entry.id)
      };
    });

    return list;
  }

  function qaMemoryFromAutofillAnswers(answersInput) {
    const answers = Array.isArray(answersInput) ? answersInput : [];
    const mapped = answers.map(function mapAnswer(answer, index) {
      const safe = answer && typeof answer === "object" ? answer : {};
      return normalizeQaEntry({
        id: cleanString(safe.id),
        questionKey: cleanString(safe.key),
        questionText: cleanString(safe.label) || cleanString(safe.key),
        answer: cleanString(safe.answer),
        aliases: Array.isArray(safe.questionPatterns) ? safe.questionPatterns : [],
        source: cleanString(safe.source),
        updatedAt: cleanString(safe.updatedAt),
        askEveryTime: Boolean(safe.askEveryTime)
      }, index + 1);
    }).filter(Boolean);

    return normalizeQaMemory(mapped);
  }

  async function persistKnowledgeBase(kb) {
    const normalized = normalizeKnowledgeBase(kb);
    normalized.meta.updatedAt = new Date().toISOString();
    await setLocal({ [KNOWLEDGE_BASE_KEY]: normalized });
    return normalized;
  }

  async function loadKnowledgeBase(profileFromPipeline) {
    const runtime = global.Stage8KnowledgeBase;
    if (runtime && typeof runtime.loadKnowledgeBase === "function") {
      try {
        const loaded = await runtime.loadKnowledgeBase({ seedProfile: profileFromPipeline });
        return normalizeKnowledgeBase(loaded);
      } catch {
        // fallback below
      }
    }

    const payload = await getLocal([KNOWLEDGE_BASE_KEY, LEGACY_DATASET_KEY, APP_DATA_KEY, "profile", "candidateProfile", "candidateResume"]);
    const rawStoredKb = payload[KNOWLEDGE_BASE_KEY];
    let knowledgeBase = normalizeKnowledgeBase(rawStoredKb);
    let changed = !rawStoredKb;
    const appData = payload[APP_DATA_KEY] && typeof payload[APP_DATA_KEY] === "object" ? payload[APP_DATA_KEY] : {};

    if (appData && typeof appData === "object") {
      knowledgeBase.profile = mergeProfiles(
        knowledgeBase.profile,
        buildExtendedProfileFromAppData(appData),
        { override: false }
      );

      const appAnswersQa = qaMemoryFromAutofillAnswers(appData.autofillAnswers);
      if (appAnswersQa.length) {
        knowledgeBase.qaMemory = upsertQaMemoryInMemory(knowledgeBase.qaMemory, appAnswersQa);
      }
    }

    knowledgeBase.profile = mergeProfiles(knowledgeBase.profile, buildProfileFromKnowledgeBaseInput(payload.profile), { override: false });
    knowledgeBase.profile = mergeProfiles(knowledgeBase.profile, buildProfileFromKnowledgeBaseInput(payload.candidateProfile), { override: false });
    knowledgeBase.profile = mergeProfiles(knowledgeBase.profile, buildProfileFromKnowledgeBaseInput(payload.candidateResume), { override: false });
    knowledgeBase.profile = mergeProfiles(knowledgeBase.profile, buildProfileFromKnowledgeBaseInput(profileFromPipeline), { override: false });

    const legacyEntries = convertLegacyDatasetToQaMemory(payload[LEGACY_DATASET_KEY]);
    if (legacyEntries.length) {
      const nextMemory = upsertQaMemoryInMemory(knowledgeBase.qaMemory, legacyEntries);
      if (nextMemory.length !== knowledgeBase.qaMemory.length) {
        changed = true;
      }
      knowledgeBase.qaMemory = nextMemory;
    }

    if (changed) {
      knowledgeBase = await persistKnowledgeBase(knowledgeBase);
    }

    return knowledgeBase;
  }

  async function syncQaEntriesToAppData(entries) {
    if (!Array.isArray(entries) || !entries.length) {
      return;
    }

    try {
      const payload = await getLocal([APP_DATA_KEY]);
      const appData = payload[APP_DATA_KEY] && typeof payload[APP_DATA_KEY] === "object"
        ? payload[APP_DATA_KEY]
        : {};
      const existingAnswers = Array.isArray(appData.autofillAnswers) ? appData.autofillAnswers : [];
      const updatedAnswers = existingAnswers.slice();

      entries.forEach(function addEntry(entry) {
        const safe = entry && typeof entry === "object" ? entry : {};
        const newAnswer = {
          id: cleanString(safe.id) || "qa_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8),
          key: cleanString(safe.questionKey),
          label: cleanString(safe.questionText) || cleanString(safe.questionKey),
          questionPatterns: Array.isArray(safe.aliases) ? safe.aliases : [],
          answer: cleanString(safe.answer),
          source: cleanString(safe.source) || "manual_confirmed",
          confidence: "high",
          askEveryTime: Boolean(safe.askEveryTime),
          updatedAt: cleanString(safe.updatedAt) || new Date().toISOString()
        };

        if (!newAnswer.key || !newAnswer.answer) {
          return;
        }

        const existingIndex = updatedAnswers.findIndex(function findExisting(a) {
          const existing = a && typeof a === "object" ? a : {};
          const keyMatch = normalizeKeyword(existing.key) && normalizeKeyword(existing.key) === normalizeKeyword(newAnswer.key);
          const labelMatch = normalizeKeyword(existing.label) && normalizeKeyword(existing.label) === normalizeKeyword(newAnswer.label);
          return keyMatch || labelMatch;
        });

        if (existingIndex >= 0) {
          updatedAnswers[existingIndex] = {
            ...updatedAnswers[existingIndex],
            answer: newAnswer.answer,
            source: newAnswer.source,
            questionPatterns: uniqueNormalizedList(
              [].concat(updatedAnswers[existingIndex].questionPatterns || []).concat(newAnswer.questionPatterns)
            ),
            updatedAt: newAnswer.updatedAt,
            id: updatedAnswers[existingIndex].id || newAnswer.id
          };
        } else {
          updatedAnswers.push(newAnswer);
        }
      });

      await setLocal({ [APP_DATA_KEY]: { ...appData, autofillAnswers: updatedAnswers } });
    } catch {
      // Non-fatal — primary persistence is autofillKnowledgeBase
    }
  }

  async function upsertQaMemoryEntries(entries, fallbackKnowledgeBase) {
    const runtime = global.Stage8KnowledgeBase;
    if (runtime && typeof runtime.upsertQaMemory === "function") {
      try {
        const updated = await runtime.upsertQaMemory(entries);
        await syncQaEntriesToAppData(entries);
        return normalizeKnowledgeBase(updated);
      } catch {
        // fallback below
      }
    }

    const base = normalizeKnowledgeBase(fallbackKnowledgeBase);
    const next = {
      ...base,
      qaMemory: upsertQaMemoryInMemory(base.qaMemory, entries)
    };
    const persisted = await persistKnowledgeBase(next);
    await syncQaEntriesToAppData(entries);
    return persisted;
  }

  function getFieldType(element) {
    if (element instanceof HTMLTextAreaElement) {
      return "textarea";
    }
    if (element instanceof HTMLSelectElement) {
      return "select";
    }
    return normalizeKeyword(element.type) || "text";
  }

  function getFieldLabelFromFor(element) {
    const id = cleanString(element.id);
    if (!id) {
      return "";
    }
    const selector = "label[for=\"" + id.replace(/\\/g, "\\\\").replace(/\"/g, '\\\"') + "\"]";
    const label = document.querySelector(selector);
    return cleanString(label && label.textContent);
  }

  function getFieldLabel(element) {
    const byFor = getFieldLabelFromFor(element);
    if (byFor) {
      return byFor;
    }

    if (element.labels && element.labels.length) {
      for (let index = 0; index < element.labels.length; index += 1) {
        const text = cleanString(element.labels[index] && element.labels[index].textContent);
        if (text) {
          return text;
        }
      }
    }

    const parentLabel = element.closest("label");
    const parentLabelText = cleanString(parentLabel && parentLabel.textContent);
    if (parentLabelText) {
      return parentLabelText;
    }

    return (
      cleanString(element.getAttribute("aria-label")) ||
      cleanString(element.getAttribute("placeholder")) ||
      cleanString(element.getAttribute("name")) ||
      cleanString(element.getAttribute("id"))
    );
  }

  function getFieldCurrentValue(element) {
    if (element instanceof HTMLSelectElement) {
      return cleanString(element.value);
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return cleanString(element.value);
    }
    return "";
  }

  function getSelectOptions(element) {
    if (!(element instanceof HTMLSelectElement)) {
      return undefined;
    }

    return Array.from(element.options).map(function mapOption(option) {
      return {
        value: cleanString(option.value),
        text: cleanString(option.textContent) || cleanString(option.value)
      };
    }).filter(function filterOption(option) {
      return cleanString(option.text) || cleanString(option.value);
    });
  }

  function buildFieldCandidates(meta) {
    const orderedSources = [meta.label, meta.ariaLabel, meta.placeholder, meta.name, meta.id];
    const rawCandidates = uniqueList(orderedSources);
    const normalizedCandidates = uniqueNormalizedList(rawCandidates).filter(function filterCandidate(candidate) {
      if (!candidate || candidate.length <= 1) {
        return false;
      }
      return !RESERVED_CANDIDATES.has(candidate);
    });

    return {
      raw: rawCandidates,
      normalized: normalizedCandidates
    };
  }

  function shouldScanElement(element) {
    if (!element || element.disabled) {
      return false;
    }

    if (element instanceof HTMLInputElement) {
      const inputType = getFieldType(element);
      if (SCAN_SKIP_INPUT_TYPES.has(inputType)) {
        return false;
      }
    }

    return true;
  }

  function scanFormFields() {
    if (typeof document === "undefined") {
      return [];
    }

    const fields = Array.from(document.querySelectorAll(SCAN_SELECTOR));
    return fields.filter(shouldScanElement).map(function mapField(element, index) {
      const meta = {
        index: index,
        element: element,
        tagName: normalizeKeyword(element.tagName),
        type: getFieldType(element),
        label: getFieldLabel(element),
        placeholder: cleanString(element.getAttribute("placeholder")),
        name: cleanString(element.getAttribute("name")),
        id: cleanString(element.getAttribute("id")),
        ariaLabel: cleanString(element.getAttribute("aria-label")),
        required: Boolean(element.required || normalizeKeyword(element.getAttribute("aria-required")) === "true"),
        selector: cleanString(element.id) ? "#" + cleanString(element.id) : "",
        currentValue: getFieldCurrentValue(element),
        options: getSelectOptions(element)
      };
      meta["aria-label"] = meta.ariaLabel;

      const candidates = buildFieldCandidates(meta);
      meta.candidates = candidates.normalized;
      meta.rawCandidates = candidates.raw;
      return meta;
    });
  }

  function detectProtectedCategory(field) {
    const candidates = uniqueNormalizedList((field.candidates || []).concat(field.rawCandidates || []));
    if (!candidates.length) {
      return "";
    }

    for (let ruleIndex = 0; ruleIndex < PROTECTED_FIELD_RULES.length; ruleIndex += 1) {
      const rule = PROTECTED_FIELD_RULES[ruleIndex];
      for (let keywordIndex = 0; keywordIndex < rule.keywords.length; keywordIndex += 1) {
        const keyword = normalizeKeyword(rule.keywords[keywordIndex]);
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

  function isAutoFillSupportedField(field) {
    if (field.tagName === "textarea" || field.tagName === "select") {
      return true;
    }
    if (field.tagName !== "input") {
      return false;
    }
    return AUTO_FILL_INPUT_TYPES.has(field.type);
  }

  function isLikelyUnfilled(field) {
    const value = cleanString(field.currentValue);
    if (!value) {
      return true;
    }

    const lowered = normalizeKeyword(value);
    if (lowered === "select" || lowered === "please select" || lowered === "-- select --") {
      return true;
    }
    return false;
  }

  function findBestProfileMatch(field, profileInput) {
    const profile = normalizeProfile(profileInput);
    const candidates = uniqueNormalizedList((field.candidates || []).concat(field.rawCandidates || []));
    if (!candidates.length) {
      return null;
    }

    let best = null;

    PROFILE_FIELD_RULES.forEach(function eachRule(rule) {
      const value = cleanString(profile[rule.key]);
      if (!value) {
        return;
      }

      const aliases = uniqueNormalizedList(rule.aliases || []);

      aliases.forEach(function eachAlias(alias) {
        candidates.forEach(function eachCandidate(candidate) {
          let score = 0;
          let matchType = "";

          if (candidate === alias) {
            score = 300;
            matchType = "alias_exact";
          } else if (normalizeCompact(candidate) && normalizeCompact(alias) && normalizeCompact(candidate) === normalizeCompact(alias)) {
            score = 240;
            matchType = "alias_normalized";
          } else if (candidate.indexOf(alias) !== -1 || alias.indexOf(candidate) !== -1) {
            score = 180;
            matchType = "alias_partial";
          }

          if (!score) {
            return;
          }

          if (!best || score > best.score) {
            best = {
              score: score,
              matchType: matchType,
              profileKey: rule.key,
              value: value,
              alias: alias,
              candidate: candidate
            };
          }
        });
      });
    });

    return best;
  }

  function buildQaAliases(entry) {
    const safe = entry && typeof entry === "object" ? entry : {};
    return uniqueNormalizedList(
      []
        .concat(Array.isArray(safe.aliases) ? safe.aliases : [])
        .concat(cleanString(safe.questionText) ? [safe.questionText] : [])
        .concat(cleanString(safe.questionKey) ? [safe.questionKey] : [])
    );
  }

  function findBestQaMemoryMatch(field, qaMemoryInput) {
    const qaMemory = normalizeQaMemory(qaMemoryInput);
    if (!qaMemory.length) {
      return null;
    }

    const candidates = uniqueNormalizedList((field.candidates || []).concat(field.rawCandidates || []));
    if (!candidates.length) {
      return null;
    }

    let best = null;

    qaMemory.forEach(function eachEntry(entry) {
      const answer = cleanString(entry.answer);
      if (!answer) {
        return;
      }

      const aliases = buildQaAliases(entry);
      const entryKey = normalizeKeyword(entry.questionKey).replace(/\s+/g, "_");

      aliases.forEach(function eachAlias(alias) {
        candidates.forEach(function eachCandidate(candidate) {
          let score = 0;
          let matchType = "";

          if (candidate === alias) {
            score = 280;
            matchType = "alias_exact";
          } else if (normalizeCompact(candidate) && normalizeCompact(alias) && normalizeCompact(candidate) === normalizeCompact(alias)) {
            score = 230;
            matchType = "alias_normalized";
          } else if (candidate.indexOf(alias) !== -1 || alias.indexOf(candidate) !== -1) {
            score = 180;
            matchType = "alias_partial";
          }

          if (!score) {
            return;
          }

          if (!best || score > best.score) {
            best = {
              score: score,
              matchType: matchType,
              value: answer,
              entry: entry,
              key: entryKey,
              askEveryTime: Boolean(entry.askEveryTime),
              alias: alias,
              candidate: candidate
            };
          }
        });
      });
    });

    return best;
  }

  function setNativeTextValue(element, value) {
    const descriptor = Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value"
    );
    const setter = descriptor && descriptor.set;

    if (typeof setter === "function") {
      setter.call(element, value);
      return;
    }
    element.value = value;
  }

  function dispatchFieldEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("blur", { bubbles: false, cancelable: false }));
  }

  function selectBestOption(element, value) {
    const target = normalizeKeyword(value);
    const compactTarget = normalizeCompact(value);
    const options = Array.from(element.options);
    if (!target) {
      return null;
    }

    let exact = options.find(function byExact(option) {
      return normalizeKeyword(option.textContent) === target || normalizeKeyword(option.value) === target;
    });
    if (exact) {
      return exact;
    }

    exact = options.find(function byNormalized(option) {
      return normalizeCompact(option.textContent) === compactTarget || normalizeCompact(option.value) === compactTarget;
    });
    if (exact) {
      return exact;
    }

    return options.find(function byPartial(option) {
      const text = normalizeKeyword(option.textContent);
      const val = normalizeKeyword(option.value);
      return text.indexOf(target) !== -1 || target.indexOf(text) !== -1 || val.indexOf(target) !== -1 || target.indexOf(val) !== -1;
    }) || null;
  }

  function deriveFieldKey(field) {
    return cleanString(field.name) || cleanString(field.id) || cleanString(field.label) || "field_" + String(field.index);
  }

  function fillField(field, rawValue, sourceKey, reason) {
    const element = field.element;
    const value = cleanString(rawValue);
    const fieldKey = deriveFieldKey(field);

    if (!element || !value) {
      return {
        fieldKey: fieldKey,
        fieldId: field.id || undefined,
        fieldLabel: field.label || undefined,
        status: "skipped",
        valuePreview: "",
        reason: "EMPTY_VALUE"
      };
    }

    try {
      if (element instanceof HTMLTextAreaElement) {
        setNativeTextValue(element, value);
        dispatchFieldEvents(element);
      } else if (element instanceof HTMLSelectElement) {
        const option = selectBestOption(element, value);
        if (!option) {
          return {
            fieldKey: fieldKey,
            fieldId: field.id || undefined,
            fieldLabel: field.label || undefined,
            status: "skipped",
            valuePreview: value,
            reason: "SELECT_OPTION_NOT_FOUND"
          };
        }
        element.value = option.value;
        dispatchFieldEvents(element);
      } else if (element instanceof HTMLInputElement) {
        const type = getFieldType(element);
        if (!AUTO_FILL_INPUT_TYPES.has(type)) {
          return {
            fieldKey: fieldKey,
            fieldId: field.id || undefined,
            fieldLabel: field.label || undefined,
            status: "skipped",
            valuePreview: value,
            reason: "UNSUPPORTED_FIELD_TYPE"
          };
        }

        setNativeTextValue(element, value);
        dispatchFieldEvents(element);
      } else {
        return {
          fieldKey: fieldKey,
          fieldId: field.id || undefined,
          fieldLabel: field.label || undefined,
          status: "skipped",
          valuePreview: value,
          reason: "UNSUPPORTED_ELEMENT"
        };
      }

      return {
        fieldKey: fieldKey,
        fieldId: field.id || undefined,
        fieldLabel: field.label || undefined,
        status: "filled",
        value: value,
        valuePreview: value.length > 48 ? value.slice(0, 45) + "..." : value,
        reason: cleanString(reason) || "STAGE8_MATCHED",
        datasetKey: cleanString(sourceKey) || undefined
      };
    } catch (error) {
      return {
        fieldKey: fieldKey,
        fieldId: field.id || undefined,
        fieldLabel: field.label || undefined,
        status: "error",
        valuePreview: value,
        reason: cleanString(reason) || "STAGE8_MATCHED",
        errorMessage: error instanceof Error ? error.message : String(error),
        datasetKey: cleanString(sourceKey) || undefined
      };
    }
  }

  function removeExistingModal() {
    const existing = document.getElementById(MODAL_ROOT_ID);
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }
  }

  function ensureModalStyle() {
    if (document.getElementById(MODAL_STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = MODAL_STYLE_ID;
    style.textContent = [
      "#" + MODAL_ROOT_ID + " { position: fixed; inset: 0; z-index: 2147483647; background: rgba(9,16,29,0.5); display:flex; align-items:flex-start; justify-content:center; overflow:auto; padding: 24px; box-sizing:border-box; }",
      "#" + MODAL_ROOT_ID + " .stage8-modal { margin-top: 12px; width: min(900px, 95vw); background: #ffffff; border: 1px solid #d8dde6; border-radius: 12px; box-shadow: 0 18px 48px rgba(0,0,0,0.22); color: #1d2a3b; font-family: Arial, sans-serif; }",
      "#" + MODAL_ROOT_ID + " .stage8-header { display:flex; justify-content:space-between; align-items:flex-start; gap: 12px; padding: 16px 20px 8px; }",
      "#" + MODAL_ROOT_ID + " .stage8-title { font-size: 17px; font-weight: 700; margin: 0; }",
      "#" + MODAL_ROOT_ID + " .stage8-subtitle { font-size: 12px; color: #5f6f86; margin: 6px 0 0; line-height: 1.45; }",
      "#" + MODAL_ROOT_ID + " .stage8-close { border: 0; background: transparent; color: #51617b; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px; }",
      "#" + MODAL_ROOT_ID + " .stage8-body { max-height: 62vh; overflow: auto; padding: 8px 20px 4px; }",
      "#" + MODAL_ROOT_ID + " .stage8-item { border: 1px solid #e2e7ef; border-radius: 10px; padding: 10px; margin-bottom: 10px; background: #fbfcfe; }",
      "#" + MODAL_ROOT_ID + " .stage8-item-top { display:flex; justify-content:space-between; gap: 10px; margin-bottom: 8px; }",
      "#" + MODAL_ROOT_ID + " .stage8-item-label { font-size: 13px; font-weight: 600; color: #142032; }",
      "#" + MODAL_ROOT_ID + " .stage8-item-type { font-size: 11px; color: #5f6f86; text-transform: uppercase; }",
      "#" + MODAL_ROOT_ID + " .stage8-item-meta { font-size: 12px; color: #5f6f86; margin-bottom: 6px; line-height: 1.35; }",
      "#" + MODAL_ROOT_ID + " .stage8-ai { display:block; margin: 6px 0 8px; font-size: 12px; color: #1f4ba0; line-height: 1.35; }",
      "#" + MODAL_ROOT_ID + " .stage8-item input, #" + MODAL_ROOT_ID + " .stage8-item select, #" + MODAL_ROOT_ID + " .stage8-item textarea { width: 100%; box-sizing: border-box; border: 1px solid #b8c4d6; border-radius: 8px; padding: 8px 10px; font-size: 13px; color: #152238; background: #ffffff; }",
      "#" + MODAL_ROOT_ID + " .stage8-item textarea { min-height: 72px; resize: vertical; }",
      "#" + MODAL_ROOT_ID + " .stage8-protected { display:inline-block; padding: 2px 6px; border-radius: 999px; font-size: 11px; font-weight: 600; color: #8a3f00; background: #ffe8d6; margin-left: 8px; }",
      "#" + MODAL_ROOT_ID + " .stage8-footer { display:flex; justify-content:flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid #edf2f8; }",
      "#" + MODAL_ROOT_ID + " .stage8-btn { border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #b7c3d5; background: #ffffff; color: #1d2a3b; }",
      "#" + MODAL_ROOT_ID + " .stage8-btn.primary { border-color: #1f4ba0; background: #2a5fc9; color: #ffffff; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  function createInputControl(field) {
    if (field.tagName === "select") {
      const select = document.createElement("select");
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "-- Select --";
      select.appendChild(emptyOption);

      (field.options || []).forEach(function eachOption(option) {
        const optionElement = document.createElement("option");
        optionElement.value = cleanString(option.value || option.text);
        optionElement.textContent = cleanString(option.text || option.value);
        select.appendChild(optionElement);
      });
      return select;
    }

    if (field.tagName === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.placeholder = field.placeholder || "Type answer";
      return textarea;
    }

    const input = document.createElement("input");
    if (field.type === "email" || field.type === "tel") {
      input.type = field.type;
    } else {
      input.type = "text";
    }
    input.placeholder = field.placeholder || "Type answer";
    return input;
  }

  function toMissingFieldLabel(field) {
    return cleanString(field.label) || cleanString(field.ariaLabel) || cleanString(field.name) || cleanString(field.id) || "Untitled field";
  }

  function deriveQuestionKey(field, index) {
    const candidates = uniqueNormalizedList((field.candidates || []).concat(field.rawCandidates || []));
    if (candidates.length) {
      return candidates[0].replace(/\s+/g, "_");
    }

    const label = normalizeKeyword(toMissingFieldLabel(field)).replace(/\s+/g, "_");
    if (label) {
      return label;
    }

    return "field_" + String(index + 1);
  }

  function extractMiniMaxTextBlocks(payload) {
    const safe = payload && typeof payload === "object" ? payload : {};
    const blocks = Array.isArray(safe.content) ? safe.content : [];
    const texts = [];

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index] && typeof blocks[index] === "object" ? blocks[index] : {};
      const type = cleanString(block.type).toLowerCase();
      const text = cleanString(block.text);
      if (type === "text" && text) {
        texts.push(text);
      }
    }

    return texts;
  }

  function parseJsonObjectFromLooseText(rawText) {
    const text = cleanString(rawText);
    if (!text) {
      return null;
    }

    const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // try slicing JSON block below
    }

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(slice);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  function resolveMiniMaxBaseUrl(settings) {
    const safe = settings && typeof settings === "object" ? settings : {};
    const minimax = safe.providers && typeof safe.providers === "object" && safe.providers.minimax && typeof safe.providers.minimax === "object"
      ? safe.providers.minimax
      : {};

    const fallback = "https://api.minimax.io/anthropic";
    const candidate = cleanString(minimax.baseUrl) || cleanString(safe.apiBaseUrl) || fallback;
    const initial = candidate.replace(/\/+$/, "");

    if (!initial) {
      return fallback;
    }

    const normalized = initial
      .replace(/\/anthropic\/v1\/messages$/i, "")
      .replace(/\/v1\/messages$/i, "");

    if (normalized.indexOf("api.minimax.io/anthropic") !== -1) {
      return normalized;
    }

    if (normalized.indexOf("api.minimax.io") !== -1) {
      return normalized + "/anthropic";
    }

    return fallback;
  }

  function resolveMiniMaxApiKey(settings) {
    const safe = settings && typeof settings === "object" ? settings : {};
    const minimax = safe.providers && typeof safe.providers === "object" && safe.providers.minimax && typeof safe.providers.minimax === "object"
      ? safe.providers.minimax
      : {};

    return cleanString(minimax.apiKey || safe.apiKey);
  }

  function resolveMiniMaxModel(settings) {
    const safe = settings && typeof settings === "object" ? settings : {};
    const minimax = safe.providers && typeof safe.providers === "object" && safe.providers.minimax && typeof safe.providers.minimax === "object"
      ? safe.providers.minimax
      : {};
    return cleanString(minimax.model || safe.model) || "MiniMax-M2.5";
  }

  function resolveMiniMaxSystemPrompt(settings) {
    const safe = settings && typeof settings === "object" ? settings : {};
    const minimax = safe.providers && typeof safe.providers === "object" && safe.providers.minimax && typeof safe.providers.minimax === "object"
      ? safe.providers.minimax
      : {};
    return cleanString(minimax.systemPrompt) || "You are a helpful assistant.";
  }

  function resolveAnthropicVersion(settings) {
    const safe = settings && typeof settings === "object" ? settings : {};
    const minimax = safe.providers && typeof safe.providers === "object" && safe.providers.minimax && typeof safe.providers.minimax === "object"
      ? safe.providers.minimax
      : {};
    return cleanString(minimax.anthropicVersion) || "2023-06-01";
  }

  function clipText(value, maxLength) {
    const text = cleanString(value);
    if (!text) {
      return "";
    }
    if (!maxLength || text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength);
  }

  function buildAiSuggestionPrompt(unresolvedFields, profileInput) {
    const unresolved = Array.isArray(unresolvedFields) ? unresolvedFields : [];
    const profile = normalizeProfile(profileInput);

    const questionItems = unresolved.map(function mapField(item, index) {
      const field = item && item.field ? item.field : {};
      return {
        index: index,
        questionText: toMissingFieldLabel(field),
        questionKey: deriveQuestionKey(field, index),
        inputType: cleanString(field.tagName) + (cleanString(field.type) ? "/" + cleanString(field.type) : ""),
        required: Boolean(field.required),
        options: Array.isArray(field.options)
          ? field.options.map(function mapOption(option) {
            const text = cleanString(option && (option.text || option.value));
            return text;
          }).filter(Boolean).slice(0, 12)
          : [],
        protectedCategory: cleanString(item.protectedCategory),
        placeholder: cleanString(field.placeholder)
      };
    });

    return [
      "You provide draft answers for unresolved job-application form questions.",
      "Output only one JSON object with shape:",
      '{ "answers": [{ "index": number, "answer": string }] }',
      "Rules:",
      "- Use the profile data when relevant.",
      "- If the answer is unknown, use an empty string.",
      "- Do not fabricate legal/work-authorization/diversity answers.",
      "- Keep answers concise and plain text.",
      "- No markdown and no explanations.",
      "",
      "Profile JSON:",
      JSON.stringify(profile, null, 2),
      "",
      "Questions JSON:",
      JSON.stringify(questionItems, null, 2)
    ].join("\n");
  }

  async function inferAiSuggestionsForMissingFields(unresolvedFields, profileInput) {
    const fields = Array.isArray(unresolvedFields) ? unresolvedFields : [];
    if (!fields.length) {
      return { ok: true, suggestions: {} };
    }

    const payload = await getLocal(["extensionSettings"]);
    const settings = payload && payload.extensionSettings && typeof payload.extensionSettings === "object"
      ? payload.extensionSettings
      : {};

    const apiKey = resolveMiniMaxApiKey(settings);
    if (!apiKey) {
      return {
        ok: false,
        reason: "missing_api_key",
        suggestions: {}
      };
    }

    const baseUrl = resolveMiniMaxBaseUrl(settings);
    const requestUrl = baseUrl.replace(/\/+$/, "") + "/v1/messages";
    const prompt = buildAiSuggestionPrompt(fields, profileInput);

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(function onTimeout() {
        controller.abort();
      }, SUGGESTION_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
          "x-api-key": apiKey,
          "anthropic-version": resolveAnthropicVersion(settings)
        },
        body: JSON.stringify({
          model: resolveMiniMaxModel(settings),
          max_tokens: 1400,
          system: resolveMiniMaxSystemPrompt(settings),
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: clipText(prompt, MAX_AI_INPUT_LENGTH) }]
            }
          ]
        }),
        signal: controller ? controller.signal : undefined
      });

      const rawText = await response.text();
      if (!response.ok) {
        return {
          ok: false,
          reason: "http_error",
          detail: "HTTP " + String(response.status) + " " + cleanString(response.statusText),
          suggestions: {}
        };
      }

      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(rawText || "{}");
      } catch {
        parsedPayload = {};
      }

      const textBlocks = extractMiniMaxTextBlocks(parsedPayload);
      const parsed = parseJsonObjectFromLooseText(textBlocks.join("\n"));
      if (!parsed || !Array.isArray(parsed.answers)) {
        return {
          ok: false,
          reason: "parse_failed",
          suggestions: {}
        };
      }

      const suggestions = {};
      parsed.answers.forEach(function eachAnswer(item) {
        const safe = item && typeof item === "object" ? item : {};
        const index = Number(safe.index);
        const answer = cleanString(safe.answer);
        if (!Number.isInteger(index) || index < 0 || index >= fields.length || !answer) {
          return;
        }
        suggestions[index] = answer;
      });

      return {
        ok: true,
        suggestions: suggestions
      };
    } catch (error) {
      return {
        ok: false,
        reason: "request_failed",
        detail: error instanceof Error ? error.message : String(error),
        suggestions: {}
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  function showReviewModal(missingFields, context) {
    const options = context && typeof context === "object" ? context : {};
    const aiSuggestions = options.aiSuggestions && typeof options.aiSuggestions === "object" ? options.aiSuggestions : {};

    return new Promise(function waitForUser(resolve) {
      if (!Array.isArray(missingFields) || !missingFields.length) {
        resolve({
          action: "skipped",
          fillResults: [],
          savedCount: 0,
          knowledgeBase: options.knowledgeBase || null
        });
        return;
      }

      removeExistingModal();
      ensureModalStyle();

      const root = document.createElement("div");
      root.id = MODAL_ROOT_ID;

      const modal = document.createElement("div");
      modal.className = "stage8-modal";

      const header = document.createElement("div");
      header.className = "stage8-header";

      const titleWrap = document.createElement("div");
      const title = document.createElement("h3");
      title.className = "stage8-title";
      title.textContent = "Review Unresolved Questions";
      const subtitle = document.createElement("p");
      subtitle.className = "stage8-subtitle";
      subtitle.textContent = "AutoFill used profile + local memory first. Review AI suggestions, edit as needed, then confirm.";
      titleWrap.appendChild(title);
      titleWrap.appendChild(subtitle);

      const closeButton = document.createElement("button");
      closeButton.className = "stage8-close";
      closeButton.type = "button";
      closeButton.textContent = "×";

      header.appendChild(titleWrap);
      header.appendChild(closeButton);
      modal.appendChild(header);

      const body = document.createElement("div");
      body.className = "stage8-body";

      const controls = [];
      const cappedMissing = missingFields.slice(0, REVIEW_MAX_FIELDS);

      cappedMissing.forEach(function eachMissing(item, index) {
        const field = item.field;
        const row = document.createElement("div");
        row.className = "stage8-item";

        const top = document.createElement("div");
        top.className = "stage8-item-top";

        const label = document.createElement("div");
        label.className = "stage8-item-label";
        label.textContent = toMissingFieldLabel(field);

        if (item.protectedCategory) {
          const badge = document.createElement("span");
          badge.className = "stage8-protected";
          badge.textContent = "Protected: " + item.protectedCategory;
          label.appendChild(badge);
        }

        const type = document.createElement("div");
        type.className = "stage8-item-type";
        type.textContent = field.tagName + (field.type ? "/" + field.type : "");

        top.appendChild(label);
        top.appendChild(type);
        row.appendChild(top);

        const meta = document.createElement("div");
        meta.className = "stage8-item-meta";
        meta.textContent = "Question key candidates: " + ((field.candidates && field.candidates.length) ? field.candidates.join(", ") : "(none)");
        row.appendChild(meta);

        const aiSuggestion = cleanString(aiSuggestions[index]);
        if (aiSuggestion) {
          const aiLine = document.createElement("span");
          aiLine.className = "stage8-ai";
          aiLine.textContent = "AI suggestion: " + aiSuggestion;
          row.appendChild(aiLine);
        }

        const control = createInputControl(field);
        const defaultValue = cleanString(item.matchedValue || aiSuggestion || "");
        if (defaultValue) {
          control.value = defaultValue;
        }

        row.appendChild(control);
        body.appendChild(row);

        controls.push({
          index: index,
          item: item,
          control: control,
          aiSuggestion: aiSuggestion
        });
      });

      modal.appendChild(body);

      const footer = document.createElement("div");
      footer.className = "stage8-footer";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "stage8-btn";
      cancelButton.textContent = "Cancel";

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "stage8-btn primary";
      confirmButton.textContent = "Confirm and Fill";

      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);
      modal.appendChild(footer);

      root.appendChild(modal);
      document.body.appendChild(root);

      let settled = false;
      function finalize(result) {
        if (settled) {
          return;
        }
        settled = true;
        removeExistingModal();
        resolve(result);
      }

      async function handleConfirm() {
        const fillResults = [];
        const qaEntries = [];

        controls.forEach(function eachControl(ctrl) {
          const value = cleanString(ctrl.control && ctrl.control.value);
          if (!value) {
            return;
          }

          const field = ctrl.item.field;
          const questionKey = deriveQuestionKey(field, ctrl.index);
          const reason = ctrl.item.protectedCategory
            ? "STAGE8_REVIEW_PROTECTED"
            : "STAGE8_REVIEW_CONFIRMED";
          const fillResult = fillField(field, value, questionKey, reason);
          fillResults.push(fillResult);

          const aiSuggestion = cleanString(ctrl.aiSuggestion);
          let source = "manual_confirmed";
          if (aiSuggestion) {
            source = normalizeKeyword(aiSuggestion) === normalizeKeyword(value)
              ? "ai_accepted"
              : "user_edited_after_ai";
          }

          qaEntries.push({
            questionKey: questionKey,
            questionText: toMissingFieldLabel(field),
            answer: value,
            source: source,
            updatedAt: new Date().toISOString(),
            aliases: uniqueNormalizedList((field.candidates || []).concat(field.rawCandidates || []).concat([field.label, field.name, field.id]))
          });
        });

        let updatedKnowledgeBase = options.knowledgeBase || null;
        let savedCount = 0;

        if (qaEntries.length) {
          updatedKnowledgeBase = await upsertQaMemoryEntries(qaEntries, updatedKnowledgeBase);
          savedCount = qaEntries.length;
        }

        finalize({
          action: "confirmed",
          fillResults: fillResults,
          savedCount: savedCount,
          knowledgeBase: updatedKnowledgeBase
        });
      }

      cancelButton.addEventListener("click", function onCancel() {
        finalize({
          action: "dismissed",
          fillResults: [],
          savedCount: 0,
          knowledgeBase: options.knowledgeBase || null
        });
      });

      confirmButton.addEventListener("click", function onConfirm() {
        handleConfirm().catch(function onError(error) {
          finalize({
            action: "error",
            fillResults: [],
            savedCount: 0,
            errorMessage: error instanceof Error ? error.message : String(error),
            knowledgeBase: options.knowledgeBase || null
          });
        });
      });

      closeButton.addEventListener("click", function onClose() {
        finalize({
          action: "dismissed",
          fillResults: [],
          savedCount: 0,
          knowledgeBase: options.knowledgeBase || null
        });
      });
    });
  }

  async function runKeywordDatasetAutofill(input) {
    const config = input && typeof input === "object" ? input : {};
    let knowledgeBase = await loadKnowledgeBase(config.profile || {});
    const workingProfile = mergeProfiles(knowledgeBase.profile, config.profile || {}, { override: false });
    const scannedFields = scanFormFields();
    const matchResults = [];
    const autoFillResults = [];
    const missingFields = [];

    scannedFields.forEach(function eachField(field) {
      const protectedCategory = detectProtectedCategory(field);
      const supported = isAutoFillSupportedField(field);
      const unfilled = isLikelyUnfilled(field);
      const profileMatch = findBestProfileMatch(field, workingProfile);
      const qaMatch = findBestQaMemoryMatch(field, knowledgeBase.qaMemory);
      const bestMatch = profileMatch
        ? {
            source: "profile",
            key: profileMatch.profileKey,
            value: profileMatch.value,
            matchType: profileMatch.matchType
          }
        : qaMatch
          ? {
              source: "qa_memory",
            key: cleanString(qaMatch.entry && qaMatch.entry.questionKey),
            value: cleanString(qaMatch.value),
            matchType: cleanString(qaMatch.matchType),
            askEveryTime: Boolean(qaMatch.askEveryTime)
          }
          : null;
      const shouldAskEveryTime = Boolean(bestMatch && bestMatch.source === "qa_memory" && bestMatch.askEveryTime);
      const matched = Boolean(bestMatch && cleanString(bestMatch.value) && !shouldAskEveryTime);

      if (!supported) {
        matchResults.push({
          field: field,
          matched: matched,
          source: matched ? bestMatch.source : "",
          datasetKey: matched ? bestMatch.key : "",
          matchedValue: matched ? bestMatch.value : "",
          reason: "UNSUPPORTED_FIELD_TYPE",
          protectedCategory: protectedCategory
        });

        if (protectedCategory && unfilled) {
          missingFields.push({
            field: field,
            protectedCategory: protectedCategory,
            matchedValue: matched ? bestMatch.value : "",
            reason: "PROTECTED_FIELD"
          });
        }
        return;
      }

      if (!unfilled) {
        matchResults.push({
          field: field,
          matched: false,
          source: "",
          datasetKey: "",
          matchedValue: "",
          reason: "ALREADY_FILLED",
          protectedCategory: protectedCategory
        });
        return;
      }

      matchResults.push({
        field: field,
        matched: matched,
        source: matched ? bestMatch.source : "",
        datasetKey: matched ? bestMatch.key : "",
        matchedValue: matched ? bestMatch.value : "",
        matchType: matched ? bestMatch.matchType : "",
        reason: matched
          ? (bestMatch.source === "profile" ? "PROFILE_" : "QAMEMORY_") + String(bestMatch.matchType || "matched").toUpperCase()
          : "NO_MATCH",
        protectedCategory: protectedCategory
      });

      if (protectedCategory && !matched) {
        // Protected field with no saved answer — send to review modal
        missingFields.push({
          field: field,
          protectedCategory: protectedCategory,
          matchedValue: "",
          reason: "PROTECTED_FIELD"
        });
        return;
      }

      if (!matched) {
        missingFields.push({
          field: field,
          protectedCategory: "",
          matchedValue: shouldAskEveryTime && bestMatch ? cleanString(bestMatch.value) : "",
          reason: shouldAskEveryTime ? "ASK_EVERY_TIME" : "NO_MATCH"
        });
        return;
      }

      const fillReason = bestMatch.source === "profile"
        ? "STAGE8_PROFILE_" + String(bestMatch.matchType || "MATCH").toUpperCase()
        : "STAGE8_QAMEMORY_" + String(bestMatch.matchType || "MATCH").toUpperCase();
      const fillResult = fillField(field, bestMatch.value, bestMatch.key, fillReason);
      autoFillResults.push(fillResult);

      if (fillResult.status !== "filled") {
        missingFields.push({
          field: field,
          protectedCategory: "",
          matchedValue: bestMatch.value,
          reason: fillResult.reason || "AUTO_FILL_FAILED"
        });
      }
    });

    let reviewResult = {
      action: "skipped",
      fillResults: [],
      savedCount: 0,
      knowledgeBase: knowledgeBase
    };

    if (missingFields.length) {
      const suggestionTargets = missingFields.filter(function filterTarget(item) {
        return !cleanString(item.protectedCategory);
      });
      const aiSuggestionResult = await inferAiSuggestionsForMissingFields(suggestionTargets, workingProfile);
      const aiSuggestions = {};
      suggestionTargets.forEach(function eachTarget(item, index) {
        if (aiSuggestionResult && aiSuggestionResult.suggestions && cleanString(aiSuggestionResult.suggestions[index])) {
          const originalIndex = missingFields.indexOf(item);
          if (originalIndex >= 0) {
            aiSuggestions[originalIndex] = cleanString(aiSuggestionResult.suggestions[index]);
          }
        }
      });

      reviewResult = await showReviewModal(missingFields, {
        aiSuggestions: aiSuggestions,
        knowledgeBase: knowledgeBase
      });
      knowledgeBase = normalizeKnowledgeBase(reviewResult.knowledgeBase || knowledgeBase);
    }

    const mergedFillResults = autoFillResults.concat(Array.isArray(reviewResult.fillResults) ? reviewResult.fillResults : []);
    const filledCount = mergedFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length;
    const protectedCount = missingFields.filter(function filterProtected(item) { return Boolean(item.protectedCategory); }).length;

    return {
      scannedFields: scannedFields,
      matchResults: matchResults,
      fillResults: mergedFillResults,
      missingFields: missingFields,
      fallbackAction: reviewResult.action,
      fallbackTriggered: Boolean(missingFields.length),
      datasetFieldCount: Array.isArray(knowledgeBase.qaMemory) ? knowledgeBase.qaMemory.length : 0,
      matchedCount: matchResults.filter(function filterMatched(item) { return item.matched; }).length,
      autoFilledCount: autoFillResults.filter(function filterFilled(item) { return item.status === "filled"; }).length,
      totalFilledCount: filledCount,
      protectedCount: protectedCount,
      savedCount: Number(reviewResult.savedCount) || 0
    };
  }

  global.Stage8KeywordAutofill = Object.freeze({
    runKeywordDatasetAutofill: runKeywordDatasetAutofill,
    scanFormFields: scanFormFields,
    normalizeKeyword: normalizeKeyword
  });
})(globalThis);
