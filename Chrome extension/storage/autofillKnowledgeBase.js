(function attachStage8KnowledgeBase(global) {
  "use strict";

  const KNOWLEDGE_BASE_KEY = "autofillKnowledgeBase";
  const LEGACY_DATASET_KEY = "autofillDataset";
  const APP_DATA_KEY = "appDataV1";
  const LEGACY_PROFILE_KEYS = Object.freeze(["profile", "candidateProfile", "candidateResume"]);
  const PROFILE_FIELDS = Object.freeze([
    "fullName",
    "firstName",
    "lastName",
    "email",
    "phone",
    "location",
    "linkedin",
    "github",
    "portfolio",
    "workAuthorization",
    "requiresSponsorship"
  ]);
  const KB_VERSION = 1;

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

  function uniqueNormalizedList(values) {
    const seen = new Set();
    const output = [];
    const items = Array.isArray(values) ? values : [];
    for (let index = 0; index < items.length; index += 1) {
      const normalized = normalizeKeyword(items[index]);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
    }
    return output;
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

  function createEmptyProfile() {
    return {
      fullName: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      location: "",
      linkedin: "",
      github: "",
      portfolio: "",
      workAuthorization: "",
      requiresSponsorship: false
    };
  }

  function buildProfileFromUnknown(rawInput) {
    const raw = rawInput && typeof rawInput === "object" ? rawInput : {};
    const header = raw.header && typeof raw.header === "object" ? raw.header : {};
    const nestedProfile = raw.profile && typeof raw.profile === "object" ? raw.profile : {};

    const fullName =
      cleanString(raw.fullName) ||
      cleanString(raw.name) ||
      cleanString(nestedProfile.fullName) ||
      cleanString(nestedProfile.name) ||
      cleanString(header.name);
    const split = splitName(fullName);

    const firstName =
      cleanString(raw.firstName) ||
      cleanString(raw.legalFirstName) ||
      cleanString(nestedProfile.firstName) ||
      cleanString(nestedProfile.legalFirstName) ||
      split.firstName;
    const lastName =
      cleanString(raw.lastName) ||
      cleanString(raw.legalLastName) ||
      cleanString(nestedProfile.lastName) ||
      cleanString(nestedProfile.legalLastName) ||
      split.lastName;

    return normalizeProfile({
      fullName: fullName,
      firstName: firstName,
      lastName: lastName,
      email: cleanString(raw.email) || cleanString(nestedProfile.email) || cleanString(header.email),
      phone:
        cleanString(raw.phone) ||
        cleanString(raw.preferredContactNumber) ||
        cleanString(nestedProfile.phone) ||
        cleanString(nestedProfile.preferredContactNumber) ||
        cleanString(header.phone),
      location: cleanString(raw.location) || cleanString(nestedProfile.location) || cleanString(header.location),
      linkedin: cleanString(raw.linkedin) || cleanString(nestedProfile.linkedin),
      github: cleanString(raw.github) || cleanString(nestedProfile.github),
      portfolio: cleanString(raw.portfolio) || cleanString(raw.website) || cleanString(nestedProfile.portfolio),
      workAuthorization:
        cleanString(raw.workAuthorization) ||
        cleanString(raw.rightToWork) ||
        cleanString(nestedProfile.workAuthorization) ||
        cleanString(nestedProfile.rightToWork),
      requiresSponsorship:
        raw.requiresSponsorship !== undefined ? raw.requiresSponsorship : nestedProfile.requiresSponsorship
    });
  }

  function normalizeProfile(input) {
    const raw = input && typeof input === "object" ? input : {};
    const base = createEmptyProfile();

    for (let index = 0; index < PROFILE_FIELDS.length; index += 1) {
      const key = PROFILE_FIELDS[index];
      if (key === "requiresSponsorship") {
        base[key] = normalizeBoolean(raw[key]);
      } else {
        base[key] = cleanString(raw[key]);
      }
    }

    if (!base.fullName) {
      const joined = [base.firstName, base.lastName].filter(Boolean).join(" ");
      base.fullName = joined;
    }

    if (!base.firstName || !base.lastName) {
      const split = splitName(base.fullName);
      if (!base.firstName) {
        base.firstName = split.firstName;
      }
      if (!base.lastName) {
        base.lastName = split.lastName;
      }
    }

    return base;
  }

  function normalizeQaEntry(input, indexHint) {
    const raw = input && typeof input === "object" ? input : {};
    const answer = cleanString(raw.answer || raw.value);
    if (!answer) {
      return null;
    }

    const questionText = cleanString(raw.questionText || raw.question || raw.label);
    const questionKeySource =
      cleanString(raw.questionKey || raw.key) ||
      normalizeKeyword(questionText).replace(/\s+/g, "_");
    const questionKey = cleanString(questionKeySource).replace(/\s+/g, "_");
    if (!questionKey) {
      return null;
    }

    const aliases = uniqueNormalizedList(
      []
        .concat(Array.isArray(raw.aliases) ? raw.aliases : [])
        .concat(Array.isArray(raw.keywords) ? raw.keywords : [])
        .concat(questionText ? [questionText] : [])
    );

    const id = cleanString(raw.id) || "qa_" + String(indexHint || Date.now()) + "_" + Math.random().toString(36).slice(2, 8);

    return {
      id: id,
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
    const seen = new Set();

    for (let index = 0; index < list.length; index += 1) {
      const entry = normalizeQaEntry(list[index], index + 1);
      if (!entry) {
        continue;
      }
      const fingerprint = normalizeKeyword(entry.questionKey + "|" + entry.answer);
      if (seen.has(fingerprint)) {
        continue;
      }
      seen.add(fingerprint);
      output.push(entry);
    }

    return output;
  }

  function normalizeKnowledgeBase(input) {
    const raw = input && typeof input === "object" ? input : {};
    const rawMeta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};

    return {
      profile: normalizeProfile(raw.profile),
      qaMemory: normalizeQaMemory(raw.qaMemory),
      meta: {
        version: Number(rawMeta.version) > 0 ? Number(rawMeta.version) : KB_VERSION,
        updatedAt: toIsoOrNow(rawMeta.updatedAt)
      }
    };
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

  function mergeProfilePreferExisting(baseProfile, extraProfile) {
    const base = normalizeProfile(baseProfile);
    const extra = normalizeProfile(extraProfile);
    const next = { ...base };

    for (let index = 0; index < PROFILE_FIELDS.length; index += 1) {
      const key = PROFILE_FIELDS[index];
      if (!next[key] && extra[key]) {
        next[key] = extra[key];
      }
    }

    if (!next.fullName) {
      next.fullName = [next.firstName, next.lastName].filter(Boolean).join(" ");
    }

    return next;
  }

  function convertLegacyDatasetToQaMemory(dataset) {
    const raw = dataset && typeof dataset === "object" ? dataset : {};
    const fields = Array.isArray(raw.fields) ? raw.fields : [];
    const output = [];

    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index] && typeof fields[index] === "object" ? fields[index] : {};
      const value = cleanString(field.value);
      if (!value) {
        continue;
      }

      const normalizedKeywords = uniqueNormalizedList(Array.isArray(field.keywords) ? field.keywords : []);
      const key = cleanString(field.key) || (normalizedKeywords[0] || "").replace(/\s+/g, "_");
      const questionText = cleanString(field.questionText) || normalizedKeywords[0] || key.replace(/_/g, " ");

      const normalized = normalizeQaEntry({
        questionKey: key,
        questionText: questionText,
        answer: value,
        aliases: normalizedKeywords,
        source: "legacy_dataset"
      }, index + 1);

      if (normalized) {
        output.push(normalized);
      }
    }

    return output;
  }

  function buildCandidateResumeFromProfile(profileInput) {
    const profile = normalizeProfile(profileInput);
    const links = [];

    if (profile.linkedin) {
      links.push({ label: "LinkedIn", url: profile.linkedin });
    }
    if (profile.github) {
      links.push({ label: "GitHub", url: profile.github });
    }
    if (profile.portfolio) {
      links.push({ label: "Portfolio", url: profile.portfolio });
    }

    return {
      header: {
        name: profile.fullName,
        title: "",
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        links: links
      },
      summary: "",
      experience: [],
      education: [],
      projects: [],
      skills: []
    };
  }

  function buildLegacyProfileFromBasicProfile(profileInput) {
    const profile = normalizeProfile(profileInput);
    return {
      fullName: profile.fullName,
      name: profile.fullName,
      firstName: profile.firstName,
      lastName: profile.lastName,
      legalFirstName: profile.firstName,
      legalLastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      preferredContactNumber: profile.phone,
      location: profile.location,
      linkedin: profile.linkedin,
      github: profile.github,
      portfolio: profile.portfolio,
      workAuthorization: profile.workAuthorization,
      rightToWork: profile.workAuthorization,
      requiresSponsorship: profile.requiresSponsorship
    };
  }

  function findQaMemoryIndex(memory, entry) {
    const list = Array.isArray(memory) ? memory : [];
    const safeEntry = entry && typeof entry === "object" ? entry : {};
    const entryKey = normalizeKeyword(safeEntry.questionKey).replace(/\s+/g, "_");
    const entryQuestion = normalizeKeyword(safeEntry.questionText);

    for (let index = 0; index < list.length; index += 1) {
      const current = list[index] && typeof list[index] === "object" ? list[index] : {};
      const currentKey = normalizeKeyword(current.questionKey).replace(/\s+/g, "_");
      const currentQuestion = normalizeKeyword(current.questionText);

      if (entryKey && currentKey && entryKey === currentKey) {
        return index;
      }
      if (entryQuestion && currentQuestion && entryQuestion === currentQuestion) {
        return index;
      }
    }

    return -1;
  }

  function upsertQaMemoryInMemory(memory, entries) {
    const current = normalizeQaMemory(memory);
    const incoming = normalizeQaMemory(entries);

    for (let index = 0; index < incoming.length; index += 1) {
      const entry = incoming[index];
      const targetIndex = findQaMemoryIndex(current, entry);
      if (targetIndex < 0) {
        current.push(entry);
        continue;
      }

      const existing = current[targetIndex];
      current[targetIndex] = {
        ...existing,
        answer: entry.answer,
        source: entry.source,
        updatedAt: toIsoOrNow(entry.updatedAt),
        aliases: uniqueNormalizedList([]
          .concat(Array.isArray(existing.aliases) ? existing.aliases : [])
          .concat(Array.isArray(entry.aliases) ? entry.aliases : [])),
        questionText: cleanString(entry.questionText) || cleanString(existing.questionText),
        questionKey: cleanString(entry.questionKey) || cleanString(existing.questionKey),
        id: cleanString(existing.id) || cleanString(entry.id)
      };
    }

    return current;
  }

  function getAppDataStore() {
    return global.Stage10AppDataStore && typeof global.Stage10AppDataStore === "object"
      ? global.Stage10AppDataStore
      : null;
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
        source: cleanString(safe.source) || "manual",
        updatedAt: toIsoOrNow(safe.updatedAt),
        aliases: Array.isArray(safe.questionPatterns) ? safe.questionPatterns : []
      }, index + 1);
    }).filter(Boolean);

    return normalizeQaMemory(mapped);
  }

  function autofillAnswersFromQaMemory(qaMemoryInput, previousAnswersInput) {
    const qaMemory = normalizeQaMemory(qaMemoryInput);
    const previousAnswers = Array.isArray(previousAnswersInput) ? previousAnswersInput : [];

    return qaMemory.map(function mapEntry(entry, index) {
      const existing = previousAnswers.find(function findMatch(answer) {
        const safe = answer && typeof answer === "object" ? answer : {};
        return cleanString(safe.id) === cleanString(entry.id) || cleanString(safe.key) === cleanString(entry.questionKey);
      }) || {};

      return {
        id: cleanString(existing.id) || cleanString(entry.id) || "answer_" + String(index + 1),
        key: cleanString(existing.key) || cleanString(entry.questionKey) || "field_" + String(index + 1),
        label: cleanString(existing.label) || cleanString(entry.questionText) || cleanString(entry.questionKey),
        questionPatterns: uniqueNormalizedList(
          []
            .concat(Array.isArray(existing.questionPatterns) ? existing.questionPatterns : [])
            .concat(Array.isArray(entry.aliases) ? entry.aliases : [])
            .concat(cleanString(entry.questionText) ? [entry.questionText] : [])
        ),
        answer: cleanString(entry.answer),
        source: cleanString(entry.source) || cleanString(existing.source) || "manual",
        confidence: cleanString(existing.confidence) || "high",
        askEveryTime: existing.askEveryTime !== undefined ? Boolean(existing.askEveryTime) : Boolean(entry.askEveryTime),
        updatedAt: toIsoOrNow(entry.updatedAt || existing.updatedAt)
      };
    });
  }

  async function loadKnowledgeBaseFromAppData(seedProfile) {
    const appStore = getAppDataStore();
    if (!appStore || typeof appStore.getAppData !== "function") {
      return null;
    }

    const appData = await appStore.getAppData();
    const baseProfile = buildProfileFromUnknown(appData && appData.profile);
    const profile = mergeProfilePreferExisting(baseProfile, buildProfileFromUnknown(seedProfile));
    const qaMemory = qaMemoryFromAutofillAnswers(appData && appData.autofillAnswers);

    return normalizeKnowledgeBase({
      profile: profile,
      qaMemory: qaMemory,
      meta: { version: KB_VERSION, updatedAt: new Date().toISOString() }
    });
  }

  async function saveKnowledgeBaseToAppData(kb) {
    const appStore = getAppDataStore();
    if (!appStore || typeof appStore.getAppData !== "function" || typeof appStore.saveAppData !== "function") {
      return null;
    }

    const normalized = normalizeKnowledgeBase(kb);
    const appData = await appStore.getAppData();
    const nextAppData = {
      ...(appData && typeof appData === "object" ? appData : {}),
      profile: {
        ...(appData && appData.profile && typeof appData.profile === "object" ? appData.profile : {}),
        ...normalized.profile
      },
      autofillAnswers: autofillAnswersFromQaMemory(
        normalized.qaMemory,
        appData && Array.isArray(appData.autofillAnswers) ? appData.autofillAnswers : []
      )
    };

    await appStore.saveAppData(nextAppData);
    return normalized;
  }

  async function loadKnowledgeBase(options) {
    const config = options && typeof options === "object" ? options : {};
    const appDataResult = await loadKnowledgeBaseFromAppData(config.seedProfile);
    if (appDataResult) {
      return appDataResult;
    }

    const payload = await getLocal([KNOWLEDGE_BASE_KEY, LEGACY_DATASET_KEY].concat(LEGACY_PROFILE_KEYS));
    const rawKb = payload[KNOWLEDGE_BASE_KEY];
    let knowledgeBase = normalizeKnowledgeBase(rawKb);
    let changed = !rawKb;

    for (let index = 0; index < LEGACY_PROFILE_KEYS.length; index += 1) {
      const key = LEGACY_PROFILE_KEYS[index];
      const legacyProfile = buildProfileFromUnknown(payload[key]);
      const merged = mergeProfilePreferExisting(knowledgeBase.profile, legacyProfile);
      if (JSON.stringify(merged) !== JSON.stringify(knowledgeBase.profile)) {
        changed = true;
      }
      knowledgeBase.profile = merged;
    }

    const seedProfile = buildProfileFromUnknown(config.seedProfile);
    const seeded = mergeProfilePreferExisting(knowledgeBase.profile, seedProfile);
    if (JSON.stringify(seeded) !== JSON.stringify(knowledgeBase.profile)) {
      changed = true;
    }
    knowledgeBase.profile = seeded;

    const legacyDatasetEntries = convertLegacyDatasetToQaMemory(payload[LEGACY_DATASET_KEY]);
    if (legacyDatasetEntries.length) {
      const mergedMemory = upsertQaMemoryInMemory(knowledgeBase.qaMemory, legacyDatasetEntries);
      if (mergedMemory.length !== knowledgeBase.qaMemory.length) {
        changed = true;
      }
      knowledgeBase.qaMemory = mergedMemory;
    }

    knowledgeBase.meta.updatedAt = toIsoOrNow(knowledgeBase.meta.updatedAt);
    knowledgeBase.meta.version = KB_VERSION;

    if (changed || config.persist === true) {
      await saveKnowledgeBase(knowledgeBase);
    }

    return knowledgeBase;
  }

  async function saveKnowledgeBase(input) {
    const normalized = normalizeKnowledgeBase(input);
    normalized.meta.updatedAt = new Date().toISOString();
    normalized.meta.version = KB_VERSION;
    const appStoreResult = await saveKnowledgeBaseToAppData(normalized);
    if (appStoreResult) {
      return appStoreResult;
    }
    await setLocal({ [KNOWLEDGE_BASE_KEY]: normalized });
    return normalized;
  }

  async function updateProfile(profilePatch) {
    const kb = await loadKnowledgeBase();
    const patch = buildProfileFromUnknown(profilePatch);
    const next = {
      ...kb,
      profile: {
        ...kb.profile,
        ...patch
      }
    };
    return await saveKnowledgeBase(next);
  }

  async function upsertQaMemory(entries) {
    const kb = await loadKnowledgeBase();
    const nextMemory = upsertQaMemoryInMemory(kb.qaMemory, entries);
    const next = {
      ...kb,
      qaMemory: nextMemory
    };
    return await saveKnowledgeBase(next);
  }

  async function syncLegacyProfileMirror(profileInput) {
    const profile = normalizeProfile(profileInput);
    const legacyProfile = buildLegacyProfileFromBasicProfile(profile);
    const candidateProfile = buildCandidateResumeFromProfile(profile);
    const appStore = getAppDataStore();

    if (appStore && typeof appStore.saveProfile === "function") {
      await appStore.saveProfile({
        fullName: profile.fullName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        linkedin: profile.linkedin,
        github: profile.github,
        portfolio: profile.portfolio,
        workAuthorization: profile.workAuthorization,
        requiresSponsorship: profile.requiresSponsorship
      });
    }

    await setLocal({
      profile: legacyProfile,
      candidateProfile: candidateProfile
    });

    return {
      profile: legacyProfile,
      candidateProfile: candidateProfile
    };
  }

  function findQaMemoryMatch(qaMemoryInput, queryInput) {
    const qaMemory = normalizeQaMemory(qaMemoryInput);
    const query = queryInput && typeof queryInput === "object" ? queryInput : {};
    const candidates = uniqueNormalizedList(
      []
        .concat(Array.isArray(query.candidates) ? query.candidates : [])
        .concat(cleanString(query.questionText) ? [query.questionText] : [])
        .concat(cleanString(query.questionKey) ? [query.questionKey] : [])
    );
    if (!candidates.length) {
      return null;
    }

    const normalizedQueryKey = normalizeKeyword(query.questionKey).replace(/\s+/g, "_");
    let best = null;

    for (let index = 0; index < qaMemory.length; index += 1) {
      const entry = qaMemory[index];
      const answer = cleanString(entry.answer);
      if (!answer) {
        continue;
      }

      const entryKey = normalizeKeyword(entry.questionKey).replace(/\s+/g, "_");
      const aliases = uniqueNormalizedList(
        []
          .concat(Array.isArray(entry.aliases) ? entry.aliases : [])
          .concat(entry.questionText ? [entry.questionText] : [])
          .concat(entry.questionKey ? [entry.questionKey] : [])
      );

      let score = 0;
      let reason = "";

      if (normalizedQueryKey && entryKey && normalizedQueryKey === entryKey) {
        score = 300;
        reason = "question_key";
      } else {
        for (let cIndex = 0; cIndex < candidates.length; cIndex += 1) {
          const candidate = candidates[cIndex];
          for (let aIndex = 0; aIndex < aliases.length; aIndex += 1) {
            const alias = aliases[aIndex];
            if (candidate === alias) {
              score = Math.max(score, 260);
              reason = reason || "alias_exact";
            } else if (candidate.indexOf(alias) !== -1 || alias.indexOf(candidate) !== -1) {
              score = Math.max(score, 190);
              reason = reason || "alias_partial";
            }
          }
        }
      }

      if (!score) {
        continue;
      }

      if (!best || score > best.score) {
        best = {
          score: score,
          reason: reason,
          entry: entry
        };
      }
    }

    return best;
  }

  global.Stage8KnowledgeBase = Object.freeze({
    KNOWLEDGE_BASE_KEY: KNOWLEDGE_BASE_KEY,
    APP_DATA_KEY: APP_DATA_KEY,
    LEGACY_DATASET_KEY: LEGACY_DATASET_KEY,
    PROFILE_FIELDS: PROFILE_FIELDS,
    normalizeKeyword: normalizeKeyword,
    normalizeProfile: normalizeProfile,
    normalizeQaEntry: normalizeQaEntry,
    normalizeKnowledgeBase: normalizeKnowledgeBase,
    loadKnowledgeBase: loadKnowledgeBase,
    saveKnowledgeBase: saveKnowledgeBase,
    updateProfile: updateProfile,
    upsertQaMemory: upsertQaMemory,
    syncLegacyProfileMirror: syncLegacyProfileMirror,
    findQaMemoryMatch: findQaMemoryMatch,
    buildProfileFromUnknown: buildProfileFromUnknown,
    buildCandidateResumeFromProfile: buildCandidateResumeFromProfile
  });
})(globalThis);
