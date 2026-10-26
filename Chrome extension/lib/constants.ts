export const STORAGE_KEYS = Object.freeze({
  APP_DATA: "appDataV1",
  JOB_DATA: "jobData",
  EXTENSION_SETTINGS: "extensionSettings",
  AI_CUSTOM_INSTRUCTIONS: "aiCustomInstructions",
  PAGE_SNAPSHOT: "pageSnapshot",
  JOB_POSTING: "jobPosting",
  LAST_PAGE_SNAPSHOT: "LAST_PAGE_SNAPSHOT"
});

export const MESSAGE_TYPES = Object.freeze({
  PING: "PING",
  EXTRACT_CURRENT_PAGE: "EXTRACT_CURRENT_PAGE",
  READ_PAGE_CONTENT: "READ_PAGE_CONTENT",
  GENERATE_RESUME: "GENERATE_RESUME"
});

export const DEFAULT_PROVIDER = "minimax";
export const SUPPORTED_PROVIDERS = Object.freeze(["openai", "deepseek", "minimax", "ollama"]);
export const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io/anthropic";
export const DEFAULT_MINIMAX_MODEL = "MiniMax-M2.5";
export const DEFAULT_MINIMAX_SYSTEM_PROMPT = "You are a helpful assistant.";
export const ANTHROPIC_VERSION_HEADER = "2023-06-01";

// Backward-compatible alias for old naming.
export const DEFAULT_LOCAL_API_BASE_URL = DEFAULT_MINIMAX_BASE_URL;

export const API_ENDPOINTS = Object.freeze({
  GENERATE_RESUME: "/v1/messages"
});

export const ENABLE_RESUME_API_MOCK = false;

export function joinApiUrl(baseUrl: string, endpoint: string): string {
  const normalizedBase = (baseUrl || "").replace(/\/+$/, "");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
}
