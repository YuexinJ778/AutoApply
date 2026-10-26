import {
  ANTHROPIC_VERSION_HEADER,
  DEFAULT_MINIMAX_BASE_URL,
  DEFAULT_MINIMAX_MODEL,
  DEFAULT_MINIMAX_SYSTEM_PROMPT,
  DEFAULT_PROVIDER,
  STORAGE_KEYS
} from "../lib/constants";
import type { ExtensionSettings, JobData } from "../lib/types";

declare const chrome: any;

const DEFAULT_SETTINGS: ExtensionSettings = Object.freeze({
  apiBaseUrl: DEFAULT_MINIMAX_BASE_URL,
  requestTimeoutMs: 30_000,
  autoParseOnExtract: true,
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MINIMAX_MODEL,
  aiCustomInstructions: "",
  providers: {
    openai: {
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini"
    },
    deepseek: {
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      model: ""
    },
    minimax: {
      apiKey: "",
      baseUrl: "https://api.minimax.io",
      model: DEFAULT_MINIMAX_MODEL,
      systemPrompt: DEFAULT_MINIMAX_SYSTEM_PROMPT,
      anthropicVersion: ANTHROPIC_VERSION_HEADER
    },
    ollama: {
      apiKey: "",
      baseUrl: "http://localhost:11434",
      model: ""
    }
  }
});

function getStorageArea() {
  if (!chrome?.storage?.local) {
    throw new Error("chrome.storage.local is unavailable");
  }

  return chrome.storage.local;
}

function setLocal(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    getStorageArea().set(items, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getLocal<T = unknown>(keys: string | string[]): Promise<Record<string, T>> {
  return new Promise((resolve, reject) => {
    getStorageArea().get(keys, (result: Record<string, T>) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result || {});
    });
  });
}

export async function getJobData(): Promise<JobData | null> {
  const result = await getLocal<JobData>([STORAGE_KEYS.JOB_DATA]);
  return result[STORAGE_KEYS.JOB_DATA] || null;
}

export async function setJobData(jobData: JobData): Promise<void> {
  if (!jobData || typeof jobData !== "object") {
    throw new Error("Invalid jobData payload");
  }

  await setLocal({ [STORAGE_KEYS.JOB_DATA]: jobData });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await getLocal<ExtensionSettings>([STORAGE_KEYS.EXTENSION_SETTINGS]);
  const stored = result[STORAGE_KEYS.EXTENSION_SETTINGS];

  if (!stored || typeof stored !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ...DEFAULT_SETTINGS,
    ...stored
  };
}

export async function setSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  if (!settings || typeof settings !== "object") {
    throw new Error("Invalid settings payload");
  }

  const merged = {
    ...(await getSettings()),
    ...settings
  };

  await setLocal({ [STORAGE_KEYS.EXTENSION_SETTINGS]: merged });
  return merged;
}
