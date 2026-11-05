(function attachStage10AppDataStore(global) {
  "use strict";

  const APP_DATA_KEY = "appDataV1";
  const PROFILE_RESUME_RESET_VERSION = "2026-04-27-clean-profile-resume";

  function cleanString(value) {
    if (typeof value !== "string") {
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      return "";
    }
    return value.trim();
  }

  function cleanBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const lower = value.trim().toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "y" || lower === "1") {
        return true;
      }
      if (lower === "false" || lower === "no" || lower === "n" || lower === "0") {
        return false;
      }
    }
    return false;
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqueStringArray(value) {
    const seen = new Set();
    const output = [];
    const list = ensureArray(value);
    for (let index = 0; index < list.length; index += 1) {
      const text = cleanString(list[index]);
      if (!text) {
        continue;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(text);
    }
    return output;
  }

  function createId(prefix) {
    return String(prefix || "id") + "_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function normalizeBilingualText(value) {
    if (!value) return { en: "", zh: "", waived: false };
    if (typeof value === "string") return { en: cleanString(value), zh: "", waived: false };
    if (typeof value === "object") {
      return {
        en: cleanString(value.en),
        zh: cleanString(value.zh),
        waived: Boolean(value.waived)
      };
    }
    return { en: "", zh: "", waived: false };
  }

  function normalizeNameParts(value) {
    const raw = value && typeof value === "object" ? value : {};
    const firstName = cleanString(raw.firstName);
    const middleName = cleanString(raw.middleName);
    const lastName = cleanString(raw.lastName);
    const displayName = cleanString(raw.displayName || raw.fullName || raw.name) || [firstName, middleName, lastName].filter(Boolean).join(" ");
    return {
      firstName: firstName,
      middleName: middleName,
      lastName: lastName,
      displayName: displayName
    };
  }

  function normalizeBilingualName(rawProfile, firstName, middleName, lastName, fullName) {
    const raw = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
    const source = raw.name && typeof raw.name === "object" ? raw.name : {};
    const enRaw = source.en && typeof source.en === "object" ? source.en : {};
    const zhRaw = source.zh && typeof source.zh === "object" ? source.zh : {};
    const en = normalizeNameParts({
      firstName: enRaw.firstName || firstName,
      middleName: enRaw.middleName || middleName,
      lastName: enRaw.lastName || lastName,
      displayName: enRaw.displayName || fullName
    });
    const zhDisplay = cleanString(zhRaw.displayName || raw.nameZh || raw.chineseName || raw.zhName);
    const zh = normalizeNameParts({
      firstName: zhRaw.firstName,
      middleName: zhRaw.middleName,
      lastName: zhRaw.lastName,
      displayName: zhDisplay
    });
    return {
      en: en,
      zh: zh,
      waived: Boolean(source.waived)
    };
  }

  function extractEnglish(field) {
    if (!field) return "";
    if (typeof field === "string") return cleanString(field);
    if (typeof field === "object") return cleanString(field.en) || cleanString(field.zh);
    return "";
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
      return { firstName: "", middleName: "", lastName: "" };
    }
    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return { firstName: "", middleName: "", lastName: "" };
    }
    if (parts.length === 1) {
      return { firstName: parts[0], middleName: "", lastName: "" };
    }
    if (parts.length === 2) {
      return { firstName: parts[0], middleName: "", lastName: parts[1] };
    }
    return {
      firstName: parts[0],
      middleName: parts.slice(1, -1).join(" "),
      lastName: parts[parts.length - 1]
    };
  }

  function createDefaultProfile() {
    return {
      id: "",
      name: normalizeBilingualName({}, "", "", "", ""),
      fullName: "",
      firstName: "",
      middleName: "",
      lastName: "",
      email: "",
      phone: "",
      location: "",
      linkedin: "",
      github: "",
      portfolio: "",
      website: "",
      workAuthorization: "",
      requiresSponsorship: false,
      preferredRoles: [],
      preferredLocations: [],
      remotePreference: "",
      salaryExpectation: "",
      yearsOfExperience: 0,
      headline: "",
      relocationPreference: ""
    };
  }

  function createDefaultMasterResume() {
    return {
      lastUpdated: "",
      summaries: [],
      experiences: [],
      projects: [],
      education: [],
      skills: {
        languages: [],
        frameworks: [],
        libraries: [],
        tools: [],
        cloud: [],
        databases: [],
        dataMl: [],
        other: []
      },
      certifications: [],
      awards: [],
      languagesSpoken: [],
      publications: []
    };
  }

  function normalizeResumeField(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      value: cleanString(raw.value !== undefined ? raw.value : value),
      waived: Boolean(raw.waived)
    };
  }

  function normalizeResumeName(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      firstName: cleanString(raw.firstName),
      middleName: cleanString(raw.middleName),
      lastName: cleanString(raw.lastName),
      waived: Boolean(raw.waived)
    };
  }

  function createEmptyResume(lang) {
    const safeLang = cleanString(lang) === "zh" ? "zh" : "en";
    return {
      id: "resume_" + safeLang + "_default",
      language: safeLang,
      header: {
        name: normalizeResumeName({}),
        email: normalizeResumeField(""),
        phone: normalizeResumeField(""),
        location: normalizeResumeField(""),
        linkedin: normalizeResumeField(""),
        github: normalizeResumeField(""),
        portfolio: normalizeResumeField("")
      },
      sections: []
    };
  }

  function normalizeResumeBlock(block, index) {
    const raw = block && typeof block === "object" ? block : {};
    return {
      id: cleanString(raw.id) || createId("block"),
      title: normalizeResumeField(raw.title),
      date: normalizeResumeField(raw.date),
      subtitle: normalizeResumeField(raw.subtitle),
      bullets: ensureArray(raw.bullets).map(function mapBullet(item, bulletIndex) {
        const safe = item && typeof item === "object" ? item : {};
        return {
          id: cleanString(safe.id) || createId("bullet"),
          value: cleanString(safe.value !== undefined ? safe.value : item),
          waived: Boolean(safe.waived),
          order: Number.isFinite(Number(safe.order)) ? Number(safe.order) : bulletIndex + 1
        };
      }),
      description: normalizeResumeField(raw.description),
      waived: Boolean(raw.waived),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1
    };
  }

  function normalizeResumeSection(section, index) {
    const raw = section && typeof section === "object" ? section : {};
    return {
      id: cleanString(raw.id) || createId("section"),
      sectionName: cleanString(raw.sectionName),
      waived: Boolean(raw.waived),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1,
      blocks: ensureArray(raw.blocks).map(normalizeResumeBlock)
    };
  }

  function normalizeResumeObject(resume, lang) {
    const raw = resume && typeof resume === "object" ? resume : {};
    const fallback = createEmptyResume(lang);
    const header = raw.header && typeof raw.header === "object" ? raw.header : {};
    return {
      id: cleanString(raw.id) || fallback.id,
      language: cleanString(lang) === "zh" ? "zh" : "en",
      header: {
        name: normalizeResumeName(header.name),
        email: normalizeResumeField(header.email),
        phone: normalizeResumeField(header.phone),
        location: normalizeResumeField(header.location),
        linkedin: normalizeResumeField(header.linkedin),
        github: normalizeResumeField(header.github),
        portfolio: normalizeResumeField(header.portfolio)
      },
      sections: ensureArray(raw.sections).map(normalizeResumeSection)
    };
  }

  function normalizeDualResumes(input) {
    const raw = input && typeof input === "object" ? input : {};
    const source = raw.resumes && typeof raw.resumes === "object" ? raw.resumes : {};
    return {
      activeResumeLanguage: cleanString(raw.activeResumeLanguage || (raw.profile && raw.profile.resumeLanguage)) === "zh" ? "zh" : "en",
      resumes: {
        en: normalizeResumeObject(source.en, "en"),
        zh: normalizeResumeObject(source.zh, "zh")
      }
    };
  }

  function createDefaultAppData() {
    const dual = normalizeDualResumes({});
    return {
      activeResumeLanguage: dual.activeResumeLanguage,
      resumes: dual.resumes,
      profile: createDefaultProfile(),
      masterResume: createDefaultMasterResume(),
      autofillAnswers: [],
      generatedResumes: [],
      applications: [],
      settings: {
        defaultModel: "",
        defaultResumeStyle: "",
        autofillMode: "suggest",
        simpleMode: false,
        requiredFieldWaivers: {}
      }
    };
  }

  function normalizeSummary(item, index) {
    const raw = item && typeof item === "object" ? item : {};
    const textRaw = typeof item === "string" ? item : raw.text;
    const textBilingual = textRaw && typeof textRaw === "object" && ("en" in textRaw || "zh" in textRaw)
      ? normalizeBilingualText(textRaw)
      : normalizeBilingualText(cleanString(textRaw));
    return {
      id: cleanString(raw.id) || createId("summary" + String(index + 1)),
      label: normalizeBilingualText(raw.label),
      text: textBilingual,
      targetRoles: uniqueStringArray(raw.targetRoles),
      isDefault: Boolean(raw.isDefault),
      enabled: raw.enabled !== false,
      waived: Boolean(raw.waived)
    };
  }

  function normalizeBullet(item, index, prefix) {
    const raw = item && typeof item === "object" ? item : {};
    const legacyText = typeof item === "string" ? cleanString(item) : cleanString(raw.text);
    const enText = cleanString(raw.en) || legacyText;
    const zhText = cleanString(raw.zh);
    return {
      id: cleanString(raw.id) || createId(prefix + "_bullet_" + String(index + 1)),
      text: enText,
      en: enText,
      zh: zhText,
      enabled: raw.enabled !== false,
      waived: Boolean(raw.waived),
      category: cleanString(raw.category),
      metrics: uniqueStringArray(raw.metrics),
      tags: uniqueStringArray(raw.tags),
      priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 3,
      selectedByDefault: raw.selectedByDefault !== false,
      tailoredVersions: ensureArray(raw.tailoredVersions)
    };
  }

  function normalizeExperience(item, index) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      id: cleanString(raw.id) || createId("exp" + String(index + 1)),
      company: normalizeBilingualText(raw.company),
      title: normalizeBilingualText(raw.title),
      employmentType: cleanString(raw.employmentType),
      location: normalizeBilingualText(raw.location),
      startDate: cleanString(raw.startDate),
      endDate: cleanString(raw.endDate),
      isCurrent: Boolean(raw.isCurrent),
      enabled: raw.enabled !== false,
      waived: Boolean(raw.waived),
      industry: cleanString(raw.industry),
      summary: normalizeBilingualText(raw.summary),
      skills: uniqueStringArray(raw.skills),
      keywords: uniqueStringArray(raw.keywords),
      bullets: ensureArray(raw.bullets).map(function mapBullet(bullet, bulletIndex) {
        return normalizeBullet(bullet, bulletIndex, "exp");
      })
    };
  }

  function normalizeProject(item, index) {
    const raw = item && typeof item === "object" ? item : {};
    const links = raw.links && typeof raw.links === "object" ? raw.links : {};
    return {
      id: cleanString(raw.id) || createId("proj" + String(index + 1)),
      name: normalizeBilingualText(raw.name),
      role: normalizeBilingualText(raw.role),
      organization: normalizeBilingualText(raw.organization),
      location: normalizeBilingualText(raw.location),
      startDate: cleanString(raw.startDate),
      endDate: cleanString(raw.endDate),
      isOngoing: Boolean(raw.isOngoing),
      enabled: raw.enabled !== false,
      waived: Boolean(raw.waived),
      description: normalizeBilingualText(raw.description),
      skills: uniqueStringArray(raw.skills),
      keywords: uniqueStringArray(raw.keywords),
      links: {
        demo: cleanString(links.demo),
        repo: cleanString(links.repo),
        other: cleanString(links.other)
      },
      bullets: ensureArray(raw.bullets).map(function mapBullet(bullet, bulletIndex) {
        return normalizeBullet(bullet, bulletIndex, "proj");
      })
    };
  }

  function normalizeEducation(item, index) {
    const raw = item && typeof item === "object" ? item : {};
    const fallbackDescription = typeof item === "string" ? cleanString(item) : "";
    const courseworkRaw = raw.coursework !== undefined ? raw.coursework : raw.relevantCoursework;
    const normalizedCoursework = Array.isArray(courseworkRaw)
      ? normalizeBilingualText(uniqueStringArray(courseworkRaw).join(", "))
      : normalizeBilingualText(courseworkRaw);
    const majorRaw = raw.major || raw.field || raw.fieldOfStudy || raw.majorName;

    return {
      id: cleanString(raw.id) || createId("edu" + String(index + 1)),
      school: normalizeBilingualText(raw.school),
      degree: normalizeBilingualText(raw.degree),
      major: normalizeBilingualText(majorRaw),
      location: normalizeBilingualText(raw.location),
      startDate: cleanString(raw.startDate),
      endDate: cleanString(raw.endDate),
      gpa: cleanString(raw.gpa),
      enabled: raw.enabled !== false,
      waived: Boolean(raw.waived),
      coursework: normalizedCoursework,
      description: normalizeBilingualText(raw.description || raw.desc || fallbackDescription),
      honors: uniqueStringArray(raw.honors)
    };
  }

  function hasMeaningfulEducationEntry(item) {
    const safe = item && typeof item === "object" ? item : {};
    return Boolean(
      extractEnglish(safe.school) ||
      extractEnglish(safe.degree) ||
      extractEnglish(safe.major) ||
      extractEnglish(safe.location) ||
      cleanString(safe.startDate) ||
      cleanString(safe.endDate) ||
      cleanString(safe.gpa) ||
      extractEnglish(safe.coursework) ||
      extractEnglish(safe.description) ||
      uniqueStringArray(safe.honors).length
    );
  }

  function normalizeEducationCollection(value) {
    if (Array.isArray(value)) {
      return value
        .map(normalizeEducation)
        .filter(hasMeaningfulEducationEntry);
    }

    if (value && typeof value === "object") {
      return normalizeEducationCollection([value]);
    }

    const text = cleanString(value);
    if (!text || text === "[]" || text === "{}") {
      return [];
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) {
        return normalizeEducationCollection(parsed);
      }
    } catch {
      // Keep legacy plain-text education notes as one description entry.
    }

    return normalizeEducationCollection([{ description: text }]);
  }

  function normalizeCertification(item, index) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      id: cleanString(raw.id) || createId("cert" + String(index + 1)),
      name: cleanString(raw.name),
      issuer: cleanString(raw.issuer),
      date: cleanString(raw.date),
      credentialUrl: cleanString(raw.credentialUrl)
    };
  }

  function normalizeAward(item, index) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      id: cleanString(raw.id) || createId("award" + String(index + 1)),
      title: cleanString(raw.title),
      issuer: cleanString(raw.issuer),
      date: cleanString(raw.date),
      description: cleanString(raw.description)
    };
  }

  function normalizeLanguageSpoken(item) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      language: cleanString(raw.language),
      proficiency: cleanString(raw.proficiency)
    };
  }

  function normalizePublication(item, index) {
    const raw = item && typeof item === "object" ? item : {};
    return {
      id: cleanString(raw.id) || createId("pub" + String(index + 1)),
      title: cleanString(raw.title),
      publisher: cleanString(raw.publisher),
      date: cleanString(raw.date),
      url: cleanString(raw.url)
    };
  }

  function normalizeMasterResume(input) {
    const raw = input && typeof input === "object" ? input : {};
    const defaults = createDefaultMasterResume();
    const rawSkills = raw.skills && typeof raw.skills === "object" ? raw.skills : {};

    return {
      lastUpdated: cleanString(raw.lastUpdated),
      summaries: ensureArray(raw.summaries).map(normalizeSummary),
      experiences: ensureArray(raw.experiences).map(normalizeExperience),
      projects: ensureArray(raw.projects).map(normalizeProject),
      education: normalizeEducationCollection(raw.education),
      skills: {
        languages: uniqueStringArray(rawSkills.languages),
        frameworks: uniqueStringArray(rawSkills.frameworks),
        libraries: uniqueStringArray(rawSkills.libraries),
        tools: uniqueStringArray(rawSkills.tools),
        cloud: uniqueStringArray(rawSkills.cloud),
        databases: uniqueStringArray(rawSkills.databases),
        dataMl: uniqueStringArray(rawSkills.dataMl),
        other: uniqueStringArray(rawSkills.other)
      },
      certifications: ensureArray(raw.certifications).map(normalizeCertification),
      awards: ensureArray(raw.awards).map(normalizeAward),
      languagesSpoken: ensureArray(raw.languagesSpoken).map(normalizeLanguageSpoken),
      publications: ensureArray(raw.publications).map(normalizePublication)
    };
  }

  function normalizeProfile(input) {
    const raw = input && typeof input === "object" ? input : {};
    const defaults = createDefaultProfile();
    const fullNameRaw = cleanString(raw.fullName || raw.name);
    const split = splitName(fullNameRaw);
    const firstName = cleanString(raw.firstName) || split.firstName;
    const middleName = cleanString(raw.middleName) || split.middleName;
    const lastName = cleanString(raw.lastName) || split.lastName;
    const fullName = fullNameRaw || [firstName, middleName, lastName].filter(Boolean).join(" ");
    const name = normalizeBilingualName(raw, firstName, middleName, lastName, fullName);

    return {
      id: cleanString(raw.id),
      name: name,
      fullName: name.en.displayName || fullName,
      firstName: name.en.firstName || firstName,
      middleName: name.en.middleName || middleName,
      lastName: name.en.lastName || lastName,
      nameZh: name.zh.displayName || cleanString(raw.nameZh),
      resumeLanguage: cleanString(raw.resumeLanguage) || "auto",
      email: cleanString(raw.email),
      phone: cleanString(raw.phone || raw.preferredContactNumber),
      location: normalizeBilingualText(raw.location),
      linkedin: cleanString(raw.linkedin),
      github: cleanString(raw.github),
      portfolio: cleanString(raw.portfolio),
      website: cleanString(raw.website),
      workAuthorization: cleanString(raw.workAuthorization || raw.rightToWork),
      requiresSponsorship: raw.requiresSponsorship !== undefined ? cleanBoolean(raw.requiresSponsorship) : defaults.requiresSponsorship,
      preferredRoles: uniqueStringArray(raw.preferredRoles),
      preferredLocations: uniqueStringArray(raw.preferredLocations),
      remotePreference: cleanString(raw.remotePreference),
      salaryExpectation: cleanString(raw.salaryExpectation),
      yearsOfExperience: Number.isFinite(Number(raw.yearsOfExperience)) ? Number(raw.yearsOfExperience) : 0,
      headline: cleanString(raw.headline),
      relocationPreference: cleanString(raw.relocationPreference)
    };
  }

  function normalizeAutofillAnswer(input, index) {
    const raw = input && typeof input === "object" ? input : {};
    return {
      id: cleanString(raw.id) || createId("answer" + String(index + 1)),
      key: cleanString(raw.key) || createId("key" + String(index + 1)),
      label: cleanString(raw.label),
      questionPatterns: uniqueStringArray(raw.questionPatterns),
      answer: cleanString(raw.answer || raw.value),
      source: cleanString(raw.source) || "manual",
      confidence: cleanString(raw.confidence) || "medium",
      askEveryTime: Boolean(raw.askEveryTime),
      updatedAt: toIsoOrNow(raw.updatedAt)
    };
  }

  function normalizeGeneratedResume(input, index) {
    const raw = input && typeof input === "object" ? input : {};
    const exportedFiles = raw.exportedFiles && typeof raw.exportedFiles === "object" ? raw.exportedFiles : {};
    const resumeDraftId = cleanString(raw.resumeDraftId || raw.resumeId || raw.id) || createId("resume" + String(index + 1));
    const createdAt = toIsoOrNow(raw.createdAt);
    const updatedAt = toIsoOrNow(raw.updatedAt || createdAt);
    const storageRef = cleanString(raw.storageRef || raw.storageKey || exportedFiles.pdf || exportedFiles.html || exportedFiles.json || raw.pdfPath || raw.htmlPath || raw.jsonPath);
    const fileName = cleanString(raw.fileName);
    const mimeType = cleanString(raw.mimeType);
    return {
      id: resumeDraftId,
      resumeDraftId: resumeDraftId,
      jobId: cleanString(raw.jobId),
      company: cleanString(raw.company),
      role: cleanString(raw.role),
      jobUrl: cleanString(raw.jobUrl),
      fileName: fileName,
      mimeType: mimeType,
      storageRef: storageRef,
      createdAt: createdAt,
      updatedAt: updatedAt,
      basedOnSummaryId: cleanString(raw.basedOnSummaryId),
      selectedExperienceIds: uniqueStringArray(raw.selectedExperienceIds),
      selectedProjectIds: uniqueStringArray(raw.selectedProjectIds),
      selectedBulletIds: uniqueStringArray(raw.selectedBulletIds),
      tailoredSummary: cleanString(raw.tailoredSummary),
      tailoredExperienceBullets: raw.tailoredExperienceBullets && typeof raw.tailoredExperienceBullets === "object" ? raw.tailoredExperienceBullets : {},
      tailoredProjectBullets: raw.tailoredProjectBullets && typeof raw.tailoredProjectBullets === "object" ? raw.tailoredProjectBullets : {},
      exportedFiles: {
        json: cleanString(exportedFiles.json || raw.jsonPath),
        html: cleanString(exportedFiles.html || raw.htmlPath),
        pdf: cleanString(exportedFiles.pdf || raw.pdfPath)
      }
    };
  }

  function normalizeApplication(input, index) {
    const raw = input && typeof input === "object" ? input : {};
    const notes = ensureArray(raw.notes).map(function normalizeNote(item) {
      const safe = item && typeof item === "object" ? item : {};
      const contentMarkdown = cleanString(safe.contentMarkdown || safe.content);
      const nextAction = cleanString(safe.nextAction);
      return {
        id: cleanString(safe.id) || createId("note"),
        date: cleanString(safe.date) || new Date().toISOString().slice(0, 10),
        title: cleanString(safe.title) || "Untitled Note",
        contentMarkdown: contentMarkdown || (nextAction ? "## Next Action\n" + nextAction : ""),
        createdAt: cleanString(safe.createdAt) || new Date().toISOString(),
        updatedAt: cleanString(safe.updatedAt) || new Date().toISOString()
      };
    });
    return {
      id: cleanString(raw.id || raw.applicationId) || createId("app" + String(index + 1)),
      applicationId: cleanString(raw.applicationId || raw.id),
      company: cleanString(raw.company),
      role: cleanString(raw.role || raw.jobTitle),
      jobTitle: cleanString(raw.jobTitle || raw.role),
      status: cleanString(raw.status) || "saved",
      jobUrl: cleanString(raw.jobUrl),
      appliedAt: cleanString(raw.appliedAt || raw.createdAt),
      resumeId: cleanString(raw.resumeId || raw.resumeVersion || raw.resumeVersionId),
      resumeDraftId: cleanString(raw.resumeDraftId),
      resumeDraft: raw.resumeDraft && typeof raw.resumeDraft === "object" ? raw.resumeDraft : null,
      notes: notes
    };
  }

  function normalizeRequiredFieldWaivers(input) {
    const safe = input && typeof input === "object" ? input : {};
    const output = {};
    Object.keys(safe).forEach(function eachKey(key) {
      const normalizedKey = cleanString(key).toLowerCase();
      if (!normalizedKey) {
        return;
      }
      output[normalizedKey] = cleanBoolean(safe[key]);
    });
    return output;
  }

  function normalizeSettings(input) {
    const raw = input && typeof input === "object" ? input : {};
    return {
      defaultModel: cleanString(raw.defaultModel),
      defaultResumeStyle: cleanString(raw.defaultResumeStyle),
      autofillMode: cleanString(raw.autofillMode) || "suggest",
      simpleMode: Boolean(raw.simpleMode),
      requiredFieldWaivers: normalizeRequiredFieldWaivers(raw.requiredFieldWaivers),
      profileResumeDataResetVersion: cleanString(raw.profileResumeDataResetVersion)
    };
  }

  function normalizeAppData(input) {
    const raw = input && typeof input === "object" ? input : {};
    const defaults = createDefaultAppData();
    const dual = normalizeDualResumes(raw);
    return {
      activeResumeLanguage: dual.activeResumeLanguage,
      resumes: dual.resumes,
      profile: normalizeProfile(raw.profile || defaults.profile),
      masterResume: normalizeMasterResume(raw.masterResume || defaults.masterResume),
      autofillAnswers: ensureArray(raw.autofillAnswers).map(normalizeAutofillAnswer),
      generatedResumes: ensureArray(raw.generatedResumes).map(normalizeGeneratedResume),
      applications: ensureArray(raw.applications).map(normalizeApplication),
      settings: normalizeSettings(raw.settings || defaults.settings)
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

  async function getAppData() {
    const payload = await getLocal([APP_DATA_KEY]);
    const normalized = normalizeAppData(payload[APP_DATA_KEY]);
    if (!payload[APP_DATA_KEY] || cleanString(normalized.settings && normalized.settings.profileResumeDataResetVersion) !== PROFILE_RESUME_RESET_VERSION) {
      normalized.settings = {
        ...normalized.settings,
        profileResumeDataResetVersion: PROFILE_RESUME_RESET_VERSION
      };
      await setLocal({ [APP_DATA_KEY]: normalized });
    }
    return normalized;
  }

  async function saveAppData(input) {
    const normalized = normalizeAppData(input);
    await setLocal({ [APP_DATA_KEY]: normalized });
    return normalized;
  }

  async function updateAppData(mutator) {
    const current = await getAppData();
    const nextRaw = typeof mutator === "function" ? mutator(current) : current;
    return await saveAppData(nextRaw);
  }

  async function saveProfile(profile) {
    const normalizedProfile = normalizeProfile(profile);
    return await updateAppData(function mergeProfile(current) {
      return {
        ...current,
        profile: {
          ...current.profile,
          ...normalizedProfile
        }
      };
    });
  }

  async function saveMasterResume(masterResume) {
    const normalized = normalizeMasterResume(masterResume);
    normalized.lastUpdated = new Date().toISOString();

    return await updateAppData(function mergeMaster(current) {
      return {
        ...current,
        masterResume: normalized
      };
    });
  }

  async function resetProfileResumeData() {
    return await updateAppData(function reset(current) {
      return {
        ...current,
        activeResumeLanguage: "en",
        resumes: normalizeDualResumes({}).resumes,
        profile: createDefaultProfile(),
        masterResume: createDefaultMasterResume(),
        settings: {
          ...(current.settings && typeof current.settings === "object" ? current.settings : {}),
          requiredFieldWaivers: {},
          profileResumeDataResetVersion: PROFILE_RESUME_RESET_VERSION
        }
      };
    });
  }

  async function upsertAutofillAnswer(answerInput) {
    const answer = normalizeAutofillAnswer(answerInput, 0);

    return await updateAppData(function mergeAnswer(current) {
      const list = ensureArray(current.autofillAnswers).slice();
      const index = list.findIndex(function match(item) {
        return cleanString(item.id) === answer.id || (cleanString(item.key) && cleanString(item.key) === answer.key);
      });

      if (index >= 0) {
        list[index] = { ...list[index], ...answer, updatedAt: new Date().toISOString() };
      } else {
        list.push({ ...answer, updatedAt: new Date().toISOString() });
      }

      return {
        ...current,
        autofillAnswers: list
      };
    });
  }

  async function removeAutofillAnswer(answerIdOrKey) {
    const token = cleanString(answerIdOrKey);
    return await updateAppData(function removeAnswer(current) {
      return {
        ...current,
        autofillAnswers: ensureArray(current.autofillAnswers).filter(function keep(item) {
          return cleanString(item.id) !== token && cleanString(item.key) !== token;
        })
      };
    });
  }

  async function appendGeneratedResume(recordInput) {
    const record = normalizeGeneratedResume(recordInput, 0);

    return await updateAppData(function appendRecord(current) {
      return {
        ...current,
        generatedResumes: ensureArray(current.generatedResumes).concat(record)
      };
    });
  }

  async function upsertApplication(recordInput) {
    const record = normalizeApplication(recordInput, 0);

    return await updateAppData(function upsertRecord(current) {
      const list = ensureArray(current.applications).slice();
      const index = list.findIndex(function match(item) {
        return cleanString(item.id) === record.id || (
          cleanString(item.company).toLowerCase() === cleanString(record.company).toLowerCase() &&
          cleanString(item.role).toLowerCase() === cleanString(record.role).toLowerCase() &&
          cleanString(item.jobUrl) === cleanString(record.jobUrl)
        );
      });

      if (index >= 0) {
        list[index] = { ...list[index], ...record };
      } else {
        list.push(record);
      }

      return {
        ...current,
        applications: list
      };
    });
  }

  async function setSettings(patchInput) {
    const patch = normalizeSettings(patchInput);
    return await updateAppData(function mergeSettings(current) {
      return {
        ...current,
        settings: {
          ...current.settings,
          ...patch
        }
      };
    });
  }

  function hasCandidateSignal(candidate) {
    return Boolean(
      cleanString(candidate && candidate.header && candidate.header.name) ||
      cleanString(candidate && candidate.header && candidate.header.email) ||
      cleanString(candidate && candidate.summary) ||
      ensureArray(candidate && candidate.experience).length ||
      ensureArray(candidate && candidate.projects).length ||
      ensureArray(candidate && candidate.skills).length
    );
  }

  function profileToLinks(profile) {
    const links = [];
    if (cleanString(profile.linkedin)) {
      links.push({ label: "LinkedIn", url: cleanString(profile.linkedin) });
    }
    if (cleanString(profile.github)) {
      links.push({ label: "GitHub", url: cleanString(profile.github) });
    }
    if (cleanString(profile.portfolio || profile.website)) {
      links.push({ label: "Portfolio", url: cleanString(profile.portfolio || profile.website) });
    }
    return links;
  }

  function normalizeExperienceForCandidate(experiences) {
    return ensureArray(experiences).map(function mapExp(item) {
      const safe = item && typeof item === "object" ? item : {};
      const bullets = ensureArray(safe.bullets)
        .map(function mapBullet(bullet) {
          if (!bullet) return "";
          if (typeof bullet === "object") {
            return cleanString(bullet.en || bullet.text) || cleanString(bullet.zh);
          }
          return cleanString(bullet);
        })
        .filter(Boolean);

      return {
        company: extractEnglish(safe.company),
        title: extractEnglish(safe.title),
        location: extractEnglish(safe.location),
        startDate: cleanString(safe.startDate),
        endDate: cleanString(safe.endDate),
        bullets: bullets
      };
    }).filter(function keep(item) {
      return item.company || item.title || item.bullets.length;
    });
  }

  function normalizeProjectsForCandidate(projects) {
    return ensureArray(projects).map(function mapProj(item) {
      const safe = item && typeof item === "object" ? item : {};
      const bullets = ensureArray(safe.bullets)
        .map(function mapBullet(bullet) {
          if (!bullet) return "";
          if (typeof bullet === "object") {
            return cleanString(bullet.en || bullet.text) || cleanString(bullet.zh);
          }
          return cleanString(bullet);
        })
        .filter(Boolean);

      return {
        name: extractEnglish(safe.name),
        role: extractEnglish(safe.role),
        startDate: cleanString(safe.startDate),
        endDate: cleanString(safe.endDate),
        bullets: bullets
      };
    }).filter(function keep(item) {
      return item.name || item.role || item.bullets.length;
    });
  }

  function normalizeEducationForCandidate(education) {
    return ensureArray(education).map(function mapEdu(item) {
      const safe = item && typeof item === "object" ? item : {};
      const majorRaw = safe.major || safe.field || safe.fieldOfStudy || safe.majorName;
      const major = extractEnglish(majorRaw);
      const coursework = Array.isArray(safe.coursework)
        ? uniqueStringArray(safe.coursework).join(", ")
        : extractEnglish(safe.coursework || safe.relevantCoursework);
      return {
        school: extractEnglish(safe.school),
        degree: extractEnglish(safe.degree),
        major: major,
        field: cleanString(safe.field || safe.fieldOfStudy || major),
        location: extractEnglish(safe.location),
        startDate: cleanString(safe.startDate),
        endDate: cleanString(safe.endDate),
        coursework: coursework,
        description: extractEnglish(safe.description || safe.desc)
      };
    }).filter(function keep(item) {
      return item.school || item.degree || item.major || item.description;
    });
  }

  function masterResumeToSkills(masterResume) {
    const skills = masterResume && masterResume.skills && typeof masterResume.skills === "object" ? masterResume.skills : {};
    return uniqueStringArray([]
      .concat(skills.languages || [])
      .concat(skills.frameworks || [])
      .concat(skills.libraries || [])
      .concat(skills.tools || [])
      .concat(skills.cloud || [])
      .concat(skills.databases || [])
      .concat(skills.dataMl || [])
      .concat(skills.other || [])
    );
  }

  function pickDefaultSummary(masterResume) {
    const summaries = ensureArray(masterResume && masterResume.summaries);
    const preferred = summaries.find(function findDefault(item) {
      return item && typeof item === "object" && item.isDefault && extractEnglish(item.text);
    });
    if (preferred) {
      return extractEnglish(preferred.text);
    }

    for (let index = 0; index < summaries.length; index += 1) {
      const item = summaries[index] && typeof summaries[index] === "object" ? summaries[index] : {};
      const text = extractEnglish(item.text);
      if (text) {
        return text;
      }
    }

    return "";
  }

  function toCandidateResume(profileInput, masterResumeInput) {
    const profile = normalizeProfile(profileInput);
    const masterResume = normalizeMasterResume(masterResumeInput);
    const displayName = cleanString(profile.fullName) || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");

    const candidate = {
      header: {
        name: displayName,
        title: cleanString(profile.headline),
        email: cleanString(profile.email),
        phone: cleanString(profile.phone),
        location: extractEnglish(profile.location),
        links: profileToLinks(profile)
      },
      summary: pickDefaultSummary(masterResume),
      experience: normalizeExperienceForCandidate(masterResume.experiences),
      education: normalizeEducationForCandidate(masterResume.education),
      projects: normalizeProjectsForCandidate(masterResume.projects),
      skills: masterResumeToSkills(masterResume),
      profile: {
        workAuthorization: cleanString(profile.workAuthorization),
        requiresSponsorship: Boolean(profile.requiresSponsorship),
        preferredRoles: uniqueStringArray(profile.preferredRoles),
        preferredLocations: uniqueStringArray(profile.preferredLocations),
        salaryExpectation: cleanString(profile.salaryExpectation),
        relocationPreference: cleanString(profile.relocationPreference)
      }
    };

    return candidate;
  }

  async function getCandidateResumeFromAppData() {
    const appData = await getAppData();
    const candidateResume = toCandidateResume(appData.profile, appData.masterResume);
    return {
      candidateResume: candidateResume,
      source: "chrome.storage.local:" + APP_DATA_KEY
    };
  }

  const api = Object.freeze({
    APP_DATA_KEY: APP_DATA_KEY,
    PROFILE_RESUME_RESET_VERSION: PROFILE_RESUME_RESET_VERSION,
    createDefaultAppData: createDefaultAppData,
    normalizeAppData: normalizeAppData,
    normalizeProfile: normalizeProfile,
    normalizeMasterResume: normalizeMasterResume,
    normalizeAutofillAnswer: normalizeAutofillAnswer,
    normalizeApplication: normalizeApplication,
    normalizeBilingualText: normalizeBilingualText,
    extractEnglish: extractEnglish,
    getAppData: getAppData,
    saveAppData: saveAppData,
    saveProfile: saveProfile,
    saveMasterResume: saveMasterResume,
    resetProfileResumeData: resetProfileResumeData,
    upsertAutofillAnswer: upsertAutofillAnswer,
    removeAutofillAnswer: removeAutofillAnswer,
    appendGeneratedResume: appendGeneratedResume,
    upsertApplication: upsertApplication,
    setSettings: setSettings,
    toCandidateResume: toCandidateResume,
    hasCandidateSignal: hasCandidateSignal,
    getCandidateResumeFromAppData: getCandidateResumeFromAppData,
    createId: createId
  });

  global.Stage10AppDataStore = api;
})(globalThis);
