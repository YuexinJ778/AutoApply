(function attachStage5Constants(global) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    APP_DATA: "appDataV1",
    JOB_DATA: "jobData",
    EXTENSION_SETTINGS: "extensionSettings",
    AI_CUSTOM_INSTRUCTIONS: "aiCustomInstructions",
    PAGE_SNAPSHOT: "pageSnapshot",
    JOB_POSTING: "jobPosting",
    LAST_PAGE_SNAPSHOT: "LAST_PAGE_SNAPSHOT"
  });

  const MESSAGE_TYPES = Object.freeze({
    PING: "PING",
    EXTRACT_CURRENT_PAGE: "EXTRACT_CURRENT_PAGE",
    READ_PAGE_CONTENT: "READ_PAGE_CONTENT",
    GENERATE_RESUME: "GENERATE_RESUME",
    COLLECT_APPLY_CANDIDATES: "COLLECT_APPLY_CANDIDATES",
    CLICK_APPLY_CANDIDATE: "CLICK_APPLY_CANDIDATE",
    DETECT_APPLICATION_FORM: "DETECT_APPLICATION_FORM",
    GET_CANDIDATE_RECT: "GET_CANDIDATE_RECT",
    SCAN_APPLY_CANDIDATES_FULL: "SCAN_APPLY_CANDIDATES_FULL",
    GET_PAGE_CONTEXT: "GET_PAGE_CONTEXT",
    TESTER_CLICK_ELEMENT: "TESTER_CLICK_ELEMENT",
    TESTER_GET_ELEMENT_RECT: "TESTER_GET_ELEMENT_RECT"
  });

  const DEFAULT_PROVIDER = "minimax";
  const SUPPORTED_PROVIDERS = Object.freeze(["openai", "deepseek", "minimax", "ollama"]);
  const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io/anthropic";
  const DEFAULT_MINIMAX_MODEL = "MiniMax-M2.5";
  const DEFAULT_MINIMAX_SYSTEM_PROMPT = "You are a helpful assistant.";
  const ANTHROPIC_VERSION_HEADER = "2023-06-01";

  // Backward-compatible alias for old naming.
  const DEFAULT_LOCAL_API_BASE_URL = DEFAULT_MINIMAX_BASE_URL;

  const API_ENDPOINTS = Object.freeze({
    GENERATE_RESUME: "/v1/messages"
  });

  const ENABLE_RESUME_API_MOCK = false;

  function joinApiUrl(baseUrl, endpoint) {
    const safeBase = String(baseUrl || "").trim().replace(/\/+$/, "");
    const safeEndpoint = String(endpoint || "").startsWith("/")
      ? String(endpoint || "")
      : `/${String(endpoint || "")}`;

    return `${safeBase}${safeEndpoint}`;
  }

  global.Stage5Constants = Object.freeze({
    STORAGE_KEYS: STORAGE_KEYS,
    MESSAGE_TYPES: MESSAGE_TYPES,
    DEFAULT_PROVIDER: DEFAULT_PROVIDER,
    SUPPORTED_PROVIDERS: SUPPORTED_PROVIDERS,
    DEFAULT_MINIMAX_BASE_URL: DEFAULT_MINIMAX_BASE_URL,
    DEFAULT_MINIMAX_MODEL: DEFAULT_MINIMAX_MODEL,
    DEFAULT_MINIMAX_SYSTEM_PROMPT: DEFAULT_MINIMAX_SYSTEM_PROMPT,
    ANTHROPIC_VERSION_HEADER: ANTHROPIC_VERSION_HEADER,
    DEFAULT_LOCAL_API_BASE_URL: DEFAULT_LOCAL_API_BASE_URL,
    API_ENDPOINTS: API_ENDPOINTS,
    ENABLE_RESUME_API_MOCK: ENABLE_RESUME_API_MOCK,
    joinApiUrl: joinApiUrl
  });
})(globalThis);
