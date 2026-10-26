import {
  ANTHROPIC_VERSION_HEADER,
  API_ENDPOINTS,
  DEFAULT_MINIMAX_BASE_URL,
  DEFAULT_MINIMAX_MODEL,
  DEFAULT_MINIMAX_SYSTEM_PROMPT,
  DEFAULT_PROVIDER,
  ENABLE_RESUME_API_MOCK,
  joinApiUrl
} from "./constants";
import type { ExtensionSettings, GenerateResumeRequest, GenerateResumeResponse, MiniMaxSettings } from "./types";

export interface GenerateResumeOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

const MAX_PREVIEW_LENGTH = 12000;
const RESPONSE_PREVIEW_LENGTH = 4000;
const DEFAULT_MAX_TOKENS = 3000;
const JOB_INPUT_MAX_LENGTH = 9000;
const OUTPUT_DIR = "stage5_output";

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const PDF_LEFT_MARGIN = 48;
const PDF_TOP_MARGIN = 56;
const PDF_BOTTOM_MARGIN = 48;
const PDF_LINE_HEIGHT = 14;

type JsonMap = Record<string, unknown>;

interface MiniMaxResolvedConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  requestUrl: string;
  systemPrompt: string;
  anthropicVersion: string;
}

interface ParsedResponse {
  payload: JsonMap;
  rawResponse: string;
  parseError: string;
}

interface TransportInfo {
  status: number;
  statusText: string;
  rawResponse: string;
}

interface BuildErrorOverrides {
  message?: string;
  error?: string;
  code?: string;
  rawResponse?: string;
  responsePreview?: string;
  jsonPath?: string;
  htmlPath?: string;
  pdfPath?: string;
  resumeJson?: unknown;
  tailoredResumeDraft?: unknown;
  artifactStage?: string;
  jobTargetSource?: string;
  candidateSource?: string;
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function clipText(value: unknown, maxLength: number): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (!maxLength || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "\n...[truncated]";
}

function safeStringify(value: unknown, indent = 2): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return "";
  }
}

function getErrorMessage(input: unknown): string {
  if (!input) {
    return "Unknown error";
  }

  if (typeof input === "string" && input.trim()) {
    return input;
  }

  if (typeof input === "object" && input !== null) {
    const message = (input as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }

    const error = (input as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }

    if (error && typeof error === "object") {
      const nestedErrorMessage = (error as { message?: unknown }).message;
      if (typeof nestedErrorMessage === "string" && nestedErrorMessage.trim()) {
        return nestedErrorMessage;
      }
    }

    const serialized = safeStringify(input, 0);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  }

  return String(input);
}

function normalizeMiniMaxBaseUrl(rawBaseUrl: string): string {
  const fallback = DEFAULT_MINIMAX_BASE_URL;
  const initial = rawBaseUrl.trim().replace(/\/+$/, "");

  if (!initial) {
    return fallback;
  }

  const normalized = initial
    .replace(/\/anthropic\/v1\/messages$/i, "")
    .replace(/\/v1\/messages$/i, "");

  if (normalized.includes("api.minimax.io/anthropic")) {
    return normalized;
  }

  if (normalized.includes("api.minimax.io")) {
    return normalized + "/anthropic";
  }

  return fallback;
}

function collectJobDescription(jobData: Record<string, unknown>): string {
  const toLines = (value: string) =>
    cleanString(value)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => cleanString(line))
      .filter(Boolean);

  const isNoise = (line: string) => {
    const normalized = cleanString(line).toLowerCase();
    return (
      normalized.includes("recommended video") ||
      normalized.includes("recommended article") ||
      normalized.includes("similar job") ||
      normalized.includes("you may also like") ||
      normalized.includes("people also viewed") ||
      normalized.includes("wellbeing") ||
      normalized.includes("cookie") ||
      normalized.includes("privacy policy") ||
      normalized.includes("terms of use")
    );
  };

  const toList = (value: unknown, maxItems = 24) => {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    const output: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      const text = cleanString(item);
      if (!text) {
        continue;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(text);
      if (output.length >= maxItems) {
        break;
      }
    }
    return output;
  };

  const source = cleanString(jobData.description) || cleanString(jobData.rawText);
  const primary = toLines(source)
    .filter((line) => !isNoise(line))
    .join("\n")
    .slice(0, Math.floor(JOB_INPUT_MAX_LENGTH * 0.65));

  const responsibilities = toList(jobData.responsibilities);
  const requirements = toList(jobData.requirements);
  const preferred = toList(jobData.preferredQualifications);

  const sections: string[] = [];
  if (primary) {
    sections.push("Primary Job Description:\n" + primary);
  }
  if (responsibilities.length) {
    sections.push("Responsibilities:\n" + responsibilities.map((item) => "- " + item).join("\n"));
  }
  if (requirements.length) {
    sections.push("Requirements:\n" + requirements.map((item) => "- " + item).join("\n"));
  }
  if (preferred.length) {
    sections.push("Preferred Qualifications:\n" + preferred.map((item) => "- " + item).join("\n"));
  }

  return cleanString(sections.join("\n\n")).slice(0, JOB_INPUT_MAX_LENGTH);
}

export function buildRequestPrompt(jobDataInput: unknown): string {
  const jobData = jobDataInput && typeof jobDataInput === "object" ? (jobDataInput as Record<string, unknown>) : {};

  const outputSchema = {
    role: "string",
    title: "string",
    company: "string",
    location: "string",
    summary: "string",
    responsibilities: ["string"],
    requirements: ["string"],
    preferredQualifications: ["string"],
    keywords: ["string"],
    skills: ["string"]
  };

  const instructionLines = [
    "根据以下的 job description 生成 JSON file。",
    "你是一个严谨的职位信息结构化助手。",
    "请根据输入职位信息抽取结构化字段，输出可被后续 resume generation pipeline 直接消费的 JSON。",
    "输出必须是且只能是一个合法 JSON object。",
    "输出第一字符必须是 {，最后一字符必须是 }。",
    "不要输出 markdown code fence，不要输出解释说明，不要输出思考过程，不要输出分析文字。",
    "字段结构必须稳定，严格遵循 OUTPUT_SCHEMA。",
    "当资料缺失或不确定时，字符串字段使用空字符串，列表字段使用空数组。",
    "不要编造公司、地点、职责、技能或资格信息；有歧义时优先保守输出。",
    "优先提取 role/title、company、location、summary、responsibilities、requirements、preferredQualifications、keywords、skills。",
    "summary 保持简洁，建议 2-4 句。",
    "responsibilities / requirements / preferredQualifications 应尽量保留原文语义，按条目输出数组。",
    "最终输出只能是一个 JSON 对象，禁止输出任何其他文字。",
    "不要输出思考过程，不要输出注释，不要输出前后缀。"
  ];

  const context = {
    jobTitleHint: cleanString(jobData.role || jobData.title || jobData.rawTitle),
    companyHint: cleanString(jobData.company),
    locationHint: cleanString(jobData.location),
    jobUrl: cleanString(jobData.jobUrl || jobData.url),
    responsibilitiesHint: Array.isArray(jobData.responsibilities) ? jobData.responsibilities : [],
    requirementsHint: Array.isArray(jobData.requirements) ? jobData.requirements : [],
    preferredQualificationsHint: Array.isArray(jobData.preferredQualifications) ? jobData.preferredQualifications : [],
    jobDescription: collectJobDescription(jobData)
  };

  return (
    instructionLines.join("\n") +
    "\n\nOUTPUT_SCHEMA:\n" +
    JSON.stringify(outputSchema, null, 2) +
    "\n\nJOB_INPUT:\n" +
    JSON.stringify(context, null, 2)
  );
}


export function buildTailoredResumePrompt(jobTargetInput: unknown, candidateResumeInput: unknown): string {
  const scoped = globalThis as typeof globalThis & {
    Stage5TailoredPromptBuilder?: {
      buildTailoredResumePrompt?: (jobTarget: unknown, candidateResume: unknown) => string;
    };
  };

  const builder = scoped.Stage5TailoredPromptBuilder;
  if (builder && typeof builder.buildTailoredResumePrompt === "function") {
    return builder.buildTailoredResumePrompt(jobTargetInput, candidateResumeInput || {});
  }

  return buildRequestPrompt(jobTargetInput) + buildCandidatePromptAddon(candidateResumeInput);
}

interface Phase1Inputs {
  jobTarget: Record<string, unknown>;
  candidateResume: Record<string, unknown>;
  jobTargetSource: string;
  candidateSource: string;
}

function getGlobalPhase1Helpers(): {
  jobTargetBuilder: { loadJobTarget?: (options?: unknown) => Promise<unknown>; buildJobTarget?: (value: unknown) => unknown } | null;
  profileLoader: { loadCandidateProfile?: () => Promise<unknown> } | null;
} {
  const scoped = globalThis as typeof globalThis & {
    Stage5JobTargetBuilder?: {
      loadJobTarget?: (options?: unknown) => Promise<unknown>;
      buildJobTarget?: (value: unknown) => unknown;
    };
    Stage5ProfileLoader?: {
      loadCandidateProfile?: () => Promise<unknown>;
    };
  };

  return {
    jobTargetBuilder: scoped.Stage5JobTargetBuilder || null,
    profileLoader: scoped.Stage5ProfileLoader || null
  };
}

function buildCandidatePromptAddon(candidateResumeInput: unknown): string {
  const source = candidateResumeInput && typeof candidateResumeInput === "object"
    ? (candidateResumeInput as Record<string, unknown>)
    : {};

  const header = source.header && typeof source.header === "object"
    ? (source.header as Record<string, unknown>)
    : {};

  const skills = Array.isArray(source.skills)
    ? source.skills.map((item) => cleanString(item)).filter(Boolean).slice(0, 40)
    : [];

  const experience = Array.isArray(source.experience) ? source.experience : [];
  const highlights: string[] = [];

  for (let index = 0; index < experience.length && highlights.length < 8; index += 1) {
    const item = experience[index] && typeof experience[index] === "object"
      ? (experience[index] as Record<string, unknown>)
      : {};
    const bullets = Array.isArray(item.bullets) ? item.bullets : [];

    for (let bulletIndex = 0; bulletIndex < bullets.length && highlights.length < 8; bulletIndex += 1) {
      const bullet = cleanString(bullets[bulletIndex]);
      if (bullet) {
        highlights.push(bullet);
      }
    }
  }

  const context = {
    name: cleanString(header.name),
    title: cleanString(header.title),
    location: cleanString(header.location),
    summary: cleanString(source.summary),
    skills,
    experienceHighlights: highlights
  };

  if (!context.name && !context.title && !context.summary && !context.skills.length && !context.experienceHighlights.length) {
    return "";
  }

  return "\n\nCANDIDATE_PROFILE_CONTEXT:\n" + JSON.stringify(context, null, 2);
}

async function resolvePhase1Inputs(request: GenerateResumeRequest): Promise<Phase1Inputs> {
  const safeRequest = request && typeof request === "object" ? request : ({ jobData: {} } as GenerateResumeRequest);
  const requestJobData = safeRequest.jobData && typeof safeRequest.jobData === "object"
    ? (safeRequest.jobData as Record<string, unknown>)
    : {};

  let jobTarget: Record<string, unknown> = requestJobData;
  let jobTargetSource = Object.keys(requestJobData).length ? "request.jobData" : "";

  const helpers = getGlobalPhase1Helpers();

  if (helpers.jobTargetBuilder && typeof helpers.jobTargetBuilder.loadJobTarget === "function") {
    try {
      const loaded = await helpers.jobTargetBuilder.loadJobTarget({ jobPosting: requestJobData });
      if (loaded && typeof loaded === "object") {
        const loadedMap = loaded as Record<string, unknown>;
        if (loadedMap.jobTarget && typeof loadedMap.jobTarget === "object") {
          jobTarget = loadedMap.jobTarget as Record<string, unknown>;
        }
        jobTargetSource = cleanString(loadedMap.source) || jobTargetSource;
      }
    } catch {
      // fall back to request payload
    }
  } else if (helpers.jobTargetBuilder && typeof helpers.jobTargetBuilder.buildJobTarget === "function") {
    try {
      const built = helpers.jobTargetBuilder.buildJobTarget(requestJobData);
      if (built && typeof built === "object") {
        jobTarget = built as Record<string, unknown>;
        jobTargetSource = "request.jobData";
      }
    } catch {
      // fall back to request payload
    }
  }

  let candidateResume: Record<string, unknown> = {};
  let candidateSource = "";

  if (helpers.profileLoader && typeof helpers.profileLoader.loadCandidateProfile === "function") {
    try {
      const loadedProfile = await helpers.profileLoader.loadCandidateProfile();
      if (loadedProfile && typeof loadedProfile === "object") {
        const profileMap = loadedProfile as Record<string, unknown>;
        if (profileMap.candidateResume && typeof profileMap.candidateResume === "object") {
          candidateResume = profileMap.candidateResume as Record<string, unknown>;
        }
        candidateSource = cleanString(profileMap.source);
      }
    } catch {
      // optional Phase 1 input only
    }
  }

  return {
    jobTarget,
    candidateResume,
    jobTargetSource,
    candidateSource
  };
}

function resolveMiniMaxConfig(request: GenerateResumeRequest, options: GenerateResumeOptions): MiniMaxResolvedConfig {
  const settings = (request.settings as Partial<ExtensionSettings> | undefined) || {};
  const minimax = (settings.providers?.minimax as MiniMaxSettings | undefined) || {};

  const provider = cleanString(settings.provider) || DEFAULT_PROVIDER;
  const model = cleanString(minimax.model) || cleanString(settings.model) || DEFAULT_MINIMAX_MODEL;
  const rawBaseUrl =
    cleanString(options.baseUrl) ||
    cleanString(minimax.baseUrl) ||
    cleanString(settings.apiBaseUrl) ||
    DEFAULT_MINIMAX_BASE_URL;
  const baseUrl = normalizeMiniMaxBaseUrl(rawBaseUrl);

  return {
    provider,
    apiKey: cleanString(minimax.apiKey) || cleanString(settings.apiKey),
    model,
    baseUrl,
    requestUrl: joinApiUrl(baseUrl, API_ENDPOINTS.GENERATE_RESUME),
    systemPrompt: cleanString(minimax.systemPrompt) || DEFAULT_MINIMAX_SYSTEM_PROMPT,
    anthropicVersion: cleanString(minimax.anthropicVersion) || ANTHROPIC_VERSION_HEADER
  };
}

function buildMiniMaxPayload(config: MiniMaxResolvedConfig, prompt: string): JsonMap {
  return {
    model: config.model,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: config.systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          }
        ]
      }
    ]
  };
}

function buildDebugBase(config: MiniMaxResolvedConfig, prompt: string, payload: JsonMap) {
  return {
    provider: config.provider,
    model: config.model,
    requestUrl: config.requestUrl,
    requestPrompt: prompt,
    requestPayloadPreview: clipText(safeStringify(payload, 2), MAX_PREVIEW_LENGTH)
  };
}

async function parseResponse(response: Response): Promise<ParsedResponse> {
  const raw = await response.text();
  const rawResponse = clipText(raw, MAX_PREVIEW_LENGTH);

  if (!raw.trim()) {
    return { payload: {}, rawResponse, parseError: "" };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      payload: parsed && typeof parsed === "object" ? (parsed as JsonMap) : {},
      rawResponse,
      parseError: ""
    };
  } catch {
    return { payload: {}, rawResponse, parseError: "API returned invalid JSON payload" };
  }
}

function extractTextBlocks(payload: JsonMap): string[] {
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const texts: string[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const type = cleanString((block as JsonMap).type);
    const text = cleanString((block as JsonMap).text);

    if (type === "text" && text) {
      texts.push(text);
    }
  }

  return texts;
}

function stripCodeFence(text: string): string {
  const trimmed = cleanString(text);
  if (!trimmed) {
    return "";
  }

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  const filtered: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (index === 0 && lines[index].trim().startsWith("```")) {
      continue;
    }
    if (index === lines.length - 1 && lines[index].trim().startsWith("```")) {
      continue;
    }
    if (lines[index].trim().startsWith("```")) {
      continue;
    }
    filtered.push(lines[index]);
  }

  return filtered.join("\n").trim();
}

function tryParseJsonObject(text: string): JsonMap | null {
  const trimmed = cleanString(text);
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonMap;
    }
  } catch {
    // ignore
  }

  return null;
}

function findJsonObjectCandidate(text: string): string {
  const source = cleanString(text);
  if (!source) {
    return "";
  }

  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = start; end < source.length; end += 1) {
      const ch = source[end];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") {
        depth += 1;
        continue;
      }

      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = source.slice(start, end + 1);
          if (tryParseJsonObject(candidate)) {
            return candidate;
          }
        }
      }
    }
  }

  return "";
}

function parseModelJson(text: string): { parsed: JsonMap | null; parseError: string } {
  const direct = tryParseJsonObject(text);
  if (direct) {
    return { parsed: direct, parseError: "" };
  }

  const withoutFence = stripCodeFence(text);
  const fenceParsed = tryParseJsonObject(withoutFence);
  if (fenceParsed) {
    return { parsed: fenceParsed, parseError: "" };
  }

  const candidate = findJsonObjectCandidate(withoutFence || text);
  const candidateParsed = tryParseJsonObject(candidate);
  if (candidateParsed) {
    return { parsed: candidateParsed, parseError: "" };
  }

  return {
    parsed: null,
    parseError: "Model returned text, but no valid JSON object could be parsed."
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const text = cleanString(item);
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(text);
  }

  return result;
}

function normalizeModelJson(parsed: JsonMap, jobData: unknown): JsonMap {
  const hints = jobData && typeof jobData === "object" ? (jobData as JsonMap) : {};

  const role = cleanString(parsed.role || parsed.title || hints.role || hints.title || hints.rawTitle);
  const title = cleanString(parsed.title || parsed.role || hints.title || hints.role || hints.rawTitle);

  return {
    role,
    title,
    company: cleanString(parsed.company || hints.company),
    location: cleanString(parsed.location || hints.location),
    summary: cleanString(parsed.summary),
    responsibilities: toStringArray(parsed.responsibilities || parsed.duties),
    requirements: toStringArray(parsed.requirements || parsed.qualifications),
    preferredQualifications: toStringArray(parsed.preferredQualifications || parsed.preferred_qualifications || parsed.niceToHave),
    keywords: toStringArray(parsed.keywords),
    skills: toStringArray(parsed.skills)
  };
}

function slugify(text: unknown, fallback: string): string {
  const value = cleanString(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (value) {
    return value.slice(0, 48);
  }

  return fallback;
}

function formatTimestampForFilename(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "_" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function buildArtifactBaseName(resumeJson: JsonMap): string {
  const timestamp = formatTimestampForFilename(new Date());
  const company = slugify(resumeJson.company, "company");
  const title = slugify(resumeJson.title || resumeJson.role, "role");
  return `${timestamp}_${company}_${title}`;
}

function escapeHtml(text: unknown): string {
  const source = typeof text === "string" ? text : String(text ?? "");
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderList(list: unknown): string {
  if (!Array.isArray(list) || !list.length) {
    return '<p class="empty">(none)</p>';
  }

  let html = "<ul>";
  for (let index = 0; index < list.length; index += 1) {
    html += `<li>${escapeHtml(list[index])}</li>`;
  }
  html += "</ul>";
  return html;
}

function buildResumeHtml(resumeJson: JsonMap): string {
  const title = cleanString(resumeJson.title || resumeJson.role) || "Generated Resume Draft";
  const company = cleanString(resumeJson.company);
  const location = cleanString(resumeJson.location);

  const subtitleParts: string[] = [];
  if (company) {
    subtitleParts.push(company);
  }
  if (location) {
    subtitleParts.push(location);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} - Stage 5 Output</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #f4f6f8; color: #111827; }
      main { max-width: 880px; margin: 0 auto; padding: 24px; }
      .card { background: #ffffff; border: 1px solid #d1d5db; border-radius: 12px; padding: 18px; margin-bottom: 14px; }
      h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.2; }
      .subtitle { margin: 0; font-size: 14px; color: #4b5563; }
      h2 { margin: 0 0 8px; font-size: 18px; }
      p { margin: 0; line-height: 1.55; }
      ul { margin: 0; padding-left: 20px; }
      li { margin: 0 0 6px; line-height: 1.45; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { border: 1px solid #c7d2fe; background: #eef2ff; color: #312e81; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
      .empty { color: #6b7280; font-style: italic; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #374151; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitleParts.join(" | ") || "-")}</p>
      </section>

      <section class="card">
        <h2>Summary</h2>
        <p>${escapeHtml(resumeJson.summary || "") || '<span class="empty">(none)</span>'}</p>
      </section>

      <section class="card">
        <h2>Responsibilities</h2>
        ${renderList(resumeJson.responsibilities)}
      </section>

      <section class="card">
        <h2>Requirements</h2>
        ${renderList(resumeJson.requirements)}
      </section>

      <section class="card">
        <h2>Preferred Qualifications</h2>
        ${renderList(resumeJson.preferredQualifications)}
      </section>

      <section class="card">
        <h2>Keywords</h2>
        <div class="chips">${(Array.isArray(resumeJson.keywords) ? resumeJson.keywords : []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("") || '<span class="empty">(none)</span>'}</div>
      </section>

      <section class="card">
        <h2>Skills</h2>
        <div class="chips">${(Array.isArray(resumeJson.skills) ? resumeJson.skills : []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("") || '<span class="empty">(none)</span>'}</div>
      </section>

      <section class="card">
        <p class="mono">Generated by Stage 5 extension direct MiniMax flow.</p>
      </section>
    </main>
  </body>
</html>`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = cleanString(text).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const lines = [words[0]];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${lines[lines.length - 1]} ${words[index]}`;
    if (candidate.length <= maxChars) {
      lines[lines.length - 1] = candidate;
    } else {
      lines.push(words[index]);
    }
  }

  return lines;
}

function buildPdfLinesFromResume(resumeJson: JsonMap): Array<{ text: string; size: number; indent: number }> {
  const lines: Array<{ text: string; size: number; indent: number }> = [];

  const title = cleanString(resumeJson.title || resumeJson.role) || "Generated Resume Draft";
  const companyLine = [cleanString(resumeJson.company), cleanString(resumeJson.location)].filter(Boolean).join(" | ");
  lines.push({ text: title, size: 18, indent: 0 });
  if (companyLine) {
    lines.push({ text: companyLine, size: 11, indent: 0 });
  }

  const addSection = (name: string) => {
    lines.push({ text: "", size: 11, indent: 0 });
    lines.push({ text: name.toUpperCase(), size: 12, indent: 0 });
  };

  if (cleanString(resumeJson.summary)) {
    addSection("Summary");
    const wrapped = wrapText(cleanString(resumeJson.summary), 88);
    for (const line of wrapped) {
      lines.push({ text: line, size: 11, indent: 0 });
    }
  }

  const sections = [
    { title: "Responsibilities", values: toStringArray(resumeJson.responsibilities) },
    { title: "Requirements", values: toStringArray(resumeJson.requirements) },
    { title: "Preferred Qualifications", values: toStringArray(resumeJson.preferredQualifications) },
    { title: "Keywords", values: toStringArray(resumeJson.keywords) },
    { title: "Skills", values: toStringArray(resumeJson.skills) }
  ];

  for (const section of sections) {
    if (!section.values.length) {
      continue;
    }

    addSection(section.title);
    for (const value of section.values) {
      const wrapped = wrapText(value, 82);
      for (let index = 0; index < wrapped.length; index += 1) {
        const prefix = index === 0 ? "- " : "  ";
        lines.push({ text: `${prefix}${wrapped[index]}`, size: 10, indent: 14 });
      }
    }
  }

  return lines;
}

function sanitizePdfText(text: string): string {
  let output = "";

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const code = text.charCodeAt(index);
    if (code >= 32 && code <= 126) {
      output += ch;
    } else if (ch === "\t" || ch === "\n" || ch === "\r") {
      output += " ";
    } else {
      output += "?";
    }
  }

  return output
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdfContentStream(pageLines: Array<{ text: string; x: number; y: number; size: number }>): string {
  const commands = ["BT", "/F1 11 Tf"];

  for (const line of pageLines) {
    commands.push(`/F1 ${line.size} Tf`);
    commands.push(`1 0 0 1 ${line.x} ${line.y} Tm`);
    commands.push(`(${sanitizePdfText(line.text)}) Tj`);
  }

  commands.push("ET");
  return commands.join("\n");
}

function buildSimplePdf(lines: Array<{ text: string; size: number; indent: number }>): Uint8Array {
  const pages: Array<Array<{ text: string; x: number; y: number; size: number }>> = [[]];
  let currentY = PDF_PAGE_HEIGHT - PDF_TOP_MARGIN;

  const ensureSpace = (requiredLines: number) => {
    const requiredHeight = requiredLines * PDF_LINE_HEIGHT;
    if (currentY - requiredHeight < PDF_BOTTOM_MARGIN) {
      pages.push([]);
      currentY = PDF_PAGE_HEIGHT - PDF_TOP_MARGIN;
    }
  };

  for (const entry of lines) {
    ensureSpace(1);
    pages[pages.length - 1].push({
      text: entry.text,
      x: PDF_LEFT_MARGIN + (entry.indent || 0),
      y: currentY,
      size: entry.size || 11
    });
    currentY -= PDF_LINE_HEIGHT;
  }

  const objects: string[] = [];
  const addObject = (payload: string) => {
    objects.push(payload);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  for (const page of pages) {
    const stream = buildPdfContentStream(page);
    const contentPayload = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    const contentId = addObject(contentPayload);
    contentIds.push(contentId);
    pageIds.push(0);
  }

  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map(() => "0 0 R").join(" ")}] /Count ${pageIds.length} >>`);

  for (let index = 0; index < contentIds.length; index += 1) {
    const pagePayload =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    pageIds[index] = addObject(pagePayload);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n%STAGE5\n";
  const offsets: number[] = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

function hasDownloadApi(): boolean {
  return Boolean((globalThis as any).chrome?.downloads?.download);
}

function downloadBlob(filename: string, blob: Blob): Promise<{ path: string }> {
  return new Promise((resolve, reject) => {
    const chromeApi = (globalThis as any).chrome;
    if (!hasDownloadApi()) {
      reject(new Error("chrome.downloads API is unavailable. Add the downloads permission in manifest."));
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    chromeApi.downloads.download(
      {
        url: objectUrl,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      },
      (downloadId: number) => {
        URL.revokeObjectURL(objectUrl);

        if (chromeApi.runtime?.lastError) {
          reject(new Error(chromeApi.runtime.lastError.message));
          return;
        }

        if (typeof downloadId !== "number") {
          reject(new Error("Download API did not return a valid download id."));
          return;
        }

        if (typeof chromeApi.downloads.search !== "function") {
          resolve({ path: `Downloads/${filename}` });
          return;
        }

        chromeApi.downloads.search({ id: downloadId }, (items: Array<{ filename?: string }>) => {
          if (chromeApi.runtime?.lastError) {
            resolve({ path: `Downloads/${filename}` });
            return;
          }

          if (Array.isArray(items) && items.length > 0 && typeof items[0].filename === "string" && items[0].filename.trim()) {
            resolve({ path: items[0].filename });
            return;
          }

          resolve({ path: `Downloads/${filename}` });
        });
      }
    );
  });
}

async function saveJsonArtifact(resumeJson: JsonMap, baseName: string): Promise<{ path: string }> {
  const jsonText = `${JSON.stringify(resumeJson, null, 2)}\n`;
  const filename = `${OUTPUT_DIR}/${baseName}.json`;
  const download = await downloadBlob(filename, new Blob([jsonText], { type: "application/json" }));
  return { path: download.path };
}

async function saveHtmlArtifact(htmlText: string, baseName: string): Promise<{ path: string }> {
  const filename = `${OUTPUT_DIR}/${baseName}.html`;
  const download = await downloadBlob(filename, new Blob([htmlText], { type: "text/html" }));
  return { path: download.path };
}

async function savePdfArtifact(resumeJson: JsonMap, htmlText: string, baseName: string): Promise<{ path: string }> {
  let lines: Array<{ text: string; size: number; indent: number }> = [];

  if (typeof DOMParser === "function") {
    try {
      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      const text = cleanString(doc?.body?.innerText || "");
      const textLines = text ? text.split(/\r?\n/).map((line) => cleanString(line)).filter(Boolean) : [];
      if (textLines.length) {
        lines = textLines.map((line) => ({ text: line, size: 10, indent: 0 }));
      }
    } catch {
      // ignore
    }
  }

  if (!lines.length) {
    lines = buildPdfLinesFromResume(resumeJson);
  }

  const pdfBytes = buildSimplePdf(lines);
  const filename = `${OUTPUT_DIR}/${baseName}.pdf`;
  const download = await downloadBlob(filename, new Blob([pdfBytes], { type: "application/pdf" }));
  return { path: download.path };
}

function buildErrorResponse(
  payload: JsonMap,
  fallbackMessage: string,
  fallbackCode: string,
  debugBase: ReturnType<typeof buildDebugBase>,
  transport: TransportInfo,
  overrides: BuildErrorOverrides = {}
): GenerateResumeResponse {
  return {
    ok: false,
    message: cleanString(payload.message) || cleanString(overrides.message),
    error: cleanString(overrides.error) || getErrorMessage(payload) || fallbackMessage,
    code: cleanString(overrides.code) || cleanString(payload.code) || fallbackCode,
    provider: cleanString(payload.provider) || debugBase.provider,
    model: cleanString(payload.model) || debugBase.model,
    requestUrl: debugBase.requestUrl,
    requestPrompt: cleanString(payload.requestPrompt) || debugBase.requestPrompt,
    requestPayloadPreview: debugBase.requestPayloadPreview,
    rawResponse: cleanString(payload.rawResponse) || cleanString(overrides.rawResponse) || cleanString(transport.rawResponse),
    responsePreview:
      cleanString(overrides.responsePreview) ||
      cleanString(payload.rawResponsePreview) ||
      clipText(safeStringify(payload, 2) || cleanString(transport.rawResponse), RESPONSE_PREVIEW_LENGTH),
    status: transport.status,
    statusText: transport.statusText,
    jsonPath: cleanString(overrides.jsonPath),
    htmlPath: cleanString(overrides.htmlPath),
    pdfPath: cleanString(overrides.pdfPath),
    resumeJson: overrides.resumeJson,
    tailoredResumeDraft: overrides.tailoredResumeDraft || overrides.resumeJson,
    artifactStage: cleanString(overrides.artifactStage),
    jobTargetSource: cleanString(overrides.jobTargetSource),
    candidateSource: cleanString(overrides.candidateSource)
  };
}

function buildMockResponse(debugBase: ReturnType<typeof buildDebugBase>): GenerateResumeResponse {
  return {
    ok: true,
    message: "Mock resume generation completed.",
    resumeJson: {},
    mocked: true,
    provider: debugBase.provider,
    model: debugBase.model,
    requestUrl: debugBase.requestUrl,
    requestPrompt: debugBase.requestPrompt,
    requestPayloadPreview: debugBase.requestPayloadPreview,
    rawResponse: "[mock] no provider response",
    responsePreview: "[mock] no provider response",
    status: 200,
    statusText: "OK",
    jsonPath: "",
    htmlPath: "",
    pdfPath: ""
  };
}

export async function generateResume(
  request: GenerateResumeRequest,
  options: GenerateResumeOptions = {}
): Promise<GenerateResumeResponse> {
  const phase1Inputs = await resolvePhase1Inputs(request);
  const phase1JobTarget = phase1Inputs.jobTarget && typeof phase1Inputs.jobTarget === "object"
    ? phase1Inputs.jobTarget
    : ((request.jobData && typeof request.jobData === "object") ? (request.jobData as unknown as Record<string, unknown>) : {});
  const phase1CandidateResume = phase1Inputs.candidateResume && typeof phase1Inputs.candidateResume === "object"
    ? phase1Inputs.candidateResume
    : {};

  const scoped = globalThis as typeof globalThis & {
    Stage5TailoredPromptBuilder?: { buildTailoredResumePrompt?: (jobTarget: unknown, candidateResume: unknown) => string; TAILORED_OUTPUT_SCHEMA?: unknown };
    Stage5TailoredJsonParser?: { ERROR_CODE?: string; extractTextBlocks?: (payload: unknown) => string[]; parseTailoredResumeJson?: (input: unknown) => { parsed?: JsonMap | null } | null };
    Stage5TailoredJsonRepair?: { buildTailoredResumeRepairPrompt?: (nonJsonText: string, options?: { maxSourceLength?: number }) => string };
    Stage5TailoredResumeNormalizer?: { normalizeTailoredResumeDraft?: (input: unknown, candidateResume: unknown, jobTarget: unknown) => JsonMap };
    Stage5TailoredResumeMerger?: { mergeTailoredResume?: (candidateResume: unknown, tailoredDraft: unknown, jobTarget?: unknown) => JsonMap };
    Stage5ResumeHtmlBuilder?: { buildTailoredResumeHtml?: (tailoredDraft: unknown, options?: unknown) => string };
    Stage5ResumePdfBuilder?: { buildTailoredResumePdfBytes?: (tailoredDraft: unknown, options?: unknown) => Uint8Array };
    Stage5ArtifactWriter?: {
      buildTailoredArtifactBaseName?: (tailoredDraft: unknown, jobTarget: unknown, options?: unknown) => string;
      writeJsonArtifact?: (tailoredDraft: unknown, options?: unknown) => Promise<{ path?: string }>;
      writeHtmlArtifact?: (htmlText: string, options?: unknown) => Promise<{ path?: string }>;
      writePdfArtifact?: (pdfBytes: Uint8Array | null, options?: unknown) => Promise<{ path?: string }>;
    };
  };

  const promptBuilder = scoped.Stage5TailoredPromptBuilder || null;
  const jsonParser = scoped.Stage5TailoredJsonParser || null;
  const jsonRepair = scoped.Stage5TailoredJsonRepair || null;
  const draftNormalizer = scoped.Stage5TailoredResumeNormalizer || null;
  const resumeMerger = scoped.Stage5TailoredResumeMerger || null;

  const parseFailureCode = cleanString(jsonParser?.ERROR_CODE) || "TAILORED_RESUME_JSON_PARSE_FAILED";

  const config = resolveMiniMaxConfig(request, options);
  const prompt = promptBuilder && typeof promptBuilder.buildTailoredResumePrompt === "function"
    ? promptBuilder.buildTailoredResumePrompt(phase1JobTarget, phase1CandidateResume)
    : buildRequestPrompt(phase1JobTarget) + buildCandidatePromptAddon(phase1CandidateResume);
  const requestPayload = buildMiniMaxPayload(config, prompt);
  const debugBase = buildDebugBase(config, prompt, requestPayload);

  if (config.provider !== DEFAULT_PROVIDER) {
    return buildErrorResponse(
      { error: `Unsupported provider: ${config.provider}`, code: "UNSUPPORTED_PROVIDER" },
      `Unsupported provider: ${config.provider}`,
      "UNSUPPORTED_PROVIDER",
      debugBase,
      { status: 0, statusText: "", rawResponse: "" }
    );
  }

  if (!config.apiKey) {
    return buildErrorResponse(
      { error: "MiniMax API key is missing in extension settings (providers.minimax.apiKey).", code: "MISSING_MINIMAX_API_KEY" },
      "MiniMax API key is missing in extension settings (providers.minimax.apiKey).",
      "MISSING_MINIMAX_API_KEY",
      debugBase,
      { status: 0, statusText: "", rawResponse: "" }
    );
  }

  if (ENABLE_RESUME_API_MOCK) {
    return buildMockResponse(debugBase);
  }

  try {
    const response = await fetch(config.requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
        "anthropic-version": config.anthropicVersion
      },
      body: JSON.stringify(requestPayload),
      signal: options.signal
    });

    const parsed = await parseResponse(response);
    const transport: TransportInfo = {
      status: response.status,
      statusText: response.statusText,
      rawResponse: parsed.rawResponse
    };

    if (parsed.parseError) {
      return buildErrorResponse(
        { error: parsed.parseError, code: "INVALID_JSON_RESPONSE" },
        parsed.parseError,
        "INVALID_JSON_RESPONSE",
        debugBase,
        transport
      );
    }

    const payload = parsed.payload;

    if (!response.ok) {
      return buildErrorResponse(
        payload,
        `HTTP ${response.status} ${response.statusText}`,
        "HTTP_ERROR",
        debugBase,
        transport
      );
    }

    if (
      (typeof payload.ok === "boolean" && payload.ok === false) ||
      cleanString(payload.type) === "error" ||
      (payload.error && typeof payload.error === "object")
    ) {
      return buildErrorResponse(payload, getErrorMessage(payload), "API_ERROR", debugBase, transport);
    }

    const firstPassBlocks = jsonParser && typeof jsonParser.extractTextBlocks === "function"
      ? jsonParser.extractTextBlocks(payload)
      : extractTextBlocks(payload);

    if (!firstPassBlocks.length) {
      return buildErrorResponse(
        { error: "MiniMax response did not contain text content.", code: "MODEL_EMPTY_TEXT" },
        "MiniMax response did not contain text content.",
        "MODEL_EMPTY_TEXT",
        debugBase,
        transport
      );
    }

    const firstPassText = firstPassBlocks.join("\n");
    const parsedFirstPass = jsonParser && typeof jsonParser.parseTailoredResumeJson === "function"
      ? jsonParser.parseTailoredResumeJson(firstPassText)
      : parseModelJson(firstPassText);

    let parsedTailored = parsedFirstPass && parsedFirstPass.parsed ? parsedFirstPass.parsed : null;
    let usedSecondPassRepair = false;
    let previewMarker = "[tailored_first_pass]";

    if (!parsedTailored) {
      const fallbackRepairPrompt = [
        "Convert the following content into one valid JSON object only.",
        "The output must strictly follow OUTPUT_SCHEMA.",
        "The first character must be { and the last character must be }.",
        "Do not output markdown, comments, explanations, or extra text.",
        "Do not invent candidate facts not present in SOURCE_TEXT.",
        "",
        "OUTPUT_SCHEMA:",
        JSON.stringify(promptBuilder?.TAILORED_OUTPUT_SCHEMA || {}, null, 2),
        "",
        "SOURCE_TEXT:",
        cleanString(firstPassText).slice(0, JOB_INPUT_MAX_LENGTH)
      ].join("\n");

      const repairPrompt = jsonRepair && typeof jsonRepair.buildTailoredResumeRepairPrompt === "function"
        ? jsonRepair.buildTailoredResumeRepairPrompt(firstPassText, { maxSourceLength: JOB_INPUT_MAX_LENGTH })
        : fallbackRepairPrompt;

      const repairPayload = buildMiniMaxPayload(config, repairPrompt);

      try {
        const repairResponse = await fetch(config.requestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + config.apiKey,
            "x-api-key": config.apiKey,
            "anthropic-version": config.anthropicVersion
          },
          body: JSON.stringify(repairPayload),
          signal: options.signal
        });

        const repairParsed = await parseResponse(repairResponse);
        const repairTransport: TransportInfo = {
          status: repairResponse.status,
          statusText: repairResponse.statusText,
          rawResponse: repairParsed.rawResponse
        };

        const mergedRaw = clipText(parsed.rawResponse + "\n\n===== TAILORED JSON REPAIR RESPONSE =====\n" + repairParsed.rawResponse, MAX_PREVIEW_LENGTH);

        if (repairParsed.parseError) {
          return buildErrorResponse(
            payload,
            "Tailored draft parse failed after retry.",
            parseFailureCode,
            debugBase,
            repairTransport,
            {
              code: parseFailureCode,
              error: "Tailored first-pass output was non-JSON, and second-pass response JSON parse failed: " + repairParsed.parseError,
              message: "Tailored resume draft generation failed during JSON repair.",
              rawResponse: mergedRaw,
              responsePreview: clipText(
                "[tailored_first_pass_non_json]\n" + firstPassText + "\n\n[tailored_second_pass_invalid_json_response]\n" + repairParsed.parseError,
                RESPONSE_PREVIEW_LENGTH
              )
            }
          );
        }

        const repairBody = repairParsed.payload;

        if (!repairResponse.ok) {
          return buildErrorResponse(
            repairBody,
            "Tailored draft parse failed after retry.",
            parseFailureCode,
            debugBase,
            repairTransport,
            {
              code: parseFailureCode,
              error: "Tailored first-pass output was non-JSON, and second-pass request returned HTTP " + String(repairResponse.status) + " " + repairResponse.statusText,
              message: "Tailored resume draft generation failed during JSON repair.",
              rawResponse: mergedRaw,
              responsePreview: clipText(
                "[tailored_first_pass_non_json]\n" + firstPassText + "\n\n[tailored_second_pass_http_error]\nHTTP " + String(repairResponse.status) + " " + repairResponse.statusText,
                RESPONSE_PREVIEW_LENGTH
              )
            }
          );
        }

        if (
          (typeof repairBody.ok === "boolean" && repairBody.ok === false) ||
          cleanString(repairBody.type) === "error" ||
          (repairBody.error && typeof repairBody.error === "object")
        ) {
          return buildErrorResponse(
            repairBody,
            "Tailored draft parse failed after retry.",
            parseFailureCode,
            debugBase,
            repairTransport,
            {
              code: parseFailureCode,
              error: "Tailored first-pass output was non-JSON, and second-pass request returned API error: " + getErrorMessage(repairBody),
              message: "Tailored resume draft generation failed during JSON repair.",
              rawResponse: mergedRaw,
              responsePreview: clipText(
                "[tailored_first_pass_non_json]\n" + firstPassText + "\n\n[tailored_second_pass_api_error]\n" + getErrorMessage(repairBody),
                RESPONSE_PREVIEW_LENGTH
              )
            }
          );
        }

        const repairBlocks = jsonParser && typeof jsonParser.extractTextBlocks === "function"
          ? jsonParser.extractTextBlocks(repairBody)
          : extractTextBlocks(repairBody);

        if (!repairBlocks.length) {
          return buildErrorResponse(
            repairBody,
            "Tailored draft parse failed after retry.",
            parseFailureCode,
            debugBase,
            repairTransport,
            {
              code: parseFailureCode,
              error: "Tailored first-pass output was non-JSON, and second-pass request returned empty text.",
              message: "Tailored resume draft generation failed during JSON repair.",
              rawResponse: mergedRaw,
              responsePreview: clipText(
                "[tailored_first_pass_non_json]\n" + firstPassText + "\n\n[tailored_second_pass_empty_text]",
                RESPONSE_PREVIEW_LENGTH
              )
            }
          );
        }

        const repairedText = repairBlocks.join("\n");
        const repairedResult = jsonParser && typeof jsonParser.parseTailoredResumeJson === "function"
          ? jsonParser.parseTailoredResumeJson(repairedText)
          : parseModelJson(repairedText);

        if (!repairedResult || !repairedResult.parsed) {
          return buildErrorResponse(
            repairBody,
            "Tailored draft parse failed after retry.",
            parseFailureCode,
            debugBase,
            repairTransport,
            {
              code: parseFailureCode,
              error: "Tailored first-pass output was non-JSON, and second-pass output is still not valid JSON.",
              message: "Tailored resume draft generation failed during JSON repair.",
              rawResponse: mergedRaw,
              responsePreview: clipText(
                "[tailored_first_pass_non_json]\n" + firstPassText + "\n\n[tailored_second_pass_still_non_json]\n" + repairedText,
                RESPONSE_PREVIEW_LENGTH
              )
            }
          );
        }

        parsedTailored = repairedResult.parsed;
        usedSecondPassRepair = true;
        previewMarker = "[tailored_second_pass_repaired]";
        parsed.rawResponse = mergedRaw;
        payload.message = cleanString(repairBody.message) || "Tailored resume draft repaired to JSON on second pass.";
        payload.code = cleanString(repairBody.code) || "TAILORED_SECOND_PASS_REPAIRED";
        payload.error = cleanString(repairBody.error);
      } catch (repairError) {
        return buildErrorResponse(
          payload,
          "Tailored draft parse failed after retry.",
          parseFailureCode,
          debugBase,
          transport,
          {
            code: parseFailureCode,
            error: "Tailored first-pass output was non-JSON, and second-pass request failed: " + getErrorMessage(repairError),
            message: "Tailored resume draft generation failed during JSON repair.",
            responsePreview: clipText(
              "[tailored_first_pass_non_json]\n" + firstPassText + "\n\n[tailored_second_pass_request_failed]\n" + getErrorMessage(repairError),
              RESPONSE_PREVIEW_LENGTH
            )
          }
        );
      }
    }

    const normalizedDraft = draftNormalizer && typeof draftNormalizer.normalizeTailoredResumeDraft === "function"
      ? draftNormalizer.normalizeTailoredResumeDraft(parsedTailored, phase1CandidateResume, phase1JobTarget)
      : (parsedTailored as JsonMap);

    const mergedDraft = resumeMerger && typeof resumeMerger.mergeTailoredResume === "function"
      ? resumeMerger.mergeTailoredResume(phase1CandidateResume, normalizedDraft, phase1JobTarget)
      : normalizedDraft;

    if (!mergedDraft || typeof mergedDraft !== "object") {
      return buildErrorResponse(
        payload,
        "Tailored resume merge failed.",
        "TAILORED_MERGE_FAILED",
        debugBase,
        transport,
        {
          code: "TAILORED_MERGE_FAILED",
          error: "Tailored resume merge returned an invalid object.",
          message: "Tailored resume draft generation failed during deterministic merge."
        }
      );
    }

    const htmlBuilder = scoped.Stage5ResumeHtmlBuilder && typeof scoped.Stage5ResumeHtmlBuilder === "object"
      ? scoped.Stage5ResumeHtmlBuilder
      : null;
    const pdfBuilder = scoped.Stage5ResumePdfBuilder && typeof scoped.Stage5ResumePdfBuilder === "object"
      ? scoped.Stage5ResumePdfBuilder
      : null;
    const artifactWriter = scoped.Stage5ArtifactWriter && typeof scoped.Stage5ArtifactWriter === "object"
      ? scoped.Stage5ArtifactWriter
      : null;

    let baseName = buildArtifactBaseName({
      company: phase1JobTarget.company,
      title: mergedDraft.targetRole || phase1JobTarget.role || phase1JobTarget.title || "tailored_resume"
    });
    if (artifactWriter && typeof artifactWriter.buildTailoredArtifactBaseName === "function") {
      baseName = artifactWriter.buildTailoredArtifactBaseName(mergedDraft, phase1JobTarget, { prefix: "tailored_resume" });
    }

    let jsonPath = "";
    let htmlPath = "";
    let pdfPath = "";
    let htmlText = "";

    try {
      const jsonResult = artifactWriter && typeof artifactWriter.writeJsonArtifact === "function"
        ? await artifactWriter.writeJsonArtifact(mergedDraft, { baseName, jobTarget: phase1JobTarget, tailoredResumeDraft: mergedDraft })
        : await saveJsonArtifact(mergedDraft, baseName);
      jsonPath = cleanString(jsonResult && jsonResult.path);
    } catch (artifactError) {
      return buildErrorResponse(
        payload,
        "Tailored resume JSON artifact write failed.",
        "TAILORED_JSON_WRITE_FAILED",
        debugBase,
        transport,
        {
          code: "TAILORED_JSON_WRITE_FAILED",
          error: getErrorMessage(artifactError),
          message: "Tailored draft generated, but JSON artifact write failed.",
          resumeJson: mergedDraft as JsonMap,
          tailoredResumeDraft: mergedDraft as JsonMap,
          jsonPath,
          htmlPath,
          pdfPath,
          artifactStage: "json_write",
          jobTargetSource: cleanString(phase1Inputs.jobTargetSource),
          candidateSource: cleanString(phase1Inputs.candidateSource),
          responsePreview: clipText(
            previewMarker + "\n" + safeStringify(mergedDraft, 2) + "\n\n[artifact_stage=json_write_failed]\n" + getErrorMessage(artifactError),
            RESPONSE_PREVIEW_LENGTH
          )
        }
      );
    }

    try {
      htmlText = htmlBuilder && typeof htmlBuilder.buildTailoredResumeHtml === "function"
        ? htmlBuilder.buildTailoredResumeHtml(mergedDraft, { jobTarget: phase1JobTarget })
        : buildResumeHtml(mergedDraft as JsonMap);
    } catch (artifactError) {
      return buildErrorResponse(
        payload,
        "Tailored resume HTML build failed.",
        "TAILORED_HTML_BUILD_FAILED",
        debugBase,
        transport,
        {
          code: "TAILORED_HTML_BUILD_FAILED",
          error: getErrorMessage(artifactError),
          message: "Tailored draft and JSON artifact generated, but HTML build failed.",
          resumeJson: mergedDraft as JsonMap,
          tailoredResumeDraft: mergedDraft as JsonMap,
          jsonPath,
          htmlPath,
          pdfPath,
          artifactStage: "html_build",
          jobTargetSource: cleanString(phase1Inputs.jobTargetSource),
          candidateSource: cleanString(phase1Inputs.candidateSource)
        }
      );
    }

    try {
      const htmlResult = artifactWriter && typeof artifactWriter.writeHtmlArtifact === "function"
        ? await artifactWriter.writeHtmlArtifact(htmlText, { baseName, jobTarget: phase1JobTarget, tailoredResumeDraft: mergedDraft })
        : await saveHtmlArtifact(htmlText, baseName);
      htmlPath = cleanString(htmlResult && htmlResult.path);
    } catch (artifactError) {
      return buildErrorResponse(
        payload,
        "Tailored resume HTML artifact write failed.",
        "TAILORED_HTML_WRITE_FAILED",
        debugBase,
        transport,
        {
          code: "TAILORED_HTML_WRITE_FAILED",
          error: getErrorMessage(artifactError),
          message: "Tailored draft and JSON artifact generated, but HTML artifact write failed.",
          resumeJson: mergedDraft as JsonMap,
          tailoredResumeDraft: mergedDraft as JsonMap,
          jsonPath,
          htmlPath,
          pdfPath,
          artifactStage: "html_write",
          jobTargetSource: cleanString(phase1Inputs.jobTargetSource),
          candidateSource: cleanString(phase1Inputs.candidateSource)
        }
      );
    }

    let pdfBytes: Uint8Array | null = null;
    try {
      pdfBytes = pdfBuilder && typeof pdfBuilder.buildTailoredResumePdfBytes === "function"
        ? pdfBuilder.buildTailoredResumePdfBytes(mergedDraft, { htmlText, jobTarget: phase1JobTarget })
        : buildSimplePdf(buildPdfLinesFromResume(mergedDraft as JsonMap));
    } catch (artifactError) {
      return buildErrorResponse(
        payload,
        "Tailored resume PDF build failed.",
        "TAILORED_PDF_BUILD_FAILED",
        debugBase,
        transport,
        {
          code: "TAILORED_PDF_BUILD_FAILED",
          error: getErrorMessage(artifactError),
          message: "Tailored draft with JSON/HTML artifacts generated, but PDF build failed.",
          resumeJson: mergedDraft as JsonMap,
          tailoredResumeDraft: mergedDraft as JsonMap,
          jsonPath,
          htmlPath,
          pdfPath,
          artifactStage: "pdf_build",
          jobTargetSource: cleanString(phase1Inputs.jobTargetSource),
          candidateSource: cleanString(phase1Inputs.candidateSource)
        }
      );
    }

    try {
      const pdfResult = artifactWriter && typeof artifactWriter.writePdfArtifact === "function"
        ? await artifactWriter.writePdfArtifact(pdfBytes, { baseName, jobTarget: phase1JobTarget, tailoredResumeDraft: mergedDraft })
        : await savePdfArtifact(mergedDraft as JsonMap, htmlText, baseName);
      pdfPath = cleanString(pdfResult && pdfResult.path);
    } catch (artifactError) {
      return buildErrorResponse(
        payload,
        "Tailored resume PDF artifact write failed.",
        "TAILORED_PDF_WRITE_FAILED",
        debugBase,
        transport,
        {
          code: "TAILORED_PDF_WRITE_FAILED",
          error: getErrorMessage(artifactError),
          message: "Tailored draft with JSON/HTML artifacts generated, but PDF artifact write failed.",
          resumeJson: mergedDraft as JsonMap,
          tailoredResumeDraft: mergedDraft as JsonMap,
          jsonPath,
          htmlPath,
          pdfPath,
          artifactStage: "pdf_write",
          jobTargetSource: cleanString(phase1Inputs.jobTargetSource),
          candidateSource: cleanString(phase1Inputs.candidateSource)
        }
      );
    }

    const artifactSummary = [
      "jsonPath=" + (jsonPath || "-"),
      "htmlPath=" + (htmlPath || "-"),
      "pdfPath=" + (pdfPath || "-")
    ].join("\n");

    const previewBody = clipText(
      previewMarker + "\n" + safeStringify(mergedDraft, 2) + "\n\n[artifact_write_result]\n" + artifactSummary,
      RESPONSE_PREVIEW_LENGTH
    );

    return {
      ok: true,
      message: usedSecondPassRepair
        ? "Tailored resume artifacts generated after JSON repair."
        : "Tailored resume artifacts generated.",
      resumeJson: mergedDraft,
      tailoredResumeDraft: mergedDraft,
      provider: config.provider,
      model: config.model,
      requestUrl: config.requestUrl,
      requestPrompt: prompt,
      requestPayloadPreview: debugBase.requestPayloadPreview,
      rawResponse: parsed.rawResponse,
      responsePreview: previewBody,
      status: response.status,
      statusText: response.statusText,
      code: usedSecondPassRepair ? "TAILORED_SECOND_PASS_REPAIRED" : (cleanString(payload.code) || "TAILORED_DRAFT_GENERATED"),
      error: cleanString(payload.error),
      jsonPath,
      htmlPath,
      pdfPath,
      artifactStage: "done",
      jobTargetSource: cleanString(phase1Inputs.jobTargetSource),
      candidateSource: cleanString(phase1Inputs.candidateSource)
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error),
      code: "API_REQUEST_FAILED",
      provider: config.provider,
      model: config.model,
      requestUrl: config.requestUrl,
      requestPrompt: debugBase.requestPrompt,
      requestPayloadPreview: debugBase.requestPayloadPreview,
      rawResponse: "",
      responsePreview: clipText(getErrorMessage(error), RESPONSE_PREVIEW_LENGTH),
      status: 0,
      statusText: "",
      jsonPath: "",
      htmlPath: "",
      pdfPath: "",
      jobTargetSource: cleanString(phase1Inputs.jobTargetSource),
      candidateSource: cleanString(phase1Inputs.candidateSource)
    };
  }
}
