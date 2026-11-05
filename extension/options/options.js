(function initOptionsConsole() {
  "use strict";

  const shared = globalThis.Stage3Shared;
  const storage = globalThis.Stage3Storage;
  const api = globalThis.Stage5Api;
  const appDataStore = globalThis.Stage10AppDataStore;
  const dataBoundary = globalThis.Stage11DataBoundary;
  const resumeRegistryStore = globalThis.Stage6ResumeRegistryStorage;
  const tracker = globalThis.AutoApplyTracker;

  const topTabsEl = document.getElementById("top-tabs");
  const statusLeftEl = document.getElementById("status-left");
  const trackerStatusEl = document.getElementById("tracker-status");
  const openTrackerDashboardBtn = document.getElementById("open-tracker-dashboard-btn");
  const trackerUrlEl = document.getElementById("tracker-url");
  const trackerTokenEl = document.getElementById("tracker-token");
  const trackerSaveBtn = document.getElementById("tracker-save-btn");
  const trackerTestBtn = document.getElementById("tracker-test-btn");
  const trackerImportBtn = document.getElementById("tracker-import-btn");

  const dashboardStatPendingEl = document.getElementById("dashboard-stat-pending");
  const dashboardStatOfferEl = document.getElementById("dashboard-stat-offer");
  const dashboardStatRejectedEl = document.getElementById("dashboard-stat-rejected");

  const uploadResumeProfileTopBtn = document.getElementById("upload-resume-profile-top-btn");
  const saveProfileResumeTopBtn = document.getElementById("save-profile-resume-top-btn");
  const generateManualResumeBtn = document.getElementById("generate-manual-resume-btn");
  const translateManualResumeBtn = document.getElementById("translate-manual-resume-btn");

  const summaryListEl = document.getElementById("summary-list");
  const summaryEmptyStateEl = document.getElementById("summary-empty-state");
  const addSummaryBtn = document.getElementById("add-summary-btn");
  const experienceListEl = document.getElementById("experience-list");
  const experienceEmptyStateEl = document.getElementById("experience-empty-state");
  const addExperienceBtn = document.getElementById("add-experience-btn");
  const projectListEl = document.getElementById("project-list");
  const projectEmptyStateEl = document.getElementById("project-empty-state");
  const addProjectBtn = document.getElementById("add-project-btn");
  const educationListEl = document.getElementById("education-list");
  const educationEmptyStateEl = document.getElementById("education-empty-state");
  const addEducationBtn = document.getElementById("add-education-btn");
  const resumeSectionsListEl = document.getElementById("resume-sections-list");
  const resumeSectionsEmptyStateEl = document.getElementById("resume-sections-empty-state");
  const addSectionBtn = document.getElementById("add-section-btn");
  const profileLinksListEl = document.getElementById("profile-links-list");
  const addContactLinkBtn = document.getElementById("add-contact-link-btn");
  const autofillKeyEl = document.getElementById("autofill-key");
  const autofillLabelEl = document.getElementById("autofill-label");
  const autofillPatternsEl = document.getElementById("autofill-patterns");
  const autofillAnswerEl = document.getElementById("autofill-answer");
  const autofillConfidenceEl = document.getElementById("autofill-confidence");
  const autofillAskEveryTimeEl = document.getElementById("autofill-askEveryTime");
  const autofillSaveBtn = document.getElementById("autofill-save-btn");
  const autofillRunBtn = document.getElementById("autofill-run-btn");
  const autofillAnswerListEl = document.getElementById("autofill-answer-list");

  const trackerNotesJobEl = document.getElementById("tracker-notes-job");
  const trackerNotesEditorEl = document.getElementById("tracker-notes-editor");
  const trackerNotesSaveBtn = document.getElementById("tracker-notes-save-btn");
  const trackerNotesRefreshBtn = document.getElementById("tracker-notes-refresh-btn");
  const trackerDashboardRefreshBtn = document.getElementById("tracker-dashboard-refresh-btn");
  const notesAiSaveBtn = document.getElementById("notes-ai-save-btn");
  const notesAiMessagesEl = document.getElementById("notes-ai-messages");
  const notesAiInputEl = document.getElementById("notes-ai-input");
  const notesAiSendBtn = document.getElementById("notes-ai-send-btn");
  const notesAiClearBtn = document.getElementById("notes-ai-clear-btn");

  const settingsProviderEl = document.getElementById("settings-provider");
  const settingsModelEl = document.getElementById("settings-model");
  const settingsApiKeyEl = document.getElementById("settings-api-key");
  const settingsBaseUrlEl = document.getElementById("settings-base-url");
  const settingsSaveBtn = document.getElementById("settings-save-btn");
  const settingsTestConnectionBtn = document.getElementById("settings-test-connection-btn");
  const resetProfileResumeBtn = document.getElementById("reset-profile-resume-btn");
  const viewLocalResumesBtn = document.getElementById("view-local-resumes-btn");
  const localResumesPanel = document.getElementById("local-resumes-panel");
  const testAddTextBtn = document.getElementById("test-add-text-btn");
  const testAddLineBtn = document.getElementById("test-add-line-btn");
  const testClearBtn = document.getElementById("test-clear-btn");
  const testViewPdfBtn = document.getElementById("test-view-pdf-btn");
  const testSelectedToolbarEl = document.getElementById("test-selected-toolbar");
  const testCanvasEl = document.getElementById("test-canvas");

  const resumePreviewIframeEl = document.getElementById("resume-preview-iframe");
  const resumePreviewStateEl = document.getElementById("resume-preview-state");
  const resumeOverflowWarningEl = document.getElementById("resume-overflow-warning");
  const uploadResumeModalOverlayEl = document.getElementById("upload-resume-modal-overlay");
  const uploadResumeFileInputEl = document.getElementById("upload-resume-file-input");
  const uploadResumeStatusEl = document.getElementById("upload-resume-status");
  const uploadResumeErrorEl = document.getElementById("upload-resume-error");
  const uploadResumePdfNavEl = document.getElementById("upload-resume-pdf-nav");
  const uploadResumePdfPageInfoEl = document.getElementById("upload-resume-pdf-page-info");
  const uploadResumePdfPrevBtn = document.getElementById("upload-resume-pdf-prev-btn");
  const uploadResumePdfNextBtn = document.getElementById("upload-resume-pdf-next-btn");
  const uploadResumePdfCanvasContainerEl = document.getElementById("upload-resume-pdf-canvas-container");
  const uploadResumePdfPlaceholderEl = document.getElementById("upload-resume-pdf-placeholder");
  const uploadResumeQualityReportEl = document.getElementById("upload-resume-quality-report");
  const uploadResumeQualityLabelEl = document.getElementById("upload-resume-quality-label");
  const uploadResumeQualityReasonsEl = document.getElementById("upload-resume-quality-reasons");
  const uploadResumeTextMetaEl = document.getElementById("upload-resume-text-meta");
  const uploadResumeTextPreviewEl = document.getElementById("upload-resume-text-preview");
  const uploadResumeCopyTextBtn = document.getElementById("upload-resume-copy-text-btn");
  const uploadResumePasteWrapEl = document.getElementById("upload-resume-paste-wrap");
  const uploadResumePasteTextareaEl = document.getElementById("upload-resume-paste-textarea");
  const uploadResumeUsePastedTextBtn = document.getElementById("upload-resume-use-pasted-text-btn");
  const uploadResumeMarkdownMetaEl = document.getElementById("upload-resume-markdown-meta");
  const uploadResumeMarkdownPreviewEl = document.getElementById("upload-resume-markdown-preview");
  const uploadResumeCopyMarkdownBtn = document.getElementById("upload-resume-copy-markdown-btn");
  const uploadResumeLogEl = document.getElementById("upload-resume-log");
  const uploadResumeCancelBtn = document.getElementById("upload-resume-cancel-btn");
  const uploadResumeDoneBtn = document.getElementById("upload-resume-done-btn");
  const uploadResumeCloseBtn = document.getElementById("upload-resume-close-btn");

  const VALID_TOP_LEVEL_TABS = new Set(["dashboard", "profile-resume", "test", "autofill", "notes", "settings"]);
  const LOCAL_RESUME_STORAGE_KEYS = Object.freeze(["resumeDrafts", "resumes", "localResumes", "generatedResumes"]);
  const COMPILED_RESUME_REGISTRY_KEY = "compiledResumeRegistry";
  const RESUME_AUTOSAVE_INTERVAL_MS = 30000;
  const RESUME_AUTOSAVE_DEBOUNCE_MS = 1000;
  const MAX_UPLOAD_RESUME_IMPORT_ROUNDS = 120;
  const MAX_UPLOAD_RESUME_AI_ATTEMPTS = 3;
  const MAX_SELF_CHECK_REJECTIONS_PER_STEP = 3;
 const PROFILE_RESUME_AI_INITIAL_MESSAGE = "Hi, I can help edit your resume. Tell me what you want to change.";

  const state = {
    activeTab: "dashboard",
    appData: appDataStore && typeof appDataStore.createDefaultAppData === "function"
      ? appDataStore.createDefaultAppData()
      : null,
    canonicalData: {
      profile: {},
      resume: {},
      autofillAnswers: [],
      settings: {}
    },
    currentJob: null,
    settings: {},
    trackerSettings: { url: "http://127.0.0.1:8765", token: "" },
    editingAutofillId: "",
    editorMode: "ai",
    aiChat: {
      messages: [{ role: "assistant", text: PROFILE_RESUME_AI_INITIAL_MESSAGE }],
      isThinking: false,
      contextKey: "profile"
    },
    resumeAutosave: {
      dirty: false,
      revision: 0,
      saving: false,
      cleanupEmptyObjects: false,
      cleanupLanguage: ""
    },
    resumeTranslation: {
      running: false
    },
    trackerSummary: null,
    notesPage: { jobs: [], statuses: [], selectedJobId: "", loadedJobId: "", notes: "", aiMessages: [], isThinking: false, loading: false },
    uploadResume: {
      open: false,
      running: false,
      completed: false,
      cancelled: false,
      step: "",
      error: "",
      log: [],
      markdown: "",
      plainText: "",
      warnings: [],
      confidence: "",
      extractionStats: {
        source: "",
        pageCount: 0,
        plainTextCharacterCount: 0,
        plainTextLineCount: 0,
        markdownCharacterCount: 0,
        characterCount: 0,
        lineCount: 0
      },
      pdfPreviewStatus: "",
      pdfPageCount: 0,
      pdfCurrentPage: 1,
      qualityReport: null,
      awaitingPastedText: false,
      lastSectionId: "",
      lastEntryId: "",
      importedSteps: 0,
      progress: []
    },
    testSandbox: {
      objects: [],
      selectedObjectId: "",
      editingTextId: null,
      draftText: "",
      originalTextBeforeEdit: "",
      drag: null
    }
  };

  let editorLang = "en";
  let testObjectCounter = 0;
  let _testDblClickTrack = { objectId: null, time: 0 };

  const UI_LABELS = {
    en: {
      pageTitle: "Profile",
      pageSubtitle: "Complete your profile and base resume data.",
      langLabel: "Resume Language",
      langEnOption: "English",
      langZhOption: "Chinese",
      sectionBasicProfile: "Contact Info",
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email",
      phone: "Phone",
      location: "Location",
      links: "Links",
      addLink: "+ Add Link",
      sectionResume: "Resume",
      sectionSummary: "Summary",
      sectionEducation: "Education",
      sectionExperiences: "Experiences",
      sectionProjects: "Projects",
      sectionSkills: "Skills",
      skillLanguages: "Languages",
      skillFrameworks: "Frameworks",
      skillTools: "Tools",
      skillOther: "Other",
      previewTitle: "Live Resume Preview",
      displayStatus: "Current Resume: English",
      emptySections: "No sections added yet.",
      addSection: "+ Add Section",
      sectionName: "Section Name",
      addEntry: "+ Add Entry",
      addLine: "+ Add Line",
      moveUp: "Move Up",
      moveDown: "Move Down",
      entryTitle: "Entry",
      lineTitle: "Title",
      lineDate: "Date",
      lineSubtitle: "Subtitle",
      lineBullet: "Bullet Point",
      lineParagraph: "Paragraph",
      bold: "Bold",
      italic: "Italic",
      addTitleLine: "Add Title",
      addDateLine: "Add Date",
      addSubtitleLine: "Add Subtitle",
      addBulletLine: "Add Bullet Point",
      addParagraphLine: "Add Paragraph",
      cardSummaryTitle: "Summary",
      cardSummaryLabel: "Label",
      cardSummaryTextEn: "Summary (English)",
      cardSummaryTextZh: "Summary (Chinese)",
      cardSummaryIsDefault: "Is default",
      cardDelete: "Delete",
      addSummary: "+ Add Summary",
      cardExpTitle: "Experience",
      cardExpCompanyEn: "Company (EN)",
      cardExpCompanyZh: "Company (ZH)",
      cardExpTitleEn: "Title (EN)",
      cardExpTitleZh: "Title (ZH)",
      cardExpLocationEn: "Location (EN)",
      cardExpLocationZh: "Location (ZH)",
      cardExpStartDate: "Start Date",
      cardExpEndDate: "End Date",
      cardExpBulletsEn: "Bullets EN (one per line)",
      cardExpBulletsZh: "Bullets ZH (one per line)",
      addExperience: "+ Add Experience",
      cardProjTitle: "Project",
      cardProjNameEn: "Name (EN)",
      cardProjNameZh: "Name (ZH)",
      cardProjRoleEn: "Role (EN)",
      cardProjRoleZh: "Role (ZH)",
      cardProjOrganizationEn: "Organization (EN)",
      cardProjOrganizationZh: "Organization (ZH)",
      cardProjLocationEn: "Location (EN)",
      cardProjLocationZh: "Location (ZH)",
      addProject: "+ Add Project",
      cardEduTitle: "Education",
      cardEduSchoolEn: "School (EN)",
      cardEduSchoolZh: "School (ZH)",
      cardEduDegreeEn: "Degree (EN)",
      cardEduDegreeZh: "Degree (ZH)",
      cardEduMajorEn: "Major (EN)",
      cardEduMajorZh: "Major (ZH)",
      cardEduLocationEn: "Location (EN)",
      cardEduLocationZh: "Location (ZH)",
      cardEduGpa: "GPA",
      cardEduCoursework: "Relevant Coursework",
      cardEduDescription: "Description",
      addEducation: "+ Add Education",
      emptySummary0: "No summary added yet.",
      emptySummary1: "Add a short professional summary for resume generation.",
      emptyEducation0: "No education added yet.",
      emptyEducation1: "Add your school, degree, and academic background for resume generation.",
      emptyExperience0: "No experience added yet.",
      emptyExperience1: "Add work, research, teaching, or internship experience.",
      emptyProject0: "No project added yet.",
      emptyProject1: "Add academic, engineering, or data projects.",
      overflowWarning: "Content exceeds one A4 page. Consider shortening bullets, waiving sections, or using a compact template."
    }
  };
  UI_LABELS.en.langEnOption = "English Resume";
  UI_LABELS.en.langZhOption = "Chinese Resume";
  UI_LABELS.zh = {
    ...UI_LABELS.en,
    displayStatus: "Current Resume: Chinese"
  };

  function cleanString(value) {
    if (typeof value !== "string") {
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      return "";
    }
    return value.trim();
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeHtml(value) {
    return cleanString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function uniqueStringArray(input) {
    const values = Array.isArray(input) ? input : [];
    const seen = new Set();
    const output = [];

    for (let index = 0; index < values.length; index += 1) {
      const text = cleanString(values[index]);
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

  function buildDisplayName(firstNameInput, middleNameInput, lastNameInput, lang) {
    const firstName = cleanString(firstNameInput);
    const middleName = cleanString(middleNameInput);
    const lastName = cleanString(lastNameInput);
    if (lang === "zh") {
      return [lastName, middleName, firstName].filter(Boolean).join("");
    }
    return [firstName, middleName, lastName].filter(Boolean).join(" ");
  }

  function normalizeResumeField(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      value: cleanString(raw.value !== undefined ? raw.value : value),
      waived: Boolean(raw.waived)
    };
  }

  function resumeFieldEditorValue(field) {
    const safe = normalizeResumeField(field);
    return safe.waived ? "" : safe.value;
  }

  function normalizeResumeName(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      firstName: cleanString(raw.firstName),
      lastName: cleanString(raw.lastName),
      waived: Boolean(raw.waived)
    };
  }

  function normalizeContactLink(value, index) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      id: cleanString(raw.id) || createId("link"),
      text: cleanString(raw.text !== undefined ? raw.text : value),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1
    };
  }

  function normalizeContactInfo(value, fallbackHeader) {
    const raw = value && typeof value === "object" ? value : {};
    const header = fallbackHeader && typeof fallbackHeader === "object" ? fallbackHeader : {};
    const name = normalizeResumeName(header.name);
    const links = Array.isArray(raw.links) ? raw.links.map(normalizeContactLink) : [];
    ["linkedin", "github", "portfolio"].forEach(function addLegacyLink(key) {
      const text = resumeFieldEditorValue(header[key]);
      if (text && !links.some(function(existing) { return cleanString(existing.text) === text; })) {
        links.push(normalizeContactLink({ text: text }, links.length));
      }
    });
    return {
      firstName: cleanString(raw.firstName) || (name.waived ? "" : name.firstName),
      lastName: cleanString(raw.lastName) || (name.waived ? "" : name.lastName),
      email: cleanString(raw.email) || resumeFieldEditorValue(header.email),
      phone: cleanString(raw.phone) || resumeFieldEditorValue(header.phone),
      location: cleanString(raw.location) || resumeFieldEditorValue(header.location),
      links: links
        .map(normalizeContactLink)
        .sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); })
    };
  }

  function createEmptyHeader() {
    const contact = normalizeContactInfo({}, {});
    return {
      contact: contact,
      name: normalizeResumeName({ firstName: contact.firstName, lastName: contact.lastName }),
      email: normalizeResumeField(""),
      phone: normalizeResumeField(""),
      location: normalizeResumeField(""),
      linkedin: normalizeResumeField(""),
      github: normalizeResumeField(""),
      portfolio: normalizeResumeField("")
    };
  }

  function createEmptyResume(lang) {
    const safeLang = lang === "zh" ? "zh" : "en";
    return {
      id: "resume_" + safeLang + "_default",
      language: safeLang,
      header: createEmptyHeader(),
      sections: []
    };
  }

  function localizedPlain(value, lang, options) {
    const copyPlain = Boolean(options && options.copyPlain);
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") {
      return lang === "en" || copyPlain ? cleanString(value) : "";
    }
    if (typeof value === "object") {
      const selected = lang === "zh" ? cleanString(value.zh) : cleanString(value.en);
      if (selected) return selected;
      return "";
    }
    return "";
  }

  function defaultLineFormatting(type) {
    if (type === "title") {
      return { bold: true, italic: false };
    }
    if (type === "subtitle") {
      return { bold: false, italic: true };
    }
    return { bold: false, italic: false };
  }

  function normalizeResumeLine(line, index) {
    const raw = line && typeof line === "object" ? line : {};
    const type = ["title", "date", "subtitle", "bullet", "paragraph"].includes(cleanString(raw.type))
      ? cleanString(raw.type)
      : "paragraph";
    const defaults = defaultLineFormatting(type);
    return {
      id: cleanString(raw.id) || createId("line"),
      type: type,
      text: cleanString(raw.text !== undefined ? raw.text : line),
      bold: type === "title" ? true : (typeof raw.bold === "boolean" ? raw.bold : defaults.bold),
      italic: type === "subtitle" ? true : (typeof raw.italic === "boolean" ? raw.italic : defaults.italic),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1
    };
  }

  function createResumeLine(type) {
    return normalizeResumeLine({
      id: createId("line"),
      type: type,
      text: ""
    }, 0);
  }

  function linesFromLegacyBlock(raw) {
    const lines = [];
    function addLine(type, field) {
      const safe = normalizeResumeField(field);
      if (safe.waived || !safe.value) {
        return;
      }
      lines.push(normalizeResumeLine({ type: type, text: safe.value }, lines.length));
    }
    addLine("title", raw.title);
    addLine("date", raw.date);
    addLine("subtitle", raw.subtitle);
    ensureArray(raw.bullets).forEach(function addBullet(item) {
      const bullet = item && typeof item === "object" ? item : {};
      const text = cleanString(bullet.value !== undefined ? bullet.value : item);
      if (!bullet.waived && text) {
        lines.push(normalizeResumeLine({ type: "bullet", text: text }, lines.length));
      }
    });
    addLine("paragraph", raw.description);
    return lines;
  }

  function normalizeResumeBlock(block, index) {
    const raw = block && typeof block === "object" ? block : {};
    const bullets = Array.isArray(raw.bullets) ? raw.bullets : [];
    const rawLines = Array.isArray(raw.lines) && raw.lines.length ? raw.lines : null;
    const lines = rawLines
      ? rawLines.map(normalizeResumeLine)
      : linesFromLegacyBlock(raw);
    return {
      id: cleanString(raw.id) || createId("block"),
      title: normalizeResumeField(raw.title),
      date: normalizeResumeField(raw.date),
      subtitle: normalizeResumeField(raw.subtitle),
      bullets: bullets.map(function mapBullet(item, bulletIndex) {
        const safe = item && typeof item === "object" ? item : {};
        return {
          id: cleanString(safe.id) || createId("bullet"),
          value: cleanString(safe.value !== undefined ? safe.value : item),
          waived: Boolean(safe.waived),
          order: Number.isFinite(Number(safe.order)) ? Number(safe.order) : bulletIndex + 1
        };
      }).filter(function keepBullet(item) {
        return item.value || item.waived;
      }),
      description: normalizeResumeField(raw.description),
      lines: lines.sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); }),
      waived: Boolean(raw.waived),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1
    };
  }

  function normalizeResumeSection(section, index) {
    const raw = section && typeof section === "object" ? section : {};
    const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
    return {
      id: cleanString(raw.id) || createId("section"),
      sectionName: cleanString(raw.sectionName),
      waived: Boolean(raw.waived),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1,
      blocks: blocks.map(normalizeResumeBlock)
    };
  }

  function normalizeResumeObject(resume, lang) {
    const raw = resume && typeof resume === "object" ? resume : {};
    const fallback = createEmptyResume(lang);
    const header = raw.header && typeof raw.header === "object" ? raw.header : {};
    const contact = normalizeContactInfo(header.contact, header);
    return {
      id: cleanString(raw.id) || fallback.id,
      language: lang === "zh" ? "zh" : "en",
      header: {
        contact: contact,
        name: normalizeResumeName({ firstName: contact.firstName, lastName: contact.lastName }),
        email: normalizeResumeField(contact.email),
        phone: normalizeResumeField(contact.phone),
        location: normalizeResumeField(contact.location),
        linkedin: normalizeResumeField(""),
        github: normalizeResumeField(""),
        portfolio: normalizeResumeField("")
      },
      sections: Array.isArray(raw.sections) ? raw.sections.map(normalizeResumeSection) : []
    };
  }

  function formatResumeDateRange(startDate, endDate) {
    const start = cleanString(startDate);
    const end = cleanString(endDate);
    if (!start && !end) return "";
    if (!start) return end;
    if (!end) return start;
    return start + " - " + end;
  }

  function makeResumeBlock(input, order) {
    const raw = input && typeof input === "object" ? input : {};
    return normalizeResumeBlock({
      id: cleanString(raw.id) || createId("block"),
      title: { value: cleanString(raw.title), waived: Boolean(raw.titleWaived) },
      date: { value: cleanString(raw.date), waived: Boolean(raw.dateWaived) },
      subtitle: { value: cleanString(raw.subtitle), waived: Boolean(raw.subtitleWaived) },
      bullets: ensureArray(raw.bullets).map(function mapText(text, index) {
        return { id: createId("bullet"), value: cleanString(text), waived: false, order: index + 1 };
      }),
      description: { value: cleanString(raw.description), waived: Boolean(raw.descriptionWaived) },
      lines: Array.isArray(raw.lines) ? raw.lines : undefined,
      waived: Boolean(raw.waived),
      order: order
    }, order - 1);
  }

  function makeResumeSection(sectionName, blocks, order) {
    return normalizeResumeSection({
      id: createId("section"),
      sectionName: sectionName,
      waived: false,
      order: order,
      blocks: ensureArray(blocks)
    }, order - 1);
  }

  function legacyNameForResume(profile, lang) {
    const safe = profile && typeof profile === "object" ? profile : {};
    const name = safe.name && typeof safe.name === "object" ? safe.name : {};
    const langName = lang === "zh" && name.zh && typeof name.zh === "object"
      ? name.zh
      : lang === "en" && name.en && typeof name.en === "object"
        ? name.en
        : {};
    if (cleanString(langName.firstName) || cleanString(langName.middleName) || cleanString(langName.lastName)) {
      return normalizeResumeName(langName);
    }
    if (lang === "zh") {
      const legacyZh = cleanString(langName.displayName || safe.nameZh || safe.chineseName || safe.zhName);
      return normalizeResumeName({ firstName: legacyZh, waived: Boolean(name.waived) });
    }
    return normalizeResumeName({
      firstName: cleanString(langName.firstName || safe.firstName),
      middleName: cleanString(langName.middleName || safe.middleName),
      lastName: cleanString(langName.lastName || safe.lastName),
      waived: Boolean(name.waived)
    });
  }

  function legacyHeaderForResume(appData, lang) {
    const profile = appData && appData.profile && typeof appData.profile === "object" ? appData.profile : {};
    const legacyLinks = [
      cleanString(profile.linkedin),
      cleanString(profile.github),
      cleanString(profile.portfolio)
    ].filter(Boolean).map(function mapLink(text, index) {
      return normalizeContactLink({ text: text }, index);
    });
    const name = legacyNameForResume(profile, lang);
    const email = cleanString(profile.email);
    const phone = cleanString(profile.phone);
    const location = localizedPlain(profile.location, lang);
    return {
      contact: normalizeContactInfo({
        firstName: name.firstName,
        lastName: name.lastName,
        email: email,
        phone: phone,
        location: location,
        links: legacyLinks
      }, {}),
      name: name,
      email: normalizeResumeField({ value: email, waived: false }),
      phone: normalizeResumeField({ value: phone, waived: false }),
      location: normalizeResumeField({ value: location, waived: Boolean(profile.location && profile.location.waived) }),
      linkedin: normalizeResumeField(""),
      github: normalizeResumeField(""),
      portfolio: normalizeResumeField("")
    };
  }

  function localizedBullets(bullets, lang) {
    return ensureArray(bullets).map(function mapBullet(item) {
      if (item && typeof item === "object") {
        if (item.waived || item.enabled === false) return "";
        return localizedPlain(item, lang);
      }
      return localizedPlain(item, lang);
    }).filter(Boolean);
  }

  function legacySectionsForResume(appData, lang) {
    const master = appData && appData.masterResume && typeof appData.masterResume === "object" ? appData.masterResume : {};
    const sections = [];
    const summaryBlocks = ensureArray(master.summaries).map(function mapSummary(item, index) {
      const safe = item && typeof item === "object" ? item : {};
      const text = localizedPlain(safe.text !== undefined ? safe.text : item, lang);
      if (!text && !safe.waived) return null;
      return makeResumeBlock({
        id: cleanString(safe.id) || "summary_" + String(index + 1),
        titleWaived: true,
        dateWaived: true,
        subtitleWaived: true,
        description: text,
        waived: Boolean(safe.waived || safe.enabled === false)
      }, index + 1);
    }).filter(Boolean);
    if (summaryBlocks.length) {
      sections.push(makeResumeSection(lang === "zh" ? "摘要" : "Summary", summaryBlocks, sections.length + 1));
    }

    const educationBlocks = migrateEducationValue(master.education).map(function mapEducation(item, index) {
      const title = [localizedPlain(item.degree, lang), localizedPlain(item.major, lang)].filter(Boolean).join(" / ");
      const subtitle = [localizedPlain(item.school, lang), localizedPlain(item.location, lang)].filter(Boolean).join(", ");
      const description = [cleanString(item.gpa) ? "GPA: " + cleanString(item.gpa) : "", localizedPlain(item.coursework, lang), localizedPlain(item.description, lang)].filter(Boolean).join("\n");
      if (!title && !subtitle && !description && !item.waived) return null;
      return makeResumeBlock({
        id: cleanString(item.id) || "education_" + String(index + 1),
        title: title,
        date: formatResumeDateRange(item.startDate, item.endDate),
        subtitle: subtitle,
        description: description,
        waived: Boolean(item.waived || item.enabled === false)
      }, index + 1);
    }).filter(Boolean);
    if (educationBlocks.length) {
      sections.push(makeResumeSection(lang === "zh" ? "教育背景" : "Education", educationBlocks, sections.length + 1));
    }

    const experienceBlocks = ensureArray(master.experiences).map(function mapExperience(item, index) {
      const safe = item && typeof item === "object" ? item : {};
      const title = localizedPlain(safe.title, lang);
      const subtitle = [localizedPlain(safe.company, lang), localizedPlain(safe.location, lang)].filter(Boolean).join(", ");
      const bullets = localizedBullets(safe.bullets, lang);
      if (!title && !subtitle && !bullets.length && !safe.waived) return null;
      return makeResumeBlock({
        id: cleanString(safe.id) || "experience_" + String(index + 1),
        title: title,
        date: formatResumeDateRange(safe.startDate, safe.endDate),
        subtitle: subtitle,
        bullets: bullets,
        waived: Boolean(safe.waived || safe.enabled === false)
      }, index + 1);
    }).filter(Boolean);
    if (experienceBlocks.length) {
      sections.push(makeResumeSection(lang === "zh" ? "經歷" : "Experience", experienceBlocks, sections.length + 1));
    }

    const projectBlocks = ensureArray(master.projects).map(function mapProject(item, index) {
      const safe = item && typeof item === "object" ? item : {};
      const title = localizedPlain(safe.name, lang);
      const subtitle = [localizedPlain(safe.role, lang), localizedPlain(safe.organization, lang), localizedPlain(safe.location, lang)].filter(Boolean).join(", ");
      const bullets = localizedBullets(safe.bullets, lang);
      const description = localizedPlain(safe.description, lang);
      if (!title && !subtitle && !description && !bullets.length && !safe.waived) return null;
      return makeResumeBlock({
        id: cleanString(safe.id) || "project_" + String(index + 1),
        title: title,
        date: formatResumeDateRange(safe.startDate, safe.endDate),
        subtitle: subtitle,
        bullets: bullets,
        description: description,
        waived: Boolean(safe.waived || safe.enabled === false)
      }, index + 1);
    }).filter(Boolean);
    if (projectBlocks.length) {
      sections.push(makeResumeSection(lang === "zh" ? "專案" : "Projects", projectBlocks, sections.length + 1));
    }

    if (lang === "en") {
      const skills = master.skills && typeof master.skills === "object" ? master.skills : {};
      const skillLabels = [
        ["Languages", skills.languages],
        ["Frameworks", skills.frameworks],
        ["Tools", skills.tools],
        ["Other", skills.other]
      ];
      const skillBlocks = skillLabels.map(function mapSkill(pair, index) {
        const values = uniqueStringArray(pair[1]);
        if (!values.length) return null;
        return makeResumeBlock({
          title: pair[0],
          dateWaived: true,
          subtitleWaived: true,
          description: values.join(", ")
        }, index + 1);
      }).filter(Boolean);
      if (skillBlocks.length) {
        sections.push(makeResumeSection("Skills", skillBlocks, sections.length + 1));
      }
    }

    return sections;
  }

  function migrateLegacyResume(appData, lang) {
    const resume = createEmptyResume(lang);
    resume.header = legacyHeaderForResume(appData, lang);
    resume.sections = legacySectionsForResume(appData, lang);
    return resume;
  }

  function hasResumeContent(resume) {
    const safe = normalizeResumeObject(resume, resume && resume.language);
    const header = safe.header || {};
    const contact = normalizeContactInfo(header.contact, header);
    return Boolean(
      contact.firstName || contact.lastName ||
      contact.email ||
      contact.phone ||
      contact.location ||
      contact.links.some(function(link) { return cleanString(link.text); }) ||
      safe.sections.length
    );
  }

  function hasLegacyResumeContent(appData) {
    const safe = appData && typeof appData === "object" ? appData : {};
    const profile = safe.profile && typeof safe.profile === "object" ? safe.profile : {};
    const master = safe.masterResume && typeof safe.masterResume === "object" ? safe.masterResume : {};
    return Boolean(
      hasOwnMeaningfulValue(profile.name) ||
      hasOwnMeaningfulValue(profile.firstName) ||
      hasOwnMeaningfulValue(profile.middleName) ||
      hasOwnMeaningfulValue(profile.lastName) ||
      hasOwnMeaningfulValue(profile.fullName) ||
      hasOwnMeaningfulValue(profile.nameZh) ||
      hasOwnMeaningfulValue(profile.chineseName) ||
      hasOwnMeaningfulValue(profile.zhName) ||
      hasOwnMeaningfulValue(profile.email) ||
      hasOwnMeaningfulValue(profile.phone) ||
      hasOwnMeaningfulValue(profile.location) ||
      hasOwnMeaningfulValue(profile.linkedin) ||
      hasOwnMeaningfulValue(profile.github) ||
      hasOwnMeaningfulValue(profile.portfolio) ||
      hasOwnMeaningfulValue(master.summaries) ||
      hasOwnMeaningfulValue(master.education) ||
      hasOwnMeaningfulValue(master.experiences) ||
      hasOwnMeaningfulValue(master.projects) ||
      hasOwnMeaningfulValue(master.skills)
    );
  }

  function hasOwnMeaningfulValue(value) {
    if (typeof value === "string") return Boolean(cleanString(value));
    if (typeof value === "number" || typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") {
      return Object.keys(value).some(function(key) {
        return hasOwnMeaningfulValue(value[key]);
      });
    }
    return false;
  }

  function normalizeDualResumeState(appData) {
    const safe = appData && typeof appData === "object" ? appData : {};
    const source = safe.resumes && typeof safe.resumes === "object" ? safe.resumes : {};
    const migrated = hasLegacyResumeContent(safe);
    const en = source.en ? normalizeResumeObject(source.en, "en") : null;
    const zh = source.zh ? normalizeResumeObject(source.zh, "zh") : null;
    return {
      activeResumeLanguage: cleanString(safe.activeResumeLanguage || (safe.profile && safe.profile.resumeLanguage)) === "zh" ? "zh" : "en",
      resumes: {
        en: en && (hasResumeContent(en) || !migrated) ? en : migrateLegacyResume(safe, "en"),
        zh: zh && (hasResumeContent(zh) || !migrated) ? zh : migrateLegacyResume(safe, "zh")
      }
    };
  }

  function ensureDualResumeState() {
    if (!state.appData || typeof state.appData !== "object") {
      state.appData = {};
    }
    const dual = normalizeDualResumeState(state.appData);
    state.appData.activeResumeLanguage = dual.activeResumeLanguage;
    state.appData.resumes = dual.resumes;
    return dual;
  }

  function getActiveResume() {
    const dual = ensureDualResumeState();
    const lang = getResumeLanguage();
    return normalizeResumeObject(dual.resumes[lang], lang);
  }

  function toDateInputValue(value) {
    const text = cleanString(value);
    if (!text) {
      return "";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    if (/^\d{4}[-/]\d{2}$/.test(text)) {
      return text.replace(/\//g, "-") + "-01";
    }

    if (/^\d{4}$/.test(text)) {
      return text + "-01-01";
    }

    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) {
      return "";
    }
    return new Date(parsed).toISOString().slice(0, 10);
  }

  function createId(prefix) {
    if (appDataStore && typeof appDataStore.createId === "function") {
      return appDataStore.createId(prefix);
    }
    return String(prefix || "id") + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function setStatus(text) {
    if (statusLeftEl) {
      statusLeftEl.textContent = cleanString(text) || "Ready.";
    }
  }

  function setTrackerStatus(text) {
    if (trackerStatusEl) {
      trackerStatusEl.textContent = cleanString(text);
      trackerStatusEl.hidden = !trackerStatusEl.textContent;
    }
  }

  async function openTrackerDashboard() {
    try {
      await tracker.openDashboard();
    } catch (error) {
      setTrackerStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function parseTabFromHash() {
    const hashRaw = cleanString(globalThis.location && globalThis.location.hash);
    if (!hashRaw) {
      return "";
    }

    const token = hashRaw.startsWith("#") ? hashRaw.slice(1) : hashRaw;
    let decoded;

    try {
      decoded = cleanString(decodeURIComponent(token)).toLowerCase();
    } catch {
      decoded = cleanString(token).toLowerCase();
    }

    return decoded === "applications" || VALID_TOP_LEVEL_TABS.has(decoded) ? decoded : "";
  }

  function syncHashWithTab(tabKey) {
    const target = cleanString(tabKey).toLowerCase();
    if (!VALID_TOP_LEVEL_TABS.has(target)) {
      return;
    }

    const nextHash = "#" + target;
    if (cleanString(globalThis.location && globalThis.location.hash) === nextHash) {
      return;
    }

    if (globalThis.history && typeof globalThis.history.replaceState === "function") {
      globalThis.history.replaceState(null, "", nextHash);
      return;
    }

    if (globalThis.location) {
      globalThis.location.hash = nextHash;
    }
  }

  function setActiveTab(tabKey) {
    const nextTab = cleanString(tabKey).toLowerCase();
    if (nextTab === "applications") {
      setActiveTab("dashboard");
      void openTrackerDashboard();
      return;
    }
    const safeTab = VALID_TOP_LEVEL_TABS.has(nextTab) ? nextTab : "dashboard";
    const previousTab = state.activeTab;
    state.activeTab = safeTab;
    if (
      safeTab === "profile-resume" &&
      previousTab !== "profile-resume"
    ) {
      state.editorMode = "ai";
      ensureResumeAiChatContext();
    }

    const sections = document.querySelectorAll(".view-section");
    sections.forEach((section) => {
      if (section.id === "view-" + safeTab) {
        section.classList.remove("hidden");
      } else {
        section.classList.add("hidden");
      }
    });

    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach((button) => {
      const isActive = button.getAttribute("data-tab") === safeTab;
      button.classList.toggle("is-active", isActive);
    });

    syncHashWithTab(safeTab);
  }

  function createTestObjectId(prefix) {
    testObjectCounter += 1;
    return "test_" + cleanString(prefix || "object") + "_" + testObjectCounter;
  }

  function checkAndTrackTestDblClick(objectId) {
    const now = Date.now();
    const isDouble = _testDblClickTrack.objectId === objectId && now - _testDblClickTrack.time < 400;
    _testDblClickTrack = { objectId, time: now };
    return isDouble;
  }

  function updateTestSelectionDom(selectedId) {
    if (!testCanvasEl) {
      return;
    }
    testCanvasEl.querySelectorAll("[data-test-object-id]").forEach(function (el) {
      const id = cleanString(el.getAttribute("data-test-object-id"));
      el.classList.toggle("is-selected", id === selectedId);
    });
  }

  function attachTestTextObjectListeners() {
    if (!testCanvasEl) {
      return;
    }
    testCanvasEl.querySelectorAll(".test-text-object[data-test-object-id]").forEach(function (el) {
      const objectId = cleanString(el.getAttribute("data-test-object-id"));
      if (!objectId) {
        return;
      }
      el.addEventListener("dblclick", function (event) {
        event.preventDefault();
        event.stopPropagation();
        startTestTextEditing(objectId);
      }, true);
      el.addEventListener("dblclick", function (event) {
        event.preventDefault();
        event.stopPropagation();
        startTestTextEditing(objectId);
      });
    });
  }

  function getSelectedTestObject() {
    const selectedId = cleanString(state.testSandbox.selectedObjectId);
    if (!selectedId) {
      return null;
    }
    return state.testSandbox.objects.find((item) => item.id === selectedId) || null;
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    const safeMin = Number.isFinite(Number(min)) ? Number(min) : 0;
    const safeMax = Number.isFinite(Number(max)) ? Number(max) : safeMin;
    if (!Number.isFinite(number)) {
      return safeMin;
    }
    return Math.min(Math.max(number, safeMin), safeMax);
  }

  function getTestCanvasBounds() {
    if (!testCanvasEl) {
      return { width: 794, height: 1123 };
    }
    return {
      width: testCanvasEl.clientWidth || 794,
      height: testCanvasEl.clientHeight || 1123
    };
  }

  function clearTestSelection() {
    state.testSandbox.selectedObjectId = "";
    state.testSandbox.editingTextId = null;
    state.testSandbox.originalTextBeforeEdit = "";
    state.testSandbox.draftText = "";
    state.testSandbox.drag = null;
    renderTestSandbox();
  }

  function addTestTextObject() {
    const count = state.testSandbox.objects.filter((item) => item.type === "text").length;
    const object = {
      id: createTestObjectId("text"),
      type: "text",
      text: "New Text",
      x: 80 + (count * 18),
      y: 80 + (count * 18),
      fontSize: 16,
      bold: false,
      italic: false
    };
    state.testSandbox.objects.push(object);
    state.testSandbox.selectedObjectId = object.id;
    state.testSandbox.editingTextId = null;
    state.testSandbox.draftText = "";
    renderTestSandbox();
  }

  function addTestLineObject() {
    const count = state.testSandbox.objects.filter((item) => item.type === "line").length;
    const object = {
      id: createTestObjectId("line"),
      type: "line",
      x: 80,
      y: 160 + (count * 18),
      width: 500,
      thickness: 1
    };
    state.testSandbox.objects.push(object);
    state.testSandbox.selectedObjectId = object.id;
    state.testSandbox.editingTextId = null;
    state.testSandbox.draftText = "";
    renderTestSandbox();
  }

  function clearTestSandbox() {
    state.testSandbox.objects = [];
    state.testSandbox.selectedObjectId = "";
    state.testSandbox.editingTextId = null;
    state.testSandbox.originalTextBeforeEdit = "";
    state.testSandbox.draftText = "";
    state.testSandbox.drag = null;
    renderTestSandbox();
  }

  function deleteSelectedTestObject() {
    const selectedId = cleanString(state.testSandbox.selectedObjectId);
    if (!selectedId) {
      return;
    }
    state.testSandbox.objects = state.testSandbox.objects.filter((item) => item.id !== selectedId);
    state.testSandbox.selectedObjectId = "";
    state.testSandbox.editingTextId = null;
    state.testSandbox.originalTextBeforeEdit = "";
    state.testSandbox.draftText = "";
    state.testSandbox.drag = null;
    renderTestSandbox();
  }

  function updateSelectedTestObject(mutator) {
    const selectedId = cleanString(state.testSandbox.selectedObjectId);
    if (!selectedId || typeof mutator !== "function") {
      return;
    }
    state.testSandbox.objects = state.testSandbox.objects.map((item) => {
      if (item.id !== selectedId) {
        return item;
      }
      return mutator({ ...item });
    });
    renderTestSandbox();
  }

  function handleTestSelectedAction(action) {
    const selected = getSelectedTestObject();
    if (!selected) {
      return;
    }
    if (action === "delete") {
      deleteSelectedTestObject();
      return;
    }
    if (selected.type === "text") {
      if (action === "increase") {
        updateSelectedTestObject((item) => ({ ...item, fontSize: Number(item.fontSize || 16) + 1 }));
        return;
      }
      if (action === "decrease") {
        updateSelectedTestObject((item) => ({ ...item, fontSize: Math.max(8, Number(item.fontSize || 16) - 1) }));
        return;
      }
      if (action === "bold") {
        updateSelectedTestObject((item) => ({ ...item, bold: !item.bold }));
        return;
      }
      if (action === "italic") {
        updateSelectedTestObject((item) => ({ ...item, italic: !item.italic }));
      }
      return;
    }
    if (selected.type === "line") {
      if (action === "increase") {
        updateSelectedTestObject((item) => ({ ...item, thickness: Number(item.thickness || 1) + 1 }));
        return;
      }
      if (action === "decrease") {
        updateSelectedTestObject((item) => ({ ...item, thickness: Math.max(1, Number(item.thickness || 1) - 1) }));
      }
    }
  }

  function startTestTextEditing(objectId) {
    const object = state.testSandbox.objects.find((item) => item.id === objectId && item.type === "text");
    if (!object) {
      return;
    }
    state.testSandbox.selectedObjectId = object.id;
    state.testSandbox.editingTextId = object.id;
    state.testSandbox.originalTextBeforeEdit = object.text;
    state.testSandbox.draftText = object.text;
    state.testSandbox.drag = null;
    renderTestSandbox();
    globalThis.setTimeout(() => {
      if (!testCanvasEl) {
        return;
      }
      const editor = testCanvasEl.querySelector("input[data-test-object-id=\"" + object.id + "\"]");
      if (!(editor instanceof HTMLInputElement)) {
        return;
      }
      editor.focus();
      editor.select();
    }, 0);
  }

  function getTestTextInputValue(element) {
    if (element instanceof HTMLInputElement) {
      return element.value;
    }
    return "";
  }

  function updateTestEditingDraft(element) {
    const objectId = element instanceof HTMLElement ? cleanString(element.getAttribute("data-test-object-id")) : "";
    if (!objectId || state.testSandbox.editingTextId !== objectId) {
      return;
    }
    state.testSandbox.draftText = getTestTextInputValue(element);
    const object = state.testSandbox.objects.find((item) => item.id === objectId && item.type === "text");
    if (object && element instanceof HTMLInputElement) {
      element.style.width = getTestTextInputWidth(state.testSandbox.draftText, object.fontSize) + "px";
    }
  }

  function commitTestTextEditing(element) {
    const objectId = element instanceof HTMLElement ? cleanString(element.getAttribute("data-test-object-id")) : "";
    if (!objectId || state.testSandbox.editingTextId !== objectId) {
      return;
    }
    const nextText = getTestTextInputValue(element);
    state.testSandbox.objects = state.testSandbox.objects.map((item) => {
      if (item.id !== objectId || item.type !== "text") {
        return item;
      }
      return { ...item, text: nextText };
    });
    state.testSandbox.editingTextId = null;
    state.testSandbox.originalTextBeforeEdit = "";
    state.testSandbox.draftText = "";
    state.testSandbox.selectedObjectId = objectId;
    renderTestSandbox();
  }

  function cancelTestTextEditing() {
    const objectId = cleanString(state.testSandbox.editingTextId);
    if (!objectId) {
      return;
    }
    const originalText = state.testSandbox.originalTextBeforeEdit;
    state.testSandbox.objects = state.testSandbox.objects.map((item) => {
      if (item.id !== objectId || item.type !== "text") {
        return item;
      }
      return { ...item, text: originalText };
    });
    state.testSandbox.editingTextId = null;
    state.testSandbox.originalTextBeforeEdit = "";
    state.testSandbox.draftText = "";
    state.testSandbox.selectedObjectId = objectId;
    renderTestSandbox();
  }

  function startTestDrag(objectId, pointerEvent) {
    const object = state.testSandbox.objects.find((item) => item.id === objectId);
    if (!object || state.testSandbox.editingTextId) {
      return;
    }
    state.testSandbox.drag = {
      id: object.id,
      type: object.type,
      startClientX: pointerEvent.clientX,
      startClientY: pointerEvent.clientY,
      startX: Number(object.x || 0),
      startY: Number(object.y || 0)
    };
  }

  function handleTestPointerMove(event) {
    const drag = state.testSandbox.drag;
    if (!drag) {
      return;
    }
    const bounds = getTestCanvasBounds();
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    state.testSandbox.objects = state.testSandbox.objects.map((item) => {
      if (item.id !== drag.id) {
        return item;
      }
      if (drag.type === "line") {
        return {
          ...item,
          x: drag.startX,
          y: clampNumber(drag.startY + dy, 0, Math.max(0, bounds.height - Number(item.thickness || 1)))
        };
      }
      return {
        ...item,
        x: clampNumber(drag.startX + dx, 0, Math.max(0, bounds.width - 24)),
        y: clampNumber(drag.startY + dy, 0, Math.max(0, bounds.height - Number(item.fontSize || 16)))
      };
    });
    renderTestSandbox();
  }

  function handleTestPointerUp() {
    if (!state.testSandbox.drag) {
      return;
    }
    state.testSandbox.drag = null;
    renderTestSandbox();
  }

  function renderTestSelectedToolbar() {
    if (!testSelectedToolbarEl) {
      return;
    }
    const editingId = cleanString(state.testSandbox.editingTextId);
    const debugHtml = "<span class=\"test-editing-debug\">Editing: " + escapeHtml(editingId || "None") + "</span>";
    const selected = getSelectedTestObject();
    if (!selected) {
      testSelectedToolbarEl.innerHTML = "No object selected " + debugHtml;
      return;
    }
    if (selected.type === "text") {
      testSelectedToolbarEl.innerHTML = [
        "<span class=\"test-selected-label\">Selected: Text</span>",
        "<button type=\"button\" class=\"secondary-btn small-btn\" data-test-action=\"increase\">+</button>",
        "<button type=\"button\" class=\"secondary-btn small-btn\" data-test-action=\"decrease\">-</button>",
        "<button type=\"button\" class=\"secondary-btn small-btn\" data-test-action=\"bold\">Bold</button>",
        "<button type=\"button\" class=\"secondary-btn small-btn\" data-test-action=\"italic\">Italic</button>",
        "<button type=\"button\" class=\"secondary-btn small-btn danger-btn\" data-test-action=\"delete\">Delete</button>",
        debugHtml
      ].join("");
      return;
    }
    testSelectedToolbarEl.innerHTML = [
      "<span class=\"test-selected-label\">Selected: Line</span>",
      "<button type=\"button\" class=\"secondary-btn small-btn\" data-test-action=\"increase\">+</button>",
      "<button type=\"button\" class=\"secondary-btn small-btn\" data-test-action=\"decrease\">-</button>",
      "<button type=\"button\" class=\"secondary-btn small-btn danger-btn\" data-test-action=\"delete\">Delete</button>",
      debugHtml
    ].join("");
  }

  function getTestTextInputWidth(text, fontSize) {
    const length = Math.max(8, String(text || "").length);
    const size = Math.max(8, Number(fontSize || 16));
    return Math.min(620, Math.max(120, Math.ceil(length * size * 0.62) + 32));
  }

  function renderTestSandbox() {
    renderTestSelectedToolbar();
    if (!testCanvasEl) {
      return;
    }
    const selectedId = cleanString(state.testSandbox.selectedObjectId);
    const editingTextId = cleanString(state.testSandbox.editingTextId);
    testCanvasEl.innerHTML = state.testSandbox.objects.map((item) => {
      const selectedClass = item.id === selectedId ? " is-selected" : "";
      if (item.type === "line") {
        return "<div class=\"test-object test-line-object" + selectedClass + "\" data-test-object-id=\"" + escapeHtml(item.id) + "\" data-test-object-type=\"line\" style=\"left:" + Number(item.x || 0) + "px;top:" + Number(item.y || 0) + "px;width:" + Number(item.width || 500) + "px;height:" + Math.max(1, Number(item.thickness || 1)) + "px;\"></div>";
      }
      if (item.id === editingTextId) {
        return "<input class=\"test-object test-text-input is-selected\" data-test-object-id=\"" + escapeHtml(item.id) + "\" data-test-object-type=\"text\" type=\"text\" placeholder=\"Empty Text\" value=\"" + escapeHtml(state.testSandbox.draftText) + "\" style=\"left:" + Number(item.x || 0) + "px;top:" + Number(item.y || 0) + "px;width:" + getTestTextInputWidth(state.testSandbox.draftText, item.fontSize) + "px;font-size:" + Number(item.fontSize || 16) + "px;font-weight:" + (item.bold ? "700" : "400") + ";font-style:" + (item.italic ? "italic" : "normal") + ";z-index:10;\" />";
      }
      const emptyClass = !item.text ? " is-empty" : "";
      return "<div class=\"test-object test-text-object" + selectedClass + emptyClass + "\" data-test-object-id=\"" + escapeHtml(item.id) + "\" data-test-object-type=\"text\" data-placeholder=\"Empty Text\" style=\"left:" + Number(item.x || 0) + "px;top:" + Number(item.y || 0) + "px;font-size:" + Number(item.fontSize || 16) + "px;font-weight:" + (item.bold ? "700" : "400") + ";font-style:" + (item.italic ? "italic" : "normal") + ";\">" + escapeHtml(item.text || "") + "</div>";
    }).join("");
    attachTestTextObjectListeners();
  }

  function buildTestPdfHtml() {
    const objectsHtml = state.testSandbox.objects.map((item) => {
      if (item.type === "line") {
        return "<div class=\"test-pdf-line\" style=\"left:" + Number(item.x || 0) + "px;top:" + Number(item.y || 0) + "px;width:" + Number(item.width || 500) + "px;height:" + Math.max(1, Number(item.thickness || 1)) + "px;\"></div>";
      }
      const text = item.text || "Empty Text";
      const color = item.text ? "#111827" : "#9ca3af";
      return "<div class=\"test-pdf-text\" style=\"left:" + Number(item.x || 0) + "px;top:" + Number(item.y || 0) + "px;font-size:" + Number(item.fontSize || 16) + "px;font-weight:" + (item.bold ? "700" : "400") + ";font-style:" + (item.italic ? "italic" : "normal") + ";color:" + color + ";\">" + escapeHtml(text) + "</div>";
    }).join("");
    return [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<head>",
      "<meta charset=\"UTF-8\" />",
      "<title>Test Sandbox PDF</title>",
      "<style>",
      "@page{size:210mm 297mm;margin:0;}",
      "html,body{margin:0;padding:0;background:#fff;}",
      "body{font-family:Arial,Helvetica,sans-serif;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;}",
      ".test-pdf-page{position:relative;width:794px;height:1123px;overflow:hidden;background:#fff;}",
      ".test-pdf-text{position:absolute;white-space:pre-wrap;line-height:1.25;}",
      ".test-pdf-line{position:absolute;background:#111827;}",
      "</style>",
      "</head>",
      "<body>",
      "<div class=\"test-pdf-page\">" + objectsHtml + "</div>",
      "</body>",
      "</html>"
    ].join("");
  }

  function escapePdfText(value) {
    const source = String(value || "");
    let output = "";
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      const ch = source[index];
      if (code >= 32 && code <= 126) {
        output += ch;
      } else if (ch === "\t" || ch === "\n" || ch === "\r") {
        output += " ";
      } else {
        output += "?";
      }
    }
    return output.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function buildTestFallbackPdfBlob() {
    const pageWidth = 794;
    const pageHeight = 1123;
    const commands = [
      "q",
      "1 1 1 rg",
      "0 0 " + pageWidth + " " + pageHeight + " re",
      "f",
      "Q"
    ];
    state.testSandbox.objects.forEach((item) => {
      if (item.type === "line") {
        const x = Number(item.x || 0);
        const thickness = Math.max(1, Number(item.thickness || 1));
        const y = pageHeight - Number(item.y || 0) - thickness;
        commands.push("q");
        commands.push("0.067 0.094 0.153 rg");
        commands.push(String(x) + " " + String(y) + " " + String(Number(item.width || 500)) + " " + String(thickness) + " re");
        commands.push("f");
        commands.push("Q");
        return;
      }
      const size = Math.max(8, Number(item.fontSize || 16));
      const fontKey = item.bold && item.italic ? "F4" : (item.bold ? "F2" : (item.italic ? "F3" : "F1"));
      const text = item.text || "Empty Text";
      const x = Number(item.x || 0);
      const y = pageHeight - Number(item.y || 0) - size;
      commands.push("BT");
      commands.push("/" + fontKey + " " + String(size) + " Tf");
      commands.push(item.text ? "0.067 0.094 0.153 rg" : "0.612 0.639 0.686 rg");
      commands.push("1 0 0 1 " + String(x) + " " + String(y) + " Tm");
      commands.push("(" + escapePdfText(text) + ") Tj");
      commands.push("ET");
    });
    const stream = commands.join("\n");
    const objects = [];
    function addObject(payload) {
      objects.push(payload);
      return objects.length;
    }
    const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const fontItalicId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>");
    const fontBoldItalicId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique >>");
    const contentId = addObject("<< /Length " + String(stream.length) + " >>\nstream\n" + stream + "\nendstream");
    const pagesId = addObject("<< /Type /Pages /Kids [0 0 R] /Count 1 >>");
    const pageId = addObject("<< /Type /Page /Parent " + String(pagesId) + " 0 R /MediaBox [0 0 " + pageWidth + " " + pageHeight + "] /Resources << /Font << /F1 " + fontRegularId + " 0 R /F2 " + fontBoldId + " 0 R /F3 " + fontItalicId + " 0 R /F4 " + fontBoldItalicId + " 0 R >> >> /Contents " + contentId + " 0 R >>");
    objects[pagesId - 1] = "<< /Type /Pages /Kids [" + pageId + " 0 R] /Count 1 >>";
    const catalogId = addObject("<< /Type /Catalog /Pages " + pagesId + " 0 R >>");
    let pdf = "%PDF-1.4\n%TEST\n";
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(pdf.length);
      pdf += String(index + 1) + " 0 obj\n" + objects[index] + "\nendobj\n";
    }
    const xrefOffset = pdf.length;
    pdf += "xref\n0 " + String(objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += String(offsets[index]).padStart(10, "0") + " 00000 n \n";
    }
    pdf += "trailer\n<< /Size " + String(objects.length + 1) + " /Root " + catalogId + " 0 R >>\nstartxref\n" + String(xrefOffset) + "\n%%EOF\n";
    return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
  }

  async function buildTestPdfBlob() {
    try {
      return await buildPdfBlobWithChromePrint(buildTestPdfHtml());
    } catch {
      return buildTestFallbackPdfBlob();
    }
  }

  async function handleViewTestPdf() {
    const targetTab = globalThis.open("", "_blank");
    if (!targetTab) {
      setStatus("Unable to open PDF tab. Please allow popups for this extension.");
      return;
    }
    try {
      const blob = await buildTestPdfBlob();
      if (!openBlobInNewTab(blob, targetTab)) {
        setStatus("Unable to open PDF tab. Please allow popups for this extension.");
        return;
      }
      setStatus("Opened Test sandbox PDF in a new tab.");
    } catch (error) {
      closeTab(targetTab);
      setStatus(error instanceof Error ? error.message : "Failed to open Test sandbox PDF.");
    }
  }

  function L(key) {
    const labels = UI_LABELS[editorLang] || UI_LABELS.en;
    return escapeHtml(labels[key] || UI_LABELS.en[key] || key);
  }

  function resolveBilingual(field) {
    if (!field) return { en: "", zh: "", waived: false };
    if (typeof field === "string") return { en: cleanString(field), zh: "", waived: false };
    if (typeof field === "object") {
      return {
        en: cleanString(field.en),
        zh: cleanString(field.zh),
        waived: Boolean(field.waived)
      };
    }
    return { en: "", zh: "", waived: false };
  }

  function buildBilingualValue(previous, nextValue, lang, options) {
    const base = resolveBilingual(previous);
    const waived = Boolean(options && options.waived);
    const text = cleanString(nextValue);
    const next = {
      en: base.en,
      zh: base.zh,
      waived: waived
    };

    if (lang === "zh") {
      next.zh = text;
    } else {
      next.en = text;
    }
    return next;
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

  function resolveBilingualName(profile) {
    const safe = profile && typeof profile === "object" ? profile : {};
    const source = safe.name && typeof safe.name === "object" ? safe.name : {};
    const enSource = source.en && typeof source.en === "object" ? source.en : {};
    const zhSource = source.zh && typeof source.zh === "object" ? source.zh : {};
    const en = normalizeNameParts({
      firstName: enSource.firstName || safe.firstName,
      middleName: enSource.middleName || safe.middleName,
      lastName: enSource.lastName || safe.lastName,
      displayName: enSource.displayName || safe.fullName
    });
    const zh = normalizeNameParts({
      firstName: zhSource.firstName,
      middleName: zhSource.middleName,
      lastName: zhSource.lastName,
      displayName: zhSource.displayName || safe.nameZh || safe.chineseName || safe.zhName
    });
    return {
      en: en,
      zh: zh,
      waived: Boolean(source.waived)
    };
  }

  function bilingualToolsHtml() {
    return "";
  }

  function createSummaryCard(summary) {
    const safe = summary && typeof summary === "object" ? summary : {};
    const label = resolveBilingual(safe.label);
    const text = resolveBilingual(safe.text);
    const card = document.createElement("div");
    card.className = "item-card summary-card";
    card.innerHTML = `
      <div class="item-card-top">
        <h4><span data-i18n="cardSummaryTitle">${L("cardSummaryTitle")}</span></h4>
      </div>
      <div class="bilingual-row">
        <label><span data-i18n="cardSummaryLabel">${L("cardSummaryLabel")} (EN)</span><input data-field="label.en" type="text" value="${escapeHtml(label.en)}" /></label>
        <label><span data-i18n="cardSummaryLabel">${L("cardSummaryLabel")} (ZH)</span><input data-field="label.zh" type="text" value="${escapeHtml(label.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(label, "label")}
      <label><span data-i18n="cardSummaryTextEn">${L("cardSummaryTextEn")}</span><textarea data-field="text.en" rows="4">${escapeHtml(text.en)}</textarea></label>
      <label><span data-i18n="cardSummaryTextZh">${L("cardSummaryTextZh")}</span><textarea data-field="text.zh" rows="4">${escapeHtml(text.zh)}</textarea></label>
      ${bilingualToolsHtml(text, "text")}
      <label class="inline-check"><input data-field="isDefault" type="checkbox" ${safe.isDefault ? "checked" : ""}/> <span data-i18n="cardSummaryIsDefault">${L("cardSummaryIsDefault")}</span></label>
      <button type="button" class="secondary-btn" data-action="delete-item"><span data-i18n="cardDelete">${L("cardDelete")}</span></button>
    `;
    card.dataset.id = cleanString(safe.id) || createId("summary");
    return card;
  }

  function createExperienceCard(exp) {
    const safe = exp && typeof exp === "object" ? exp : {};
    const company = resolveBilingual(safe.company);
    const title = resolveBilingual(safe.title);
    const location = resolveBilingual(safe.location);

    const bulletsEn = Array.isArray(safe.bullets)
      ? safe.bullets.map((b) => {
          if (!b) return "";
          if (typeof b === "object") return cleanString(b.en || b.text);
          return cleanString(b);
        }).filter(Boolean)
      : [];
    const bulletsZh = Array.isArray(safe.bullets)
      ? safe.bullets.map((b) => (!b || typeof b !== "object") ? "" : cleanString(b.zh))
      : [];
    while (bulletsZh.length < bulletsEn.length) bulletsZh.push("");

    const card = document.createElement("div");
    card.className = "item-card experience-card";
    card.innerHTML = `
      <div class="item-card-top">
        <h4><span data-i18n="cardExpTitle">${L("cardExpTitle")}</span></h4>
      </div>
      <div class="bilingual-row">
        <label><span data-i18n="cardExpCompanyEn">${L("cardExpCompanyEn")}</span><input data-field="company.en" type="text" value="${escapeHtml(company.en)}" /></label>
        <label><span data-i18n="cardExpCompanyZh">${L("cardExpCompanyZh")}</span><input data-field="company.zh" type="text" value="${escapeHtml(company.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(company, "company")}
      <div class="bilingual-row">
        <label><span data-i18n="cardExpTitleEn">${L("cardExpTitleEn")}</span><input data-field="title.en" type="text" value="${escapeHtml(title.en)}" /></label>
        <label><span data-i18n="cardExpTitleZh">${L("cardExpTitleZh")}</span><input data-field="title.zh" type="text" value="${escapeHtml(title.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(title, "title")}
      <div class="bilingual-row">
        <label><span data-i18n="cardExpLocationEn">${L("cardExpLocationEn")}</span><input data-field="location.en" type="text" value="${escapeHtml(location.en)}" /></label>
        <label><span data-i18n="cardExpLocationZh">${L("cardExpLocationZh")}</span><input data-field="location.zh" type="text" value="${escapeHtml(location.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(location, "location")}
      <div class="button-row">
        <label><span data-i18n="cardExpStartDate">${L("cardExpStartDate")}</span><input data-field="startDate" type="date" value="${escapeHtml(toDateInputValue(safe.startDate))}" /></label>
        <label><span data-i18n="cardExpEndDate">${L("cardExpEndDate")}</span><input data-field="endDate" type="date" value="${escapeHtml(toDateInputValue(safe.endDate))}" /></label>
      </div>
      <label><span data-i18n="cardExpBulletsEn">${L("cardExpBulletsEn")}</span><textarea data-field="bullets.en" rows="4">${escapeHtml(bulletsEn.join("\n"))}</textarea></label>
      <label><span data-i18n="cardExpBulletsZh">${L("cardExpBulletsZh")}</span><textarea data-field="bullets.zh" rows="4">${escapeHtml(bulletsZh.join("\n"))}</textarea></label>
      ${bilingualToolsHtml({ waived: (safe.bullets || []).some((b) => b && b.waived) }, "bullets")}
      <button type="button" class="secondary-btn" data-action="delete-item"><span data-i18n="cardDelete">${L("cardDelete")}</span></button>
    `;
    card.dataset.id = cleanString(safe.id) || createId("exp");
    return card;
  }

  function createProjectCard(project) {
    const safe = project && typeof project === "object" ? project : {};
    const name = resolveBilingual(safe.name);
    const role = resolveBilingual(safe.role);
    const organization = resolveBilingual(safe.organization);
    const location = resolveBilingual(safe.location);

    const bulletsEn = Array.isArray(safe.bullets)
      ? safe.bullets.map((b) => {
          if (!b) return "";
          if (typeof b === "object") return cleanString(b.en || b.text);
          return cleanString(b);
        }).filter(Boolean)
      : [];
    const bulletsZh = Array.isArray(safe.bullets)
      ? safe.bullets.map((b) => (!b || typeof b !== "object") ? "" : cleanString(b.zh))
      : [];
    while (bulletsZh.length < bulletsEn.length) bulletsZh.push("");

    const card = document.createElement("div");
    card.className = "item-card project-card";
    card.innerHTML = `
      <div class="item-card-top">
        <h4><span data-i18n="cardProjTitle">${L("cardProjTitle")}</span></h4>
      </div>
      <div class="bilingual-row">
        <label><span data-i18n="cardProjNameEn">${L("cardProjNameEn")}</span><input data-field="name.en" type="text" value="${escapeHtml(name.en)}" /></label>
        <label><span data-i18n="cardProjNameZh">${L("cardProjNameZh")}</span><input data-field="name.zh" type="text" value="${escapeHtml(name.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(name, "name")}
      <div class="bilingual-row">
        <label><span data-i18n="cardProjRoleEn">${L("cardProjRoleEn")}</span><input data-field="role.en" type="text" value="${escapeHtml(role.en)}" /></label>
        <label><span data-i18n="cardProjRoleZh">${L("cardProjRoleZh")}</span><input data-field="role.zh" type="text" value="${escapeHtml(role.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(role, "role")}
      <div class="bilingual-row">
        <label><span data-i18n="cardProjOrganizationEn">${L("cardProjOrganizationEn")}</span><input data-field="organization.en" type="text" value="${escapeHtml(organization.en)}" /></label>
        <label><span data-i18n="cardProjOrganizationZh">${L("cardProjOrganizationZh")}</span><input data-field="organization.zh" type="text" value="${escapeHtml(organization.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(organization, "organization")}
      <div class="bilingual-row">
        <label><span data-i18n="cardProjLocationEn">${L("cardProjLocationEn")}</span><input data-field="location.en" type="text" value="${escapeHtml(location.en)}" /></label>
        <label><span data-i18n="cardProjLocationZh">${L("cardProjLocationZh")}</span><input data-field="location.zh" type="text" value="${escapeHtml(location.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(location, "location")}
      <div class="button-row">
        <label><span data-i18n="cardExpStartDate">${L("cardExpStartDate")}</span><input data-field="startDate" type="date" value="${escapeHtml(toDateInputValue(safe.startDate))}" /></label>
        <label><span data-i18n="cardExpEndDate">${L("cardExpEndDate")}</span><input data-field="endDate" type="date" value="${escapeHtml(toDateInputValue(safe.endDate))}" /></label>
      </div>
      <label><span data-i18n="cardExpBulletsEn">${L("cardExpBulletsEn")}</span><textarea data-field="bullets.en" rows="4">${escapeHtml(bulletsEn.join("\n"))}</textarea></label>
      <label><span data-i18n="cardExpBulletsZh">${L("cardExpBulletsZh")}</span><textarea data-field="bullets.zh" rows="4">${escapeHtml(bulletsZh.join("\n"))}</textarea></label>
      ${bilingualToolsHtml({ waived: (safe.bullets || []).some((b) => b && b.waived) }, "bullets")}
      <button type="button" class="secondary-btn" data-action="delete-item"><span data-i18n="cardDelete">${L("cardDelete")}</span></button>
    `;
    card.dataset.id = cleanString(safe.id) || createId("proj");
    return card;
  }

  function createEducationCard(edu) {
    const safe = edu && typeof edu === "object" ? edu : {};
    const school = resolveBilingual(safe.school);
    const degree = resolveBilingual(safe.degree);
    const major = resolveBilingual(safe.major);
    const location = resolveBilingual(safe.location);
    const coursework = resolveBilingual(safe.coursework);
    const description = resolveBilingual(safe.description);
    const card = document.createElement("div");
    card.className = "item-card education-card";
    card.innerHTML = `
      <div class="item-card-top">
        <h4><span data-i18n="cardEduTitle">${L("cardEduTitle")}</span></h4>
      </div>
      <div class="bilingual-row">
        <label><span data-i18n="cardEduSchoolEn">${L("cardEduSchoolEn")}</span><input data-field="school.en" type="text" value="${escapeHtml(school.en)}" /></label>
        <label><span data-i18n="cardEduSchoolZh">${L("cardEduSchoolZh")}</span><input data-field="school.zh" type="text" value="${escapeHtml(school.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(school, "school")}
      <div class="bilingual-row">
        <label><span data-i18n="cardEduDegreeEn">${L("cardEduDegreeEn")}</span><input data-field="degree.en" type="text" value="${escapeHtml(degree.en)}" /></label>
        <label><span data-i18n="cardEduDegreeZh">${L("cardEduDegreeZh")}</span><input data-field="degree.zh" type="text" value="${escapeHtml(degree.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(degree, "degree")}
      <div class="bilingual-row">
        <label><span data-i18n="cardEduMajorEn">${L("cardEduMajorEn")}</span><input data-field="major.en" type="text" value="${escapeHtml(major.en)}" /></label>
        <label><span data-i18n="cardEduMajorZh">${L("cardEduMajorZh")}</span><input data-field="major.zh" type="text" value="${escapeHtml(major.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(major, "major")}
      <div class="bilingual-row">
        <label><span data-i18n="cardEduLocationEn">${L("cardEduLocationEn")}</span><input data-field="location.en" type="text" value="${escapeHtml(location.en)}" /></label>
        <label><span data-i18n="cardEduLocationZh">${L("cardEduLocationZh")}</span><input data-field="location.zh" type="text" value="${escapeHtml(location.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(location, "location")}
      <div class="button-row">
        <label><span data-i18n="cardExpStartDate">${L("cardExpStartDate")}</span><input data-field="startDate" type="date" value="${escapeHtml(toDateInputValue(safe.startDate))}" /></label>
        <label><span data-i18n="cardExpEndDate">${L("cardExpEndDate")}</span><input data-field="endDate" type="date" value="${escapeHtml(toDateInputValue(safe.endDate))}" /></label>
      </div>
      <label><span data-i18n="cardEduGpa">${L("cardEduGpa")}</span><input data-field="gpa" type="text" value="${escapeHtml(safe.gpa)}" /></label>
      <div class="bilingual-row">
        <label><span data-i18n="cardEduCoursework">${L("cardEduCoursework")} (EN)</span><input data-field="coursework.en" type="text" value="${escapeHtml(coursework.en)}" /></label>
        <label><span data-i18n="cardEduCoursework">${L("cardEduCoursework")} (ZH)</span><input data-field="coursework.zh" type="text" value="${escapeHtml(coursework.zh)}" /></label>
      </div>
      ${bilingualToolsHtml(coursework, "coursework")}
      <label><span data-i18n="cardEduDescription">${L("cardEduDescription")} (EN)</span><textarea data-field="description.en" rows="2">${escapeHtml(description.en)}</textarea></label>
      <label><span data-i18n="cardEduDescription">${L("cardEduDescription")} (ZH)</span><textarea data-field="description.zh" rows="2">${escapeHtml(description.zh)}</textarea></label>
      ${bilingualToolsHtml(description, "description")}
      <button type="button" class="secondary-btn" data-action="delete-item"><span data-i18n="cardDelete">${L("cardDelete")}</span></button>
    `;
    card.dataset.id = cleanString(safe.id) || createId("edu");
    return card;
  }

  function lineTypeLabel(type) {
    if (type === "title") return L("lineTitle");
    if (type === "date") return L("lineDate");
    if (type === "subtitle") return L("lineSubtitle");
    if (type === "bullet") return L("lineBullet");
    return L("lineParagraph");
  }

  function createContactLinkRow(link) {
    const safe = normalizeContactLink(link || {}, 0);
    const row = document.createElement("div");
    row.className = "contact-link-row";
    row.dataset.id = safe.id;
    row.innerHTML = '<button type="button" class="secondary-btn small-btn" data-resume-action="delete-contact-link">' + escapeHtml(L("cardDelete")) + '</button>' +
      '<input data-contact-link-text type="text" value="' + escapeHtml(safe.text) + '" />';
    return row;
  }

  function createResumeLineRow(line, index) {
    const safe = normalizeResumeLine(line || {}, index);
    const row = document.createElement("div");
    row.className = "resume-line-row";
    row.dataset.id = safe.id;
    row.dataset.lineType = safe.type;
    const boldLocked = safe.type === "title";
    const italicLocked = safe.type === "subtitle";
    const input = safe.type === "paragraph"
      ? '<textarea data-line-field="text" rows="3">' + escapeHtml(safe.text) + '</textarea>'
      : '<input data-line-field="text" type="text" value="' + escapeHtml(safe.text) + '" />';
    row.innerHTML = `
      <div class="resume-line-toolbar">
        <span class="resume-line-type">${escapeHtml(lineTypeLabel(safe.type))}</span>
        <button type="button" class="secondary-btn small-btn" data-resume-action="move-line-up">${escapeHtml(L("moveUp"))}</button>
        <button type="button" class="secondary-btn small-btn" data-resume-action="move-line-down">${escapeHtml(L("moveDown"))}</button>
        <button type="button" class="secondary-btn small-btn${safe.bold ? " is-active" : ""}${boldLocked ? " is-locked" : ""}" data-resume-action="toggle-line-bold"${boldLocked ? ' disabled title="Title is always bold"' : ""}>${escapeHtml(L("bold"))}</button>
        <button type="button" class="secondary-btn small-btn${safe.italic ? " is-active" : ""}${italicLocked ? " is-locked" : ""}" data-resume-action="toggle-line-italic"${italicLocked ? ' disabled title="Subtitle is always italic"' : ""}>${escapeHtml(L("italic"))}</button>
        <button type="button" class="secondary-btn small-btn" data-resume-action="delete-line">${escapeHtml(L("cardDelete"))}</button>
      </div>
      <label class="resume-line-input"><span>${escapeHtml(lineTypeLabel(safe.type))}</span>${input}</label>
    `;
    row.dataset.bold = safe.bold ? "true" : "false";
    row.dataset.italic = safe.italic ? "true" : "false";
    return row;
  }

  function addLineMenuHtml() {
    return `
      <details class="add-line-menu">
        <summary class="secondary-btn lightweight-action-btn">${escapeHtml(L("addLine"))}</summary>
        <div class="add-line-menu-options">
          <button type="button" class="secondary-btn small-btn" data-resume-action="add-line" data-line-type="title">${escapeHtml(L("addTitleLine"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="add-line" data-line-type="date">${escapeHtml(L("addDateLine"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="add-line" data-line-type="subtitle">${escapeHtml(L("addSubtitleLine"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="add-line" data-line-type="bullet">${escapeHtml(L("addBulletLine"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="add-line" data-line-type="paragraph">${escapeHtml(L("addParagraphLine"))}</button>
        </div>
      </details>
    `;
  }

  function createResumeBlockCard(block, index) {
    const safe = normalizeResumeBlock(block, index);
    const card = document.createElement("div");
    card.className = "item-card resume-entry-card";
    card.dataset.id = safe.id;
    card.innerHTML = `
      <div class="item-card-top">
        <h4>${escapeHtml(L("entryTitle"))}</h4>
        <div class="button-row">
          <button type="button" class="secondary-btn small-btn" data-resume-action="move-entry-up">${escapeHtml(L("moveUp"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="move-entry-down">${escapeHtml(L("moveDown"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="delete-entry">${escapeHtml(L("cardDelete"))}</button>
        </div>
      </div>
      <div class="resume-lines-list" data-lines-list></div>
      ${addLineMenuHtml()}
    `;
    const linesList = card.querySelector("[data-lines-list]");
    safe.lines
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .forEach(function appendLine(line, lineIndex) {
        linesList.appendChild(createResumeLineRow(line, lineIndex));
      });
    return card;
  }

  function createResumeSectionCard(section, index) {
    const safe = normalizeResumeSection(section, index);
    const card = document.createElement("div");
    card.className = "item-card resume-section-card";
    card.dataset.id = safe.id;
    card.innerHTML = `
      <div class="item-card-top">
        <h4>Resume Section</h4>
        <div class="button-row">
          <button type="button" class="secondary-btn small-btn" data-resume-action="move-section-up">${escapeHtml(L("moveUp"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="move-section-down">${escapeHtml(L("moveDown"))}</button>
          <button type="button" class="secondary-btn small-btn" data-resume-action="delete-section">${escapeHtml(L("cardDelete"))}</button>
        </div>
      </div>
      <label><span data-i18n="sectionName">${escapeHtml(L("sectionName"))}</span><input data-section-field="sectionName" type="text" value="${escapeHtml(safe.sectionName)}" /></label>
      <h4>Entries</h4>
      <div class="item-list" data-blocks-list></div>
      <div class="button-row">
        <button type="button" class="secondary-btn lightweight-action-btn" data-resume-action="add-entry"><span data-i18n="addEntry">${escapeHtml(L("addEntry"))}</span></button>
      </div>
    `;
    const blocksList = card.querySelector("[data-blocks-list]");
    safe.blocks
      .filter(function keepVisibleBlock(block) { return block && !block.waived; })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .forEach(function appendBlock(block, blockIndex) {
        blocksList.appendChild(createResumeBlockCard(block, blockIndex));
      });
    return card;
  }

  function collectContactLinksFromForm() {
    const rows = profileLinksListEl ? Array.from(profileLinksListEl.querySelectorAll(".contact-link-row")) : [];
    return rows.map(function mapLink(row, index) {
      const input = row.querySelector("[data-contact-link-text]");
      return normalizeContactLink({
        id: cleanString(row.dataset.id) || createId("link"),
        text: input && "value" in input ? cleanString(input.value) : "",
        order: index + 1
      }, index);
    });
  }

  function collectResumeSectionsFromForm() {
    const cards = resumeSectionsListEl ? Array.from(resumeSectionsListEl.querySelectorAll(":scope > .resume-section-card")) : [];
    return cards.map(function mapSection(card, sectionIndex) {
      const sectionNameNode = card.querySelector('[data-section-field="sectionName"]');
      const blockCards = Array.from(card.querySelectorAll(":scope [data-blocks-list] > .resume-entry-card"));
      return normalizeResumeSection({
        id: cleanString(card.dataset.id) || createId("section"),
        sectionName: sectionNameNode && "value" in sectionNameNode ? cleanString(sectionNameNode.value) : "",
        waived: false,
        order: sectionIndex + 1,
        blocks: blockCards.map(function mapBlock(blockCard, blockIndex) {
          return {
            id: cleanString(blockCard.dataset.id) || createId("block"),
            lines: Array.from(blockCard.querySelectorAll(":scope [data-lines-list] > .resume-line-row")).map(function mapLine(row, lineIndex) {
              const valueNode = row.querySelector('[data-line-field="text"]');
              const lineType = cleanString(row.dataset.lineType);
              return {
                id: cleanString(row.dataset.id) || createId("line"),
                type: lineType,
                text: valueNode && "value" in valueNode ? cleanString(valueNode.value) : "",
                bold: lineType === "title" ? true : cleanString(row.dataset.bold) === "true",
                italic: lineType === "subtitle" ? true : cleanString(row.dataset.italic) === "true",
                order: lineIndex + 1
              };
            }),
            waived: false,
            order: blockIndex + 1
          };
        })
      }, sectionIndex);
    });
  }

  function migrateEducationValue(value) {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.map((item) => {
        const safe = item && typeof item === "object" ? item : {};
        return {
          id: cleanString(safe.id) || createId("edu"),
          school: resolveBilingual(safe.school),
          degree: resolveBilingual(safe.degree),
          major: resolveBilingual(safe.major || safe.field || safe.fieldOfStudy || safe.majorName),
          location: resolveBilingual(safe.location),
          startDate: cleanString(safe.startDate),
          endDate: cleanString(safe.endDate),
          gpa: cleanString(safe.gpa),
          coursework: resolveBilingual(Array.isArray(safe.coursework)
            ? safe.coursework.join(", ")
            : Array.isArray(safe.relevantCoursework)
              ? safe.relevantCoursework.join(", ")
              : (safe.coursework || safe.relevantCoursework)),
          description: resolveBilingual(safe.description || safe.desc),
          enabled: safe.enabled !== false,
          waived: Boolean(safe.waived)
        };
      }).filter((item) => (
        item.school.en || item.school.zh ||
        item.degree.en || item.degree.zh ||
        item.major.en || item.major.zh ||
        item.location.en || item.location.zh ||
        item.startDate || item.endDate ||
        item.gpa || item.coursework.en || item.coursework.zh || item.description.en || item.description.zh
      ));
    }

    if (value && typeof value === "object") {
      return migrateEducationValue([value]);
    }

    const text = cleanString(value);
    if (!text || text === "[]" || text === "{}") {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (parsed !== null) {
      return migrateEducationValue(parsed);
    }

    return [{
      id: createId("edu"),
      school: "",
      degree: "",
      major: "",
      location: "",
      startDate: "",
      endDate: "",
      gpa: "",
      coursework: resolveBilingual(""),
      description: resolveBilingual(text)
    }];
  }

  function getInputValue(id) {
    const node = document.getElementById(id);
    return node ? cleanString(node.value) : "";
  }

  function setInputValue(id, value) {
    const node = document.getElementById(id);
    if (node) {
      node.value = cleanString(value);
    }
  }

  function syncProfileResumeFormIntoState(languageOverride) {
    if (!state.appData || typeof state.appData !== "object") {
      return;
    }
    const lang = languageOverride === "zh" || languageOverride === "en" ? languageOverride : getResumeLanguage();
    const dual = ensureDualResumeState();
    dual.resumes[lang] = collectActiveResumeFromForm(lang);
    state.appData = {
      ...state.appData,
      activeResumeLanguage: lang,
      resumes: dual.resumes,
      profile: collectProfileFromForm(languageOverride),
      masterResume: state.appData.masterResume
    };
  }

  let resumeAutosaveDebounceTimer = null;
  let resumeAutosaveIntervalId = null;
  let resumeAutosavePromise = null;

  function clearResumeAutosaveDebounce() {
    if (resumeAutosaveDebounceTimer) {
      clearTimeout(resumeAutosaveDebounceTimer);
      resumeAutosaveDebounceTimer = null;
    }
  }

  function normalizeSharedResumeLanguages(resumes) {
    const safe = resumes && typeof resumes === "object" ? resumes : {};
    return {
      en: normalizeResumeObject(safe.en, "en"),
      zh: normalizeResumeObject(safe.zh, "zh")
    };
  }

  function isBlankText(value) {
    return !cleanString(value);
  }

  function isBlankLine(line) {
    const safe = line && typeof line === "object" ? line : {};
    return isBlankText(safe.text !== undefined ? safe.text : line);
  }

  function isBlankEntry(entry) {
    const safe = normalizeResumeBlock(entry, 0);
    return !safe.lines.some(function hasLineText(line) {
      return !isBlankLine(line);
    });
  }

  function isBlankSection(section) {
    const safe = section && typeof section === "object" ? section : {};
    return isBlankText(safe.sectionName !== undefined ? safe.sectionName : safe.name);
  }

  function cleanEntryAfterAi(entry, index) {
    const safe = normalizeResumeBlock(entry, index);
    const blank = isBlankEntry(safe);
    const lines = blank
      ? safe.lines.filter(isBlankLine).slice(0, 1)
      : safe.lines.filter(function keepLine(line) {
          return !isBlankLine(line);
        });
    return {
      ...safe,
      lines: lines.map(function reorderLine(line, lineIndex) {
        return { ...normalizeResumeLine(line, lineIndex), order: lineIndex + 1 };
      }),
      order: index + 1
    };
  }

  function limitBlankEntries(entries, maxBlank) {
    const list = Array.isArray(entries) ? entries : [];
    const limit = Number.isFinite(Number(maxBlank)) ? Number(maxBlank) : 2;
    let blankCount = 0;
    return list.map(cleanEntryAfterAi).filter(function keepEntry(entry) {
      if (!isBlankEntry(entry)) {
        return true;
      }
      blankCount += 1;
      return blankCount <= limit;
    }).map(function reorderEntry(entry, index) {
      return { ...entry, order: index + 1 };
    });
  }

  function cleanSectionAfterAi(section, index) {
    const safe = normalizeResumeSection(section, index);
    return {
      ...safe,
      sectionName: cleanString(safe.sectionName),
      blocks: limitBlankEntries(safe.blocks, 2),
      order: index + 1
    };
  }

  function limitBlankSections(sections, maxBlank) {
    const list = Array.isArray(sections) ? sections : [];
    const limit = Number.isFinite(Number(maxBlank)) ? Number(maxBlank) : 2;
    let blankCount = 0;
    return list.map(cleanSectionAfterAi).filter(function keepSection(section) {
      if (!isBlankSection(section)) {
        return true;
      }
      blankCount += 1;
      return blankCount <= limit;
    }).map(function reorderSection(section, index) {
      return { ...section, order: index + 1 };
    });
  }

  function limitBlankContactLinks(links, maxBlank) {
    const list = Array.isArray(links) ? links : [];
    const limit = Number.isFinite(Number(maxBlank)) ? Number(maxBlank) : 2;
    let blankCount = 0;
    return list.map(normalizeContactLink).filter(function keepLink(link) {
      if (!isBlankText(link && link.text)) {
        return true;
      }
      blankCount += 1;
      return blankCount <= limit;
    }).map(function reorderLink(link, index) {
      return { ...link, order: index + 1 };
    });
  }

  function cleanupResumeAfterAI(resume, lang) {
    const normalized = normalizeResumeObject(resume, lang);
    const header = normalized.header && typeof normalized.header === "object" ? normalized.header : {};
    const contact = normalizeContactInfo(header.contact, header);
    return normalizeResumeObject({
      ...normalized,
      header: {
        ...header,
        contact: {
          ...contact,
          links: limitBlankContactLinks(contact.links, 2)
        }
      },
      sections: limitBlankSections(normalized.sections, 2)
    }, lang);
  }

  function applyResumeCleanupForSave(language) {
    const lang = language === "zh" ? "zh" : "en";

    const dual = ensureDualResumeState();
    dual.resumes[lang] = cleanupResumeAfterAI(dual.resumes[lang], lang);
    state.appData.resumes = {
      ...dual.resumes,
      [lang]: dual.resumes[lang]
    };
  }

  function flushManualResumeEditsToSharedState(options) {
    const opts = options && typeof options === "object" ? options : {};
    const lang = opts.language === "zh" || opts.language === "en" ? opts.language : getResumeLanguage();

    syncProfileResumeFormIntoState(lang);
    state.appData.resumes = normalizeSharedResumeLanguages(state.appData.resumes);
    state.appData.activeResumeLanguage = lang;
    if (state.appData.profile && typeof state.appData.profile === "object") {
      state.appData.profile.resumeLanguage = lang;
    }

    if (opts.markDirty) {
      markResumeDirty({ debounce: opts.debounce !== false });
    }
  }

  function markResumeDirty(options) {
    const opts = options && typeof options === "object" ? options : {};
    state.resumeAutosave.dirty = true;
    state.resumeAutosave.revision += 1;
    if (opts.cleanupEmptyObjects) {
      state.resumeAutosave.cleanupEmptyObjects = true;
      state.resumeAutosave.cleanupLanguage = opts.language === "zh" ? "zh" : "en";
    } else {
      state.resumeAutosave.cleanupEmptyObjects = false;
      state.resumeAutosave.cleanupLanguage = "";
    }
    if (opts.debounce !== false) {
      scheduleDebouncedResumeAutosave();
    }
  }

  function scheduleDebouncedResumeAutosave() {
    clearResumeAutosaveDebounce();
    resumeAutosaveDebounceTimer = setTimeout(function runDebouncedAutosave() {
      resumeAutosaveDebounceTimer = null;
      void flushResumeAutosave({ force: false, silent: true }).catch(() => {});
    }, RESUME_AUTOSAVE_DEBOUNCE_MS);
  }

  function updateResumeAutosaveClean(savedRevision) {
    if (state.resumeAutosave.revision === savedRevision) {
      state.resumeAutosave.dirty = false;
      state.resumeAutosave.cleanupEmptyObjects = false;
      state.resumeAutosave.cleanupLanguage = "";
    }
  }

  async function saveProfileResumeStateFromSharedState() {
    const lang = state.appData && state.appData.activeResumeLanguage === "zh" ? "zh" : "en";
    const resumes = normalizeSharedResumeLanguages(state.appData && state.appData.resumes);
    const profile = state.appData && state.appData.profile && typeof state.appData.profile === "object"
      ? state.appData.profile
      : collectProfileFromForm(lang);
    const masterResume = state.appData && state.appData.masterResume && typeof state.appData.masterResume === "object"
      ? state.appData.masterResume
      : {};
    const requiredFieldWaivers = collectRequiredFieldWaiversFromForm();
    const nextAppData = {
      ...(state.appData && typeof state.appData === "object" ? state.appData : {}),
      activeResumeLanguage: lang,
      resumes: resumes,
      profile: profile,
      masterResume: masterResume,
      settings: {
        ...((state.appData && state.appData.settings && typeof state.appData.settings === "object") ? state.appData.settings : {}),
        requiredFieldWaivers: requiredFieldWaivers
      }
    };

    if (dataBoundary && typeof dataBoundary.saveAppData === "function") {
      const savedCanonical = await saveCanonicalDataPatch({
        activeResumeLanguage: lang,
        resumes: resumes,
        profile: profile,
        resume: masterResume,
        settings: {
          requiredFieldWaivers: requiredFieldWaivers
        }
      });
      if (savedCanonical && typeof savedCanonical === "object") {
        state.canonicalData = savedCanonical;
      }
    } else if (appDataStore && typeof appDataStore.saveAppData === "function") {
      await appDataStore.saveAppData(nextAppData);
    }

    state.appData = nextAppData;
  }

  async function flushResumeAutosave(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (!opts.force && !state.resumeAutosave.dirty) {
      return;
    }
    if (resumeAutosavePromise) {
      await resumeAutosavePromise;
      if (!opts.force && !state.resumeAutosave.dirty) {
        return;
      }
    }

    clearResumeAutosaveDebounce();
    const savedRevision = state.resumeAutosave.revision;
    const cleanupEmptyObjects = Boolean(opts.cleanupEmptyObjects || state.resumeAutosave.cleanupEmptyObjects);
    const cleanupLanguage = opts.cleanupLanguage === "zh" || opts.cleanupLanguage === "en"
      ? opts.cleanupLanguage
      : state.resumeAutosave.cleanupLanguage === "zh" || state.resumeAutosave.cleanupLanguage === "en"
        ? state.resumeAutosave.cleanupLanguage
        : getResumeLanguage();
    state.resumeAutosave.saving = true;
    resumeAutosavePromise = (async function persistSharedResumeState() {
      if (cleanupEmptyObjects) {
        applyResumeCleanupForSave(cleanupLanguage);
      }
      await saveProfileResumeStateFromSharedState();
      updateResumeAutosaveClean(savedRevision);
    })();

    try {
      await resumeAutosavePromise;
      if (!opts.silent) {
        setStatus("Profile saved.");
      }
    } catch (error) {
      state.resumeAutosave.dirty = true;
      if (!opts.silent) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
      throw error;
    } finally {
      state.resumeAutosave.saving = false;
      resumeAutosavePromise = null;
    }
  }

  function handleManualResumeEdit() {
    flushManualResumeEditsToSharedState({ markDirty: true });
  }

  async function flushPendingResumeWork() {
    flushManualResumeEditsToSharedState({ markDirty: false });
    if (state.resumeAutosave.dirty) {
      await flushResumeAutosave({ force: true, silent: true });
    }
  }

  function startResumeAutosaveInterval() {
    if (resumeAutosaveIntervalId) {
      return;
    }
    resumeAutosaveIntervalId = setInterval(function intervalAutosave() {
      if (state.resumeAutosave.dirty) {
        void flushResumeAutosave({ force: false, silent: true }).catch(() => {});
      }
    }, RESUME_AUTOSAVE_INTERVAL_MS);
  }

  function renderRequiredFieldWaivers() {
    document.querySelectorAll(".waive-sync-controls, .waive-inline-check").forEach(function removeWaiver(node) {
      node.remove();
    });
    document.querySelectorAll(".waive-input-wrap").forEach(function unwrapWaiver(wrap) {
      if (!(wrap instanceof HTMLElement)) {
        return;
      }
      const parent = wrap.parentElement;
      if (!parent) {
        return;
      }
      while (wrap.firstChild) {
        parent.insertBefore(wrap.firstChild, wrap);
      }
      wrap.remove();
    });
  }

  function collectRequiredFieldWaiversFromForm() {
    return {};
  }

  function collectActiveResumeFromForm(languageOverride) {
    const firstName = getInputValue("profile-firstName");
    const lastName = getInputValue("profile-lastName");
    const lang = languageOverride === "zh" || languageOverride === "en" ? languageOverride : getResumeLanguage();
    const current = normalizeResumeObject(ensureDualResumeState().resumes[lang], lang);

    const header = current.header || createEmptyHeader();
    function headerField(inputId) {
      return normalizeResumeField({
        value: getInputValue(inputId),
        waived: false
      });
    }
    const contact = normalizeContactInfo({
      firstName: firstName,
      lastName: lastName,
      email: getInputValue("profile-email"),
      phone: getInputValue("profile-phone"),
      location: getInputValue("profile-location"),
      links: collectContactLinksFromForm()
    }, {});

    return normalizeResumeObject({
      ...current,
      language: lang,
      header: {
        ...header,
        contact: contact,
        name: normalizeResumeName({
          firstName: firstName,
          lastName: lastName,
          waived: false
        }),
        email: headerField("profile-email", "email"),
        phone: headerField("profile-phone", "phone"),
        location: headerField("profile-location", "location"),
        linkedin: normalizeResumeField(""),
        github: normalizeResumeField(""),
        portfolio: normalizeResumeField("")
      },
      sections: collectResumeSectionsFromForm()
    }, lang);
  }

  function collectProfileFromForm(languageOverride) {
    const lang = languageOverride === "zh" || languageOverride === "en" ? languageOverride : getResumeLanguage();
    const activeResume = collectActiveResumeFromForm(lang);
    const name = activeResume.header.name || {};
    const displayName = buildDisplayName(name.firstName, "", name.lastName, lang);
    const previousProfile = state.appData && state.appData.profile && typeof state.appData.profile === "object"
      ? state.appData.profile
      : {};
    const existingName = resolveBilingualName(previousProfile);
    const nextName = {
      en: { ...existingName.en },
      zh: { ...existingName.zh },
      waived: false
    };
    nextName[lang] = {
      firstName: cleanString(name.firstName),
      lastName: cleanString(name.lastName),
      displayName: displayName
    };
    const englishName = nextName.en || {};

    return {
      ...previousProfile,
      name: nextName,
      fullName: buildDisplayName(englishName.firstName, "", englishName.lastName, "en") || cleanString(englishName.displayName),
      firstName: cleanString(englishName.firstName),
      lastName: cleanString(englishName.lastName),
      nameZh: cleanString(nextName.zh && nextName.zh.displayName),
      resumeLanguage: getResumeLanguage(),
      email: activeResume.header.email.value,
      phone: activeResume.header.phone.value,
      location: buildBilingualValue(previousProfile.location, activeResume.header.location.value, lang, { waived: false })
    };
  }

  function renderDashboard() {
    const counts = state.trackerSummary;
    if (dashboardStatOfferEl) dashboardStatOfferEl.textContent = counts ? String(counts.offer) : "—";
    if (dashboardStatRejectedEl) dashboardStatRejectedEl.textContent = counts ? String(counts.rejected) : "—";
    if (dashboardStatPendingEl) dashboardStatPendingEl.textContent = counts ? String(counts.pending) : "—";
  }

  function renderProfile() {
    const dual = ensureDualResumeState();
    const lang = dual.activeResumeLanguage === "zh" ? "zh" : "en";
    const resume = normalizeResumeObject(dual.resumes[lang], lang);
    const header = resume.header || createEmptyHeader();
    const contact = normalizeContactInfo(header.contact, header);
    ensureResumeAiChatContext();
    setInputValue("profile-firstName", contact.firstName);
    setInputValue("profile-lastName", contact.lastName);
    setInputValue("profile-email", contact.email);
    setInputValue("profile-phone", contact.phone);
    setInputValue("profile-location", contact.location);
    if (profileLinksListEl) {
      profileLinksListEl.innerHTML = "";
      contact.links.forEach(function appendLink(link) {
        profileLinksListEl.appendChild(createContactLinkRow(link));
      });
    }
    const radioEl = document.getElementById(lang === "zh" ? "resume-lang-zh" : "resume-lang-en");
    if (radioEl) radioEl.checked = true;
    const pageTitleEl = document.querySelector("#resume-editor-panel .editor-panel-header h2");
    if (pageTitleEl) pageTitleEl.textContent = (UI_LABELS[editorLang] || UI_LABELS.en).pageTitle;
    renderRequiredFieldWaivers();
    renderEditorModeUI();
  }

  function renderResume() {
    const resume = getActiveResume();
    if (resumeSectionsListEl) {
      resumeSectionsListEl.innerHTML = "";
      resume.sections
        .slice()
        .filter(function keepVisibleSection(section) { return section && !section.waived; })
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        .forEach(function appendSection(section, index) {
          resumeSectionsListEl.appendChild(createResumeSectionCard(section, index));
        });
    }
    updateResumeEmptyStates();
  }

  function updateResumeEmptyState(listEl, emptyStateEl) {
    if (!emptyStateEl) {
      return;
    }

    const hasRows = Boolean(listEl && listEl.children && listEl.children.length);
    emptyStateEl.hidden = hasRows;
  }

  function updateResumeEmptyStates() {
    updateResumeEmptyState(resumeSectionsListEl, resumeSectionsEmptyStateEl);
    updateResumeEmptyState(summaryListEl, summaryEmptyStateEl);
    updateResumeEmptyState(educationListEl, educationEmptyStateEl);
    updateResumeEmptyState(experienceListEl, experienceEmptyStateEl);
    updateResumeEmptyState(projectListEl, projectEmptyStateEl);
  }

  function renderAutofillAnswers() {
    if (!autofillAnswerListEl) {
      return;
    }

    const list = Array.isArray(state.appData && state.appData.autofillAnswers) ? state.appData.autofillAnswers : [];
    autofillAnswerListEl.innerHTML = "";

    if (!list.length) {
      const empty = document.createElement("li");
      empty.textContent = "No answers yet.";
      autofillAnswerListEl.appendChild(empty);
      return;
    }

    list.forEach((item) => {
      const li = document.createElement("li");
      const title = escapeHtml(cleanString(item.label) || cleanString(item.key));
      const answerText = escapeHtml(cleanString(item.answer));
      const patterns = Array.isArray(item.questionPatterns)
        ? item.questionPatterns.slice(0, 2).map((pattern) => escapeHtml(pattern)).join(" | ")
        : "";

      li.innerHTML = `
        <strong>${title}</strong><br/>
        <span>${answerText}</span><br/>
        <small>${patterns}</small>
        <div class="button-row" style="margin-top:6px;">
          <button type="button" class="secondary-btn" data-action="edit" data-id="${escapeHtml(cleanString(item.id))}">Edit</button>
          <button type="button" class="secondary-btn" data-action="delete" data-id="${escapeHtml(cleanString(item.id))}">Delete</button>
        </div>
      `;

      autofillAnswerListEl.appendChild(li);
    });
  }

  function formatDateLabel(value) {
    const text = cleanString(value);
    if (!text) {
      return "-";
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      return text;
    }

    return date.toISOString().slice(0, 10);
  }

  function truncateNotesText(value, limit) {
    const text = String(value || "");
    const max = Number(limit) || 1200;
    return text.length > max ? text.slice(0, max) + "\n[truncated]" : text;
  }

  function buildVisibleChatHistory(messages) {
    const source = Array.isArray(messages) ? messages : [];
    return source.map(function mapMessage(message) {
      const role = cleanString(message && message.role).toLowerCase();
      const text = cleanString(message && (message.text || message.content));
      if ((role !== "user" && role !== "assistant") || !text) {
        return null;
      }
      return { role: role, text: text };
    }).filter(Boolean).slice(-20);
  }

  function buildProfileResumeAiMessages() {
    return [{ role: "assistant", text: PROFILE_RESUME_AI_INITIAL_MESSAGE }];
  }

  function ensureResumeAiChatContext() {
    if (!Array.isArray(state.aiChat.messages) || state.aiChat.messages.length === 0) {
      state.aiChat.messages = buildProfileResumeAiMessages();
    }
    state.aiChat.contextKey = "profile";
  }

  function trackerStatusLabel(job) {
    const status = state.notesPage.statuses.find(item => item.id === job.status_id);
    return status ? status.label : job.status_id;
  }

  function renderTrackerNotesPage() {
    const notes = state.notesPage;
    if (trackerNotesJobEl) {
      trackerNotesJobEl.innerHTML = "";
      for (const job of notes.jobs) {
        const option = document.createElement("option");
        option.value = job.id;
        option.textContent = `${job.company} — ${job.job_title} (${trackerStatusLabel(job)})`;
        trackerNotesJobEl.appendChild(option);
      }
      trackerNotesJobEl.value = notes.selectedJobId;
      trackerNotesJobEl.disabled = notes.loading || !notes.jobs.length;
    }
    const disabled = notes.loading || !notes.selectedJobId || notes.loadedJobId !== notes.selectedJobId;
    if (trackerNotesEditorEl) trackerNotesEditorEl.disabled = disabled;
    if (trackerNotesSaveBtn) trackerNotesSaveBtn.disabled = disabled;
    if (notesAiInputEl) notesAiInputEl.disabled = notes.isThinking;
    if (notesAiSendBtn) notesAiSendBtn.disabled = notes.isThinking;
    if (notesAiSaveBtn) notesAiSaveBtn.disabled = disabled || notes.isThinking || !notes.aiMessages.some(item => item.role === "assistant");
    if (notesAiClearBtn) notesAiClearBtn.disabled = notes.isThinking || !notes.aiMessages.length;
    if (notesAiMessagesEl) {
      notesAiMessagesEl.innerHTML = "";
      for (const message of notes.aiMessages) {
        const bubble = document.createElement("div");
        bubble.className = "notes-ai-message notes-ai-message-" + message.role;
        bubble.textContent = message.content;
        notesAiMessagesEl.appendChild(bubble);
      }
      if (notes.isThinking) {
        const bubble = document.createElement("div");
        bubble.className = "notes-ai-message notes-ai-message-assistant";
        bubble.textContent = "Thinking...";
        notesAiMessagesEl.appendChild(bubble);
      }
      notesAiMessagesEl.scrollTop = notesAiMessagesEl.scrollHeight;
    }
  }

  async function loadTrackerNotes(jobId) {
    state.notesPage.loadedJobId = "";
    state.notesPage.notes = "";
    if (trackerNotesEditorEl) trackerNotesEditorEl.value = "";
    renderTrackerNotesPage();
    try {
      const result = await tracker.getNotes(jobId);
      if (state.notesPage.selectedJobId !== jobId) return;
      state.notesPage.notes = result.notes;
      state.notesPage.loadedJobId = jobId;
      if (trackerNotesEditorEl) trackerNotesEditorEl.value = result.notes;
    } finally {
      renderTrackerNotesPage();
    }
  }

  async function refreshTrackerData({ preserveDraft = false } = {}) {
    const draftJobId = state.notesPage.selectedJobId;
    const retainDraft = preserveDraft && draftJobId && state.notesPage.loadedJobId === draftJobId
      && trackerNotesEditorEl && trackerNotesEditorEl.value !== state.notesPage.notes;
    state.notesPage.loading = true;
    renderTrackerNotesPage();
    try {
      const [jobs, statuses, summary] = await Promise.all([
        tracker.getJobs(), tracker.getStatuses(), tracker.getSummary()
      ]);
      state.notesPage.jobs = jobs;
      state.notesPage.statuses = statuses;
      state.trackerSummary = summary;
      if (!jobs.some(job => job.id === state.notesPage.selectedJobId)) {
        state.notesPage.selectedJobId = jobs.length ? jobs[0].id : "";
      }
      if (state.notesPage.selectedJobId) {
        if (retainDraft && state.notesPage.selectedJobId === draftJobId) {
          setTrackerStatus("Tracker updated. Your unsaved notes draft was retained.");
        } else {
          await loadTrackerNotes(state.notesPage.selectedJobId);
        }
      } else {
        state.notesPage.loadedJobId = "";
        state.notesPage.notes = "";
        if (trackerNotesEditorEl) trackerNotesEditorEl.value = "";
      }
    } catch (error) {
      state.trackerSummary = null;
      setTrackerStatus(error instanceof Error ? error.message : String(error));
    } finally {
      state.notesPage.loading = false;
      renderDashboard();
      renderTrackerNotesPage();
    }
  }

  async function saveTrackerNotes() {
    const jobId = state.notesPage.selectedJobId;
    if (!jobId || state.notesPage.loadedJobId !== jobId) return;
    const text = trackerNotesEditorEl ? trackerNotesEditorEl.value : state.notesPage.notes;
    const saved = await tracker.saveNotes(jobId, text);
    if (state.notesPage.selectedJobId === jobId) state.notesPage.notes = saved.notes;
    setTrackerStatus("Notes saved in Tracker.");
  }

  async function buildNotesAiContext() {
    const jobs = await tracker.getJobs();
    const files = await Promise.all(jobs.map(job => tracker.getNotes(job.id)));
    const notes = jobs.map((job, index) => ({ job, text: files[index].notes })).filter(item => cleanString(item.text));
    const selected = notes.slice(0, 50);
    return {
      contextVersion: 1, totalNotes: notes.length, notesIncluded: selected.length,
      truncated: notes.length > selected.length, onlineResearchAvailable: false,
      onlineResearchContext: "", resumePdfContextAvailable: false, resumePdfContext: "",
      applications: selected.map(({ job, text }) => ({
        applicationId: job.id, company: job.company, jobTitle: job.job_title,
        status: trackerStatusLabel(job), location: job.location,
        appliedDate: job.applied_date,
        note: { title: `${job.company} — ${job.job_title}`, contentMarkdown: truncateNotesText(text, 1300) }
      }))
    };
  }

  function appendNotesAiMessage(role, content) {
    state.notesPage.aiMessages.push({ role, content });
    renderTrackerNotesPage();
  }

  function trackerCurrentTime() {
    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentDateTime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    };
  }

  function formatTrackerActionFailure(result) {
    const reason = cleanString(result && result.error) || "The Tracker action could not be completed.";
    const candidates = Array.isArray(result && result.candidates) ? result.candidates : [];
    const choices = candidates.map(item => `${item.company} — ${item.jobTitle}`).join("\n");
    const clarification = result && (result.code === "AMBIGUOUS" || result.code === "NOT_FOUND")
      ? "\nPlease clarify the company, job title, or reminder."
      : "";
    return `No changes were made. ${reason}${choices ? "\n" + choices : ""}${clarification}`;
  }

  function formatTrackerActionSuccess(results) {
    return results.map(result => {
      const job = result.job;
      const target = `${job.company} — ${job.job_title}`;
      switch (result.name) {
        case "setJobStatus": return `Status updated: ${target} (${trackerStatusLabel(job)}).`;
        case "setAppliedDate": return `Applied date updated: ${target} (${job.applied_date}).`;
        case "addJobNote": return `Note added: ${target}.`;
        case "addReminder": return `Reminder added: ${target} — ${result.reminder.title}.`;
        case "completeReminder": return `Reminder completed: ${target} — ${result.reminder.title}.`;
      }
    }).join("\n");
  }

  async function handleNotesAiSend() {
    const userMessage = cleanString(notesAiInputEl && notesAiInputEl.value);
    if (!userMessage || state.notesPage.isThinking) return;
    if (!hasAiProvider()) {
      appendNotesAiMessage("assistant", "Tracker Assistant is unavailable because no model provider is configured.");
      return;
    }
    const chatHistory = buildVisibleChatHistory(state.notesPage.aiMessages);
    const selectedJob = state.notesPage.jobs.find(job => job.id === state.notesPage.selectedJobId);
    state.notesPage.isThinking = true;
    if (notesAiInputEl) notesAiInputEl.value = "";
    appendNotesAiMessage("user", userMessage);
    try {
      state.notesPage.statuses = await tracker.getStatuses();
      const notesContext = await buildNotesAiContext();
      const request = {
        userMessage, notesContext, chatHistory, statuses: state.notesPage.statuses,
        selectedJob: selectedJob ? { company: selectedJob.company, jobTitle: selectedJob.job_title } : null,
        ...trackerCurrentTime(), settings: getAiSettings()
      };
      const plan = await api.planTrackerActions(request);
      if (!plan || plan.ok !== true) {
        appendNotesAiMessage("assistant", cleanString(plan && plan.error) || "Tracker planning failed.");
        return;
      }
      const functions = globalThis.TrackerAiFunctions;
      const validation = functions.validateTrackerFunctionBatch(plan.functionCalls);
      if (!validation.ok) {
        appendNotesAiMessage("assistant", formatTrackerActionFailure(validation));
        return;
      }
      if (!plan.functionCalls.length) {
        appendNotesAiMessage("assistant", cleanString(plan.assistantMessage) || "Please give more detail about your Tracker request.");
        return;
      }
      const check = await api.selfCheckTrackerActions({ ...request, functionCalls: plan.functionCalls });
      if (!check || check.ok !== true || check.approved !== true) {
        appendNotesAiMessage("assistant", `No changes were made. ${cleanString(check && check.reason) || "The proposed Tracker actions were rejected by the self-check."}`);
        return;
      }
      const result = await functions.executeTrackerFunctions(plan.functionCalls, { timezone: request.timezone });
      if (!result || result.ok !== true) {
        appendNotesAiMessage("assistant", formatTrackerActionFailure(result));
        return;
      }
      await refreshTrackerData({ preserveDraft: true });
      appendNotesAiMessage("assistant", formatTrackerActionSuccess(result.results));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendNotesAiMessage("assistant", `Tracker request failed: ${message}`);
      setTrackerStatus(message);
    } finally {
      state.notesPage.isThinking = false;
      renderTrackerNotesPage();
    }
  }

  function handleNotesAiClear() {
    state.notesPage.aiMessages = [];
    renderTrackerNotesPage();
  }

  async function saveLatestNotesAiReply() {
    const message = state.notesPage.aiMessages.slice().reverse().find(item => item.role === "assistant");
    if (!message || !state.notesPage.selectedJobId || state.notesPage.loadedJobId !== state.notesPage.selectedJobId) return;
    const text = trackerNotesEditorEl ? trackerNotesEditorEl.value : state.notesPage.notes;
    const combined = `${text.trimEnd()}\n\n## Tracker Assistant\n\n${message.content}`.trimStart();
    const jobId = state.notesPage.selectedJobId;
    const saved = await tracker.saveNotes(jobId, combined);
    if (state.notesPage.selectedJobId === jobId && state.notesPage.loadedJobId === jobId) {
      state.notesPage.notes = saved.notes;
      if (trackerNotesEditorEl) trackerNotesEditorEl.value = saved.notes;
    }
    setTrackerStatus("AI reply saved to the selected job's Tracker notes.");
  }

  function getUploadResumeState() {
    return state.uploadResume;
  }

  function renderUploadResumeModal() {
    const uploadState = getUploadResumeState();
    if (uploadResumeModalOverlayEl) {
      uploadResumeModalOverlayEl.classList.toggle("hidden", !uploadState.open);
    }
    if (uploadResumeStatusEl) {
      uploadResumeStatusEl.textContent = cleanString(uploadState.step) || "Choose a PDF resume to start importing.";
    }
    if (uploadResumeErrorEl) {
      const error = cleanString(uploadState.error);
      uploadResumeErrorEl.textContent = error;
      uploadResumeErrorEl.classList.toggle("hidden", !error);
    }

    const pdfStatus = cleanString(uploadState.pdfPreviewStatus);
    if (uploadResumePdfPlaceholderEl) {
      if (pdfStatus === "rendering") {
        uploadResumePdfPlaceholderEl.textContent = "Rendering PDF preview...";
        uploadResumePdfPlaceholderEl.hidden = false;
      } else if (pdfStatus === "failed") {
        uploadResumePdfPlaceholderEl.textContent = "Failed to render PDF preview.";
        uploadResumePdfPlaceholderEl.hidden = false;
      } else if (pdfStatus === "rendered") {
        uploadResumePdfPlaceholderEl.hidden = true;
      } else {
        uploadResumePdfPlaceholderEl.textContent = "No PDF selected.";
        uploadResumePdfPlaceholderEl.hidden = false;
      }
    }
    if (uploadResumePdfNavEl) {
      const hasPages = Number(uploadState.pdfPageCount || 0) > 1;
      uploadResumePdfNavEl.classList.toggle("hidden", !hasPages);
      if (hasPages && uploadResumePdfPageInfoEl) {
        uploadResumePdfPageInfoEl.textContent = "Page " + String(uploadState.pdfCurrentPage || 1) + " of " + String(uploadState.pdfPageCount);
      }
      if (uploadResumePdfPrevBtn) {
        uploadResumePdfPrevBtn.disabled = Number(uploadState.pdfCurrentPage || 1) <= 1;
      }
      if (uploadResumePdfNextBtn) {
        uploadResumePdfNextBtn.disabled = Number(uploadState.pdfCurrentPage || 1) >= Number(uploadState.pdfPageCount || 1);
      }
    }

    if (uploadResumeQualityReportEl) {
      const report = uploadState.qualityReport;
      if (report && report.quality) {
        uploadResumeQualityReportEl.classList.remove("hidden");
        if (uploadResumeQualityLabelEl) {
          const qualityText = "Extraction quality: " + report.quality.charAt(0).toUpperCase() + report.quality.slice(1);
          uploadResumeQualityLabelEl.textContent = qualityText;
          uploadResumeQualityLabelEl.className = "upload-resume-quality-label quality-" + report.quality;
        }
        if (uploadResumeQualityReasonsEl) {
          uploadResumeQualityReasonsEl.innerHTML = "";
          const reasons = Array.isArray(report.reasons) ? report.reasons.filter(Boolean) : [];
          reasons.forEach(function addReason(reason) {
            const li = document.createElement("li");
            li.textContent = cleanString(reason);
            uploadResumeQualityReasonsEl.appendChild(li);
          });
          uploadResumeQualityReasonsEl.hidden = !reasons.length;
        }
      } else {
        uploadResumeQualityReportEl.classList.add("hidden");
      }
    }

    if (uploadResumeTextPreviewEl) {
      uploadResumeTextPreviewEl.textContent = cleanString(uploadState.plainText) || "No text extracted yet.";
    }
    if (uploadResumeTextMetaEl) {
      const plainText = cleanString(uploadState.plainText);
      if (!plainText) {
        uploadResumeTextMetaEl.textContent = "No text extracted yet.";
      } else {
        const stats = uploadState.extractionStats && typeof uploadState.extractionStats === "object" ? uploadState.extractionStats : {};
        const pageCount = Number(stats.pageCount || 0);
        const characterCount = Number(stats.plainTextCharacterCount || stats.characterCount || 0) || plainText.length;
        const lineCount = Number(stats.plainTextLineCount || 0) || countPdfTextLines(plainText);
        const source = cleanString(stats.textSource || stats.source) || "Local PDF text extraction";
        const parts = [
          String(characterCount) + " chars",
          String(lineCount) + " lines",
          source
        ];
        if (pageCount > 0) parts.unshift(String(pageCount) + " page" + (pageCount === 1 ? "" : "s"));
        uploadResumeTextMetaEl.textContent = parts.join(" · ");
      }
    }
    if (uploadResumeCopyTextBtn) {
      uploadResumeCopyTextBtn.disabled = !cleanString(uploadState.plainText);
    }

    if (uploadResumePasteWrapEl) {
      uploadResumePasteWrapEl.classList.toggle("paste-needed", Boolean(uploadState.awaitingPastedText));
    }
    if (uploadResumeUsePastedTextBtn) {
      uploadResumeUsePastedTextBtn.disabled = Boolean(uploadState.running) || Boolean(uploadState.completed && !uploadState.awaitingPastedText);
    }
    if (uploadResumeMarkdownPreviewEl) {
      uploadResumeMarkdownPreviewEl.textContent = cleanString(uploadState.markdown) || "No Markdown extracted yet.";
    }
    if (uploadResumeMarkdownMetaEl) {
      const markdown = cleanString(uploadState.markdown);
      if (!markdown) {
        uploadResumeMarkdownMetaEl.textContent = "No Markdown extracted yet.";
      } else {
        const lineCount = markdown.split(/\r?\n/).length;
        const stats = uploadState.extractionStats && typeof uploadState.extractionStats === "object" ? uploadState.extractionStats : {};
        const pageCount = Number(stats.pageCount || 0);
        const characterCount = Number(stats.characterCount || 0) || markdown.length;
        const extractedLineCount = Number(stats.lineCount || 0) || lineCount;
        const parts = [
          String(characterCount) + " chars",
          String(extractedLineCount) + " lines"
        ];
        if (pageCount > 0) parts.unshift(String(pageCount) + " page" + (pageCount === 1 ? "" : "s"));
        const confidence = cleanString(uploadState.confidence);
        if (confidence) parts.push("confidence: " + confidence);
        const warnings = Array.isArray(uploadState.warnings) ? uploadState.warnings.filter(Boolean) : [];
        const source = cleanString(stats.source);
        if (source) parts.push(source);
        const plainTextCharacterCount = Number(stats.plainTextCharacterCount || 0);
        const markdownCharacterCount = Number(stats.markdownCharacterCount || 0);
        if (plainTextCharacterCount > 0) parts.push(String(plainTextCharacterCount) + " raw chars");
        if (markdownCharacterCount > 0) parts.push(String(markdownCharacterCount) + " Markdown chars");
        if (warnings.length) parts.push(String(warnings.length) + " warning" + (warnings.length === 1 ? "" : "s"));
        uploadResumeMarkdownMetaEl.textContent = parts.join(" · ");
      }
    }
    if (uploadResumeCopyMarkdownBtn) {
      uploadResumeCopyMarkdownBtn.disabled = !cleanString(uploadState.markdown);
    }
    if (uploadResumeLogEl) {
      uploadResumeLogEl.innerHTML = "";
      const rows = Array.isArray(uploadState.log) ? uploadState.log : [];
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "upload-resume-log-empty";
        empty.textContent = "Import progress will appear here.";
        uploadResumeLogEl.appendChild(empty);
      } else {
        rows.forEach(function renderLogRow(row) {
          const item = document.createElement("div");
          item.className = "upload-resume-log-item";
          item.textContent = cleanString(row);
          uploadResumeLogEl.appendChild(item);
        });
        uploadResumeLogEl.scrollTop = uploadResumeLogEl.scrollHeight;
      }
    }
    if (uploadResumeFileInputEl) {
      uploadResumeFileInputEl.disabled = Boolean(uploadState.running);
    }
    const isActive = Boolean(uploadState.running) || Boolean(uploadState.awaitingPastedText);
    if (uploadResumeCancelBtn) {
      uploadResumeCancelBtn.disabled = !isActive;
      uploadResumeCancelBtn.classList.toggle("hidden", Boolean(uploadState.completed || uploadState.error) && !isActive);
    }
    if (uploadResumeDoneBtn) {
      uploadResumeDoneBtn.classList.toggle("hidden", isActive || (!uploadState.completed && !uploadState.error));
    }
    if (uploadResumeCloseBtn) {
      uploadResumeCloseBtn.disabled = Boolean(uploadState.running);
    }
  }

  function resetUploadResumeState() {
    releasePdfPreviewDoc();
    state.uploadResume = {
      open: true,
      running: false,
      completed: false,
      cancelled: false,
      step: "Choose a PDF resume to start importing.",
      error: "",
      log: [],
      markdown: "",
      plainText: "",
      warnings: [],
      confidence: "",
      extractionStats: {
        source: "",
        pageCount: 0,
        plainTextCharacterCount: 0,
        plainTextLineCount: 0,
        markdownCharacterCount: 0,
        characterCount: 0,
        lineCount: 0
      },
      pdfPreviewStatus: "",
      pdfPageCount: 0,
      pdfCurrentPage: 1,
      qualityReport: null,
      awaitingPastedText: false,
      lastSectionId: "",
      lastEntryId: "",
      importChecklist: null,
      auditMissingItems: [],
      auditAttempts: 0,
      importedSteps: 0,
      progress: []
    };
  }

  function openUploadResumeModal() {
    resetUploadResumeState();
    if (uploadResumeFileInputEl) {
      uploadResumeFileInputEl.value = "";
    }
    renderUploadResumeModal();
  }

  function closeUploadResumeModal() {
    const uploadState = getUploadResumeState();
    if (uploadState.running) return;
    uploadState.open = false;
    releasePdfPreviewDoc();
    renderUploadResumeModal();
  }

  function setUploadResumeStep(message) {
    const uploadState = getUploadResumeState();
    uploadState.step = cleanString(message);
    renderUploadResumeModal();
  }

  function setUploadResumeError(message) {
    const uploadState = getUploadResumeState();
    uploadState.running = false;
    uploadState.completed = false;
    uploadState.error = cleanString(message);
    uploadState.step = cleanString(message);
    renderUploadResumeModal();
  }

  function addUploadResumeLog(message) {
    const uploadState = getUploadResumeState();
    const text = cleanString(message);
    if (text) {
      uploadState.log.push(text);
    }
    renderUploadResumeModal();
  }

  function isUploadResumeCancelled() {
    const uploadState = getUploadResumeState();
    return Boolean(uploadState.cancelled || !uploadState.open);
  }

  let _pdfPreviewDoc = null;

  function releasePdfPreviewDoc() {
    if (_pdfPreviewDoc) {
      try { _pdfPreviewDoc.destroy(); } catch { /* The preview may already be destroyed. */ }
      _pdfPreviewDoc = null;
    }
  }

  async function renderPdfPageInModal(pageNum) {
    if (!_pdfPreviewDoc || !uploadResumePdfCanvasContainerEl) return;
    const uploadState = getUploadResumeState();
    const totalPages = _pdfPreviewDoc.numPages;
    const safePageNum = Math.min(Math.max(1, pageNum), totalPages);
    uploadState.pdfCurrentPage = safePageNum;

    const page = await _pdfPreviewDoc.getPage(safePageNum);
    const containerWidth = uploadResumePdfCanvasContainerEl.clientWidth || 600;
    const nativeViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, Math.max(0.5, (containerWidth - 16) / nativeViewport.width));
    const viewport = page.getViewport({ scale });

    let canvas = uploadResumePdfCanvasContainerEl.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      uploadResumePdfCanvasContainerEl.appendChild(canvas);
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    renderUploadResumeModal();
  }

  async function renderPdfPreviewInModal(file) {
    const uploadState = getUploadResumeState();
    releasePdfPreviewDoc();
    if (uploadResumePdfCanvasContainerEl) {
      const old = uploadResumePdfCanvasContainerEl.querySelector("canvas");
      if (old) old.remove();
    }
    uploadState.pdfPreviewStatus = "rendering";
    uploadState.pdfCurrentPage = 1;
    uploadState.pdfPageCount = 0;
    renderUploadResumeModal();

    const pdfjs = globalThis.pdfjsLib || globalThis.pdfjsDistBuildPdf || globalThis["pdfjs-dist/build/pdf"];
    if (!pdfjs || typeof pdfjs.getDocument !== "function") {
      uploadState.pdfPreviewStatus = "failed";
      renderUploadResumeModal();
      return;
    }
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "";
    }
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: buffer.slice(0),
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false
    });
    _pdfPreviewDoc = await loadingTask.promise;
    uploadState.pdfPageCount = _pdfPreviewDoc.numPages;
    uploadState.pdfPreviewStatus = "rendered";
    if (uploadResumePdfPlaceholderEl) uploadResumePdfPlaceholderEl.hidden = true;
    await renderPdfPageInModal(1);
  }

  function getExtractionQualityReport(text) {
    const normalized = normalizeExtractedPdfText(text);
    const characterCount = normalized.length;
    const lines = normalized.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    const lineCount = lines.length;
    const words = normalized.match(/[A-Za-z0-9][A-Za-z0-9+.#/@'-]{1,}/g) || [];
    const wordLikeTokenCount = words.length;
    const avgLen = wordLikeTokenCount ? words.reduce(function(s, w) { return s + w.length; }, 0) / wordLikeTokenCount : 0;
    const replacementCharCount = (normalized.match(/�/g) || []).length;
    const totalChars = normalized.length || 1;
    const printableAsciiCount = (normalized.match(/[\x20-\x7E]/g) || []).length;
    const asciiPrintableRatio = printableAsciiCount / totalChars;
    // eslint-disable-next-line no-control-regex -- Tabs and line endings are valid extracted text, not corruption.
    const suspiciousChars = (normalized.match(/[^\x09\x0A\x0D\x20-\x7E\u00A0-ɏ‐-‧‰-⁯]/g) || []).length;
    const suspiciousCharacterRatio = suspiciousChars / totalChars;
    const symbolOnlyWords = (normalized.match(/[^A-Za-z0-9\s]{3,}/g) || []).length;
    const repeatedSymbolRatio = totalChars ? symbolOnlyWords * 4 / totalChars : 0;
    const shortLines = lines.filter(function(l) { return l.length <= 4; });
    const shortLineRatio = lineCount ? shortLines.length / lineCount : 0;
    const resumeHeadings = /\b(education|experience|work|project|skill|research|award|leadership|summary|objective|certification)\b/i.test(normalized);
    const reasons = [];

    if (characterCount < 200) reasons.push("character count too low (" + characterCount + " < 200)");
    if (lineCount < 5) reasons.push("line count too low (" + lineCount + " < 5)");
    if (wordLikeTokenCount < 30) reasons.push("word count too low (" + wordLikeTokenCount + " < 30)");
    if (replacementCharCount > 5) reasons.push("too many replacement characters (" + replacementCharCount + ")");
    if (suspiciousCharacterRatio > 0.15) reasons.push("high suspicious character ratio (" + suspiciousCharacterRatio.toFixed(2) + ")");
    if (asciiPrintableRatio < 0.6) reasons.push("low ASCII printable ratio (" + asciiPrintableRatio.toFixed(2) + ")");
    if (avgLen > 0 && avgLen < 2.5) reasons.push("average word length too short (" + avgLen.toFixed(1) + ")");
    if (shortLineRatio > 0.6 && wordLikeTokenCount < 60) reasons.push("too many short lines with low word count");
    if (repeatedSymbolRatio > 0.2) reasons.push("text dominated by repeated symbols");

    let quality;
    if (reasons.length === 0 && !detectCorruptedExtraction(normalized)) {
      quality = "good";
    } else if (reasons.length >= 3 || suspiciousCharacterRatio > 0.3 || replacementCharCount > 20 || asciiPrintableRatio < 0.4) {
      quality = "garbled";
    } else {
      quality = "poor";
    }

    if (quality !== "good" && resumeHeadings && wordLikeTokenCount >= 30 && characterCount >= 200) {
      quality = "poor";
    }

    return {
      characterCount,
      lineCount,
      wordLikeTokenCount,
      averageTokenLength: avgLen,
      suspiciousCharacterRatio,
      replacementCharacterCount: replacementCharCount,
      asciiPrintableRatio,
      repeatedSymbolRatio,
      shortLineRatio,
      hasCommonResumeHeadings: resumeHeadings,
      quality,
      reasons
    };
  }

  function bytesToBinaryString(bytes) {
    const chunks = [];
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
    }
    return chunks.join("");
  }

  function decodePdfLiteralString(input) {
    const text = String(input || "");
    let output = "";
    for (let index = 0; index < text.length; index += 1) {
      const ch = text[index];
      if (ch !== "\\") {
        output += ch;
        continue;
      }
      index += 1;
      const escaped = text[index] || "";
      if (escaped === "n") output += "\n";
      else if (escaped === "r") output += "\r";
      else if (escaped === "t") output += "\t";
      else if (escaped === "b") output += "\b";
      else if (escaped === "f") output += "\f";
      else if (escaped === "(" || escaped === ")" || escaped === "\\") output += escaped;
      else if (/[0-7]/.test(escaped)) {
        let octal = escaped;
        for (let count = 0; count < 2 && /[0-7]/.test(text[index + 1] || ""); count += 1) {
          index += 1;
          octal += text[index];
        }
        output += String.fromCharCode(parseInt(octal, 8));
      } else if (escaped === "\n" || escaped === "\r") {
        if (escaped === "\r" && text[index + 1] === "\n") index += 1;
      } else {
        output += escaped;
      }
    }
    return output;
  }

  function decodePdfHexString(hexInput) {
    let hex = cleanString(hexInput).replace(/[^0-9a-fA-F]/g, "");
    if (!hex) return "";
    if (hex.length % 2 === 1) hex += "0";
    const bytes = [];
    for (let index = 0; index < hex.length; index += 2) {
      bytes.push(parseInt(hex.slice(index, index + 2), 16));
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      let output = "";
      for (let index = 2; index + 1 < bytes.length; index += 2) {
        output += String.fromCharCode((bytes[index] << 8) + bytes[index + 1]);
      }
      return output;
    }
    try {
      return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    } catch {
      return String.fromCharCode.apply(null, bytes);
    }
  }

  function extractPdfStringsFromContent(content) {
    const source = String(content || "");
    const textSections = source.match(/BT[\s\S]*?ET/g) || [source];
    const output = [];
    textSections.forEach(function parseSection(section) {
      const literalRegex = /\((?:\\.|[^\\()])*\)/g;
      let literalMatch;
      while ((literalMatch = literalRegex.exec(section))) {
        const decoded = decodePdfLiteralString(literalMatch[0].slice(1, -1));
        if (cleanString(decoded)) output.push(decoded);
      }
      const hexRegex = /<([0-9a-fA-F\s]+)>/g;
      let hexMatch;
      while ((hexMatch = hexRegex.exec(section))) {
        const decoded = decodePdfHexString(hexMatch[1]);
        if (cleanString(decoded)) output.push(decoded);
      }
    });
    return output.join("\n");
  }

  async function inflatePdfStreamBytes(bytes) {
    if (!globalThis.DecompressionStream) {
      return null;
    }
    const formats = ["deflate", "deflate-raw"];
    for (let index = 0; index < formats.length; index += 1) {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(formats[index]));
        const buffer = await new Response(stream).arrayBuffer();
        if (buffer && buffer.byteLength) {
          return new Uint8Array(buffer);
        }
      } catch {
        // Try the next supported compression format.
      }
    }
    return null;
  }

  function normalizeExtractedPdfText(value) {
    return String(value || "")
      // eslint-disable-next-line no-control-regex -- Remove embedded NUL characters from extracted PDF text.
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function countPdfTextLines(value) {
    return normalizeExtractedPdfText(value).split(/\r?\n/).map(cleanString).filter(Boolean).length;
  }

  function estimatePdfPageCount(binary) {
    const matches = String(binary || "").match(/\/Type\s*\/Page\b/g);
    return matches && matches.length ? matches.length : 0;
  }

  function buildPdfExtractionResult(text, pageCount, source, error) {
    const normalized = normalizeExtractedPdfText(text);
    return {
      ok: Boolean(normalized),
      text: normalized,
      plainText: normalized,
      pageCount: Number(pageCount || 0),
      characterCount: normalized.length,
      lineCount: countPdfTextLines(normalized),
      warnings: [],
      source: cleanString(source),
      error: cleanString(error)
    };
  }

  function normalizePdfTextItems(items) {
    const list = Array.isArray(items) ? items : [];
    const rows = [];
    list.forEach(function collectItem(item) {
      const text = cleanString(item && item.str);
      if (!text) return;
      const transform = Array.isArray(item && item.transform) ? item.transform : [];
      const x = Number(transform[4] || 0);
      const y = Number(transform[5] || 0);
      let row = rows.find(function findRow(candidate) {
        return Math.abs(candidate.y - y) <= 4;
      });
      if (!row) {
        row = { y: y, items: [] };
        rows.push(row);
      }
      row.items.push({ x: x, text: text });
    });
    return rows
      .sort(function sortRows(a, b) { return b.y - a.y; })
      .map(function mapRow(row) {
        return row.items
          .sort(function sortItems(a, b) { return a.x - b.x; })
          .map(function mapItem(item) { return item.text; })
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      })
      .filter(Boolean)
      .join("\n");
  }

  async function extractPdfTextWithPdfJs(arrayBuffer) {
    const pdfjs = globalThis.pdfjsLib || globalThis.pdfjsDistBuildPdf || globalThis["pdfjs-dist/build/pdf"];
    if (!pdfjs || typeof pdfjs.getDocument !== "function") {
      return null;
    }
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "";
    }
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer.slice(0),
      disableWorker: true,
      useWorkerFetch: false,
      isEvalSupported: false
    });
    const doc = await loadingTask.promise;
    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const items = Array.isArray(textContent && textContent.items) ? textContent.items : [];
      pageTexts.push(normalizePdfTextItems(items));
    }
    return buildPdfExtractionResult(pageTexts.join("\n\n"), doc.numPages, "pdfjs", "");
  }

  async function extractPdfTextFromArrayBuffer(arrayBuffer) {
    try {
      const pdfJsResult = await extractPdfTextWithPdfJs(arrayBuffer);
      if (pdfJsResult && pdfJsResult.ok) {
        return pdfJsResult;
      }
    } catch {
      // Fall back to the embedded PDF stream extractor.
    }

    const bytes = new Uint8Array(arrayBuffer);
    const binary = bytesToBinaryString(bytes);
    const pieces = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(binary))) {
      const streamStart = match.index;
      const dictStart = Math.max(0, streamStart - 800);
      const dict = binary.slice(dictStart, streamStart);
      const streamText = match[1] || "";
      let content = "";
      if (/\/FlateDecode\b/.test(dict)) {
        const inflated = await inflatePdfStreamBytes(new Uint8Array(Array.from(streamText, function(ch) {
          return ch.charCodeAt(0) & 255;
        })));
        if (inflated) {
          content = bytesToBinaryString(inflated);
        }
      } else {
        content = streamText;
      }
      const extracted = extractPdfStringsFromContent(content);
      if (cleanString(extracted)) {
        pieces.push(extracted);
      }
    }
    const wholePdfText = extractPdfStringsFromContent(binary);
    if (cleanString(wholePdfText)) {
      pieces.push(wholePdfText);
    }
    const text = uniqueStringArray(pieces.join("\n").split(/\n+/))
      .join("\n")
      .replace(/[ \t]+/g, " ");
    return buildPdfExtractionResult(text, estimatePdfPageCount(binary), "fallback", "");
  }

  async function extractTextFromPdfFile(file) {
    const buffer = await file.arrayBuffer();
    const result = await extractPdfTextFromArrayBuffer(buffer);
    const plainText = normalizeExtractedPdfText(cleanString(result && (result.plainText || result.text)));
    return {
      plainText: plainText,
      pageCount: Number(result && result.pageCount || 0),
      characterCount: plainText.length,
      lineCount: countPdfTextLines(plainText),
      warnings: Array.isArray(result && result.warnings) ? result.warnings.map(cleanString).filter(Boolean) : []
    };
  }

  function detectCorruptedExtraction(value) {
    const text = cleanString(value);
    if (!text) return true;
    const lower = text.toLowerCase();
    const badPhrases = [
      "[section present but content corrupted]",
      "[content appears to be corrupted]",
      "no readable text found",
      "placeholder text",
      "content corrupted",
      "appears to be corrupted"
    ];
    if (badPhrases.some(function hasBadPhrase(phrase) { return lower.indexOf(phrase) !== -1; })) {
      return true;
    }
    const bracketedPlaceholderCount = (text.match(/\[[^\]]*(corrupt|placeholder|unreadable|not readable|no readable)[^\]]*\]/gi) || []).length;
    const nonEmptyLineCount = text.split(/\r?\n/).map(cleanString).filter(Boolean).length;
    if (bracketedPlaceholderCount >= 2 && bracketedPlaceholderCount >= Math.max(1, Math.floor(nonEmptyLineCount / 3))) {
      return true;
    }
    const meaningfulWords = (text.match(/[A-Za-z][A-Za-z0-9+.#-]{2,}/g) || []).filter(function keepWord(word) {
      return !/^(section|content|corrupted|placeholder|readable|found|unknown|unreadable)$/i.test(word);
    });
    return meaningfulWords.length < 8;
  }

  function isReadableExtractedText(text) {
    const normalized = normalizeExtractedPdfText(text);
    if (!normalized) return false;
    if (normalized.length < 200) return false;
    if (countPdfTextLines(normalized) < 5) return false;
    if (detectCorruptedExtraction(normalized)) return false;
    const words = normalized.match(/[A-Za-z0-9][A-Za-z0-9+.#/@-]{2,}/g) || [];
    if (words.length < 30) return false;
    const brokenFragments = words.filter(function isFragment(word) {
      return word.length <= 3 && !/\d/.test(word);
    }).length;
    if (words.length && brokenFragments / words.length > 0.65) return false;
    const sectionLikeLines = normalized.split(/\r?\n/).map(cleanString).filter(Boolean).filter(function isSectionLike(line) {
      return line.length <= 40 && /^[A-Z][A-Za-z &/,-]+$/.test(line) && !/[.!?:]$/.test(line);
    }).length;
    const lineCount = countPdfTextLines(normalized);
    return !(lineCount > 0 && sectionLikeLines / lineCount > 0.75);
  }

  function isMarkdownUsable(markdown, plainText) {
    const cleanMarkdown = cleanString(markdown);
    if (!cleanMarkdown) return false;
    if (detectCorruptedExtraction(cleanMarkdown)) return false;
    const words = cleanMarkdown.match(/[A-Za-z0-9][A-Za-z0-9+.#/@-]{2,}/g) || [];
    if (words.length < 20) return false;
    const errorWords = (cleanMarkdown.match(/\b(error|failed|unable|cannot|can't|placeholder|corrupted|unreadable)\b/gi) || []).length;
    if (words.length && errorWords / words.length > 0.2) return false;
    const contentLines = cleanMarkdown.split(/\r?\n/).map(cleanString).filter(Boolean).filter(function(line) {
      return !/^#{1,6}\s+\S/.test(line);
    });
    const rawContentLines = cleanString(plainText).split(/\r?\n/).map(cleanString).filter(Boolean).filter(function(line) {
      return !isPlainSectionHeading(line);
    });
    if (rawContentLines.length > 3 && contentLines.length < 3) return false;
    return true;
  }

  async function convertExtractedTextToMarkdownWithAI(text, provider, fileName, retryReason) {
    if (!api || typeof api.extractResumeMarkdownFromText !== "function") {
      throw new Error("The extracted Markdown is not usable. Please upload a clearer text-based PDF.");
    }
    return await api.extractResumeMarkdownFromText({
      fileName: fileName,
      pdfText: text,
      settings: getAiSettings(),
      provider: provider,
      retryReason: retryReason
    });
  }

  async function runUploadResumeAiStageWithRetries(options) {
    const opts = options && typeof options === "object" ? options : {};
    const maxAttempts = Number(opts.maxAttempts || MAX_UPLOAD_RESUME_AI_ATTEMPTS);
    let lastReason = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (typeof opts.onAttempt === "function") {
        opts.onAttempt(attempt, maxAttempts, lastReason);
      }
      let result;
      try {
        result = await opts.run(attempt, lastReason);
      } catch (error) {
        lastReason = cleanString(error instanceof Error ? error.message : String(error)) || "AI request failed.";
        result = null;
      }
      const validation = typeof opts.validate === "function"
        ? opts.validate(result)
        : { ok: Boolean(result) };
      if (validation && validation.ok) {
        return validation.value !== undefined ? validation.value : result;
      }
      lastReason = cleanString(validation && validation.message) || lastReason || "AI response was invalid.";
      if (attempt < maxAttempts && typeof opts.onRetry === "function") {
        opts.onRetry(attempt + 1, maxAttempts, lastReason);
      }
    }
    if (typeof opts.onFailure === "function") {
      opts.onFailure(lastReason);
    }
    throw new Error(cleanString(opts.failureMessage) || lastReason || "AI stage failed.");
  }

  async function extractMarkdownFromUploadedPdf(file) {
    if (!hasAiProvider()) {
      throw new Error("PDF resume upload is unavailable because no model provider is configured.");
    }
    const capabilities = getUploadResumeProviderCapabilities();
    const providerName = cleanString(capabilities.provider).toLowerCase();
    let plainText = "";
    let extractionSource;
    let plainTextStats;
    let combinedWarnings;

    if (capabilities.supportsDirectPdfTextExtraction) {
      if (!api || typeof api.extractResumePlainTextFromPdf !== "function") {
        throw new Error("The current AI provider does not support direct PDF text extraction.");
      }
      setUploadResumeStep("Reading PDF file...");
      addUploadResumeLog("Reading PDF file...");
      const buffer = await file.arrayBuffer();
      if (isUploadResumeCancelled()) return null;

      setUploadResumeStep("Sending PDF to AI for text extraction...");
      addUploadResumeLog("Sending PDF to AI for text extraction...");
      const plainTextResult = await api.extractResumePlainTextFromPdf({
        fileName: file.name,
        pdfBase64: bytesToBase64(new Uint8Array(buffer)),
        settings: getAiSettings()
      });
      if (!plainTextResult || plainTextResult.ok !== true) {
        if (cleanString(plainTextResult && plainTextResult.code) === "PDF_INPUT_UNSUPPORTED") {
          throw new Error("The current AI provider does not support direct PDF text extraction.");
        }
        if (cleanString(plainTextResult && plainTextResult.code) === "MODEL_JSON_PARSE_FAILED") {
          throw new Error("The AI returned an invalid extraction result.");
        }
        throw new Error("The AI could not extract readable text from this PDF.");
      }
      plainText = normalizeExtractedPdfText(plainTextResult.plainText);
      if (!isReadableExtractedText(plainText)) {
        throw new Error("The AI could not extract readable text from this PDF.");
      }
      extractionSource = "OpenAI direct PDF text extraction";
      plainTextStats = {
        pageCount: 0,
        characterCount: plainText.length,
        lineCount: countPdfTextLines(plainText)
      };
      combinedWarnings = Array.isArray(plainTextResult.warnings) ? plainTextResult.warnings.map(cleanString).filter(Boolean) : [];
      addUploadResumeLog("Raw text extracted.");
    } else {
      setUploadResumeStep("Reading PDF locally...");
      addUploadResumeLog("Reading PDF locally...");
      setUploadResumeStep("Extracting embedded PDF text...");
      addUploadResumeLog("Extracting embedded PDF text...");
      const localResult = await extractTextFromPdfFile(file);
      if (isUploadResumeCancelled()) return null;
      plainText = normalizeExtractedPdfText(localResult && localResult.plainText);
      if (!isReadableExtractedText(plainText)) {
        throw new Error("No readable embedded text was found in this PDF. It may be scanned or image-based. Please upload a text-based PDF.");
      }
      extractionSource = providerName === "minimax"
        ? "Local PDF text extraction + MiniMax Markdown cleanup"
        : "Local PDF text extraction + AI Markdown cleanup";
      plainTextStats = {
        pageCount: Number(localResult && localResult.pageCount || 0),
        characterCount: Number(localResult && localResult.characterCount || plainText.length),
        lineCount: Number(localResult && localResult.lineCount || countPdfTextLines(plainText))
      };
      combinedWarnings = Array.isArray(localResult && localResult.warnings) ? localResult.warnings.map(cleanString).filter(Boolean) : [];
      addUploadResumeLog("Extracted text from PDF.");
    }

    const uploadState = getUploadResumeState();
    uploadState.plainText = plainText;
    uploadState.confidence = "";
    uploadState.warnings = combinedWarnings;
    uploadState.extractionStats = {
      source: extractionSource,
      pageCount: Number(plainTextStats && plainTextStats.pageCount || 0),
      plainTextCharacterCount: plainText.length,
      plainTextLineCount: countPdfTextLines(plainText),
      markdownCharacterCount: 0,
      characterCount: Number(plainTextStats && plainTextStats.characterCount || plainText.length),
      lineCount: Number(plainTextStats && plainTextStats.lineCount || countPdfTextLines(plainText))
    };
    if (plainTextStats) {
      addUploadResumeLog(
        "Extracted " +
        String(uploadState.extractionStats.characterCount) +
        " characters across " +
        String(uploadState.extractionStats.lineCount) +
        " lines" +
        (uploadState.extractionStats.pageCount ? " from " + String(uploadState.extractionStats.pageCount) + " page" + (uploadState.extractionStats.pageCount === 1 ? "" : "s") : "") +
        "."
      );
    }
    if (uploadState.warnings.length) {
      uploadState.warnings.forEach(function(warning) {
        addUploadResumeLog("Extraction warning: " + warning);
      });
    }

    const markdownCleanupMessage = providerName === "minimax"
      ? "Converting extracted text to Markdown with MiniMax..."
      : "Converting extracted text to Markdown...";
    const cleanupResult = await runUploadResumeAiStageWithRetries({
      label: "Markdown cleanup",
      failureMessage: "Failed to convert extracted text into usable Markdown after 3 attempts.",
      onAttempt: function(attempt, total) {
        const message = markdownCleanupMessage + " attempt " + String(attempt) + " of " + String(total);
        setUploadResumeStep(message);
        addUploadResumeLog(message);
      },
      onRetry: function(nextAttempt, total, reason) {
        addUploadResumeLog("Markdown cleanup returned invalid result. Retrying... attempt " + String(nextAttempt) + " of " + String(total) + (reason ? " (" + reason + ")" : ""));
      },
      run: function(attempt, retryReason) {
        return convertExtractedTextToMarkdownWithAI(plainText, providerName, file.name, attempt > 1 ? retryReason : "");
      },
      validate: function(result) {
        if (!result || result.ok !== true) {
          return { ok: false, message: cleanString(result && result.error) || "AI call failed." };
        }
        if (!cleanString(result.markdown)) {
          return { ok: false, message: "markdown was missing." };
        }
        if (!isMarkdownUsable(result.markdown, plainText)) {
          return { ok: false, message: "markdown failed validation." };
        }
        return { ok: true, value: result };
      }
    });
    uploadState.markdown = cleanString(cleanupResult.markdown);
    uploadState.confidence = cleanString(cleanupResult.confidence) || uploadState.confidence;
    uploadState.warnings = uploadState.warnings.concat(Array.isArray(cleanupResult.warnings) ? cleanupResult.warnings : []);
    uploadState.extractionStats.source = extractionSource;
    uploadState.extractionStats.markdownCharacterCount = uploadState.markdown.length;
    uploadState.extractionStats.characterCount = uploadState.markdown.length;
    uploadState.extractionStats.lineCount = countPdfTextLines(uploadState.markdown);
    addUploadResumeLog("Markdown extracted.");
    if (uploadState.confidence) {
      addUploadResumeLog("Extraction confidence: " + uploadState.confidence + ".");
    }
    if (uploadState.confidence.toLowerCase() === "low") {
      addUploadResumeLog("Resume extraction confidence is low. Please review imported content in Manual Mode.");
    }
    if (uploadState.warnings.length) {
      uploadState.warnings.forEach(function(warning) {
        addUploadResumeLog("Extraction warning: " + warning);
      });
    }
    return uploadState.markdown;
  }

  function normalizeImportComparable(value) {
    return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function importTextMatches(left, right) {
    const a = normalizeImportComparable(left);
    const b = normalizeImportComparable(right);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  function isPlaceholderResumeText(value) {
    const raw = cleanString(value);
    const comparable = normalizeImportComparable(raw);
    if (!comparable) return false;
    if (/^your name$|^name$|^full name$/.test(comparable)) return true;
    if (/^phone number$|^phone$|^email address$|^email$|^city state$/.test(comparable)) return true;
    if (/^month year$|^month year month year$|^month year present$/.test(comparable)) return true;
    if (/^company name$|^organization name$|^position title$|^job title$/.test(comparable)) return true;
    if (/^describe what you did$|^add details here$/.test(comparable)) return true;
    if (/\blorem ipsum\b/i.test(raw)) return true;
    if (/volunteer\s*\([^)]*position title[^)]*\)/i.test(raw)) return true;
    if (/^(month year)\s*[-–—]\s*(month year)$/i.test(raw)) return true;
    if (/^\[?(your\s+)?(name|phone number|email address|city,\s*state|company name|organization name|position title|job title)\]?$/i.test(raw)) return true;
    if (/^(describe|add|list|include)\b.*\b(details|experience|responsibilities|achievements|accomplishments)\b/i.test(raw)) return true;
    return false;
  }

  function isMarkdownHeading(line) {
    return /^#{1,4}\s+\S/.test(cleanString(line));
  }

  function isPlainSectionHeading(line) {
    const text = stripMarkdownLine(line);
    return Boolean(text && text.length <= 64 && isLikelyResumeSectionHeading(text) && !isBulletMarkdownLine(line) && !/[.!?]$/.test(text));
  }

  function markdownHeadingText(line) {
    return cleanString(line).replace(/^#{1,4}\s+/, "").replace(/[*_`]/g, "").trim();
  }

  function stripMarkdownLine(value) {
    return cleanString(value)
      .replace(/^[-*•]\s+/, "")
      .replace(/^#+\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/__/g, "")
      .replace(/`/g, "")
      .trim();
  }

  function isBulletMarkdownLine(value) {
    return /^[-*•]\s+\S/.test(cleanString(value));
  }

  function isLikelyDateLine(value) {
    const text = cleanString(value);
    return /\b(19|20)\d{2}\b/.test(text) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(text) || /\bpresent\b/i.test(text);
  }

  function isLikelySkillSection(name) {
    return /\b(skill|technical|technology|tools|languages|certification|certifications)\b/i.test(cleanString(name));
  }

  function isLikelyResumeSectionHeading(name) {
    return /\b(education|experience|employment|work|professional|project|skills?|technical|research|leadership|activities|awards?|honors?|publications?|certifications?|summary|objective|volunteer|teaching|coursework)\b/i.test(cleanString(name));
  }

  function createChecklistEntry(title) {
    return {
      title: cleanString(title),
      date: "",
      subtitle: "",
      bulletCount: 0,
      paragraphCount: 0,
      bullets: [],
      paragraphs: []
    };
  }

  function createMarkdownContentUnit(idNumber, type, text) {
    const cleanText = cleanString(text);
    const isPlaceholder = isPlaceholderResumeText(cleanText);
    return {
      id: "unit_" + String(idNumber),
      type: cleanString(type) || "paragraph",
      text: cleanText,
      status: isPlaceholder ? "skipped" : "pending",
      reason: isPlaceholder ? "placeholder/template text" : ""
    };
  }

  function addMarkdownContentUnit(contentUnits, type, text) {
    const cleanText = cleanString(text);
    if (!cleanText) return null;
    const unit = createMarkdownContentUnit(contentUnits.length + 1, type, cleanText);
    contentUnits.push(unit);
    return unit;
  }

  function parseSectionEntries(sectionName, rawLines) {
    const lines = rawLines.map(stripMarkdownLine).filter(function keepLine(line) {
      return Boolean(cleanString(line)) && !isPlaceholderResumeText(line);
    });
    if (isLikelySkillSection(sectionName)) {
      return lines.length ? [{
        title: cleanString(sectionName),
        date: "",
        subtitle: "",
        bulletCount: 0,
        paragraphCount: lines.length,
        bullets: [],
        paragraphs: lines
      }] : [];
    }

    const entries = [];
    let current = null;
    rawLines.forEach(function parseLine(rawLine) {
      const text = stripMarkdownLine(rawLine);
      if (!text) return;
      if (isPlaceholderResumeText(text)) return;
      if (isBulletMarkdownLine(rawLine)) {
        if (!current) {
          current = createChecklistEntry(cleanString(sectionName));
        }
        current.bulletCount += 1;
        current.bullets.push(text);
        return;
      }
      if (!current) {
        current = createChecklistEntry(text);
        entries.push(current);
        return;
      }
      if (!current.date && isLikelyDateLine(text)) {
        current.date = text;
        return;
      }
      if (!current.subtitle && current.bulletCount === 0 && current.paragraphCount < 1) {
        current.subtitle = text;
        return;
      }
      if (current.bulletCount > 0 || current.paragraphCount > 0 || current.subtitle) {
        current = createChecklistEntry(text);
        entries.push(current);
        return;
      }
      current.paragraphCount += 1;
      current.paragraphs.push(text);
    });

    return entries.filter(function keepEntry(entry) {
      return cleanString(entry.title) || cleanString(entry.subtitle) || cleanString(entry.date) || entry.bulletCount || entry.paragraphCount;
    });
  }

  function analyzeMarkdownImportChecklist(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const contactDetected = [];
    const sections = [];
    const contentUnits = [];
    let currentSection = null;
    let currentSectionName = "";
    let currentEntrySeen = false;
    let currentEntryHasSubtitle = false;
    let firstHeadingSeen = false;

    function addContact(key) {
      if (contactDetected.indexOf(key) === -1) contactDetected.push(key);
    }

    lines.forEach(function scanContact(line) {
      const text = stripMarkdownLine(line);
      if (!text) return;
      if (isPlaceholderResumeText(text)) return;
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) addContact("email");
      if (/\+?\d[\d\s().-]{7,}\d/.test(text)) addContact("phone");
      if (/linkedin|github|portfolio|https?:\/\/|www\./i.test(text)) addContact("links");
      if (/\b[A-Z][a-z]+,\s*[A-Z]{2}\b|\b(remote|united states|usa|new york|chicago|san francisco|seattle|boston|austin|los angeles)\b/i.test(text)) addContact("location");
    });

    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      if (isMarkdownHeading(raw) || isPlainSectionHeading(raw)) {
        const heading = isMarkdownHeading(raw) ? markdownHeadingText(raw) : stripMarkdownLine(raw);
        const isFirstLikelyName = !firstHeadingSeen && !isLikelyResumeSectionHeading(heading) && heading.split(/\s+/).length <= 5;
        firstHeadingSeen = true;
        if (isFirstLikelyName) {
          if (!isPlaceholderResumeText(heading)) {
            addContact("name");
            addMarkdownContentUnit(contentUnits, "contact", heading);
          } else {
            addMarkdownContentUnit(contentUnits, "contact", heading);
          }
          currentSection = null;
          currentSectionName = "";
          currentEntrySeen = false;
          currentEntryHasSubtitle = false;
          continue;
        }
        if (isPlaceholderResumeText(heading)) {
          addMarkdownContentUnit(contentUnits, "section", heading);
          currentSection = null;
          currentSectionName = "";
          currentEntrySeen = false;
          currentEntryHasSubtitle = false;
          continue;
        }
        addMarkdownContentUnit(contentUnits, "section", heading);
        currentSection = { name: heading, rawLines: [] };
        currentSectionName = heading;
        currentEntrySeen = false;
        currentEntryHasSubtitle = false;
        sections.push(currentSection);
        continue;
      }
      const text = stripMarkdownLine(raw);
      if (!text) continue;
      if (currentSection) {
        currentSection.rawLines.push(raw);
        if (isLikelySkillSection(currentSectionName)) {
          addMarkdownContentUnit(contentUnits, "skillsLine", text);
          continue;
        }
        if (isBulletMarkdownLine(raw)) {
          addMarkdownContentUnit(contentUnits, "bullet", text);
          continue;
        }
        if (!currentEntrySeen) {
          addMarkdownContentUnit(contentUnits, isLikelyDateLine(text) ? "entryTitleDate" : "entryTitle", text);
          currentEntrySeen = true;
          currentEntryHasSubtitle = false;
          continue;
        }
        if (isLikelyDateLine(text)) {
          addMarkdownContentUnit(contentUnits, "entryTitleDate", text);
          continue;
        }
        if (!currentEntryHasSubtitle) {
          addMarkdownContentUnit(contentUnits, "subtitle", text);
          currentEntryHasSubtitle = true;
          continue;
        }
        addMarkdownContentUnit(contentUnits, "paragraph", text);
      } else {
        addMarkdownContentUnit(contentUnits, /linkedin|github|portfolio|https?:\/\/|www\./i.test(text) ? "link" : "contact", text);
        if (text && !isPlaceholderResumeText(text) && !contactDetected.includes("name") && !text.includes("@") && !isLikelyDateLine(text) && text.split(/\s+/).length <= 5) {
          addContact("name");
        }
      }
    }

    const sectionsDetected = sections.map(function mapSection(section) {
      const entries = parseSectionEntries(section.name, section.rawLines);
      const bulletCount = entries.reduce(function(sum, entry) { return sum + Number(entry.bulletCount || 0); }, 0);
      const paragraphCount = entries.reduce(function(sum, entry) { return sum + Number(entry.paragraphCount || 0); }, 0);
      return {
        name: cleanString(section.name),
        entries: entries,
        bulletCount: bulletCount,
        paragraphCount: paragraphCount
      };
    }).filter(function keepSection(section) {
      return cleanString(section.name);
    });

    return {
      contactDetected: contactDetected,
      sectionsDetected: sectionsDetected,
      contentUnits: contentUnits
    };
  }

  function getChecklistContentUnits(checklist) {
    const safeChecklist = checklist && typeof checklist === "object" ? checklist : {};
    return Array.isArray(safeChecklist.contentUnits) ? safeChecklist.contentUnits : [];
  }

  function isPendingRealContentUnit(unit) {
    const safe = unit && typeof unit === "object" ? unit : {};
    return cleanString(safe.status) === "pending" && cleanString(safe.text) && !isPlaceholderResumeText(safe.text);
  }

  function getNextPendingContentUnit(checklist) {
    return getChecklistContentUnits(checklist).find(isPendingRealContentUnit) || null;
  }

  function getPendingContentUnitCount(checklist) {
    return getChecklistContentUnits(checklist).filter(isPendingRealContentUnit).length;
  }

  function describeImportContentUnit(unit) {
    const safe = unit && typeof unit === "object" ? unit : {};
    const text = cleanString(safe.text);
    const type = cleanString(safe.type);
    if (!text) return "next content unit";
    if (type === "section") return text + " section";
    if (type === "entryTitle") return text + " entry title";
    if (type === "entryTitleDate") return text + " title/date";
    if (type === "skillsLine") return text + " skills line";
    if (type === "bullet") return text + " bullet point";
    if (type === "link") return text + " link";
    if (type === "contact") return text + " contact information";
    return text;
  }

  function logSkippedPlaceholderUnits(checklist) {
    getChecklistContentUnits(checklist).forEach(function logSkipped(unit) {
      if (cleanString(unit && unit.status) === "skipped") {
        addUploadResumeLog("Skipped placeholder: " + cleanString(unit && unit.text) + ".");
      }
    });
  }

  function markNextPendingContentUnitImported(checklist) {
    const unit = getNextPendingContentUnit(checklist);
    if (!unit) return null;
    unit.status = "imported";
    return unit;
  }

  function getResumeSectionLineTexts(section) {
    const blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
    const lines = [];
    blocks.forEach(function eachBlock(block) {
      (Array.isArray(block && block.lines) ? block.lines : []).forEach(function eachLine(line) {
        const text = cleanString(line && line.text);
        if (text) lines.push({ type: cleanString(line && line.type), text: text });
      });
    });
    return lines;
  }

  function findResumeSectionForChecklist(resume, sectionName) {
    const sections = Array.isArray(resume && resume.sections) ? resume.sections : [];
    return sections.find(function findSection(section) {
      return importTextMatches(section && section.sectionName, sectionName);
    }) || null;
  }

  function validateImportCoverage(checklist, resume) {
    const safeChecklist = checklist && typeof checklist === "object" ? checklist : {};
    const remaining = [];
    getChecklistContentUnits(safeChecklist).forEach(function checkContentUnit(unit) {
      if (isPendingRealContentUnit(unit)) {
        remaining.push("pending content unit: " + describeImportContentUnit(unit));
      }
    });
    const contact = resume && resume.header && resume.header.contact && typeof resume.header.contact === "object" ? resume.header.contact : {};
    const detectedContact = Array.isArray(safeChecklist.contactDetected) ? safeChecklist.contactDetected : [];
    if (detectedContact.includes("email") && !cleanString(contact.email)) remaining.push("missing contact email");
    if (detectedContact.includes("phone") && !cleanString(contact.phone)) remaining.push("missing contact phone");
    if (detectedContact.includes("name") && !(cleanString(contact.firstName) || cleanString(contact.lastName))) remaining.push("missing contact name");
    if (detectedContact.includes("links") && !(Array.isArray(contact.links) && contact.links.some(function(link) { return cleanString(link && link.text); }))) {
      remaining.push("missing contact link");
    }

    const sectionsDetected = Array.isArray(safeChecklist.sectionsDetected) ? safeChecklist.sectionsDetected : [];
    sectionsDetected.forEach(function checkSection(sectionItem) {
      const sectionName = cleanString(sectionItem && sectionItem.name);
      if (!sectionName) return;
      const resumeSection = findResumeSectionForChecklist(resume, sectionName);
      if (!resumeSection) {
        remaining.push("missing section: " + sectionName);
        return;
      }
      const lineTexts = getResumeSectionLineTexts(resumeSection);
      const allText = lineTexts.map(function(line) { return line.text; }).join("\n");
      const expectedEntries = Array.isArray(sectionItem.entries) ? sectionItem.entries : [];
      expectedEntries.forEach(function checkEntry(entry) {
        const title = cleanString(entry && entry.title);
        if (title && !isLikelySkillSection(sectionName) && !importTextMatches(allText, title)) {
          remaining.push("missing entry: " + title + " in " + sectionName);
        }
      });
      const expectedBulletCount = Number(sectionItem.bulletCount || 0);
      const actualBulletCount = lineTexts.filter(function(line) { return line.type === "bullet" && cleanString(line.text); }).length;
      if (expectedBulletCount > actualBulletCount) {
        remaining.push("missing " + String(expectedBulletCount - actualBulletCount) + " bullet point(s) in " + sectionName);
      }
      if (isLikelySkillSection(sectionName)) {
        const expectedParagraphCount = Number(sectionItem.paragraphCount || 0);
        const actualSkillLineCount = lineTexts.filter(function(line) {
          return (line.type === "paragraph" || line.type === "subtitle" || line.type === "bullet") && cleanString(line.text);
        }).length;
        if (expectedParagraphCount > actualSkillLineCount) {
          remaining.push("missing skill line(s) in " + sectionName);
        }
      }
    });
    return uniqueStringArray(remaining).slice(0, 40);
  }

  function getUploadResumeRemainingItems() {
    const uploadState = getUploadResumeState();
    const localRemaining = validateImportCoverage(uploadState.importChecklist, getActiveResume());
    const auditRemaining = Array.isArray(uploadState.auditMissingItems) ? uploadState.auditMissingItems : [];
    return uniqueStringArray(localRemaining.concat(auditRemaining)).slice(0, 50);
  }

  async function runUploadResumeFinalAudit(markdown, checklist, remainingItems, settings) {
    if (!api || typeof api.auditResumeImportCoverage !== "function") {
      return { ok: true, complete: remainingItems.length === 0, missingItems: remainingItems, notes: "" };
    }
    return await api.auditResumeImportCoverage({
      markdown: markdown,
      resumeSummary: buildAiResumeSummary(),
      importChecklist: checklist,
      remainingItems: remainingItems,
      settings: settings
    });
  }

  async function selfCheckUploadResumeFunctionCalls(markdown, functionCalls, progress, settings) {
    if (!api || typeof api.selfCheckResumeImportFunctionCall !== "function") {
      return { ok: false, selfCheckFailed: true, message: "Failed to import resume content. Please try again." };
    }
    const result = await api.selfCheckResumeImportFunctionCall({
      markdown: markdown,
      resumeSummary: buildAiResumeSummary(),
      functionCalls: functionCalls,
      progress: progress,
      settings: settings
    });
    if (!result || result.ok !== true) {
      return {
        ok: false,
        selfCheckFailed: true,
        message: cleanString(result && result.error) || "Self-check request failed. Please try again."
      };
    }
    if (result.approved !== true) {
      const reason = cleanString(result.reason);
      return {
        ok: false,
        selfCheckRejected: true,
        reason: reason,
        message: reason || "Self-check rejected this proposal."
      };
    }
    return { ok: true, message: cleanString(result.reason) };
  }

  async function persistUploadResumeExecution(execResult, lang) {
    const uploadState = getUploadResumeState();
    if (cleanString(execResult && execResult.lastSectionId)) {
      uploadState.lastSectionId = cleanString(execResult.lastSectionId);
    }
    if (cleanString(execResult && execResult.lastEntryId)) {
      uploadState.lastEntryId = cleanString(execResult.lastEntryId);
    }
    applyAiExecutionResult(execResult, lang);
    markResumeDirty({ cleanupEmptyObjects: true, language: lang, debounce: false });
    await flushResumeAutosave({
      force: true,
      silent: true,
      cleanupEmptyObjects: true,
      cleanupLanguage: lang
    });
    renderProfile();
    applyUiLanguage(lang);
    renderResume();
    schedulePreviewUpdate({ force: true });
  }

  function summarizeFunctionBatch(functionCalls, execResult) {
    const summaries = Array.isArray(execResult && execResult.changeSummary)
      ? execResult.changeSummary.map(cleanString).filter(Boolean)
      : [];
    const summary = summaries.length
      ? summaries[0]
      : "";
    if (summary) return summary;
    const firstCall = Array.isArray(functionCalls) && functionCalls.length ? functionCalls[0] : null;
    const name = cleanString(firstCall && firstCall.name);
    if (!name) return "Imported one resume item.";
    return "Imported " + String(Array.isArray(functionCalls) ? functionCalls.length : 1) + " resume item(s).";
  }

  function resolveUploadResumeBatchPlaceholders(functionCalls) {
    const uploadState = getUploadResumeState();
    let localSectionAvailable = false;
    let localEntryAvailable = false;
    return (Array.isArray(functionCalls) ? functionCalls : []).map(function mapCall(functionCall) {
      const safeCall = functionCall && typeof functionCall === "object" ? functionCall : {};
      const args = safeCall.args && typeof safeCall.args === "object" ? { ...safeCall.args } : {};
      if (args.sectionId === "$lastSection" && !localSectionAvailable && cleanString(uploadState.lastSectionId)) {
        args.sectionId = cleanString(uploadState.lastSectionId);
      }
      if (args.entryId === "$lastEntry" && !localEntryAvailable && cleanString(uploadState.lastEntryId)) {
        args.entryId = cleanString(uploadState.lastEntryId);
      }
      const nextCall = {
        ...safeCall,
        args: args
      };
      if (cleanString(nextCall.name) === "addSection") {
        localSectionAvailable = true;
      }
      if (cleanString(nextCall.name) === "addEntry") {
        localEntryAvailable = true;
      }
      return nextCall;
    });
  }

  async function executeUploadResumeFunctionBatch(functionCalls, markdown, progress, settings, lang) {
    const rfns = globalThis.ResumeAiFunctions;
    if (!rfns || typeof rfns.executeResumeFunctions !== "function" || typeof rfns.validateResumeFunctionBatch !== "function") {
      throw new Error("Resume function executor is unavailable.");
    }
    const resolvedFunctionCalls = resolveUploadResumeBatchPlaceholders(functionCalls);
    if (!resolvedFunctionCalls.length || resolvedFunctionCalls.length > 10) {
      return {
        validationRejected: true,
        summary: "Import planner must return 1 to 10 function calls per round."
      };
    }
    const validation = rfns.validateResumeFunctionBatch(resolvedFunctionCalls, getActiveResume());
    if (!validation || validation.ok !== true) {
      return {
        validationRejected: true,
        summary: cleanString(validation && validation.error) || "Failed to import resume content. Please try again."
      };
    }
    const check = await selfCheckUploadResumeFunctionCalls(markdown, resolvedFunctionCalls, progress, settings);
    if (!check.ok) {
      if (check.selfCheckRejected) {
        return {
          selfCheckRejected: true,
          rejectionReason: check.reason || check.message,
          summary: check.message || "Self-check rejected this proposal."
        };
      }
      return {
        selfCheckFailed: true,
        summary: check.message || "The AI could not confirm this import step. Please review the extracted Markdown and try again."
      };
    }
    addUploadResumeLog("Self-check approved.");
    if (isUploadResumeCancelled()) return { cancelled: true };

    const execResult = rfns.executeResumeFunctions(resolvedFunctionCalls, getActiveResume());
    if (!execResult || execResult.ok !== true) {
      throw new Error(cleanString(execResult && execResult.error) || "Failed to import resume content. Please try again.");
    }

    await persistUploadResumeExecution(execResult, lang);
    return {
      summary: summarizeFunctionBatch(resolvedFunctionCalls, execResult),
      changeSummary: Array.isArray(execResult.changeSummary) ? execResult.changeSummary : [],
      functionCalls: resolvedFunctionCalls
    };
  }

  function validateUploadResumeImportPlan(plan) {
    const status = cleanString(plan && plan.status);
    if (["continue", "complete", "ask_user", "abort"].indexOf(status) === -1) {
      return { ok: false, message: "status missing or invalid." };
    }
    const calls = Array.isArray(plan && plan.functionCalls) ? plan.functionCalls : [];
    if (status === "continue") {
      if (!calls.length) return { ok: false, message: "continue returned no functionCalls." };
      if (calls.length > 10) return { ok: false, message: "functionCalls exceeded 10." };
      const rfns = globalThis.ResumeAiFunctions;
      if (!rfns || typeof rfns.validateResumeFunctionBatch !== "function") {
        return { ok: false, message: "Resume function validator is unavailable." };
      }
      const validation = rfns.validateResumeFunctionBatch(resolveUploadResumeBatchPlaceholders(calls), getActiveResume());
      if (!validation || validation.ok !== true) {
        return { ok: false, message: cleanString(validation && validation.error) || "functionCalls failed validation." };
      }
    }
    return { ok: true, value: plan };
  }

  async function planUploadResumeImportRound(params) {
    const safe = params && typeof params === "object" ? params : {};
    return await runUploadResumeAiStageWithRetries({
      label: "Import planner",
      failureMessage: "Failed to plan the next resume import step after 3 attempts.",
      onRetry: function(nextAttempt, total, reason) {
        addUploadResumeLog("Import planner returned invalid result. Retrying... attempt " + String(nextAttempt) + " of " + String(total) + (reason ? " (" + reason + ")" : ""));
      },
      run: function(attempt, retryReason) {
        return api.planResumeImportStep({
          markdown: safe.markdown,
          resumeSummary: buildAiResumeSummary(),
          activeResumeLanguage: safe.lang,
          progress: safe.progress,
          importChecklist: safe.importChecklist,
          remainingItems: safe.remainingItems,
          settings: safe.settings,
          retryReason: attempt > 1 ? retryReason : ""
        });
      },
      validate: function(plan) {
        if (!plan || plan.ok !== true) {
          return { ok: false, message: cleanString(plan && plan.error) || "AI call failed." };
        }
        return validateUploadResumeImportPlan(plan);
      }
    });
  }

  async function planSmallerBatch(params) {
    const safe = params && typeof params === "object" ? params : {};
    const rejectionReason = cleanString(safe.rejectionReason);
    const prevCount = Number(safe.previousCallCount || 5);
    let targetHint;
    if (prevCount > 1) targetHint = "1 to 2";
    else targetHint = "1";
    return await runUploadResumeAiStageWithRetries({
      label: "Smaller batch planner",
      failureMessage: "Failed to plan a smaller import batch after 3 attempts.",
      onRetry: function(nextAttempt, total, reason) {
        addUploadResumeLog("Smaller batch planner returned invalid result. Retrying... attempt " + String(nextAttempt) + " of " + String(total) + (reason ? " (" + reason + ")" : ""));
      },
      run: function(attempt, retryReason) {
        return api.planResumeImportStep({
          markdown: safe.markdown,
          resumeSummary: buildAiResumeSummary(),
          activeResumeLanguage: safe.lang,
          progress: safe.progress,
          importChecklist: getUploadResumeState().importChecklist,
          remainingItems: getUploadResumeRemainingItems(),
          settings: safe.settings,
          retryReason: attempt > 1 ? retryReason : "",
          selfCheckRejectionReason: rejectionReason,
          selfCheckRejectionCount: Number(safe.rejectionCount || 1),
          selfCheckTargetCallHint: targetHint
        });
      },
      validate: function(plan) {
        if (!plan || plan.ok !== true) {
          return { ok: false, message: cleanString(plan && plan.error) || "AI call failed." };
        }
        return validateUploadResumeImportPlan(plan);
      }
    });
  }

  async function runUploadResumeImport(markdown) {
    const uploadState = getUploadResumeState();
    const settings = getAiSettings();
    const lang = getResumeLanguage();
    if (!api || typeof api.planResumeImportStep !== "function") {
      throw new Error("Failed to import resume content. Please try again.");
    }

    setUploadResumeStep("Importing resume content...");
    uploadState.importChecklist = analyzeMarkdownImportChecklist(markdown);
    uploadState.auditMissingItems = [];
    uploadState.auditAttempts = 0;
    logSkippedPlaceholderUnits(uploadState.importChecklist);
    const detectedSections = Array.isArray(uploadState.importChecklist.sectionsDetected)
      ? uploadState.importChecklist.sectionsDetected.map(function(section) { return cleanString(section && section.name); }).filter(Boolean)
      : [];
    if (detectedSections.length) {
      addUploadResumeLog("Detected sections: " + detectedSections.join(", ") + ".");
    } else {
      addUploadResumeLog("No clear section headings detected. Import will continue from the extracted Markdown.");
    }
    const contentUnits = getChecklistContentUnits(uploadState.importChecklist);
    const skippedUnitCount = contentUnits.filter(function(unit) { return cleanString(unit && unit.status) === "skipped"; }).length;
    if (contentUnits.length && getPendingContentUnitCount(uploadState.importChecklist) === 0 && skippedUnitCount > 0) {
      const placeholderOnlyMessage = "The remaining content appears to be template placeholder text. Please paste actual resume content.";
      const placeholderPlan = await planUploadResumeImportRound({
        markdown: markdown,
        lang: lang,
        progress: uploadState.progress,
        importChecklist: uploadState.importChecklist,
        remainingItems: [placeholderOnlyMessage],
        settings: settings
      });
      if (placeholderPlan && cleanString(placeholderPlan.status) === "ask_user") {
        throw new Error(cleanString(placeholderPlan.assistantMessage) || placeholderOnlyMessage);
      }
      throw new Error(placeholderOnlyMessage);
    }
    for (let roundIndex = 0; roundIndex < MAX_UPLOAD_RESUME_IMPORT_ROUNDS; roundIndex += 1) {
      if (isUploadResumeCancelled()) {
        addUploadResumeLog("Import cancelled. Imported changes so far have been kept.");
        uploadState.running = false;
        uploadState.completed = true;
        uploadState.step = "Import cancelled. Imported changes so far have been kept.";
        await flushResumeAutosave({ force: true, silent: true });
        renderUploadResumeModal();
        return;
      }

      const remainingItems = getUploadResumeRemainingItems();
      const nextUnit = getNextPendingContentUnit(uploadState.importChecklist);
      if (nextUnit) {
        const nextUnitMessage = "Importing next content unit: " + describeImportContentUnit(nextUnit) + ".";
        setUploadResumeStep(nextUnitMessage);
        addUploadResumeLog(nextUnitMessage);
      }
      const plan = await planUploadResumeImportRound({
        markdown: markdown,
        lang: lang,
        progress: uploadState.progress,
        importChecklist: uploadState.importChecklist,
        remainingItems: remainingItems,
        settings: settings
      });
      if (!plan || plan.ok !== true) {
        throw new Error("Failed to import resume content. Please try again.");
      }

      const status = cleanString(plan.status);
      const assistantMessage = cleanString(plan.assistantMessage);
      if (status === "complete") {
        const localRemaining = getUploadResumeRemainingItems();
        if (localRemaining.length) {
          addUploadResumeLog("Import is not complete yet. Continuing with missing item: " + localRemaining[0] + ".");
          uploadState.progress.push({
            step: uploadState.importedSteps + 1,
            summary: "Completion rejected. Remaining: " + localRemaining.slice(0, 6).join("; "),
            functionName: "coverage-check"
          });
          continue;
        }
        setUploadResumeStep("Running final audit...");
        addUploadResumeLog("Running final audit...");
        const audit = await runUploadResumeFinalAudit(markdown, uploadState.importChecklist, localRemaining, settings);
        let completionMessage = "Import Success.";
        if (audit && audit.ok === true && audit.complete !== true) {
          const missingItems = Array.isArray(audit.missingItems) ? audit.missingItems : [];
          uploadState.auditAttempts += 1;
          uploadState.auditMissingItems = missingItems;
          if (missingItems.length && uploadState.auditAttempts <= 2) {
            addUploadResumeLog("Final coverage audit found missing items: " + missingItems.slice(0, 6).join("; ") + ".");
            uploadState.progress.push({
              step: uploadState.importedSteps + 1,
              summary: "Final audit missing items: " + missingItems.slice(0, 6).join("; "),
              functionName: "coverage-audit"
            });
            continue;
          }
          completionMessage = "Import completed with possible missing items. Please review in Manual Mode.";
          addUploadResumeLog(completionMessage);
          missingItems.slice(0, 10).forEach(function logMissing(item) {
            addUploadResumeLog("Possible missing item: " + item);
          });
        } else if (audit && audit.ok === true) {
          addUploadResumeLog("Final coverage audit passed.");
        } else {
          completionMessage = "Import completed with possible missing items. Please review in Manual Mode.";
          addUploadResumeLog("Final coverage audit could not complete. Please review in Manual Mode.");
        }
        setUploadResumeStep("Saving imported resume...");
        if (assistantMessage && completionMessage === "Import Success.") {
          addUploadResumeLog(assistantMessage);
        }
        await flushResumeAutosave({ force: true, silent: true, cleanupEmptyObjects: true, cleanupLanguage: lang });
        uploadState.running = false;
        uploadState.completed = true;
        uploadState.step = completionMessage;
        addUploadResumeLog(completionMessage);
        renderProfile();
        applyUiLanguage(lang);
        renderResume();
        schedulePreviewUpdate({ force: true });
        renderUploadResumeModal();
        return;
      }
      if (status === "ask_user" || status === "abort") {
        throw new Error(assistantMessage || "Failed to import resume content. Please try again.");
      }
      let activeFunctionCalls = Array.isArray(plan.functionCalls) ? plan.functionCalls : [];
      if (status !== "continue" || !activeFunctionCalls.length) {
        throw new Error("Failed to import resume content. Please try again.");
      }
      if (activeFunctionCalls.length > 10) {
        addUploadResumeLog("Import planner returned more than 10 function calls. Asking for a smaller batch.");
        const reduceProgress = uploadState.progress.concat([{
          step: uploadState.importedSteps + 1,
          summary: "Previous proposal had more than 10 function calls. Return at most 10 calls.",
          functionName: "batch-size-check"
        }]);
        const reducedPlan = await api.planResumeImportStep({
          markdown: markdown,
          resumeSummary: buildAiResumeSummary(),
          activeResumeLanguage: lang,
          progress: reduceProgress,
          importChecklist: uploadState.importChecklist,
          remainingItems: getUploadResumeRemainingItems(),
          settings: settings
        });
        activeFunctionCalls = reducedPlan && reducedPlan.ok === true && cleanString(reducedPlan.status) === "continue" && Array.isArray(reducedPlan.functionCalls)
          ? reducedPlan.functionCalls
          : [];
        if (!activeFunctionCalls.length || activeFunctionCalls.length > 10) {
          throw new Error("Failed to import resume content. Please try again.");
        }
      }

      setUploadResumeStep(assistantMessage || "Importing next resume item...");
      addUploadResumeLog("Proposed " + String(activeFunctionCalls.length) + " function call" + (activeFunctionCalls.length === 1 ? "" : "s") + ".");

      let batchToExecute = activeFunctionCalls;
      let batchProgress = uploadState.progress;
      let selfCheckRejectionCount = 0;
      let executed;

      while (true) {
        executed = await executeUploadResumeFunctionBatch(batchToExecute, markdown, batchProgress, settings, lang);

        if (executed && executed.cancelled) break;

        if (executed && executed.selfCheckFailed) break;

        if (executed && executed.validationRejected) break;

        if (executed && executed.selfCheckRejected) {
          const rejectionReason = cleanString(executed.rejectionReason || executed.summary);
          selfCheckRejectionCount += 1;

          addUploadResumeLog("Self-check rejected the proposal" + (rejectionReason ? ": " + rejectionReason : "") + ".");

          if (selfCheckRejectionCount >= MAX_SELF_CHECK_REJECTIONS_PER_STEP) {
            addUploadResumeLog("Reached " + String(MAX_SELF_CHECK_REJECTIONS_PER_STEP) + " rejected proposals for this step. Stopping import.");
            break;
          }

          addUploadResumeLog("Retrying with a smaller batch... attempt " + String(selfCheckRejectionCount + 1) + " of " + String(MAX_SELF_CHECK_REJECTIONS_PER_STEP) + ".");

          batchProgress = uploadState.progress.concat([{
            step: uploadState.importedSteps + 1,
            summary: "Self-check rejected proposal (attempt " + String(selfCheckRejectionCount) + "): " + rejectionReason,
            functionName: "self-check-rejection"
          }]);

          const smallerPlan = await planSmallerBatch({
            markdown: markdown,
            lang: lang,
            settings: settings,
            rejectionReason: rejectionReason,
            rejectionCount: selfCheckRejectionCount,
            previousCallCount: batchToExecute.length,
            progress: batchProgress
          });

          batchToExecute = smallerPlan.functionCalls;
          addUploadResumeLog("Proposed " + String(batchToExecute.length) + " function call" + (batchToExecute.length === 1 ? "" : "s") + " (smaller batch).");
          continue;
        }

        break;
      }

      if (executed && executed.cancelled) continue;

      if (executed && executed.selfCheckFailed) {
        throw new Error(cleanString(executed.summary) || "Self-check failed. Please try again.");
      }

      if (executed && executed.validationRejected) {
        throw new Error(cleanString(executed.summary) || "Failed to import resume content. Please try again.");
      }

      if (executed && executed.selfCheckRejected) {
        throw new Error("Import stopped because the AI could not produce an approved import proposal after " + String(MAX_SELF_CHECK_REJECTIONS_PER_STEP) + " attempts. Please review the Extracted Markdown or use Manual Mode.");
      }

      uploadState.importedSteps += 1;
      const importedUnit = markNextPendingContentUnitImported(uploadState.importChecklist);
      const summary = cleanString(executed && executed.summary) || cleanString(plan.reason) || "Imported resume content.";
      uploadState.progress.push({
        step: uploadState.importedSteps,
        summary: summary,
        functionName: "batch",
        functionCount: Array.isArray(batchToExecute) ? batchToExecute.length : 0,
        contentUnit: importedUnit ? describeImportContentUnit(importedUnit) : ""
      });
      uploadState.auditMissingItems = [];
      addUploadResumeLog(summary);
      if (importedUnit) {
        addUploadResumeLog("Imported content unit: " + describeImportContentUnit(importedUnit) + ".");
      }
      const changeSummary = Array.isArray(executed && executed.changeSummary) ? executed.changeSummary : [];
      changeSummary.slice(1).forEach(function(extra) {
        addUploadResumeLog(extra);
      });
    }

    uploadState.running = false;
    uploadState.completed = true;
    uploadState.step = "Import stopped after reaching the step limit. Please review the imported content in Manual Mode.";
    addUploadResumeLog("Import stopped after reaching the step limit. Please review the imported content in Manual Mode.");
    await flushResumeAutosave({ force: true, silent: true, cleanupEmptyObjects: true, cleanupLanguage: lang });
    renderUploadResumeModal();
  }

  async function runMarkdownCleanupAndImport(sourceText, fileName, sourceLabel) {
    const uploadState = getUploadResumeState();
    if (!hasAiProvider()) {
      throw new Error("PDF resume upload is unavailable because no model provider is configured.");
    }
    const capabilities = getUploadResumeProviderCapabilities();
    const providerName = cleanString(capabilities.provider).toLowerCase();

    const cleanupMessage = providerName === "minimax"
      ? "Converting extracted text to Markdown with MiniMax..."
      : "Converting extracted text to Markdown...";

    const cleanupResult = await runUploadResumeAiStageWithRetries({
      label: "Markdown cleanup",
      failureMessage: "Failed to convert the resume text into usable Markdown after 3 attempts.",
      onAttempt: function(attempt, total) {
        const msg = cleanupMessage + " attempt " + String(attempt) + " of " + String(total);
        setUploadResumeStep(msg);
        addUploadResumeLog(msg);
      },
      onRetry: function(nextAttempt, total, reason) {
        addUploadResumeLog("Markdown cleanup returned invalid result. Retrying... attempt " + String(nextAttempt) + " of " + String(total) + (reason ? " (" + reason + ")" : ""));
      },
      onFailure: function(reason) {
        addUploadResumeLog("Markdown cleanup failed after 3 attempts: " + (reason || "unknown error"));
      },
      run: function(attempt, retryReason) {
        return convertExtractedTextToMarkdownWithAI(sourceText, providerName, fileName, attempt > 1 ? retryReason : "");
      },
      validate: function(result) {
        if (!result || result.ok !== true) {
          return { ok: false, message: cleanString(result && result.error) || "AI call failed." };
        }
        if (!cleanString(result.markdown)) {
          return { ok: false, message: "markdown was missing." };
        }
        if (!isMarkdownUsable(result.markdown, sourceText)) {
          return { ok: false, message: "markdown failed validation." };
        }
        return { ok: true, value: result };
      }
    });

    if (isUploadResumeCancelled()) return;

    uploadState.markdown = cleanString(cleanupResult.markdown);
    uploadState.confidence = cleanString(cleanupResult.confidence) || uploadState.confidence;
    uploadState.warnings = uploadState.warnings.concat(Array.isArray(cleanupResult.warnings) ? cleanupResult.warnings.map(cleanString).filter(Boolean) : []);
    uploadState.extractionStats.source = cleanString(sourceLabel);
    uploadState.extractionStats.markdownCharacterCount = uploadState.markdown.length;
    uploadState.extractionStats.characterCount = uploadState.markdown.length;
    uploadState.extractionStats.lineCount = countPdfTextLines(uploadState.markdown);
    renderUploadResumeModal();

    addUploadResumeLog("Markdown extracted. Source: " + cleanString(sourceLabel) + ".");
    if (uploadState.confidence) addUploadResumeLog("Extraction confidence: " + uploadState.confidence + ".");
    if (uploadState.confidence && uploadState.confidence.toLowerCase() === "low") {
      addUploadResumeLog("Resume extraction confidence is low. Please review imported content in Manual Mode.");
    }
    uploadState.warnings.forEach(function(warning) {
      if (warning) addUploadResumeLog("Extraction warning: " + warning);
    });

    await runUploadResumeImport(uploadState.markdown);
  }

  async function handleUsePastedText() {
    const uploadState = getUploadResumeState();
    if (uploadState.running) return;
    const pastedText = cleanString(uploadResumePasteTextareaEl && uploadResumePasteTextareaEl.value);
    if (!pastedText) {
      addUploadResumeLog("Paste area is empty. Please paste your resume text.");
      renderUploadResumeModal();
      return;
    }
    if (pastedText.length < 100) {
      addUploadResumeLog("Please paste more resume content before importing.");
      renderUploadResumeModal();
      return;
    }

    uploadState.awaitingPastedText = false;
    uploadState.running = true;
    uploadState.completed = false;
    uploadState.cancelled = false;
    uploadState.error = "";
    uploadState.markdown = "";
    uploadState.confidence = "";
    uploadState.warnings = [];
    uploadState.progress = [];
    uploadState.plainText = pastedText;
    uploadState.qualityReport = null;
    uploadState.extractionStats = {
      source: "Pasted text + MiniMax Markdown cleanup",
      pageCount: 0,
      plainTextCharacterCount: pastedText.length,
      plainTextLineCount: countPdfTextLines(pastedText),
      markdownCharacterCount: 0,
      characterCount: pastedText.length,
      lineCount: countPdfTextLines(pastedText)
    };
    uploadState.lastSectionId = "";
    uploadState.lastEntryId = "";
    uploadState.importChecklist = null;
    uploadState.auditMissingItems = [];
    uploadState.auditAttempts = 0;
    uploadState.importedSteps = 0;
    addUploadResumeLog("Using pasted resume text (" + String(pastedText.length) + " chars).");
    renderUploadResumeModal();

    try {
      await runMarkdownCleanupAndImport(pastedText, "", "Pasted text + MiniMax Markdown cleanup");
    } catch (error) {
      const message = cleanString(error instanceof Error ? error.message : String(error)) || "Failed to import resume content. Please try again.";
      if (state.resumeAutosave && state.resumeAutosave.dirty) {
        await flushResumeAutosave({ force: true, silent: true }).catch(() => {});
      }
      setUploadResumeError(message);
    }
  }

  async function startUploadResumeImport(file) {
    const uploadState = getUploadResumeState();
    if (!file) return;

    const isPdf = cleanString(file.type).toLowerCase() === "application/pdf" || /\.pdf$/i.test(cleanString(file.name));
    if (!isPdf) {
      setUploadResumeError("Please upload a PDF resume.");
      return;
    }
    flushManualResumeEditsToSharedState({ markDirty: true, debounce: false });
    await flushResumeAutosave({ force: true, silent: true });

    uploadState.running = true;
    uploadState.completed = false;
    uploadState.cancelled = false;
    uploadState.awaitingPastedText = false;
    uploadState.error = "";
    uploadState.log = [];
    uploadState.progress = [];
    uploadState.markdown = "";
    uploadState.plainText = "";
    uploadState.confidence = "";
    uploadState.warnings = [];
    uploadState.qualityReport = null;
    uploadState.extractionStats = {
      source: "",
      pageCount: 0,
      plainTextCharacterCount: 0,
      plainTextLineCount: 0,
      markdownCharacterCount: 0,
      characterCount: 0,
      lineCount: 0
    };
    uploadState.lastSectionId = "";
    uploadState.lastEntryId = "";
    uploadState.importChecklist = null;
    uploadState.auditMissingItems = [];
    uploadState.auditAttempts = 0;
    uploadState.importedSteps = 0;
    renderUploadResumeModal();

    try {
      if (!hasAiProvider()) {
        throw new Error("PDF resume upload is unavailable because no model provider is configured.");
      }
      const capabilities = getUploadResumeProviderCapabilities();
      if (capabilities.supportsDirectPdfTextExtraction) {
        const markdown = await extractMarkdownFromUploadedPdf(file);
        if (!markdown || isUploadResumeCancelled()) {
          uploadState.running = false;
          uploadState.completed = true;
          uploadState.step = "Import cancelled. Imported changes so far have been kept.";
          addUploadResumeLog("Import cancelled. Imported changes so far have been kept.");
          await flushResumeAutosave({ force: true, silent: true });
          renderUploadResumeModal();
          return;
        }
        await runUploadResumeImport(markdown);
        return;
      }

      const providerName = cleanString(capabilities.provider).toLowerCase();

      void renderPdfPreviewInModal(file).catch(function() {
        uploadState.pdfPreviewStatus = "failed";
        renderUploadResumeModal();
      });

      setUploadResumeStep("Extracting embedded PDF text...");
      addUploadResumeLog("Extracting embedded PDF text...");

      let localResult;
      try {
        localResult = await extractTextFromPdfFile(file);
      } catch {
        localResult = { plainText: "", pageCount: 0, characterCount: 0, lineCount: 0, warnings: [] };
      }
      if (isUploadResumeCancelled()) {
        uploadState.running = false;
        uploadState.completed = true;
        uploadState.step = "Import cancelled. Imported changes so far have been kept.";
        renderUploadResumeModal();
        return;
      }

      const plainText = normalizeExtractedPdfText(localResult && localResult.plainText);
      const extractionSource = providerName === "minimax"
        ? "Local PDF text extraction + MiniMax Markdown cleanup"
        : "Local PDF text extraction + AI Markdown cleanup";

      uploadState.plainText = plainText;
      uploadState.extractionStats = {
        source: extractionSource,
        pageCount: Number(localResult && localResult.pageCount || 0),
        plainTextCharacterCount: plainText.length,
        plainTextLineCount: countPdfTextLines(plainText),
        markdownCharacterCount: 0,
        characterCount: plainText.length,
        lineCount: countPdfTextLines(plainText)
      };

      const qualityReport = getExtractionQualityReport(plainText);
      uploadState.qualityReport = qualityReport;

      const extractionMsg = "Extracted " + String(plainText.length) + " chars across " + String(uploadState.extractionStats.plainTextLineCount) + " lines" +
        (uploadState.extractionStats.pageCount ? " from " + String(uploadState.extractionStats.pageCount) + " page" + (uploadState.extractionStats.pageCount === 1 ? "" : "s") : "") + ".";
      addUploadResumeLog(extractionMsg);
      addUploadResumeLog("Extraction quality: " + qualityReport.quality + ".");
      if (Array.isArray(localResult && localResult.warnings)) {
        localResult.warnings.filter(Boolean).forEach(function(w) { addUploadResumeLog("Warning: " + w); });
      }

      if (qualityReport.quality !== "good") {
        uploadState.running = false;
        uploadState.awaitingPastedText = true;
        const failMsg = "The PDF text layer could not be read reliably. Please paste your resume text manually below.";
        uploadState.step = failMsg;
        addUploadResumeLog(failMsg);
        renderUploadResumeModal();
        return;
      }

      renderUploadResumeModal();
      await runMarkdownCleanupAndImport(plainText, file.name, extractionSource);
    } catch (error) {
      const message = cleanString(error instanceof Error ? error.message : String(error)) || "Failed to import resume content. Please try again.";
      if (state.resumeAutosave && state.resumeAutosave.dirty) {
        await flushResumeAutosave({ force: true, silent: true }).catch(() => {});
      }
      setUploadResumeError(message);
    }
  }

  function cancelUploadResumeImport() {
    const uploadState = getUploadResumeState();
    if (uploadState.awaitingPastedText) {
      uploadState.awaitingPastedText = false;
      uploadState.step = "Import cancelled. Imported changes so far have been kept.";
      uploadState.completed = true;
      addUploadResumeLog("Import cancelled. Imported changes so far have been kept.");
      renderUploadResumeModal();
      return;
    }
    if (!uploadState.running) return;
    uploadState.cancelled = true;
    uploadState.step = "Cancelling import...";
    addUploadResumeLog("Cancelling import...");
    renderUploadResumeModal();
  }

  function resolveSettingsProvider(settings, overrideProvider) {
    const provider = cleanString(overrideProvider) || cleanString(settings && settings.provider) || "minimax";
    const providers = settings && settings.providers && typeof settings.providers === "object" ? settings.providers : {};
    const scoped = providers[provider] && typeof providers[provider] === "object" ? providers[provider] : {};

    return {
      provider: provider,
      model: cleanString(scoped.model) || cleanString(settings && settings.model),
      apiKey: cleanString(scoped.apiKey),
      baseUrl: cleanString(scoped.baseUrl) || cleanString(settings && settings.apiBaseUrl)
    };
  }

  function renderSettings() {
    const selectedProvider = cleanString(settingsProviderEl && settingsProviderEl.value);
    const resolved = resolveSettingsProvider(state.settings || {}, selectedProvider);

    if (settingsProviderEl) {
      settingsProviderEl.value = resolved.provider;
    }

    if (settingsModelEl) {
      settingsModelEl.value = resolved.model;
    }

    if (settingsApiKeyEl) {
      settingsApiKeyEl.value = resolved.apiKey;
    }

    if (settingsBaseUrlEl) {
      settingsBaseUrlEl.value = resolved.baseUrl;
    }
    if (trackerUrlEl) trackerUrlEl.value = state.trackerSettings.url;
    if (trackerTokenEl) trackerTokenEl.value = state.trackerSettings.token;
  }

  function getResumeLanguage() {
    const zh = document.getElementById("resume-lang-zh");
    if (zh && zh.checked) return "zh";
    return "en";
  }

  function applyUiLanguage(lang) {
    editorLang = lang === "zh" ? "zh" : "en";
    const labels = UI_LABELS[editorLang] || UI_LABELS.en;
    const editorPanel = document.getElementById("resume-editor-panel");
    if (editorPanel) {
      editorPanel.dataset.resumeEditorLang = editorLang;
    }
    document.querySelectorAll("[data-i18n]").forEach(function(el) {
      const key = el.getAttribute("data-i18n");
      if (key && labels[key] !== undefined) {
        el.textContent = labels[key];
      }
    });
    updateResumeTranslationButton();
    updatePreviewStatus();
  }

  function updatePreviewStatus() {
    const el = document.getElementById("preview-lang-status");
    if (!el) return;
    const labels = UI_LABELS[editorLang] || UI_LABELS.en;
    el.textContent = labels.displayStatus || "";
  }

  function updatePreviewScale() {
    const shell = document.getElementById("resume-preview-shell");
    const scaler = document.getElementById("resume-page-scaler");
    if (!shell || !scaler) return;
    const A4_W = 794;
    const pad = 32;
    const availW = shell.clientWidth - pad;
    if (availW <= 0) return;
    const leftOffset = Math.max(0, (availW - A4_W) / 2);
    scaler.style.transform = "";
    scaler.style.transformOrigin = "top left";
    scaler.style.marginLeft = leftOffset + "px";
    scaler.style.marginRight = "";
    scaler.style.marginBottom = "";
  }

  function buildResumeDataForPreview() {
    const lang = getResumeLanguage();
    return {
      resume: collectActiveResumeFromForm(lang),
      settings: {
        requiredFieldWaivers: collectRequiredFieldWaiversFromForm()
      }
    };
  }

  let currentResumePdfArtifact = null;
  let currentResumePdfPromise = null;
  let currentResumePdfPromiseSignature = "";
  let currentResumePdfGenerationToken = 0;
  let previewGenerationSeq = 0;

  function setResumePreviewState(message) {
    if (!resumePreviewStateEl) {
      return;
    }
    const text = cleanString(message);
    resumePreviewStateEl.textContent = text;
    resumePreviewStateEl.hidden = !text;
  }

  function revokeObjectUrlLater(objectUrl) {
    const safeUrl = cleanString(objectUrl);
    if (!safeUrl) {
      return;
    }
    setTimeout(function revokePreviewUrl() {
      try {
        URL.revokeObjectURL(safeUrl);
      } catch {
        // The object URL may already have been released.
      }
    }, 300000);
  }

  function replaceCurrentResumePdfArtifact(signature, blob, filename) {
    const previousUrl = currentResumePdfArtifact && currentResumePdfArtifact.objectUrl;
    const objectUrl = URL.createObjectURL(blob);
    currentResumePdfArtifact = {
      signature: cleanString(signature),
      blob: blob,
      objectUrl: objectUrl,
      filename: cleanString(filename) || buildCurrentResumePdfFilename(),
      createdAt: Date.now()
    };
    if (previousUrl && previousUrl !== objectUrl) {
      revokeObjectUrlLater(previousUrl);
    }
    return currentResumePdfArtifact;
  }

  function releaseCurrentResumePdfArtifact() {
    const objectUrl = currentResumePdfArtifact && currentResumePdfArtifact.objectUrl;
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // The object URL may already have been released.
      }
    }
    currentResumePdfArtifact = null;
  }

  function buildCurrentResumePdfSignature(html) {
    return getResumeLanguage() + "\n" + cleanString(html);
  }

  async function ensureCurrentResumePdfArtifact() {
    const html = buildCurrentResumeA4Html();
    const signature = buildCurrentResumePdfSignature(html);
    if (
      currentResumePdfArtifact &&
      currentResumePdfArtifact.signature === signature &&
      currentResumePdfArtifact.blob instanceof Blob &&
      cleanString(currentResumePdfArtifact.objectUrl)
    ) {
      return currentResumePdfArtifact;
    }
    if (currentResumePdfPromise && currentResumePdfPromiseSignature === signature) {
      return currentResumePdfPromise;
    }
    const filename = buildCurrentResumePdfFilename();
    const generationToken = currentResumePdfGenerationToken + 1;
    currentResumePdfGenerationToken = generationToken;
    currentResumePdfPromiseSignature = signature;
    currentResumePdfPromise = (async function generatePdfArtifact() {
      const blob = await generateCurrentResumePdfBlob(html);
      if (generationToken !== currentResumePdfGenerationToken) {
        const objectUrl = URL.createObjectURL(blob);
        revokeObjectUrlLater(objectUrl);
        return {
          signature: signature,
          blob: blob,
          objectUrl: objectUrl,
          filename: filename,
          createdAt: Date.now()
        };
      }
      return replaceCurrentResumePdfArtifact(signature, blob, filename);
    })();
    try {
      return await currentResumePdfPromise;
    } finally {
      if (currentResumePdfPromiseSignature === signature) {
        currentResumePdfPromise = null;
        currentResumePdfPromiseSignature = "";
      }
    }
  }

  async function updateLivePreview() {
    if (!resumePreviewIframeEl) return;
    const generationId = previewGenerationSeq + 1;
    previewGenerationSeq = generationId;
    setResumePreviewState("Generating PDF preview...");
    if (resumeOverflowWarningEl) {
      resumeOverflowWarningEl.classList.add("hidden");
    }
    try {
      const artifact = await ensureCurrentResumePdfArtifact();
      if (generationId !== previewGenerationSeq) {
        return;
      }
      resumePreviewIframeEl.onload = function () {
        updatePreviewScale();
      };
      if (resumePreviewIframeEl.getAttribute("src") !== artifact.objectUrl) {
        resumePreviewIframeEl.removeAttribute("srcdoc");
        resumePreviewIframeEl.src = artifact.objectUrl;
      } else {
        updatePreviewScale();
      }
      setResumePreviewState("");
    } catch {
      if (generationId !== previewGenerationSeq) {
        return;
      }
      resumePreviewIframeEl.removeAttribute("src");
      resumePreviewIframeEl.srcdoc = '<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,sans-serif;color:#475569;background:#fff;">Failed to generate PDF preview.</body></html>';
      setResumePreviewState("Failed to generate PDF preview.");
      updatePreviewScale();
    }
  }

  function buildCurrentResumeA4Html() {
    const template = globalThis.ResumeA4Template;
    if (!template || typeof template.renderA4Html !== "function") {
      throw new Error("Resume renderer is unavailable.");
    }
    return template.renderA4Html(buildResumeDataForPreview(), getResumeLanguage());
  }

  function sanitizeFilenamePart(value) {
    return cleanString(value)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);
  }

  function buildCurrentResumePdfFilename() {
    const data = buildResumeDataForPreview();
    const resume = data && data.resume && typeof data.resume === "object" ? data.resume : {};
    const header = resume.header && typeof resume.header === "object" ? resume.header : {};
    const nameParts = header.name && typeof header.name === "object" ? header.name : {};
    const name = sanitizeFilenamePart(buildDisplayName(nameParts.firstName, "", nameParts.lastName, resume.language));
    const date = new Date().toISOString().slice(0, 10);
    return (name ? name + "-resume-" : "auto-apply-resume-") + date + ".pdf";
  }

  function chromeTabsCreate(options) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome || !chrome.tabs || typeof chrome.tabs.create !== "function") {
        reject(new Error("chrome.tabs.create unavailable"));
        return;
      }
      chrome.tabs.create(options, (tab) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tab || null);
      });
    });
  }

  function chromeTabsRemove(tabId) {
    return new Promise((resolve) => {
      if (!globalThis.chrome || !chrome.tabs || typeof chrome.tabs.remove !== "function" || typeof tabId !== "number") {
        resolve();
        return;
      }
      chrome.tabs.remove(tabId, () => resolve());
    });
  }

  function waitForTabComplete(tabId) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome || !chrome.tabs || typeof chrome.tabs.get !== "function") {
        reject(new Error("chrome.tabs.get unavailable"));
        return;
      }
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (tab && tab.status === "complete") {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error("Timed out waiting for PDF render tab."));
        }, 10000);
        function listener(updatedTabId, changeInfo) {
          if (updatedTabId === tabId && changeInfo && changeInfo.status === "complete") {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });
    });
  }

  function debuggerAttach(debugTarget) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome || !chrome.debugger || typeof chrome.debugger.attach !== "function") {
        reject(new Error("chrome.debugger unavailable"));
        return;
      }
      chrome.debugger.attach(debugTarget, "1.3", () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function debuggerSendCommand(debugTarget, method, params) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome || !chrome.debugger || typeof chrome.debugger.sendCommand !== "function") {
        reject(new Error("chrome.debugger.sendCommand unavailable"));
        return;
      }
      chrome.debugger.sendCommand(debugTarget, method, params || {}, (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function debuggerDetach(debugTarget) {
    return new Promise((resolve) => {
      if (!globalThis.chrome || !chrome.debugger || typeof chrome.debugger.detach !== "function") {
        resolve();
        return;
      }
      chrome.debugger.detach(debugTarget, () => resolve());
    });
  }

  function buildPdfBlobWithFallbackBuilder(html) {
    const builder = globalThis.Stage5ResumePdfBuilder;
    if (!builder || typeof builder.buildTailoredResumePdfBytes !== "function") {
      throw new Error("PDF builder is unavailable.");
    }
    const bytes = builder.buildTailoredResumePdfBytes(null, { htmlText: html });
    if (!(bytes instanceof Uint8Array) || !bytes.length) {
      throw new Error("PDF builder returned no data.");
    }
    return new Blob([bytes], { type: "application/pdf" });
  }

  async function buildPdfBlobWithChromePrint(html) {
    const dataUrl = "data:text/html;charset=utf-8;base64," + textToBase64(html);
    let tab = null;
    let attached = false;
    try {
      tab = await chromeTabsCreate({ url: dataUrl, active: false });
      if (!tab || typeof tab.id !== "number") {
        throw new Error("Could not create PDF render tab.");
      }
      await waitForTabComplete(tab.id);
      const debugTarget = { tabId: tab.id };
      await debuggerAttach(debugTarget);
      attached = true;
      await debuggerSendCommand(debugTarget, "Page.enable");
      const result = await debuggerSendCommand(debugTarget, "Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0
      });
      const blob = base64ToBlob(result && result.data, "application/pdf");
      if (!blob) {
        throw new Error("Chrome print returned no PDF data.");
      }
      return blob;
    } finally {
      if (tab && typeof tab.id === "number") {
        if (attached) {
          await debuggerDetach({ tabId: tab.id });
        }
        await chromeTabsRemove(tab.id);
      }
    }
  }

  async function generateCurrentResumePdfBlob(htmlInput) {
    const html = typeof htmlInput === "string" ? htmlInput : buildCurrentResumeA4Html();
    try {
      return await buildPdfBlobWithChromePrint(html);
    } catch {
      return buildPdfBlobWithFallbackBuilder(html);
    }
  }

  let previewUpdateTimer = null;
  function clearPreviewUpdateTimer() {
    if (previewUpdateTimer) {
      clearTimeout(previewUpdateTimer);
      previewUpdateTimer = null;
    }
  }

  function schedulePreviewUpdate(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (state.editorMode === "manual" && !opts.force) {
      return;
    }
    clearPreviewUpdateTimer();
    previewUpdateTimer = setTimeout(function () {
      previewUpdateTimer = null;
      updateLivePreview();
    }, 350);
  }

  async function handleGenerateManualResumePreview() {
    if (state.editorMode !== "manual") {
      return;
    }
    flushManualResumeEditsToSharedState({ markDirty: false });
    const btn = generateManualResumeBtn;
    const previousText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating...";
    }
    try {
      await updateLivePreview();
      setStatus("Resume preview generated.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = previousText || "Generate Resume";
      }
    }
  }

  function renderAll() {
    renderDashboard();
    renderProfile();
    applyUiLanguage(getResumeLanguage());
    renderResume();
    renderTestSandbox();
    renderAutofillAnswers();
    renderTrackerNotesPage();
    renderSettings();
    setActiveTab(state.activeTab || "dashboard");
    schedulePreviewUpdate();
    updatePreviewScale();
  }

  async function refreshStateFromStorage() {
    if (!appDataStore || typeof appDataStore.getAppData !== "function") {
      throw new Error("AppData store unavailable");
    }

    state.appData = await appDataStore.getAppData();
    ensureDualResumeState();
    state.currentJob = storage && typeof storage.getJobData === "function" ? await storage.getJobData() : null;
    const settings = storage && typeof storage.getSettings === "function" ? await storage.getSettings() : {};
    const canonicalData = dataBoundary && typeof dataBoundary.getAppData === "function"
      ? await dataBoundary.getAppData()
      : {
          profile: state.appData && state.appData.profile ? state.appData.profile : {},
          resume: state.appData && state.appData.masterResume ? state.appData.masterResume : {},
          autofillAnswers: Array.isArray(state.appData && state.appData.autofillAnswers) ? state.appData.autofillAnswers : [],
          settings: settings
        };

    state.canonicalData = canonicalData;
    state.settings = canonicalData && typeof canonicalData.settings === "object"
      ? {
          ...settings,
          ...canonicalData.settings
        }
      : settings;
  }

  function queryActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(Array.isArray(tabs) ? tabs[0] : null);
      });
    });
  }

  function sendMessageToTab(tabId, payload) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || null);
      });
    });
  }

  async function runAutofillFlow() {
    if (!shared || !shared.MESSAGE_TYPES) {
      throw new Error("Message constants unavailable.");
    }

    const activeTab = await queryActiveTab();
    if (!activeTab || typeof activeTab.id !== "number") {
      throw new Error("No active tab.");
    }

    const response = await sendMessageToTab(activeTab.id, { type: shared.MESSAGE_TYPES.PREPARE_APPLICATION });
    if (!response || response.ok !== true) {
      throw new Error(cleanString(response && response.error) || "Autofill failed.");
    }

    const data = response.data && typeof response.data === "object" ? response.data : {};
    await refreshStateFromStorage();
    renderAll();

    const filledCount = Number(data.filledFieldCount || 0) + Number(data.selectFilledCount || 0) + Number(data.checkboxFilledCount || 0);
    setStatus("AutoFill completed. Filled=" + String(filledCount));
    if (data.trackerError) {
      setTrackerStatus(data.trackerError);
    } else if (data.trackerJob) {
      setTrackerStatus("Autofill coverage saved in Tracker.");
    }
  }

  async function saveCanonicalDataPatch(patch) {
    const safePatch = patch && typeof patch === "object" ? patch : {};
    if (dataBoundary && typeof dataBoundary.saveAppData === "function") {
      return await dataBoundary.saveAppData(safePatch);
    }
    return state.canonicalData;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return globalThis.btoa(binary);
  }

  function textToBase64(value) {
    const text = String(value || "");
    const encoder = new TextEncoder();
    return bytesToBase64(encoder.encode(text));
  }

  function collectSettingsFromForm() {
    const provider = cleanString(settingsProviderEl && settingsProviderEl.value) || "minimax";
    const model = cleanString(settingsModelEl && settingsModelEl.value);
    const apiKey = cleanString(settingsApiKeyEl && settingsApiKeyEl.value);
    const baseUrl = cleanString(settingsBaseUrlEl && settingsBaseUrlEl.value);
    const current = state.settings && typeof state.settings === "object" ? state.settings : {};
    const providers = current.providers && typeof current.providers === "object" ? { ...current.providers } : {};
    const scoped = providers[provider] && typeof providers[provider] === "object" ? { ...providers[provider] } : {};

    providers[provider] = {
      ...scoped,
      model: model,
      apiKey: apiKey,
      baseUrl: baseUrl
    };

    const nextSettings = {
      ...current,
      provider: provider,
      model: model,
      apiKey: apiKey,
      apiBaseUrl: baseUrl,
      providers: providers
    };

    return nextSettings;
  }

  async function saveTrackerSettingsFromForm() {
    state.trackerSettings = await tracker.saveSettings({
      url: cleanString(trackerUrlEl && trackerUrlEl.value),
      token: cleanString(trackerTokenEl && trackerTokenEl.value)
    });
    setTrackerStatus("Tracker settings saved.");
  }

  async function testTrackerConnectionFromForm() {
    trackerTestBtn.disabled = true;
    try {
      await saveTrackerSettingsFromForm();
      await tracker.testConnection();
      await refreshTrackerData();
      setTrackerStatus("Tracker connection successful.");
    } catch (error) {
      setTrackerStatus(error instanceof Error ? error.message : String(error));
    } finally {
      trackerTestBtn.disabled = false;
    }
  }

  async function importExistingApplicationsToTracker() {
    trackerImportBtn.disabled = true;
    try {
      await saveTrackerSettingsFromForm();
      const records = await dataBoundary.getLegacyApplications();
      const imported = await tracker.importJobs(records);
      setTrackerStatus("Imported " + String(imported.length) + " applications into Tracker. Existing Tracker records were preserved.");
      await refreshTrackerData();
    } catch (error) {
      setTrackerStatus(error instanceof Error ? error.message : String(error));
    } finally {
      trackerImportBtn.disabled = false;
    }
  }

  async function saveSettingsFromForm() {
    const nextSettings = collectSettingsFromForm();

    if (storage && typeof storage.setSettings === "function") {
      await storage.setSettings(nextSettings);
    }

    await saveCanonicalDataPatch({ settings: nextSettings });
    await refreshStateFromStorage();
    renderAll();
    setStatus("Settings saved.");
  }

  async function handleTestConnection() {
    const settings = collectSettingsFromForm();

    if (dataBoundary && typeof dataBoundary.validateApiSettings === "function" && !dataBoundary.validateApiSettings(settings)) {
      setStatus("API settings are incomplete.");
      return;
    }

    if (!api || typeof api.testConnection !== "function") {
      setStatus("Connection failed. Please check your Provider, Model, API Key, and Base URL.");
      return;
    }

    if (settingsTestConnectionBtn) {
      settingsTestConnectionBtn.disabled = true;
    }
    setStatus("Testing connection...");

    try {
      const result = await api.testConnection({ settings: settings });
      if (result && result.ok === true) {
        setStatus("Connection successful.");
        return;
      }

      if (cleanString(result && result.code) === "INVALID_API_SETTINGS") {
        setStatus("API settings are incomplete.");
        return;
      }

      setStatus("Connection failed. Please check your Provider, Model, API Key, and Base URL.");
    } catch {
      setStatus("Connection failed. Please check your Provider, Model, API Key, and Base URL.");
    } finally {
      if (settingsTestConnectionBtn) {
        settingsTestConnectionBtn.disabled = false;
      }
    }
  }

  async function handleResetProfileResumeData() {
    const confirmed = window.confirm("This will delete your saved Profile data from this device. Tracker applications and notes are unchanged. Continue?");
    if (!confirmed) {
      return;
    }

    try {
      if (resetProfileResumeBtn) {
        resetProfileResumeBtn.disabled = true;
      }

      if (dataBoundary && typeof dataBoundary.resetProfileResumeData === "function") {
        await dataBoundary.resetProfileResumeData();
      } else if (appDataStore && typeof appDataStore.resetProfileResumeData === "function") {
        await appDataStore.resetProfileResumeData();
      } else {
        throw new Error("Profile reset is unavailable.");
      }

      await refreshStateFromStorage();
      setActiveTab("settings");
      renderAll();
      setStatus("Profile data has been reset.");
    } catch {
      setStatus("Failed to reset Profile data. Please try again.");
    } finally {
      if (resetProfileResumeBtn) {
        resetProfileResumeBtn.disabled = false;
      }
    }
  }

  async function saveProfileResumeFromForm() {
    flushManualResumeEditsToSharedState({ markDirty: true, debounce: false });
    await flushResumeAutosave({ force: true, silent: true });
    renderProfile();
    applyUiLanguage(getResumeLanguage());
    renderResume();
    schedulePreviewUpdate();
    setStatus("Profile saved.");
  }

  async function saveAutofillAnswerFromForm() {
    const answerId = cleanString(state.editingAutofillId) || createId("answer");
    const answer = {
      id: answerId,
      key: cleanString(autofillKeyEl && autofillKeyEl.value) || answerId,
      label: cleanString(autofillLabelEl && autofillLabelEl.value),
      questionPatterns: String(autofillPatternsEl && autofillPatternsEl.value || "")
        .split("\n")
        .map((item) => cleanString(item))
        .filter(Boolean),
      answer: cleanString(autofillAnswerEl && autofillAnswerEl.value),
      confidence: cleanString(autofillConfidenceEl && autofillConfidenceEl.value) || "medium",
      source: "manual",
      askEveryTime: Boolean(autofillAskEveryTimeEl && autofillAskEveryTimeEl.checked),
      updatedAt: new Date().toISOString()
    };

    if (!answer.answer || !answer.key) {
      throw new Error("Answer key and answer text are required.");
    }

    await appDataStore.upsertAutofillAnswer(answer);
    state.editingAutofillId = "";

    if (autofillKeyEl) autofillKeyEl.value = "";
    if (autofillLabelEl) autofillLabelEl.value = "";
    if (autofillPatternsEl) autofillPatternsEl.value = "";
    if (autofillAnswerEl) autofillAnswerEl.value = "";
    if (autofillConfidenceEl) autofillConfidenceEl.value = "high";
    if (autofillAskEveryTimeEl) autofillAskEveryTimeEl.checked = false;

    await refreshStateFromStorage();
    renderAll();
    setStatus("AutoFill answer saved.");
  }

  async function handleAutofillListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = cleanString(target.getAttribute("data-action"));
    const id = cleanString(target.getAttribute("data-id"));
    if (!action || !id) {
      return;
    }

    const answers = Array.isArray(state.appData && state.appData.autofillAnswers) ? state.appData.autofillAnswers : [];
    const answer = answers.find((item) => cleanString(item.id) === id);

    if (action === "edit" && answer) {
      state.editingAutofillId = id;
      if (autofillKeyEl) autofillKeyEl.value = cleanString(answer.key);
      if (autofillLabelEl) autofillLabelEl.value = cleanString(answer.label);
      if (autofillPatternsEl) autofillPatternsEl.value = Array.isArray(answer.questionPatterns) ? answer.questionPatterns.join("\n") : "";
      if (autofillAnswerEl) autofillAnswerEl.value = cleanString(answer.answer);
      if (autofillConfidenceEl) autofillConfidenceEl.value = cleanString(answer.confidence) || "high";
      if (autofillAskEveryTimeEl) autofillAskEveryTimeEl.checked = Boolean(answer.askEveryTime);
      setStatus("Loaded answer for editing.");
      return;
    }

    if (action === "delete") {
      await appDataStore.removeAutofillAnswer(id);
      await refreshStateFromStorage();
      renderAll();
      setStatus("Answer deleted.");
    }
  }

  function collectCardDeleteHandler(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (cleanString(target.getAttribute("data-action")) !== "delete-item") {
      return;
    }

    const card = target.closest(".item-card");
    if (card && card.parentElement) {
      card.parentElement.removeChild(card);
      updateResumeEmptyStates();
      schedulePreviewUpdate();
    }
  }

  function getChromeLocalArea() {
    if (globalThis.chrome && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function getChromeLocal(keys) {
    const area = getChromeLocalArea();
    if (!area) {
      return Promise.resolve({});
    }
    return new Promise(function wrap(resolve, reject) {
      area.get(keys, function onGet(result) {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function setChromeLocal(payload) {
    const area = getChromeLocalArea();
    if (!area) {
      return Promise.resolve();
    }
    return new Promise(function wrap(resolve, reject) {
      area.set(payload, function onSet() {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function removeChromeLocal(keys) {
    const area = getChromeLocalArea();
    const list = Array.isArray(keys) ? keys.filter(Boolean) : [cleanString(keys)].filter(Boolean);
    if (!area || !list.length) {
      return Promise.resolve();
    }
    return new Promise(function wrap(resolve, reject) {
      area.remove(list, function onRemove() {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function base64ToBlob(base64Input, mimeTypeInput) {
    const base64 = cleanString(base64Input);
    if (!base64) {
      return null;
    }
    const mimeType = cleanString(mimeTypeInput) || "application/octet-stream";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  function closeTab(tab) {
    try {
      if (tab && typeof tab.close === "function" && !tab.closed) {
        tab.close();
      }
    } catch {
      // Closing an auxiliary preview tab is best-effort cleanup.
    }
  }

  function openBlobInNewTab(blob, targetTab) {
    if (!(blob instanceof Blob)) {
      return false;
    }
    const objectUrl = URL.createObjectURL(blob);
    const opened = targetTab || globalThis.open("", "_blank");
    if (!opened) {
      URL.revokeObjectURL(objectUrl);
      return false;
    }
    opened.location.href = objectUrl;
    setTimeout(function revokeLater() {
      URL.revokeObjectURL(objectUrl);
    }, 60000);
    return true;
  }

  function getResumeRecordId(record, fallbackId) {
    const safe = record && typeof record === "object" ? record : {};
    return cleanString(safe.resumeDraftId || safe.resumeId || safe.id || safe.versionId || fallbackId);
  }

  function getResumeRecordStorageRefs(record) {
    const safe = record && typeof record === "object" ? record : {};
    const exportedFiles = safe.exportedFiles && typeof safe.exportedFiles === "object" ? safe.exportedFiles : {};
    return [
      safe.pdfStorageRef,
      safe.pdfRef,
      safe.pdfPath,
      exportedFiles.pdf,
      safe.storageRef,
      safe.storageKey,
      safe.blobKey,
      safe.htmlPath,
      safe.jsonPath,
      exportedFiles.html,
      exportedFiles.json
    ].map(cleanString).filter(Boolean);
  }

  function normalizeLocalResumeRecord(input, source, location) {
    const safe = input && typeof input === "object" ? input : {};
    const id = getResumeRecordId(safe, location && location.objectKey);
    if (!id) {
      return null;
    }

    const storageRefs = getResumeRecordStorageRefs(safe);
    const exportedFiles = safe.exportedFiles && typeof safe.exportedFiles === "object" ? safe.exportedFiles : {};

    return {
      id: id,
      jobTitle: cleanString(safe.jobTitle || safe.role || safe.title || safe.rawTitle),
      company: cleanString(safe.company || safe.companyName || safe.employer),
      createdAt: cleanString(safe.createdAt || safe.generatedAt || safe.savedAt || safe.updatedAt),
      updatedAt: cleanString(safe.updatedAt),
      fileName: cleanString(safe.fileName || safe.displayName || safe.name),
      mimeType: cleanString(safe.mimeType || safe.contentType || safe.type),
      storageRef: storageRefs[0] || "",
      storageRefs: storageRefs,
      exportedFiles: exportedFiles,
      source: source,
      locations: location ? [location] : []
    };
  }

  function mergeLocalResumeRecord(target, incoming) {
    if (!target || !incoming) {
      return target || incoming || null;
    }

    ["jobTitle", "company", "createdAt", "updatedAt", "fileName", "mimeType", "storageRef"].forEach(function eachField(field) {
      if (!cleanString(target[field]) && cleanString(incoming[field])) {
        target[field] = incoming[field];
      }
    });

    target.storageRefs = uniqueStringArray([].concat(target.storageRefs || [], incoming.storageRefs || []));
    target.locations = [].concat(target.locations || [], incoming.locations || []);
    target.source = uniqueStringArray([target.source, incoming.source]).join(",");
    return target;
  }

  function addLocalResumeRecord(recordMap, record) {
    if (!record || !record.id) {
      return;
    }

    const existing = recordMap.get(record.id);
    if (existing) {
      mergeLocalResumeRecord(existing, record);
      return;
    }

    recordMap.set(record.id, {
      ...record,
      storageRefs: Array.isArray(record.storageRefs) ? record.storageRefs.slice() : [],
      locations: Array.isArray(record.locations) ? record.locations.slice() : []
    });
  }

  function collectLocalResumeRecordsFromValue(value, source, storageKey) {
    const output = [];

    if (Array.isArray(value)) {
      value.forEach(function eachItem(item, index) {
        const record = normalizeLocalResumeRecord(item, source, { key: storageKey, index: index });
        if (record) {
          output.push(record);
        }
      });
      return output;
    }

    if (value && typeof value === "object") {
      const directRecord = normalizeLocalResumeRecord(value, source, { key: storageKey });
      if (directRecord) {
        output.push(directRecord);
        return output;
      }

      Object.keys(value).forEach(function eachObjectKey(objectKey) {
        const item = value[objectKey];
        const record = normalizeLocalResumeRecord(item, source, { key: storageKey, objectKey: objectKey });
        if (record) {
          output.push(record);
        }
      });
    }

    return output;
  }

  async function readAllLocalResumeRecords() {
    const recordMap = new Map();

    if (resumeRegistryStore && typeof resumeRegistryStore.listCompiledResumeRecords === "function") {
      const compiled = await resumeRegistryStore.listCompiledResumeRecords();
      (Array.isArray(compiled) ? compiled : []).forEach(function addCompiled(item) {
        const record = normalizeLocalResumeRecord({
          id: cleanString(item && item.resumeId),
          jobTitle: cleanString(item && item.role),
          company: cleanString(item && item.company),
          fileName: cleanString(item && item.fileName),
          mimeType: cleanString(item && item.mimeType),
          createdAt: cleanString(item && item.createdAt),
          storageRef: cleanString(item && item.storageKey)
        }, "registry", { key: COMPILED_RESUME_REGISTRY_KEY });
        addLocalResumeRecord(recordMap, record);
      });
    }

    if (appDataStore && typeof appDataStore.getAppData === "function") {
      const appData = await appDataStore.getAppData();
      const generated = Array.isArray(appData && appData.generatedResumes) ? appData.generatedResumes : [];
      generated.forEach(function addGenerated(item) {
        const record = normalizeLocalResumeRecord(item, "appData", { key: appDataStore.APP_DATA_KEY || "profileDataV2" });
        addLocalResumeRecord(recordMap, record);
      });
    }

    const localPayload = await getChromeLocal(LOCAL_RESUME_STORAGE_KEYS);
    LOCAL_RESUME_STORAGE_KEYS.forEach(function eachStorageKey(storageKey) {
      collectLocalResumeRecordsFromValue(localPayload[storageKey], "localStorage", storageKey).forEach(function addRecord(record) {
        addLocalResumeRecord(recordMap, record);
      });
    });

    return Array.from(recordMap.values()).sort(function byDate(a, b) {
      const left = new Date(a.createdAt || a.updatedAt).getTime() || 0;
      const right = new Date(b.createdAt || b.updatedAt).getTime() || 0;
      return right - left;
    });
  }

  function normalizePdfBase64(value) {
    const text = cleanString(value);
    if (!text) {
      return "";
    }

    const dataUrlMatch = text.match(/^data:application\/pdf;base64,(.+)$/i);
    if (dataUrlMatch) {
      return cleanString(dataUrlMatch[1]);
    }

    return text;
  }

  function sanitizePdfFileName(record) {
    const safe = record && typeof record === "object" ? record : {};
    const existing = cleanString(safe.fileName || safe.name || safe.displayName);
    const source = existing && /\.pdf$/i.test(existing)
      ? existing
      : [
          "resume",
          cleanString(safe.company),
          cleanString(safe.jobTitle || safe.role || safe.title),
          cleanString(safe.id || safe.resumeDraftId || safe.resumeId)
        ].filter(Boolean).join("_");

    const sanitized = cleanString(source)
      .replace(/\.pdf$/i, "")
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96);

    return (sanitized || "resume_" + (cleanString(safe.id || safe.resumeDraftId || safe.resumeId) || "draft")) + ".pdf";
  }

  function extractPdfPayload(raw, fallbackMeta) {
    const safe = raw && typeof raw === "object" ? raw : {};
    const meta = fallbackMeta && typeof fallbackMeta === "object" ? fallbackMeta : {};
    const mimeType = cleanString(safe.mimeType || safe.contentType || safe.type || meta.mimeType);
    const fileName = cleanString(safe.fileName || safe.displayName || safe.name || meta.fileName);
    const isPdf = mimeType.toLowerCase() === "application/pdf" || /\.pdf$/i.test(fileName);

    if (raw instanceof Blob && (raw.type === "application/pdf" || cleanString(meta.mimeType).toLowerCase() === "application/pdf")) {
      return {
        blob: raw,
        fileName: sanitizePdfFileName({ ...meta, fileName: fileName })
      };
    }

    if (typeof raw === "string" && cleanString(meta.mimeType).toLowerCase() === "application/pdf") {
      const dataBase64 = normalizePdfBase64(raw);
      return dataBase64 ? {
        dataBase64: dataBase64,
        fileName: sanitizePdfFileName(meta)
      } : null;
    }

    const nestedCandidates = [safe.pdfBlob, safe.pdfData, safe.fileData, safe.data].filter(function keepNested(item) {
      return item && typeof item === "object";
    });
    for (let index = 0; index < nestedCandidates.length; index += 1) {
      const nested = extractPdfPayload(nestedCandidates[index], { ...meta, fileName: fileName, mimeType: mimeType });
      if (nested) {
        return nested;
      }
    }

    const explicitBase64 = normalizePdfBase64(safe.pdfBase64 || safe.pdfData || safe.pdfBlob);
    if (explicitBase64) {
      return {
        dataBase64: explicitBase64,
        fileName: sanitizePdfFileName({ ...meta, fileName: fileName })
      };
    }

    if (isPdf) {
      const dataBase64 = normalizePdfBase64(safe.dataBase64 || safe.base64 || safe.contentBase64 || safe.content);
      if (dataBase64) {
        return {
          dataBase64: dataBase64,
          fileName: sanitizePdfFileName({ ...meta, fileName: fileName })
        };
      }
    }

    return null;
  }

  function extractHtmlContent(raw, fallbackMeta) {
    const safe = raw && typeof raw === "object" ? raw : {};
    const meta = fallbackMeta && typeof fallbackMeta === "object" ? fallbackMeta : {};
    const mimeType = cleanString(safe.mimeType || safe.contentType || safe.type || meta.mimeType).toLowerCase();
    const fileName = cleanString(safe.fileName || safe.displayName || safe.name || meta.fileName).toLowerCase();

    if (typeof raw === "string" && (mimeType === "text/html" || /\.html?$/i.test(fileName))) {
      return cleanString(raw);
    }

    const directHtml = cleanString(safe.html || safe.resumeHtml || safe.contentHtml);
    if (directHtml) {
      return directHtml;
    }

    if (mimeType === "text/html" || /\.html?$/i.test(fileName)) {
      if (typeof safe.content === "string") {
        return safe.content;
      }
      const base64Source = cleanString(safe.dataBase64 || safe.base64 || safe.contentBase64);
      if (base64Source) {
        try {
          const dataUrlMatch = base64Source.match(/^data:text\/html;base64,(.+)$/i);
          const binary = atob(dataUrlMatch ? cleanString(dataUrlMatch[1]) : base64Source);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return typeof TextDecoder === "function" ? new TextDecoder("utf-8").decode(bytes) : binary;
        } catch {
          return "";
        }
      }
    }

    return "";
  }

  function buildPdfPayloadFromHtml(htmlText, record) {
    const text = typeof htmlText === "string" ? htmlText : "";
    const builder = globalThis.Stage5ResumePdfBuilder;
    if (!text || !builder || typeof builder.buildTailoredResumePdfBytes !== "function") {
      return null;
    }

    const pdfBytes = builder.buildTailoredResumePdfBytes(null, { htmlText: text });
    if (!(pdfBytes instanceof Uint8Array) || !pdfBytes.length) {
      return null;
    }

    return {
      dataBase64: bytesToBase64(pdfBytes),
      fileName: sanitizePdfFileName(record)
    };
  }

  async function readLocalResumeHtmlContent(record) {
    const safe = record && typeof record === "object" ? record : {};
    const directHtml = extractHtmlContent(safe, safe);
    if (directHtml) {
      return directHtml;
    }

    const storageRefs = Array.isArray(safe.storageRefs) ? safe.storageRefs : [];
    if (resumeRegistryStore && typeof resumeRegistryStore.getCompiledResumeBlobData === "function") {
      for (let index = 0; index < storageRefs.length; index += 1) {
        const blobData = await resumeRegistryStore.getCompiledResumeBlobData(storageRefs[index]);
        const html = extractHtmlContent(blobData, safe);
        if (html) {
          return html;
        }
      }
    }

    const localPayload = await getChromeLocal(LOCAL_RESUME_STORAGE_KEYS.concat(storageRefs));
    for (let index = 0; index < LOCAL_RESUME_STORAGE_KEYS.length; index += 1) {
      const rawRecord = findResumeInStorageValue(localPayload[LOCAL_RESUME_STORAGE_KEYS[index]], safe.id);
      const html = extractHtmlContent(rawRecord, safe);
      if (html) {
        return html;
      }
    }

    for (let index = 0; index < storageRefs.length; index += 1) {
      const html = extractHtmlContent(localPayload[storageRefs[index]], safe);
      if (html) {
        return html;
      }
    }

    return "";
  }

  async function readLocalResumePdfData(record) {
    const safe = record && typeof record === "object" ? record : {};
    const storageRefs = Array.isArray(safe.storageRefs) ? safe.storageRefs : [];
    const directPayload = extractPdfPayload(safe, safe);
    if (directPayload) {
      return directPayload;
    }

    if (resumeRegistryStore && typeof resumeRegistryStore.getCompiledResumeBlobData === "function") {
      for (let index = 0; index < storageRefs.length; index += 1) {
        const blobData = await resumeRegistryStore.getCompiledResumeBlobData(storageRefs[index]);
        const pdfPayload = extractPdfPayload(blobData, safe);
        if (pdfPayload) {
          return pdfPayload;
        }
      }
    }

    const localPayload = await getChromeLocal(LOCAL_RESUME_STORAGE_KEYS.concat(storageRefs));
    for (let index = 0; index < LOCAL_RESUME_STORAGE_KEYS.length; index += 1) {
      const rawRecord = findResumeInStorageValue(localPayload[LOCAL_RESUME_STORAGE_KEYS[index]], safe.id);
      const pdfPayload = extractPdfPayload(rawRecord, safe);
      if (pdfPayload) {
        return pdfPayload;
      }
    }

    for (let index = 0; index < storageRefs.length; index += 1) {
      const pdfPayload = extractPdfPayload(localPayload[storageRefs[index]], safe);
      if (pdfPayload) {
        return pdfPayload;
      }
    }

    const htmlText = await readLocalResumeHtmlContent(safe);
    const generatedPdf = buildPdfPayloadFromHtml(htmlText, safe);
    if (generatedPdf) {
      return generatedPdf;
    }

    return null;
  }

  function findResumeInStorageValue(value, resumeDraftId) {
    const target = cleanString(resumeDraftId);
    if (!target) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.find(function match(item) {
        return getResumeRecordId(item) === target;
      }) || null;
    }

    if (value && typeof value === "object") {
      if (getResumeRecordId(value) === target) {
        return value;
      }
      const direct = value[target];
      if (direct && typeof direct === "object") {
        return direct;
      }
      const keys = Object.keys(value);
      for (let index = 0; index < keys.length; index += 1) {
        const candidate = value[keys[index]];
        if (candidate && typeof candidate === "object" && getResumeRecordId(candidate, keys[index]) === target) {
          return candidate;
        }
      }
    }

    return null;
  }

  function pdfPayloadToBlob(pdfPayload) {
    const safe = pdfPayload && typeof pdfPayload === "object" ? pdfPayload : {};
    if (safe.blob instanceof Blob) {
      return safe.blob;
    }
    if (cleanString(safe.dataBase64)) {
      return base64ToBlob(safe.dataBase64, "application/pdf");
    }
    return null;
  }

  function renderLocalResumePdfPreview(previewEl, record, pdfPayload) {
    if (!previewEl) {
      return;
    }

    const blob = pdfPayloadToBlob(pdfPayload);
    if (!blob) {
      previewEl.innerHTML = "";
      previewEl.hidden = false;
      const message = document.createElement("div");
      message.className = "helper-text";
      message.textContent = "PDF preview is not available for this resume draft.";
      previewEl.appendChild(message);
      return;
    }

    previewEl.innerHTML = "";
    previewEl.hidden = false;
    const previousUrl = cleanString(previewEl.dataset.objectUrl);
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    const objectUrl = URL.createObjectURL(blob);
    previewEl.dataset.objectUrl = objectUrl;
    const frame = document.createElement("iframe");
    frame.title = "Local resume draft PDF preview";
    frame.src = objectUrl;
    frame.style.cssText = "width:100%;height:520px;border:1px solid var(--border);border-radius:7px;background:#fff";
    previewEl.appendChild(frame);
  }

  function revokeLocalResumePreviewUrls(parent) {
    if (!parent || typeof parent.querySelectorAll !== "function") {
      return;
    }
    parent.querySelectorAll(".resume-preview").forEach(function eachPreview(previewEl) {
      const objectUrl = cleanString(previewEl.dataset && previewEl.dataset.objectUrl);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        previewEl.dataset.objectUrl = "";
      }
    });
  }

  function downloadPdfBlob(blob, fileName) {
    if (!(blob instanceof Blob)) {
      return Promise.reject(new Error("PDF blob unavailable"));
    }
    const safeFileName = sanitizePdfFileName({ fileName: fileName });
    const objectUrl = URL.createObjectURL(blob);

    if (globalThis.chrome && chrome.downloads && typeof chrome.downloads.download === "function") {
      return new Promise(function wrap(resolve, reject) {
        chrome.downloads.download({
          url: objectUrl,
          filename: safeFileName,
          saveAs: false
        }, function onDownload(downloadId) {
          URL.revokeObjectURL(objectUrl);
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (typeof downloadId !== "number") {
            reject(new Error("Download API did not return a valid id"));
            return;
          }
          resolve(downloadId);
        });
      });
    }

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeFileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(function revokeLater() {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
    return Promise.resolve();
  }

  function removeResumeFromCollectionValue(value, resumeDraftId, removedRecords) {
    const target = cleanString(resumeDraftId);
    if (!target) {
      return { changed: false, value: value };
    }

    if (Array.isArray(value)) {
      const kept = [];
      let changed = false;
      value.forEach(function eachItem(item) {
        if (getResumeRecordId(item) === target) {
          changed = true;
          removedRecords.push(item);
          return;
        }
        kept.push(item);
      });
      return { changed: changed, value: kept };
    }

    if (value && typeof value === "object") {
      if (getResumeRecordId(value) === target) {
        removedRecords.push(value);
        return { changed: true, value: {} };
      }

      let changed = false;
      const next = { ...value };
      Object.keys(value).forEach(function eachKey(key) {
        const item = value[key];
        if (item && typeof item === "object" && getResumeRecordId(item, key) === target) {
          delete next[key];
          changed = true;
          removedRecords.push(item);
        }
      });
      return { changed: changed, value: next };
    }

    return { changed: false, value: value };
  }

  async function deleteLocalResumeDraft(resumeDraftId, record) {
    const target = cleanString(resumeDraftId);
    if (!target) {
      throw new Error("Missing resume draft ID");
    }

    let deleted = false;
    const refsToRemove = new Set(Array.isArray(record && record.storageRefs) ? record.storageRefs : []);

    const registryPayload = await getChromeLocal([COMPILED_RESUME_REGISTRY_KEY]);
    const registry = Array.isArray(registryPayload[COMPILED_RESUME_REGISTRY_KEY])
      ? registryPayload[COMPILED_RESUME_REGISTRY_KEY]
      : [];
    if (registry.length) {
      const nextRegistry = registry.filter(function keepRegistryItem(item) {
        const id = getResumeRecordId({
          id: cleanString(item && item.resumeId),
          resumeDraftId: cleanString(item && item.resumeDraftId)
        });
        if (id === target) {
          deleted = true;
          getResumeRecordStorageRefs(item).forEach(function addRef(ref) { refsToRemove.add(ref); });
          return false;
        }
        return true;
      });
      if (nextRegistry.length !== registry.length) {
        await setChromeLocal({ [COMPILED_RESUME_REGISTRY_KEY]: nextRegistry });
      }
    }

    if (appDataStore && typeof appDataStore.getAppData === "function" && typeof appDataStore.saveAppData === "function") {
      const appData = await appDataStore.getAppData();
      const generated = Array.isArray(appData && appData.generatedResumes) ? appData.generatedResumes : [];
      const nextGenerated = generated.filter(function keepGenerated(item) {
        if (getResumeRecordId(item) === target) {
          deleted = true;
          getResumeRecordStorageRefs(item).forEach(function addRef(ref) { refsToRemove.add(ref); });
          return false;
        }
        return true;
      });

      if (nextGenerated.length !== generated.length) {
        await appDataStore.saveAppData({
          ...appData,
          generatedResumes: nextGenerated
        });
      }
    }

    const localPayload = await getChromeLocal(LOCAL_RESUME_STORAGE_KEYS);
    const localUpdates = {};
    const removedLocalRecords = [];
    LOCAL_RESUME_STORAGE_KEYS.forEach(function eachKey(storageKey) {
      const result = removeResumeFromCollectionValue(localPayload[storageKey], target, removedLocalRecords);
      if (result.changed) {
        deleted = true;
        localUpdates[storageKey] = result.value;
      }
    });

    removedLocalRecords.forEach(function eachRemoved(item) {
      getResumeRecordStorageRefs(item).forEach(function addRef(ref) { refsToRemove.add(ref); });
    });

    if (Object.keys(localUpdates).length) {
      await setChromeLocal(localUpdates);
    }

    refsToRemove.delete(COMPILED_RESUME_REGISTRY_KEY);
    refsToRemove.delete(appDataStore && appDataStore.APP_DATA_KEY ? appDataStore.APP_DATA_KEY : "profileDataV2");
    refsToRemove.delete("appDataV1");
    refsToRemove.delete("stage11CanonicalAppDataV1");
    LOCAL_RESUME_STORAGE_KEYS.forEach(function keepCollectionKey(storageKey) {
      refsToRemove.delete(storageKey);
    });
    await removeChromeLocal(Array.from(refsToRemove));

    if (!deleted) {
      throw new Error("Resume draft not found");
    }
  }

  async function loadAndRenderLocalResumes() {
    if (!localResumesPanel) return;
    localResumesPanel.textContent = "Loading...";
    localResumesPanel.hidden = false;

    try {
      const allRecords = await readAllLocalResumeRecords();
      if (!allRecords.length) {
        localResumesPanel.textContent = "No local resumes found.";
        return;
      }

      const container = document.createElement("div");
      container.className = "local-resume-list";

      allRecords.forEach(function renderItem(record) {
        const item = document.createElement("div");
        item.className = "item-card local-resume-card";
        item.dataset.resumeDraftId = record.id;

        item.innerHTML = [
          "<div class=\"local-resume-meta\">",
          "<div><strong>Resume Draft ID:</strong> " + escapeHtml(record.id) + "</div>",
          (record.jobTitle ? "<div><strong>Job Title:</strong> " + escapeHtml(record.jobTitle) + "</div>" : ""),
          (record.company ? "<div><strong>Company:</strong> " + escapeHtml(record.company) + "</div>" : ""),
          "<div><strong>Created At:</strong> " + escapeHtml(formatDateLabel(record.createdAt)) + "</div>",
          (record.updatedAt ? "<div><strong>Updated At:</strong> " + escapeHtml(formatDateLabel(record.updatedAt)) + "</div>" : ""),
          (record.fileName ? "<div><strong>File Name:</strong> " + escapeHtml(record.fileName) + "</div>" : ""),
          (record.mimeType ? "<div><strong>MIME Type:</strong> " + escapeHtml(record.mimeType) + "</div>" : ""),
          "</div>",
          "<div class=\"button-row local-resume-actions\">",
          "<button type=\"button\" class=\"secondary-btn small-btn\" data-action=\"view-resume\" data-id=\"" + escapeHtml(record.id) + "\">View</button>",
          "<button type=\"button\" class=\"secondary-btn small-btn\" data-action=\"download-resume\" data-id=\"" + escapeHtml(record.id) + "\">Download</button>",
          "<button type=\"button\" class=\"secondary-btn small-btn\" data-action=\"delete-resume\" data-id=\"" + escapeHtml(record.id) + "\">Delete</button>",
          "</div>",
          "<div class=\"local-resume-confirm\" data-confirm-id=\"" + escapeHtml(record.id) + "\" hidden>",
          "<div><strong>Delete this local resume draft?</strong></div>",
          "<div>This action cannot be undone.</div>",
          "<div class=\"button-row\">",
          "<button type=\"button\" class=\"secondary-btn small-btn\" data-action=\"cancel-delete-resume\" data-id=\"" + escapeHtml(record.id) + "\">Cancel</button>",
          "<button type=\"button\" class=\"primary-btn small-btn\" data-action=\"confirm-delete-resume\" data-id=\"" + escapeHtml(record.id) + "\">Delete</button>",
          "</div>",
          "</div>",
          "<div class=\"resume-preview\" data-preview-id=\"" + escapeHtml(record.id) + "\" hidden></div>"
        ].join("");

        container.appendChild(item);
      });

      revokeLocalResumePreviewUrls(localResumesPanel);
      localResumesPanel.innerHTML = "";
      localResumesPanel.appendChild(container);

      container.addEventListener("click", function handleResumeAction(event) {
        const btn = event.target.closest("button[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const id = cleanString(btn.dataset.id);

        if (action === "delete-resume" && id) {
          const item = btn.closest(".local-resume-card");
          const confirmEl = item && item.querySelector(".local-resume-confirm");
          if (confirmEl) {
            confirmEl.hidden = false;
          }
          return;
        }

        if (action === "cancel-delete-resume" && id) {
          const item = btn.closest(".local-resume-card");
          const confirmEl = item && item.querySelector(".local-resume-confirm");
          if (confirmEl) {
            confirmEl.hidden = true;
          }
          return;
        }

        if (action === "confirm-delete-resume" && id) {
          const record = allRecords.find(function match(item) { return cleanString(item && item.id) === id; }) || null;
          btn.disabled = true;
          void deleteLocalResumeDraft(id, record).then(async function afterDelete() {
            await refreshStateFromStorage().catch(function ignoreRefreshError() {});
            await loadAndRenderLocalResumes();
            renderAll();
            setStatus("Local resume draft deleted.");
          }).catch(function notifyDeleteFailure() {
            setStatus("Could not delete local resume draft.");
          }).finally(function resetDeleteButton() {
            btn.disabled = false;
          });
          return;
        }

        if (action === "download-resume" && id) {
          const record = allRecords.find(function match(itemRecord) {
            return cleanString(itemRecord && itemRecord.id) === id;
          });
          if (!record) {
            setStatus("PDF download is not available for this resume draft.");
            return;
          }

          btn.disabled = true;
          const previousLabel = btn.textContent;
          btn.textContent = "Downloading...";
          (async function downloadResumePdf() {
            try {
              const pdfPayload = await readLocalResumePdfData(record);
              const blob = pdfPayloadToBlob(pdfPayload);
              if (!blob) {
                setStatus("PDF download is not available for this resume draft.");
                return;
              }
              await downloadPdfBlob(blob, sanitizePdfFileName({ ...record, fileName: cleanString(pdfPayload && pdfPayload.fileName) || record.fileName }));
              setStatus("Local resume draft PDF downloaded.");
            } catch {
              setStatus("PDF download is not available for this resume draft.");
            } finally {
              btn.disabled = false;
              btn.textContent = previousLabel;
            }
          })();
          return;
        }

        if (action === "view-resume" && id) {
          const item = btn.closest(".local-resume-card");
          const previewEl = item && item.querySelector(".resume-preview");
          if (!previewEl) {
            return;
          }

          if (!previewEl.hidden) {
            const previousUrl = cleanString(previewEl.dataset.objectUrl);
            if (previousUrl) {
              URL.revokeObjectURL(previousUrl);
              previewEl.dataset.objectUrl = "";
            }
            previewEl.hidden = true;
            previewEl.innerHTML = "";
            return;
          }

          const record = allRecords.find(function match(itemRecord) {
            return cleanString(itemRecord && itemRecord.id) === id;
          });
          if (!record) {
            renderLocalResumePdfPreview(previewEl, { id: id }, null);
            return;
          }

          btn.disabled = true;
          const previousLabel = btn.textContent;
          btn.textContent = "Loading...";
          (async function previewResume() {
            try {
              const pdfPayload = await readLocalResumePdfData(record);
              renderLocalResumePdfPreview(previewEl, record, pdfPayload);
            } catch {
              renderLocalResumePdfPreview(previewEl, record, null);
            } finally {
              btn.disabled = false;
              btn.textContent = previousLabel;
            }
          })();
        }
      });

    } catch (error) {
      localResumesPanel.textContent = "Failed to load local resumes: " + (error instanceof Error ? error.message : String(error));
    }
  }

  // ── AI Editor Mode ──────────────────────────────────────────────────────────

  function renderEditorModeUI() {
    const isAiMode = state.editorMode === "ai";

    const modeSwitchBar = document.getElementById("editor-mode-switch-bar");
    const manualContent = document.getElementById("manual-editor-content");
    const manualGenerateRow = document.getElementById("manual-generate-resume-row");
    const aiChatPanel = document.getElementById("ai-chat-panel");
    const manualBtn = document.getElementById("mode-btn-manual");
    const aiBtn = document.getElementById("mode-btn-ai");

    if (modeSwitchBar) modeSwitchBar.classList.remove("hidden");
    if (manualGenerateRow) manualGenerateRow.classList.toggle("hidden", isAiMode);
    if (manualContent) manualContent.classList.toggle("hidden", isAiMode);
    if (aiChatPanel) aiChatPanel.classList.toggle("hidden", !isAiMode);
    if (manualBtn) manualBtn.classList.toggle("is-active", !isAiMode);
    if (aiBtn) aiBtn.classList.toggle("is-active", isAiMode);
    updateResumeTranslationButton();

    if (isAiMode) {
      renderAiChatMessages();
    } else {
      clearPreviewUpdateTimer();
    }
  }

  function renderAiChatMessages() {
    const container = document.getElementById("ai-chat-messages");
    if (!container) return;

    container.innerHTML = "";
    state.aiChat.messages.forEach(function appendMsg(msg) {
      const div = document.createElement("div");
      div.className = "ai-chat-message " + (msg.role === "user" ? "user" : "assistant");
      div.textContent = cleanString(msg.text);
      container.appendChild(div);
    });

    if (state.aiChat.isThinking) {
      const div = document.createElement("div");
      div.className = "ai-chat-message thinking";
      div.id = "ai-thinking-indicator";
      div.textContent = "Thinking...";
      container.appendChild(div);
    }

    container.scrollTop = container.scrollHeight;
  }

  function appendAiMessage(role, text) {
    state.aiChat.messages.push({ role: role, text: cleanString(text) });
    renderAiChatMessages();
  }

  async function switchEditorMode(mode) {
    if (mode !== "manual" && mode !== "ai") return;

    if (mode === "ai" && state.editorMode === "manual") {
      flushManualResumeEditsToSharedState({ markDirty: true, debounce: false });
      await flushResumeAutosave({ force: true, silent: true });
        ensureResumeAiChatContext();
    } else if (mode === "manual" && state.editorMode === "ai") {
      if (state.resumeAutosave.dirty) {
        await flushResumeAutosave({ force: true, silent: true });
      }
      renderProfile();
      applyUiLanguage(getResumeLanguage());
      renderResume();
    }

    state.editorMode = mode;
    renderEditorModeUI();
  }

  function buildAiResumeSummary() {
    const resume = getActiveResume();
    const rfns = globalThis.ResumeAiFunctions;
    if (rfns && typeof rfns.buildCompactResumeSummary === "function") {
      return rfns.buildCompactResumeSummary(resume);
    }
    return "";
  }

  function getAiSettings() {
    return state.settings && typeof state.settings === "object" ? state.settings : {};
  }

  function hasAiProvider() {
    const resolved = resolveSettingsProvider(getAiSettings(), null);
    return Boolean(resolved.apiKey && resolved.provider && resolved.model);
  }

  function getResumeTranslationLabel(lang) {
    return lang === "zh" ? "將簡歷翻譯成中文" : "Translate Resume to English";
  }

  function updateResumeTranslationButton() {
    if (!translateManualResumeBtn) return;
    const running = Boolean(state.resumeTranslation && state.resumeTranslation.running);
    translateManualResumeBtn.disabled = running;
    translateManualResumeBtn.textContent = running ? "Translating..." : getResumeTranslationLabel(getResumeLanguage());
  }

  function countTextLines(value) {
    return String(value === undefined || value === null ? "" : value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length;
  }

  function isProtectedScalarPath(path, key) {
    const lowered = cleanString(path).toLowerCase();
    const safeKey = cleanString(key).toLowerCase();
    if (["id", "order", "type", "bold", "italic", "waived", "email", "phone"].includes(safeKey)) {
      return true;
    }
    if (lowered.indexOf(".date.") !== -1 || lowered.endsWith(".date")) {
      return true;
    }
    if (lowered.indexOf(".gpa") !== -1) {
      return true;
    }
    if (lowered.indexOf(".contact.firstname") !== -1 || lowered.indexOf(".contact.lastname") !== -1) {
      return true;
    }
    if (lowered.indexOf(".contact.location") !== -1 || lowered.indexOf(".contact.links.") !== -1) {
      return true;
    }
    return false;
  }

  function isProtectedStringValue(value) {
    const text = cleanString(value);
    if (!text) return false;
    if (/https?:\/\/|www\.|linkedin\.com|github\.com|mailto:/i.test(text)) return true;
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return true;
    if (/^\+?[\d\s().-]{7,}$/.test(text)) return true;
    if (/^\d+(\.\d+)?$/.test(text)) return true;
    if (/\bGPA\b\s*:?\s*\d/i.test(text)) return true;
    return false;
  }

  function isNestedSectionTextPath(path, parentLeft) {
    const lowered = cleanString(path).toLowerCase();
    if (lowered.indexOf(".sections[") === -1 && lowered.indexOf("resume.sections[") === -1) {
      return false;
    }
    if (cleanString(parentLeft && parentLeft.type) === "date") {
      return false;
    }
    if (lowered.endsWith(".sectionname")) {
      return false;
    }
    if (lowered.endsWith(".text")) {
      return true;
    }
    if (
      lowered.endsWith(".title.value") ||
      lowered.endsWith(".subtitle.value") ||
      lowered.endsWith(".description.value") ||
      (lowered.indexOf(".bullets[") !== -1 && lowered.endsWith(".value"))
    ) {
      return true;
    }
    return false;
  }

  function isLikelyTranslatableResumeText(value) {
    const text = cleanString(value);
    if (!text || isProtectedStringValue(text)) {
      return false;
    }
    if (!/[A-Za-z\u3400-\u9fff]/.test(text)) {
      return false;
    }
    if (/^[A-Za-z0-9#+.\-/,\s]+$/.test(text) && text.length <= 32 && !/\b(in|for|with|and|built|created|developed|managed|major|minor|coursework|project|experience)\b/i.test(text)) {
      return false;
    }
    return true;
  }

  function sameObjectKeys(left, right) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(function(key, index) {
      return key === rightKeys[index];
    });
  }

  function validateTranslatedResumeShape(source, translated) {
    const failures = [];
    let nestedTranslatableCount = 0;
    let nestedTranslatedCount = 0;

    function fail(message) {
      if (failures.length < 8) {
        failures.push(message);
      }
    }

    function walk(left, right, path, parentLeft) {
      const leftIsArray = Array.isArray(left);
      const rightIsArray = Array.isArray(right);
      if (leftIsArray || rightIsArray) {
        if (!leftIsArray || !rightIsArray) {
          fail(path + " type changed.");
          return;
        }
        if (left.length !== right.length) {
          fail(path + " array length changed.");
          return;
        }
        left.forEach(function(item, index) {
          walk(item, right[index], path + "[" + String(index) + "]", left);
        });
        return;
      }

      const leftIsObject = Boolean(left && typeof left === "object");
      const rightIsObject = Boolean(right && typeof right === "object");
      if (leftIsObject || rightIsObject) {
        if (!leftIsObject || !rightIsObject) {
          fail(path + " type changed.");
          return;
        }
        if (!sameObjectKeys(left, right)) {
          fail(path + " object keys changed.");
          return;
        }
        Object.keys(left).forEach(function(key) {
          walk(left[key], right[key], path ? path + "." + key : key, left);
        });
        return;
      }

      const key = path.split(".").pop().replace(/\[[^\]]+\]/g, "");
      if (isProtectedScalarPath(path, key) && left !== right) {
        if (path.endsWith(".language")) {
          return;
        }
        fail(path + " protected value changed.");
        return;
      }

      if (typeof left === "string" || typeof right === "string") {
        if (isNestedSectionTextPath(path, parentLeft) && isLikelyTranslatableResumeText(left)) {
          nestedTranslatableCount += 1;
          if (cleanString(left) !== cleanString(right)) {
            nestedTranslatedCount += 1;
          }
        }
        if (isProtectedStringValue(left) && left !== right) {
          fail(path + " protected text changed.");
          return;
        }
        if (!cleanString(left) && cleanString(right)) {
          fail(path + " added new text.");
          return;
        }
        if (cleanString(left) && !cleanString(right)) {
          fail(path + " removed text.");
          return;
        }
        if (countTextLines(left) !== countTextLines(right)) {
          fail(path + " line count changed.");
          return;
        }
      }

      if (
        parentLeft &&
        typeof parentLeft === "object" &&
        cleanString(parentLeft.type) === "date" &&
        path.endsWith(".text") &&
        left !== right
      ) {
        fail(path + " date text changed.");
      }
    }

    if (!source || typeof source !== "object" || !translated || typeof translated !== "object") {
      return { ok: false, message: "Translated resume was not a valid object." };
    }
    ["id", "language", "header", "sections"].forEach(function(requiredKey) {
      if (!Object.prototype.hasOwnProperty.call(translated, requiredKey)) {
        fail("Missing required field: " + requiredKey + ".");
      }
    });
    walk(source, translated, "resume", null);

    const sourceSections = Array.isArray(source.sections) ? source.sections : [];
    const translatedSections = Array.isArray(translated.sections) ? translated.sections : [];
    const sourceBulletCount = sourceSections.reduce(function(total, section) {
      const blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
      return total + blocks.reduce(function(blockTotal, block) {
        const lines = Array.isArray(block && block.lines) ? block.lines : [];
        return blockTotal + lines.filter(function(line) { return cleanString(line && line.type) === "bullet"; }).length;
      }, 0);
    }, 0);
    const translatedBulletCount = translatedSections.reduce(function(total, section) {
      const blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
      return total + blocks.reduce(function(blockTotal, block) {
        const lines = Array.isArray(block && block.lines) ? block.lines : [];
        return blockTotal + lines.filter(function(line) { return cleanString(line && line.type) === "bullet"; }).length;
      }, 0);
    }, 0);
    if (sourceBulletCount !== translatedBulletCount) {
      fail("Bullet count changed.");
    }
    if (nestedTranslatableCount > 0 && nestedTranslatedCount === 0) {
      fail("Nested section content was not translated.");
    }

    return failures.length
      ? { ok: false, message: failures[0] }
      : { ok: true, message: "" };
  }

  function getResumeForLanguageFromState(lang) {
    const safeLang = lang === "zh" ? "zh" : "en";

    const dual = ensureDualResumeState();
    return normalizeResumeObject(dual.resumes[safeLang], safeLang);
  }

  function applyTranslatedResumeToState(translatedResume, lang) {
    const safeLang = lang === "zh" ? "zh" : "en";
    const normalized = normalizeResumeObject({
      ...translatedResume,
      language: safeLang
    }, safeLang);

    const dual = ensureDualResumeState();
    dual.resumes[safeLang] = normalized;
    state.appData.resumes = normalizeSharedResumeLanguages(dual.resumes);
    state.appData.activeResumeLanguage = safeLang;
    if (state.appData.profile && typeof state.appData.profile === "object") {
      state.appData.profile.resumeLanguage = safeLang;
    }
  }

  async function handleTranslateManualResume() {
    if (state.editorMode !== "manual") {
      return;
    }
    if (state.resumeTranslation && state.resumeTranslation.running) {
      return;
    }
    if (!api || typeof api.translateResumeJson !== "function") {
      setStatus("Resume translation is unavailable.");
      return;
    }
    if (!hasAiProvider()) {
      setStatus("Resume translation is unavailable because no model provider is configured.");
      return;
    }

    const targetLang = getResumeLanguage();
    const sourceLang = targetLang === "zh" ? "en" : "zh";
    flushManualResumeEditsToSharedState({ markDirty: true, debounce: false });
    const sourceResume = getResumeForLanguageFromState(sourceLang);
    if (!hasResumeContent(sourceResume)) {
      setStatus(sourceLang === "zh" ? "No Chinese resume content is available to translate." : "No English resume content is available to translate.");
      return;
    }

    state.resumeTranslation.running = true;
    updateResumeTranslationButton();
    setStatus("Translating resume...");

    try {
      const result = await api.translateResumeJson({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        resume: sourceResume,
        settings: getAiSettings()
      });
      if (!result || result.ok !== true || !result.translatedResume) {
        throw new Error(cleanString(result && result.error) || "Resume translation failed.");
      }

      const validation = validateTranslatedResumeShape(sourceResume, result.translatedResume);
      if (!validation.ok) {
        throw new Error("Resume translation failed validation: " + validation.message);
      }

      applyTranslatedResumeToState(result.translatedResume, targetLang);
      renderProfile();
      applyUiLanguage(targetLang);
      renderResume();
      markResumeDirty({ debounce: false });
      await flushResumeAutosave({ force: true, silent: true });
      schedulePreviewUpdate({ force: true });
      setStatus("Resume translation completed.");
    } catch (error) {
      setStatus(cleanString(error instanceof Error ? error.message : String(error)) || "Resume translation failed. Current resume was not changed.");
    } finally {
      state.resumeTranslation.running = false;
      updateResumeTranslationButton();
    }
  }

  function getUploadResumeProviderCapabilities() {
    if (api && typeof api.getProviderCapabilities === "function") {
      return api.getProviderCapabilities({ settings: getAiSettings() });
    }
    const resolved = resolveSettingsProvider(getAiSettings(), null);
    const provider = cleanString(resolved.provider).toLowerCase();
    return {
      provider: provider,
      model: cleanString(resolved.model),
      supportsDirectPdfInput: false,
      supportsDirectPdfTextExtraction: false,
      supportsTextCleanup: provider === "minimax" || provider === "openai" || provider === "deepseek" || provider === "ollama"
    };
  }

  function normalizeCandidateText(value) {
    return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function simpleSimilarity(left, right) {
    const a = normalizeCandidateText(left);
    const b = normalizeCandidateText(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.82;
    let common = 0;
    const chars = new Set(a.split(""));
    b.split("").forEach(function countChar(ch) {
      if (chars.has(ch)) common += 1;
    });
    return common / Math.max(a.length, b.length);
  }

  function getLineLabel(lines) {
    const list = Array.isArray(lines) ? lines : [];
    const title = list.find(function findTitle(line) {
      return cleanString(line && line.type) === "title" && cleanString(line && line.text);
    });
    const subtitle = list.find(function findSubtitle(line) {
      return cleanString(line && line.type) === "subtitle" && cleanString(line && line.text);
    });
    const anyLine = list.find(function findAny(line) {
      return cleanString(line && line.text);
    });
    return [cleanString(title && title.text), cleanString(subtitle && subtitle.text)].filter(Boolean).join(" | ") ||
      cleanString(anyLine && anyLine.text);
  }

  function buildRecoveryCandidates(missingTarget, failedCall, resume) {
    const safeError = missingTarget && typeof missingTarget === "object" ? missingTarget : {};
    const safeCall = failedCall && typeof failedCall === "object" ? failedCall : {};
    const args = safeCall.args && typeof safeCall.args === "object" ? safeCall.args : {};
    const missingText = cleanString(safeError.missingId || args.sectionName || args.name || args.sectionId || args.entryId || args.lineId || args.linkId);
    const contact = resume && resume.header && resume.header.contact && typeof resume.header.contact === "object" ? resume.header.contact : {};
    const links = Array.isArray(contact.links) ? contact.links : [];
    const sections = Array.isArray(resume && resume.sections) ? resume.sections : [];
    const sectionCandidates = sections.map(function mapSection(section) {
      const name = cleanString(section && section.sectionName);
      return {
        sectionId: cleanString(section && section.id),
        name: name,
        score: Number(simpleSimilarity(missingText, name).toFixed(2))
      };
    }).sort(function sortScore(a, b) { return b.score - a.score; }).slice(0, 5);

    let entrySourceSections = sections;
    const targetSectionId = cleanString(args.sectionId);
    const knownSection = sections.find(function findSection(section) {
      return cleanString(section && section.id) === targetSectionId;
    });
    if (knownSection) {
      entrySourceSections = [knownSection];
    }
    const entryCandidates = [];
    entrySourceSections.forEach(function eachSection(section) {
      const blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
      blocks.forEach(function eachBlock(block) {
        const label = getLineLabel(block && block.lines);
        entryCandidates.push({
          sectionId: cleanString(section && section.id),
          sectionName: cleanString(section && section.sectionName),
          entryId: cleanString(block && block.id),
          label: label,
          score: Number(simpleSimilarity(missingText, label).toFixed(2))
        });
      });
    });
    entryCandidates.sort(function sortScore(a, b) { return b.score - a.score; });

    return {
      missingType: cleanString(safeError.missingType),
      missingId: cleanString(safeError.missingId),
      sections: sectionCandidates,
      entries: entryCandidates.slice(0, 8),
      links: links.map(function mapLink(link) {
        const text = cleanString(link && link.text);
        return {
          linkId: cleanString(link && link.id),
          text: text,
          score: Number(simpleSimilarity(missingText, text).toFixed(2))
        };
      }).sort(function sortScore(a, b) { return b.score - a.score; }).slice(0, 5)
    };
  }

  function buildMissingTargetError(execResult) {
    const safe = execResult && typeof execResult === "object" ? execResult : {};
    return {
      code: cleanString(safe.code),
      missingType: cleanString(safe.missingType),
      missingId: cleanString(safe.missingId),
      error: cleanString(safe.error),
      appliedCount: Number.isFinite(Number(safe.appliedCount)) ? Number(safe.appliedCount) : 0
    };
  }

  async function selfCheckAiFunctionCalls(userMessage, functionCalls, resumeSummary, settings, guidanceContext, chatHistory) {
    const checkResult = await api.selfCheckFunctionCalls({ userMessage, functionCalls, resumeSummary, settings, guidanceContext, chatHistory });
    if (!checkResult || checkResult.approved !== true) {
      return {
        ok: false,
        message: cleanString(checkResult && checkResult.reason) || "The proposed changes were rejected by the safety check."
      };
    }
    return { ok: true };
  }

  function formatResumeAiChangeSummary(changeSummary) {
    const lines = Array.isArray(changeSummary) ? changeSummary.map(cleanString).filter(Boolean) : [];
    if (!lines.length) return "I updated your resume.";
    return "I updated your resume:\n" + lines.map(function(line) { return "- " + line; }).join("\n");
  }

  function applyAiExecutionResult(execResult, lang) {
    state.appData.resumes[lang] = normalizeResumeObject(execResult.resumeState, lang);
    state.appData.activeResumeLanguage = lang;
    state.appData.resumes = normalizeSharedResumeLanguages(state.appData.resumes);
  }

  async function persistAiExecutionResult(execResult, lang) {
    applyAiExecutionResult(execResult, lang);
    markResumeDirty({ cleanupEmptyObjects: true, language: lang, debounce: false });
    await flushResumeAutosave({
      force: true,
      silent: true,
      cleanupEmptyObjects: true,
      cleanupLanguage: lang
    });
    renderProfile();
    applyUiLanguage(lang);
    renderResume();
    schedulePreviewUpdate({ force: true });
  }

  async function recoverAndExecuteMissingTarget(params) {
    const safe = params && typeof params === "object" ? params : {};
    const rfns = globalThis.ResumeAiFunctions;
    if (!api || typeof api.recoverResumeFunctionCalls !== "function" || !rfns || typeof rfns.executeResumeFunctions !== "function") {
      return { ok: false, message: "Failed to apply changes: " + cleanString(safe.execResult && safe.execResult.error) };
    }

    const currentResume = getActiveResume();
    const resumeSummary = buildAiResumeSummary();
    const failedCall = safe.execResult && safe.execResult.failedCall ? safe.execResult.failedCall : {};
    const missingTarget = buildMissingTargetError(safe.execResult);
    const recovery = await api.recoverResumeFunctionCalls({
      userMessage: safe.userMessage,
      resumeSummary: resumeSummary,
      settings: safe.settings,
      guidanceContext: safe.guidanceContext,
      failedCall: failedCall,
      missingTarget: missingTarget,
      candidates: buildRecoveryCandidates(missingTarget, failedCall, currentResume)
    });

    if (!recovery || recovery.ok !== true) {
      return {
        ok: false,
        message: "I could not find the requested resume target. Please clarify which section or entry to edit."
      };
    }

    const action = cleanString(recovery.action);
    const assistantMessage = cleanString(recovery.assistantMessage);
    if (action === "ask_user" || action === "abort") {
      return { ok: false, message: assistantMessage || "I could not confidently find the right resume target." };
    }

    const functionCalls = Array.isArray(recovery.functionCalls) ? recovery.functionCalls : [];
    if (!functionCalls.length) {
      return { ok: false, message: assistantMessage || "I could not find a safe recovery action." };
    }

    const check = await selfCheckAiFunctionCalls(safe.userMessage, functionCalls, resumeSummary, safe.settings, safe.guidanceContext, safe.chatHistory);
    if (!check.ok) {
      return { ok: false, message: check.message };
    }

    const execResult = rfns.executeResumeFunctions(functionCalls, currentResume);
    if (!execResult || execResult.ok !== true) {
      if (execResult && execResult.targetNotFound) {
        return {
          ok: false,
          message: assistantMessage || "I still could not find the right resume target. Please clarify which section or entry to edit."
        };
      }
      return { ok: false, message: "Failed to apply recovered changes: " + (cleanString(execResult && execResult.error) || "Unknown error.") };
    }

    await persistAiExecutionResult(execResult, safe.lang);
    return {
      ok: true,
      message: assistantMessage || formatResumeAiChangeSummary(execResult.changeSummary),
      changeSummary: Array.isArray(execResult.changeSummary) ? execResult.changeSummary : []
    };
  }

  async function handleAiSend() {
    const inputEl = document.getElementById("ai-chat-input");
    const sendBtn = document.getElementById("ai-chat-send-btn");
    if (!inputEl) return;

    const userMessage = cleanString(inputEl.value);
    if (!userMessage) return;

    if (!hasAiProvider()) {
      appendAiMessage("assistant", "AI Assistant is unavailable because no model provider is configured.");
      return;
    }

    const rfns = globalThis.ResumeAiFunctions;
    if (!rfns || typeof rfns.executeResumeFunctions !== "function") {
      appendAiMessage("assistant", "Resume function executor is unavailable.");
      return;
    }

    const chatHistory = buildVisibleChatHistory(state.aiChat.messages);
    inputEl.value = "";
    appendAiMessage("user", userMessage);

    state.aiChat.isThinking = true;
    if (sendBtn) sendBtn.disabled = true;
    renderAiChatMessages();

    const lang = getResumeLanguage();
    const resumeSummary = buildAiResumeSummary();
    const settings = getAiSettings();

    const guidanceContext = null;

    try {
      const planResult = await api.planResumeEdit({ userMessage, resumeSummary, settings, guidanceContext, chatHistory });

      if (!planResult || planResult.ok !== true) {
        state.aiChat.isThinking = false;
        if (cleanString(planResult && planResult.code) === "FUNCTION_CALL_LIMIT_EXCEEDED") {
          appendAiMessage("assistant", "I need to split that into smaller resume edit batches. Please ask for at most 10 local resume edits at a time.");
        } else {
          appendAiMessage("assistant", cleanString(planResult && planResult.error) || "Failed to process your request. Please try again.");
        }
        return;
      }

      const functionCalls = planResult.functionCalls || [];

      if (functionCalls.length === 0) {
        state.aiChat.isThinking = false;
        appendAiMessage("assistant", cleanString(planResult.assistantMessage) || "I couldn't find a safe action to take for that request.");
        return;
      }

      const checkResult = await selfCheckAiFunctionCalls(userMessage, functionCalls, resumeSummary, settings, guidanceContext, chatHistory);

      if (!checkResult.ok) {
        state.aiChat.isThinking = false;
        appendAiMessage("assistant", checkResult.message);
        return;
      }

      const currentResume = getActiveResume();
      const execResult = rfns.executeResumeFunctions(functionCalls, currentResume);

      if (!execResult || execResult.ok !== true) {
        if (execResult && execResult.targetNotFound) {
          const recoveryResult = await recoverAndExecuteMissingTarget({
            userMessage: userMessage,
            settings: settings,
            guidanceContext: guidanceContext,
            execResult: execResult,
            lang: lang,
            chatHistory: chatHistory
          });
          state.aiChat.isThinking = false;
          if (recoveryResult.ok) {
            const recoveredSummary = Array.isArray(recoveryResult.changeSummary) ? recoveryResult.changeSummary : [];
            const recoveredText = recoveredSummary.length ? formatResumeAiChangeSummary(recoveredSummary) : (cleanString(recoveryResult.message) || "I updated your resume.");
            appendAiMessage("assistant", recoveredText);
            return;
          }
          appendAiMessage("assistant", cleanString(recoveryResult.message) || "I could not find the requested resume target.");
          return;
        }
        state.aiChat.isThinking = false;
        appendAiMessage("assistant", "Failed to apply changes: " + (cleanString(execResult && execResult.error) || "Unknown error."));
        return;
      }

      await persistAiExecutionResult(execResult, lang);

      state.aiChat.isThinking = false;

      appendAiMessage("assistant", formatResumeAiChangeSummary(execResult.changeSummary));

    } catch {
      state.aiChat.isThinking = false;
      appendAiMessage("assistant", "Failed to process your request. Please try again.");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      renderAiChatMessages();
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  function bindEvents() {
    for (const button of [trackerNotesRefreshBtn, trackerDashboardRefreshBtn]) {
      if (button) button.addEventListener("click", () => { void refreshTrackerData(); });
    }
    if (trackerNotesJobEl) {
      trackerNotesJobEl.addEventListener("change", () => {
        state.notesPage.selectedJobId = trackerNotesJobEl.value;
        void loadTrackerNotes(state.notesPage.selectedJobId).catch(error => setTrackerStatus(error.message));
      });
    }
    if (trackerNotesSaveBtn) {
      trackerNotesSaveBtn.addEventListener("click", () => {
        void saveTrackerNotes().catch(error => setTrackerStatus(error.message));
      });
    }
    if (notesAiSaveBtn) {
      notesAiSaveBtn.addEventListener("click", () => {
        void saveLatestNotesAiReply().catch(error => setTrackerStatus(error.message));
      });
    }

    if (openTrackerDashboardBtn) {
      openTrackerDashboardBtn.addEventListener("click", () => { void openTrackerDashboard(); });
    }
    if (trackerSaveBtn) {
      trackerSaveBtn.addEventListener("click", () => {
        void saveTrackerSettingsFromForm().catch((error) => {
          setTrackerStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }
    if (trackerTestBtn) {
      trackerTestBtn.addEventListener("click", () => { void testTrackerConnectionFromForm(); });
    }
    if (trackerImportBtn) {
      trackerImportBtn.addEventListener("click", () => { void importExistingApplicationsToTracker(); });
    }
    if (topTabsEl) {
      topTabsEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const tab = cleanString(target.getAttribute("data-tab"));
        if (!tab) {
          return;
        }
        void (async function switchTopTab() {
          if (state.uploadResume && state.uploadResume.running) {
            setStatus("Resume import is running. Cancel or finish it before switching pages.");
            return;
          }
          if (state.activeTab === "profile-resume") {
            await flushPendingResumeWork();
          }

          setActiveTab(tab);
          if (tab === "dashboard" || tab === "notes") await refreshTrackerData();
        })().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (testAddTextBtn) {
      testAddTextBtn.addEventListener("click", addTestTextObject);
    }

    if (testAddLineBtn) {
      testAddLineBtn.addEventListener("click", addTestLineObject);
    }

    if (testClearBtn) {
      testClearBtn.addEventListener("click", clearTestSandbox);
    }

    if (testViewPdfBtn) {
      testViewPdfBtn.addEventListener("click", () => {
        void handleViewTestPdf();
      });
    }

    if (testSelectedToolbarEl) {
      testSelectedToolbarEl.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const action = cleanString(target.getAttribute("data-test-action"));
        if (action) {
          handleTestSelectedAction(action);
        }
      });
    }

    if (testCanvasEl) {
      testCanvasEl.addEventListener("pointerdown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "button") {
          event.stopPropagation();
          return;
        }
        if (state.testSandbox.editingTextId) {
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLInputElement && activeElement.getAttribute("data-test-object-type") === "text") {
            commitTestTextEditing(activeElement);
          }
          return;
        }
        const objectEl = target.closest("[data-test-object-id]");
        if (!(objectEl instanceof HTMLElement)) {
          clearTestSelection();
          return;
        }
        const objectId = cleanString(objectEl.getAttribute("data-test-object-id"));
        if (!objectId) {
          return;
        }
        if (objectEl.getAttribute("data-test-object-type") === "text") {
          if (event.detail >= 2 || checkAndTrackTestDblClick(objectId)) {
            event.preventDefault();
            event.stopPropagation();
            startTestTextEditing(objectId);
            return;
          }
        } else {
          _testDblClickTrack = { objectId: null, time: 0 };
        }
        if (event.detail >= 2) {
          return;
        }
        state.testSandbox.selectedObjectId = objectId;
        state.testSandbox.editingTextId = null;
        state.testSandbox.originalTextBeforeEdit = "";
        state.testSandbox.draftText = "";
        startTestDrag(objectId, event);
        updateTestSelectionDom(objectId);
        renderTestSelectedToolbar();
      });

      testCanvasEl.addEventListener("dblclick", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (target instanceof HTMLInputElement) {
          return;
        }
        const objectEl = target.closest("[data-test-object-id][data-test-object-type=\"text\"]");
        if (!(objectEl instanceof HTMLElement)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startTestTextEditing(cleanString(objectEl.getAttribute("data-test-object-id")));
      }, true);

      testCanvasEl.addEventListener("focusout", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.getAttribute("data-test-object-type") === "text") {
          commitTestTextEditing(target);
        }
      });

      testCanvasEl.addEventListener("input", (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.getAttribute("data-test-object-type") === "text") {
          updateTestEditingDraft(target);
        }
      });

      testCanvasEl.addEventListener("keydown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.getAttribute("data-test-object-type") !== "text") {
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          target.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelTestTextEditing();
        }
      });
    }

    document.addEventListener("pointermove", handleTestPointerMove);
    document.addEventListener("pointerup", handleTestPointerUp);

    globalThis.addEventListener("hashchange", () => {
      const hashTab = parseTabFromHash();
      if (!hashTab) {
        return;
      }

      void (async function switchHashTab() {
        if (state.uploadResume && state.uploadResume.running) {
          syncHashWithTab(state.activeTab || "dashboard");
          setStatus("Resume import is running. Cancel or finish it before switching pages.");
          return;
        }
        if (state.activeTab === "profile-resume") {
          await flushPendingResumeWork();
        }
        setActiveTab(hashTab);
        if (hashTab === "dashboard" || hashTab === "notes") await refreshTrackerData();
      })().catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    });

    if (saveProfileResumeTopBtn) {
      saveProfileResumeTopBtn.addEventListener("click", () => {
        void saveProfileResumeFromForm().catch(() => {
          setStatus("Failed to save profile.");
        });
      });
    }

    if (uploadResumeProfileTopBtn) {
      uploadResumeProfileTopBtn.addEventListener("click", () => {
        openUploadResumeModal();
      });
    }

    if (generateManualResumeBtn) {
      generateManualResumeBtn.addEventListener("click", () => {
        void handleGenerateManualResumePreview().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (translateManualResumeBtn) {
      translateManualResumeBtn.addEventListener("click", () => {
        void handleTranslateManualResume().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
          if (state.resumeTranslation) {
            state.resumeTranslation.running = false;
          }
          updateResumeTranslationButton();
        });
      });
    }

    if (uploadResumeFileInputEl) {
      uploadResumeFileInputEl.addEventListener("change", () => {
        const file = uploadResumeFileInputEl.files && uploadResumeFileInputEl.files[0] ? uploadResumeFileInputEl.files[0] : null;
        void startUploadResumeImport(file);
      });
    }

    if (uploadResumeCancelBtn) {
      uploadResumeCancelBtn.addEventListener("click", cancelUploadResumeImport);
    }

    if (uploadResumeDoneBtn) {
      uploadResumeDoneBtn.addEventListener("click", closeUploadResumeModal);
    }

    if (uploadResumeCloseBtn) {
      uploadResumeCloseBtn.addEventListener("click", closeUploadResumeModal);
    }

    if (uploadResumePdfPrevBtn) {
      uploadResumePdfPrevBtn.addEventListener("click", () => {
        const uploadState = getUploadResumeState();
        const current = Number(uploadState.pdfCurrentPage || 1);
        if (current > 1) {
          void renderPdfPageInModal(current - 1).catch(() => {});
        }
      });
    }

    if (uploadResumePdfNextBtn) {
      uploadResumePdfNextBtn.addEventListener("click", () => {
        const uploadState = getUploadResumeState();
        const current = Number(uploadState.pdfCurrentPage || 1);
        const total = Number(uploadState.pdfPageCount || 1);
        if (current < total) {
          void renderPdfPageInModal(current + 1).catch(() => {});
        }
      });
    }

    if (uploadResumeUsePastedTextBtn) {
      uploadResumeUsePastedTextBtn.addEventListener("click", () => {
        void handleUsePastedText().catch((error) => {
          setUploadResumeError(cleanString(error instanceof Error ? error.message : String(error)) || "Failed to import pasted text. Please try again.");
        });
      });
    }

    if (uploadResumeCopyMarkdownBtn) {
      uploadResumeCopyMarkdownBtn.addEventListener("click", () => {
        const markdown = cleanString(getUploadResumeState().markdown);
        if (!markdown) return;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          void navigator.clipboard.writeText(markdown).then(() => {
            addUploadResumeLog("Markdown copied.");
          }).catch(() => {
            setStatus("Failed to copy extracted Markdown.");
          });
        }
      });
    }

    if (uploadResumeCopyTextBtn) {
      uploadResumeCopyTextBtn.addEventListener("click", () => {
        const plainText = cleanString(getUploadResumeState().plainText);
        if (!plainText) return;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          void navigator.clipboard.writeText(plainText).then(() => {
            addUploadResumeLog("Text copied.");
          }).catch(() => {
            setStatus("Failed to copy extracted text.");
          });
        }
      });
    }

    // Mode switch buttons
    const editorModeSwitchBar = document.getElementById("editor-mode-switch-bar");
    if (editorModeSwitchBar) {
      editorModeSwitchBar.addEventListener("click", (event) => {
        const btn = event.target instanceof HTMLElement ? event.target.closest("[data-mode]") : null;
        if (!btn) return;
        const mode = cleanString(btn.getAttribute("data-mode"));
        if (mode === "manual" || mode === "ai") {
          void switchEditorMode(mode).catch((error) => {
            setStatus(error instanceof Error ? error.message : String(error));
          });
        }
      });
    }

    // AI chat send button
    const aiChatSendBtn = document.getElementById("ai-chat-send-btn");
    if (aiChatSendBtn) {
      aiChatSendBtn.addEventListener("click", () => {
        void handleAiSend().catch(() => {
          appendAiMessage("assistant", "Failed to process your request. Please try again.");
          state.aiChat.isThinking = false;
          renderAiChatMessages();
          const btn = document.getElementById("ai-chat-send-btn");
          if (btn) btn.disabled = false;
        });
      });
    }

    // AI chat send on Ctrl+Enter / Cmd+Enter
    const aiChatInputEl = document.getElementById("ai-chat-input");
    if (aiChatInputEl) {
      aiChatInputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void handleAiSend().catch(() => {
            appendAiMessage("assistant", "Failed to process your request. Please try again.");
            state.aiChat.isThinking = false;
            renderAiChatMessages();
            const btn = document.getElementById("ai-chat-send-btn");
            if (btn) btn.disabled = false;
          });
        }
      });
    }

    if (addSectionBtn) {
      addSectionBtn.addEventListener("click", () => {
        if (!resumeSectionsListEl) return;
        resumeSectionsListEl.appendChild(createResumeSectionCard(makeResumeSection("", [], resumeSectionsListEl.children.length + 1), resumeSectionsListEl.children.length));
        updateResumeEmptyStates();
        handleManualResumeEdit();
      });
    }

    if (addContactLinkBtn) {
      addContactLinkBtn.addEventListener("click", () => {
        if (!profileLinksListEl) return;
        profileLinksListEl.appendChild(createContactLinkRow({ id: createId("link"), text: "" }));
        updateResumeEmptyStates();
        handleManualResumeEdit();
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-resume-action]") : null;
      if (!(target instanceof HTMLElement)) return;
      const action = cleanString(target.getAttribute("data-resume-action"));
      const sectionCard = target.closest(".resume-section-card");
      const blockCard = target.closest(".resume-entry-card");
      const lineRow = target.closest(".resume-line-row");
      if (action === "delete-contact-link") {
        const linkRow = target.closest(".contact-link-row");
        if (linkRow) linkRow.remove();
      } else if (action === "add-entry" && sectionCard) {
        const blocksList = sectionCard.querySelector("[data-blocks-list]");
        if (blocksList) {
          blocksList.appendChild(createResumeBlockCard(makeResumeBlock({ lines: [] }, blocksList.children.length + 1), blocksList.children.length));
        }
      } else if (action === "delete-section" && sectionCard) {
        sectionCard.remove();
      } else if (action === "delete-entry" && blockCard) {
        blockCard.remove();
      } else if (action === "add-line" && blockCard) {
        const linesList = blockCard.querySelector("[data-lines-list]");
        if (linesList) {
          const lineType = cleanString(target.getAttribute("data-line-type")) || "paragraph";
          linesList.appendChild(createResumeLineRow(createResumeLine(lineType), linesList.children.length));
          const menu = target.closest("details");
          if (menu) menu.open = false;
        }
      } else if (action === "delete-line" && lineRow) {
        lineRow.remove();
      } else if (action === "toggle-line-bold" && lineRow) {
        const active = cleanString(lineRow.dataset.bold) !== "true";
        lineRow.dataset.bold = active ? "true" : "false";
        target.classList.toggle("is-active", active);
      } else if (action === "toggle-line-italic" && lineRow) {
        const active = cleanString(lineRow.dataset.italic) !== "true";
        lineRow.dataset.italic = active ? "true" : "false";
        target.classList.toggle("is-active", active);
      } else if (action === "move-line-up" && lineRow && lineRow.previousElementSibling) {
        lineRow.parentElement.insertBefore(lineRow, lineRow.previousElementSibling);
      } else if (action === "move-line-down" && lineRow && lineRow.nextElementSibling) {
        lineRow.parentElement.insertBefore(lineRow.nextElementSibling, lineRow);
      } else if (action === "move-section-up" && sectionCard && sectionCard.previousElementSibling) {
        sectionCard.parentElement.insertBefore(sectionCard, sectionCard.previousElementSibling);
      } else if (action === "move-section-down" && sectionCard && sectionCard.nextElementSibling) {
        sectionCard.parentElement.insertBefore(sectionCard.nextElementSibling, sectionCard);
      } else if (action === "move-entry-up" && blockCard && blockCard.previousElementSibling) {
        blockCard.parentElement.insertBefore(blockCard, blockCard.previousElementSibling);
      } else if (action === "move-entry-down" && blockCard && blockCard.nextElementSibling) {
        blockCard.parentElement.insertBefore(blockCard.nextElementSibling, blockCard);
      }
      updateResumeEmptyStates();
      handleManualResumeEdit();
    });

    if (addSummaryBtn && summaryListEl) {
      addSummaryBtn.addEventListener("click", () => {
        summaryListEl.appendChild(createSummaryCard({ id: createId("summary"), label: "", text: { en: "", zh: "" }, isDefault: false, enabled: true }));
        updateResumeEmptyStates();
        schedulePreviewUpdate();
      });
    }

    if (addEducationBtn && educationListEl) {
      addEducationBtn.addEventListener("click", () => {
        educationListEl.appendChild(createEducationCard({ id: createId("edu"), school: { en: "", zh: "" }, degree: { en: "", zh: "" }, major: { en: "", zh: "" }, location: { en: "", zh: "" }, startDate: "", endDate: "", gpa: "", coursework: "", description: "", enabled: true }));
        updateResumeEmptyStates();
        schedulePreviewUpdate();
      });
    }

    if (addExperienceBtn && experienceListEl) {
      addExperienceBtn.addEventListener("click", () => {
        experienceListEl.appendChild(createExperienceCard({ id: createId("exp"), company: { en: "", zh: "" }, title: { en: "", zh: "" }, location: { en: "", zh: "" }, bullets: [], enabled: true }));
        updateResumeEmptyStates();
        schedulePreviewUpdate();
      });
    }

    if (addProjectBtn && projectListEl) {
      addProjectBtn.addEventListener("click", () => {
        projectListEl.appendChild(createProjectCard({ id: createId("proj"), name: { en: "", zh: "" }, role: { en: "", zh: "" }, organization: { en: "", zh: "" }, location: { en: "", zh: "" }, bullets: [], enabled: true }));
        updateResumeEmptyStates();
        schedulePreviewUpdate();
      });
    }

    if (summaryListEl) summaryListEl.addEventListener("click", collectCardDeleteHandler);
    if (educationListEl) educationListEl.addEventListener("click", collectCardDeleteHandler);
    if (experienceListEl) experienceListEl.addEventListener("click", collectCardDeleteHandler);
    if (projectListEl) projectListEl.addEventListener("click", collectCardDeleteHandler);

    const editorPanel = document.getElementById("resume-editor-panel");
    if (editorPanel) {
      editorPanel.addEventListener("input", function onEditorInput(event) {
        const manualContent = document.getElementById("manual-editor-content");
        if (manualContent && manualContent.contains(event.target)) {
          handleManualResumeEdit();
        }
      });
      editorPanel.addEventListener("change", function onEditorChange(event) {
        const manualContent = document.getElementById("manual-editor-content");
        if (manualContent && manualContent.contains(event.target)) {
          handleManualResumeEdit();
        }
      });
    }

    // Language radio buttons — also update UI labels and preview status
    ["resume-lang-en", "resume-lang-zh"].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", function(event) {
          event.stopPropagation();

            const previousLang = editorLang === "zh" ? "zh" : "en";
            syncProfileResumeFormIntoState(previousLang);
            state.appData.activeResumeLanguage = getResumeLanguage();
            state.appData.resumes = normalizeSharedResumeLanguages(state.appData.resumes);
            if (state.appData.profile && typeof state.appData.profile === "object") {
              state.appData.profile.resumeLanguage = getResumeLanguage();
            }

          markResumeDirty({ debounce: false });
          renderProfile();
          applyUiLanguage(getResumeLanguage());
          renderResume();
          schedulePreviewUpdate();
          void flushResumeAutosave({ force: true, silent: true }).catch(() => {});
        });
      }
    });

    // Recalculate preview scale on window resize
    globalThis.addEventListener("resize", function() {
      updatePreviewScale();
    });
    globalThis.addEventListener("beforeunload", function handleBeforeUnload() {
      try {
        flushManualResumeEditsToSharedState({ markDirty: false });
        if (state.resumeAutosave.dirty) {
          void flushResumeAutosave({ force: true, silent: true }).catch(() => {});
        }
      } finally {
        releaseCurrentResumePdfArtifact();
      }
    });

    if (autofillSaveBtn) {
      autofillSaveBtn.addEventListener("click", () => {
        void saveAutofillAnswerFromForm().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (autofillRunBtn) {
      autofillRunBtn.addEventListener("click", () => {
        setStatus("Running autofill...");
        void runAutofillFlow().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (autofillAnswerListEl) {
      autofillAnswerListEl.addEventListener("click", (event) => {
        void handleAutofillListClick(event).catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (notesAiSendBtn) {
      notesAiSendBtn.addEventListener("click", () => {
        void handleNotesAiSend();
      });
    }

    if (notesAiClearBtn) {
      notesAiClearBtn.addEventListener("click", () => {
        handleNotesAiClear();
      });
    }

    if (notesAiInputEl) {
      notesAiInputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void handleNotesAiSend();
        }
      });
    }

    if (settingsProviderEl) {
      settingsProviderEl.addEventListener("change", () => {
        renderSettings();
      });
    }

    if (settingsSaveBtn) {
      settingsSaveBtn.addEventListener("click", () => {
        void saveSettingsFromForm().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (settingsTestConnectionBtn) {
      settingsTestConnectionBtn.addEventListener("click", () => {
        void handleTestConnection().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (resetProfileResumeBtn) {
      resetProfileResumeBtn.addEventListener("click", () => {
        void handleResetProfileResumeData();
      });
    }

    if (viewLocalResumesBtn) {
      viewLocalResumesBtn.addEventListener("click", () => {
        void loadAndRenderLocalResumes().catch((error) => {
          setStatus(error instanceof Error ? error.message : String(error));
        });
      });
    }

    if (uploadResumeModalOverlayEl) {
      uploadResumeModalOverlayEl.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) {
          closeUploadResumeModal();
        }
      });
    }
  }

  async function boot() {
    if (!appDataStore || typeof appDataStore.getAppData !== "function") {
      setStatus("AppData store is unavailable.");
      return;
    }

    state.activeTab = parseTabFromHash() || "dashboard";

    await refreshStateFromStorage();
    state.trackerSettings = await tracker.getSettings();
    bindEvents();
    startResumeAutosaveInterval();
    renderAll();
    void refreshTrackerData();
    setStatus("Ready.");
  }

  void boot().catch((error) => {
    setStatus(error instanceof Error ? error.message : String(error));
  });
})();
