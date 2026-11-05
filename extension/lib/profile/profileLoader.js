(function attachStage5ProfileLoader(global) {
  "use strict";

  var normalizer = global.Stage5ProfileNormalizer || {};

  var CANDIDATE_STORAGE_PRIORITY = Object.freeze([
    "candidateProfile",
    "candidateResume",
    "profile",
    "resume",
    "resumeData",
    "resumeJson"
  ]);
  var AUTOFILL_KNOWLEDGE_BASE_KEY = "autofillKnowledgeBase";
  var APP_DATA_KEY = "appDataV1";

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function getStorageArea() {
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function getLocal(keys) {
    return new Promise(function wrap(resolve) {
      var storage = getStorageArea();
      if (!storage) {
        resolve({});
        return;
      }

      storage.get(keys, function onGet(result) {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(result || {});
      });
    });
  }

  async function readExtensionJson(relativePath) {
    try {
      var baseUrl = global.chrome && chrome.runtime && typeof chrome.runtime.getURL === "function"
        ? chrome.runtime.getURL(relativePath)
        : relativePath;
      var response = await fetch(baseUrl, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      var payload = await response.json();
      return isObject(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  function normalizeCandidateResume(value) {
    if (normalizer && typeof normalizer.normalizeCandidateResume === "function") {
      return normalizer.normalizeCandidateResume(value);
    }
    return isObject(value) ? value : {};
  }

  function cleanString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function resolveLocalizedText(value, lang) {
    if (typeof value === "string") {
      return cleanString(value);
    }
    if (!isObject(value)) {
      return "";
    }
    var en = cleanString(value.en);
    var zh = cleanString(value.zh);
    return lang === "zh" ? (zh || en) : (en || zh);
  }

  function getAppDataStore() {
    return isObject(global.Stage10AppDataStore) ? global.Stage10AppDataStore : null;
  }

  function splitName(fullName) {
    var text = cleanString(fullName);
    if (!text) {
      return { firstName: "", lastName: "" };
    }
    var parts = text.split(/\s+/).filter(Boolean);
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

  function buildCandidateResumeFromKnowledgeBase(rawKnowledgeBase) {
    var kb = isObject(rawKnowledgeBase) ? rawKnowledgeBase : {};
    var profileRaw = isObject(kb.profile) ? kb.profile : {};
    var fullName = cleanString(profileRaw.fullName || profileRaw.name);
    var split = splitName(fullName);
    var firstName = cleanString(profileRaw.firstName) || split.firstName;
    var lastName = cleanString(profileRaw.lastName) || split.lastName;

    var normalizedProfile = {
      fullName: fullName || [firstName, lastName].filter(Boolean).join(" "),
      firstName: firstName,
      lastName: lastName,
      email: cleanString(profileRaw.email),
      phone: cleanString(profileRaw.phone),
      location: resolveLocalizedText(profileRaw.location, cleanString(profileRaw.resumeLanguage) === "zh" ? "zh" : "en"),
      linkedin: cleanString(profileRaw.linkedin),
      github: cleanString(profileRaw.github),
      portfolio: cleanString(profileRaw.portfolio || profileRaw.website)
    };

    var hasSignal = Boolean(
      normalizedProfile.fullName ||
      normalizedProfile.email ||
      normalizedProfile.phone ||
      normalizedProfile.location ||
      normalizedProfile.linkedin ||
      normalizedProfile.github ||
      normalizedProfile.portfolio
    );

    if (!hasSignal) {
      return null;
    }

    var links = [];
    if (normalizedProfile.linkedin) {
      links.push({ label: "LinkedIn", url: normalizedProfile.linkedin });
    }
    if (normalizedProfile.github) {
      links.push({ label: "GitHub", url: normalizedProfile.github });
    }
    if (normalizedProfile.portfolio) {
      links.push({ label: "Portfolio", url: normalizedProfile.portfolio });
    }

    return normalizeCandidateResume({
      header: {
        name: normalizedProfile.fullName,
        title: "",
        email: normalizedProfile.email,
        phone: normalizedProfile.phone,
        location: normalizedProfile.location,
        links: links
      },
      summary: "",
      experience: [],
      education: [],
      projects: [],
      skills: []
    });
  }

  function buildCandidateResumeFromProfileAndMasterResume(profileInput, masterResumeInput) {
    var appDataStore = getAppDataStore();
    if (appDataStore && typeof appDataStore.toCandidateResume === "function") {
      return normalizeCandidateResume(appDataStore.toCandidateResume(profileInput, masterResumeInput));
    }

    var profile = isObject(profileInput) ? profileInput : {};
    var masterResume = isObject(masterResumeInput) ? masterResumeInput : {};
    var summaries = Array.isArray(masterResume.summaries) ? masterResume.summaries : [];
    var experiences = Array.isArray(masterResume.experiences) ? masterResume.experiences : [];
    var projects = Array.isArray(masterResume.projects) ? masterResume.projects : [];
    var education = Array.isArray(masterResume.education) ? masterResume.education : [];
    var resumeLang = cleanString(profile.resumeLanguage) === "zh" ? "zh" : "en";
    var summaryItem = summaries.find(function findDefault(item) {
      return isObject(item) && item.isDefault && resolveLocalizedText(item.text, resumeLang);
    }) || summaries.find(function findAny(item) {
      return isObject(item) && resolveLocalizedText(item.text, resumeLang);
    }) || {};

    var links = [];
    if (cleanString(profile.linkedin)) {
      links.push({ label: "LinkedIn", url: cleanString(profile.linkedin) });
    }
    if (cleanString(profile.github)) {
      links.push({ label: "GitHub", url: cleanString(profile.github) });
    }
    if (cleanString(profile.portfolio || profile.website)) {
      links.push({ label: "Portfolio", url: cleanString(profile.portfolio || profile.website) });
    }

    var skillsSource = isObject(masterResume.skills) ? masterResume.skills : {};
    var skills = []
      .concat(Array.isArray(skillsSource.languages) ? skillsSource.languages : [])
      .concat(Array.isArray(skillsSource.frameworks) ? skillsSource.frameworks : [])
      .concat(Array.isArray(skillsSource.libraries) ? skillsSource.libraries : [])
      .concat(Array.isArray(skillsSource.tools) ? skillsSource.tools : [])
      .concat(Array.isArray(skillsSource.cloud) ? skillsSource.cloud : [])
      .concat(Array.isArray(skillsSource.databases) ? skillsSource.databases : [])
      .concat(Array.isArray(skillsSource.dataMl) ? skillsSource.dataMl : [])
      .concat(Array.isArray(skillsSource.other) ? skillsSource.other : [])
      .map(function mapSkill(item) {
        return cleanString(item);
      })
      .filter(Boolean);

    var candidateResume = {
      header: {
        name: cleanString(profile.fullName || profile.name),
        title: cleanString(profile.headline),
        email: cleanString(profile.email),
        phone: cleanString(profile.phone),
        location: resolveLocalizedText(profile.location, resumeLang),
        links: links
      },
      summary: resolveLocalizedText(summaryItem.text, resumeLang),
      experience: experiences.map(function mapExp(item) {
        var safe = isObject(item) ? item : {};
        var bullets = Array.isArray(safe.bullets) ? safe.bullets.map(function mapBullet(bullet) {
          if (isObject(bullet)) {
            return resolveLocalizedText(bullet, resumeLang) || cleanString(bullet.text);
          }
          return cleanString(bullet);
        }).filter(Boolean) : [];

        return {
          company: resolveLocalizedText(safe.company, resumeLang),
          title: resolveLocalizedText(safe.title, resumeLang),
          location: resolveLocalizedText(safe.location, resumeLang),
          startDate: cleanString(safe.startDate),
          endDate: cleanString(safe.endDate),
          bullets: bullets
        };
      }),
      education: education.map(function mapEdu(item) {
        var safe = isObject(item) ? item : {};
        var major = resolveLocalizedText(safe.major || safe.field || safe.fieldOfStudy || safe.majorName, resumeLang);
        var coursework = Array.isArray(safe.coursework)
          ? safe.coursework.map(function mapCoursework(entry) { return cleanString(entry); }).filter(Boolean).join(", ")
          : Array.isArray(safe.relevantCoursework)
            ? safe.relevantCoursework.map(function mapLegacyCoursework(entry) { return cleanString(entry); }).filter(Boolean).join(", ")
            : resolveLocalizedText(safe.coursework || safe.relevantCoursework, resumeLang);

        return {
          school: resolveLocalizedText(safe.school, resumeLang),
          degree: resolveLocalizedText(safe.degree, resumeLang),
          major: major,
          field: cleanString(safe.field || safe.fieldOfStudy || major),
          location: resolveLocalizedText(safe.location, resumeLang),
          startDate: cleanString(safe.startDate),
          endDate: cleanString(safe.endDate),
          coursework: coursework,
          description: resolveLocalizedText(safe.description || safe.desc, resumeLang)
        };
      }),
      projects: projects.map(function mapProj(item) {
        var safe = isObject(item) ? item : {};
        var bullets = Array.isArray(safe.bullets) ? safe.bullets.map(function mapBullet(bullet) {
          if (isObject(bullet)) {
            return resolveLocalizedText(bullet, resumeLang) || cleanString(bullet.text);
          }
          return cleanString(bullet);
        }).filter(Boolean) : [];

        return {
          name: resolveLocalizedText(safe.name, resumeLang),
          role: resolveLocalizedText(safe.role, resumeLang),
          startDate: cleanString(safe.startDate),
          endDate: cleanString(safe.endDate),
          bullets: bullets
        };
      }),
      skills: skills,
      profile: {
        workAuthorization: cleanString(profile.workAuthorization || profile.rightToWork),
        requiresSponsorship: Boolean(profile.requiresSponsorship)
      }
    };

    return normalizeCandidateResume(candidateResume);
  }

  function buildCandidateResumeFromAppData(rawAppData) {
    var appData = isObject(rawAppData) ? rawAppData : {};
    var profile = isObject(appData.profile) ? appData.profile : {};
    var masterResume = isObject(appData.masterResume) ? appData.masterResume : {};
    return buildCandidateResumeFromProfileAndMasterResume(profile, masterResume);
  }

  function pickFirstStorageCandidate(storagePayload) {
    for (var index = 0; index < CANDIDATE_STORAGE_PRIORITY.length; index += 1) {
      var key = CANDIDATE_STORAGE_PRIORITY[index];
      var value = storagePayload && storagePayload[key];
      if (isObject(value)) {
        return { sourceKey: key, value: value };
      }
    }

    return null;
  }

  async function loadCandidateProfile(options) {
    var opts = isObject(options) ? options : {};
    if (isObject(opts.profile) || isObject(opts.masterResume)) {
      return {
        candidateResume: buildCandidateResumeFromProfileAndMasterResume(opts.profile, opts.masterResume),
        source: "request.profile+masterResume"
      };
    }

    var appDataStore = getAppDataStore();
    if (appDataStore && typeof appDataStore.getCandidateResumeFromAppData === "function") {
      try {
        var viaAppStore = await appDataStore.getCandidateResumeFromAppData();
        var appStoreCandidate = isObject(viaAppStore) && isObject(viaAppStore.candidateResume)
          ? normalizeCandidateResume(viaAppStore.candidateResume)
          : {};
        if (appStoreCandidate && Object.keys(appStoreCandidate).length) {
          return {
            candidateResume: appStoreCandidate,
            source: cleanString(viaAppStore && viaAppStore.source) || "stage10-app-data-store"
          };
        }
      } catch {
        // fallback below
      }
    }

    var storagePayload = await getLocal(CANDIDATE_STORAGE_PRIORITY.concat([AUTOFILL_KNOWLEDGE_BASE_KEY, APP_DATA_KEY]));

    if (isObject(storagePayload[APP_DATA_KEY])) {
      return {
        candidateResume: buildCandidateResumeFromAppData(storagePayload[APP_DATA_KEY]),
        source: "chrome.storage.local:" + APP_DATA_KEY
      };
    }

    var kbCandidateResume = buildCandidateResumeFromKnowledgeBase(storagePayload[AUTOFILL_KNOWLEDGE_BASE_KEY]);
    if (kbCandidateResume) {
      return {
        candidateResume: kbCandidateResume,
        source: "chrome.storage.local:" + AUTOFILL_KNOWLEDGE_BASE_KEY + ".profile"
      };
    }

    var storageCandidate = pickFirstStorageCandidate(storagePayload);

    if (storageCandidate) {
      return {
        candidateResume: normalizeCandidateResume(storageCandidate.value),
        source: "chrome.storage.local:" + storageCandidate.sourceKey
      };
    }

    var profileDefault = await readExtensionJson("lib/data/profile.default.json");
    if (profileDefault) {
      return {
        candidateResume: normalizeCandidateResume(profileDefault),
        source: "lib/data/profile.default.json"
      };
    }

    var resumeDefault = await readExtensionJson("lib/data/resume.default.json");
    if (resumeDefault) {
      return {
        candidateResume: normalizeCandidateResume(resumeDefault),
        source: "lib/data/resume.default.json"
      };
    }

    return {
      candidateResume: normalizeCandidateResume({}),
      source: "generated-empty"
    };
  }

  global.Stage5ProfileLoader = Object.freeze({
    CANDIDATE_STORAGE_PRIORITY: CANDIDATE_STORAGE_PRIORITY,
    APP_DATA_KEY: APP_DATA_KEY,
    buildCandidateResumeFromProfileAndMasterResume: buildCandidateResumeFromProfileAndMasterResume,
    loadCandidateProfile: loadCandidateProfile,
    loadCandidateResume: loadCandidateProfile
  });
})(globalThis);
