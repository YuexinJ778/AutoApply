(function attachStage5Api(global) {
  "use strict";

  var constants = global.Stage5Constants || {};
  var validation = global.Stage5Validation || {};

  var MAX_PREVIEW_LENGTH = 12000;
  var RESPONSE_PREVIEW_LENGTH = 4000;
  var MAX_CUSTOM_INSTRUCTIONS_LENGTH = 800;
  var DEFAULT_MAX_TOKENS = 3000;
  var DEFAULT_PROVIDER = "minimax";
  var DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io/anthropic";
  var DEFAULT_MINIMAX_MODEL = "MiniMax-M2.5";
  var DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";
  var DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
  var CHAT_HISTORY_VISIBLE_LIMIT = 20;
  var RESUME_MAX_FUNCTION_CALLS = 10;

  var ERROR_CODES = Object.freeze({
    MISSING_CONSTANTS: "MISSING_CONSTANTS",
    UNSUPPORTED_PROVIDER: "UNSUPPORTED_PROVIDER",
    MISSING_JOB_POSTING: "MISSING_JOB_POSTING",
    MISSING_CANDIDATE_PROFILE: "MISSING_CANDIDATE_PROFILE",
    MISSING_MINIMAX_API_KEY: "MISSING_MINIMAX_API_KEY",
    MODEL_REQUEST_FAILED: "MODEL_REQUEST_FAILED",
    MODEL_JSON_PARSE_FAILED: "MODEL_JSON_PARSE_FAILED",
    MODEL_JSON_TRUNCATED_BY_MAX_TOKENS: "MODEL_JSON_TRUNCATED_BY_MAX_TOKENS",
    MODEL_JSON_REPAIR_FAILED: "MODEL_JSON_REPAIR_FAILED",
    TAILORED_DRAFT_NORMALIZE_FAILED: "TAILORED_DRAFT_NORMALIZE_FAILED",
    TAILORED_DRAFT_MERGE_FAILED: "TAILORED_DRAFT_MERGE_FAILED",
    TAILORED_JSON_WRITE_FAILED: "TAILORED_JSON_WRITE_FAILED",
    TAILORED_HTML_BUILD_FAILED: "TAILORED_HTML_BUILD_FAILED",
    TAILORED_HTML_WRITE_FAILED: "TAILORED_HTML_WRITE_FAILED",
    TAILORED_PDF_BUILD_FAILED: "TAILORED_PDF_BUILD_FAILED",
    TAILORED_PDF_WRITE_FAILED: "TAILORED_PDF_WRITE_FAILED"
  });

  var STAGES = Object.freeze({
    INIT: "init",
    SETTINGS: "settings",
    LOAD_JOB: "load_job_posting",
    LOAD_CANDIDATE: "load_candidate_profile",
    BUILD_PROMPT: "build_prompt",
    MODEL_REQUEST: "model_request",
    MODEL_PARSE: "model_parse",
    MODEL_REPAIR: "model_repair",
    NORMALIZE_DRAFT: "normalize_draft",
    MERGE_DRAFT: "merge_draft",
    WRITE_JSON: "write_json_artifact",
    BUILD_HTML: "build_html_artifact",
    WRITE_HTML: "write_html_artifact",
    BUILD_PDF: "build_pdf_artifact",
    WRITE_PDF: "write_pdf_artifact",
    DONE: "done"
  });

  function cleanString(value) {
    if (typeof validation.cleanString === "function") {
      return validation.cleanString(value);
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeCustomInstructions(value) {
    var text = typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : "";
    var cleaned = cleanString(text);
    if (!cleaned) {
      return "";
    }
    return cleaned.length <= MAX_CUSTOM_INSTRUCTIONS_LENGTH ? cleaned : cleaned.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH);
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeVisibleChatHistory(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }
    return messages.map(function normalizeMessage(message) {
      var safe = isObject(message) ? message : {};
      var role = cleanString(safe.role).toLowerCase();
      var text = cleanString(safe.text || safe.content || safe.message);
      if (role !== "user" && role !== "assistant") {
        return null;
      }
      if (!text) {
        return null;
      }
      return { role: role, text: text };
    }).filter(Boolean);
  }

  function formatVisibleChatHistory(messages) {
    var visibleMessages = normalizeVisibleChatHistory(messages);
    if (!visibleMessages.length) {
      return "(no previous visible messages)";
    }
    return visibleMessages.map(function formatMessage(message, index) {
      var label = message.role === "user" ? "User" : "Assistant";
      return "[" + (index + 1) + "] " + label + ":\n" + message.text;
    }).join("\n\n");
  }

  function toStringArray(value) {
    if (typeof validation.toStringArray === "function") {
      return validation.toStringArray(value, 0);
    }
    return Array.isArray(value) ? value : [];
  }

  function clipText(value, maxLength) {
    var source = typeof value === "string" ? value : String(value || "");
    if (!maxLength || source.length <= maxLength) {
      return source;
    }
    return source.slice(0, maxLength) + "\n...[truncated]";
  }

  function safeJsonStringify(value, indent) {
    try {
      return JSON.stringify(value, null, indent || 0);
    } catch {
      return "";
    }
  }

  function getErrorMessage(input) {
    if (!input) {
      return "Unknown error";
    }

    if (typeof input === "string" && input.trim()) {
      return input;
    }

    if (input instanceof Error && typeof input.message === "string" && input.message.trim()) {
      return input.message;
    }

    if (isObject(input)) {
      if (typeof input.message === "string" && input.message.trim()) {
        return input.message;
      }

      if (typeof input.error === "string" && input.error.trim()) {
        return input.error;
      }

      if (isObject(input.error) && typeof input.error.message === "string" && input.error.message.trim()) {
        return input.error.message;
      }

      var serialized = safeJsonStringify(input, 0);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    }

    return String(input);
  }

  function mergeObjects(base, override) {
    var left = isObject(base) ? base : {};
    var right = isObject(override) ? override : {};
    return Object.assign({}, left, right);
  }

  function buildDefaultSettings() {
    return {
      provider: constants.DEFAULT_PROVIDER || DEFAULT_PROVIDER,
      apiBaseUrl: constants.DEFAULT_MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL,
      model: constants.DEFAULT_MINIMAX_MODEL || DEFAULT_MINIMAX_MODEL,
      providers: {
        minimax: {
          apiKey: "",
          baseUrl: constants.DEFAULT_MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL,
          model: constants.DEFAULT_MINIMAX_MODEL || DEFAULT_MINIMAX_MODEL,
          systemPrompt: constants.DEFAULT_MINIMAX_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
          anthropicVersion: constants.ANTHROPIC_VERSION_HEADER || DEFAULT_ANTHROPIC_VERSION
        }
      }
    };
  }

  async function readSettingsFromStorage() {
    if (global.Stage5Storage && typeof global.Stage5Storage.getSettings === "function") {
      try {
        var viaWrapper = await global.Stage5Storage.getSettings();
        return isObject(viaWrapper) ? viaWrapper : {};
      } catch {
        // fallback below
      }
    }

    if (!(global.chrome && chrome.storage && chrome.storage.local)) {
      return {};
    }

    var storageKey =
      constants && constants.STORAGE_KEYS && constants.STORAGE_KEYS.EXTENSION_SETTINGS
        ? constants.STORAGE_KEYS.EXTENSION_SETTINGS
        : "extensionSettings";

    return new Promise(function resolveStorage(resolve) {
      chrome.storage.local.get([storageKey], function onGet(result) {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({});
          return;
        }

        var stored = result && result[storageKey];
        resolve(isObject(stored) ? stored : {});
      });
    });
  }

  async function resolveRuntimeSettings(request) {
    var req = isObject(request) ? request : {};
    var requestSettings = isObject(req.settings) ? req.settings : {};
    var storedSettings = await readSettingsFromStorage();
    var defaults = buildDefaultSettings();

    var merged = mergeObjects(defaults, storedSettings);
    merged.providers = mergeObjects(defaults.providers, storedSettings.providers);
    merged.providers.minimax = mergeObjects(defaults.providers.minimax, isObject(storedSettings.providers) ? storedSettings.providers.minimax : {});

    merged = mergeObjects(merged, requestSettings);
    merged.providers = mergeObjects(merged.providers, requestSettings.providers);
    merged.providers.minimax = mergeObjects(
      defaults.providers.minimax,
      mergeObjects(
        isObject(storedSettings.providers) ? storedSettings.providers.minimax : {},
        isObject(requestSettings.providers) ? requestSettings.providers.minimax : {}
      )
    );

    return {
      settings: merged,
      source:
        Object.keys(requestSettings).length > 0
          ? "request.settings"
          : Object.keys(storedSettings).length > 0
            ? "chrome.storage.local:extensionSettings"
            : "defaults"
    };
  }

  function normalizeMiniMaxBaseUrl(rawBaseUrl) {
    var fallback = constants.DEFAULT_MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL;
    var initial = cleanString(rawBaseUrl).replace(/\/+$/, "");

    if (!initial) {
      return fallback;
    }

    var normalized = initial
      .replace(/\/anthropic\/v1\/messages$/i, "")
      .replace(/\/v1\/messages$/i, "");

    if (normalized.indexOf("api.minimax.io/anthropic") !== -1) {
      return normalized;
    }

    if (normalized.indexOf("api.minimax.io") !== -1) {
      return normalized + "/anthropic";
    }

    return normalized;
  }

  function resolveProviderConfig(settings) {
    var safeSettings = isObject(settings) ? settings : {};
    var minimax = isObject(safeSettings.providers) && isObject(safeSettings.providers.minimax)
      ? safeSettings.providers.minimax
      : {};

    var provider = cleanString(safeSettings.provider) || constants.DEFAULT_PROVIDER || DEFAULT_PROVIDER;
    var model =
      cleanString(minimax.model) ||
      cleanString(safeSettings.model) ||
      constants.DEFAULT_MINIMAX_MODEL ||
      DEFAULT_MINIMAX_MODEL;

    var baseUrl = normalizeMiniMaxBaseUrl(
      cleanString(minimax.baseUrl) ||
      cleanString(safeSettings.apiBaseUrl) ||
      constants.DEFAULT_MINIMAX_BASE_URL ||
      DEFAULT_MINIMAX_BASE_URL
    );

    var endpoint = constants.API_ENDPOINTS && constants.API_ENDPOINTS.GENERATE_RESUME
      ? constants.API_ENDPOINTS.GENERATE_RESUME
      : "/v1/messages";

    var requestUrl = typeof constants.joinApiUrl === "function"
      ? constants.joinApiUrl(baseUrl, endpoint)
      : baseUrl + endpoint;

    return {
      provider: provider,
      model: model,
      apiKey: cleanString(minimax.apiKey) || cleanString(safeSettings.apiKey),
      baseUrl: baseUrl,
      requestUrl: requestUrl,
      systemPrompt: cleanString(minimax.systemPrompt) || constants.DEFAULT_MINIMAX_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
      anthropicVersion: cleanString(minimax.anthropicVersion) || constants.ANTHROPIC_VERSION_HEADER || DEFAULT_ANTHROPIC_VERSION
    };
  }

  function firstNonEmptyValue(values) {
    var list = Array.isArray(values) ? values : [];
    for (var index = 0; index < list.length; index += 1) {
      var next = cleanString(list[index]);
      if (next) {
        return next;
      }
    }
    return "";
  }

  function normalizeProviderName(value) {
    var provider = cleanString(value).toLowerCase();
    if (!provider) {
      return constants.DEFAULT_PROVIDER || DEFAULT_PROVIDER;
    }
    return provider;
  }

  function normalizeBaseUrl(rawBaseUrl, provider) {
    var safeProvider = normalizeProviderName(provider);
    var initial = cleanString(rawBaseUrl).replace(/\/+$/, "");

    if (!initial) {
      if (safeProvider === "openai") {
        return "https://api.openai.com/v1";
      }
      if (safeProvider === "deepseek") {
        return "https://api.deepseek.com/v1";
      }
      if (safeProvider === "ollama") {
        return "http://localhost:11434";
      }
      return normalizeMiniMaxBaseUrl("");
    }

    if (safeProvider === "minimax") {
      return normalizeMiniMaxBaseUrl(initial);
    }

    if (safeProvider === "openai" || safeProvider === "deepseek") {
      var normalized = initial.replace(/\/chat\/completions$/i, "");
      if (!/\/v\d+$/i.test(normalized)) {
        normalized += "/v1";
      }
      return normalized;
    }

    if (safeProvider === "ollama") {
      return initial.replace(/\/api\/chat$/i, "");
    }

    return initial;
  }

  function resolveProviderRuntimeConfig(settings) {
    var safeSettings = isObject(settings) ? settings : {};
    var provider = normalizeProviderName(safeSettings.provider);
    var providers = isObject(safeSettings.providers) ? safeSettings.providers : {};
    var scoped = isObject(providers[provider]) ? providers[provider] : {};

    return {
      provider: provider,
      model: firstNonEmptyValue([scoped.model, safeSettings.model]),
      apiKey: firstNonEmptyValue([scoped.apiKey, safeSettings.apiKey]),
      baseUrl: normalizeBaseUrl(firstNonEmptyValue([scoped.baseUrl, safeSettings.apiBaseUrl]), provider),
      anthropicVersion: firstNonEmptyValue([scoped.anthropicVersion, safeSettings.anthropicVersion, constants.ANTHROPIC_VERSION_HEADER || DEFAULT_ANTHROPIC_VERSION]) || DEFAULT_ANTHROPIC_VERSION,
      systemPrompt: firstNonEmptyValue([scoped.systemPrompt, safeSettings.systemPrompt, constants.DEFAULT_MINIMAX_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT]) || DEFAULT_SYSTEM_PROMPT
    };
  }

  function openAiModelSupportsDirectPdfInput(model) {
    var safeModel = cleanString(model).toLowerCase();
    if (!safeModel) {
      return false;
    }
    if (
      safeModel.indexOf("embedding") !== -1 ||
      safeModel.indexOf("whisper") !== -1 ||
      safeModel.indexOf("tts") !== -1 ||
      safeModel.indexOf("dall-e") !== -1 ||
      safeModel.indexOf("image") !== -1 ||
      safeModel.indexOf("gpt-3.5") !== -1
    ) {
      return false;
    }
    return (
      safeModel.indexOf("gpt-5") !== -1 ||
      safeModel.indexOf("gpt-4.1") !== -1 ||
      safeModel.indexOf("gpt-4o") !== -1 ||
      safeModel.indexOf("o1") !== -1 ||
      safeModel.indexOf("o3") !== -1 ||
      safeModel.indexOf("o4") !== -1
    );
  }

  function supportsDirectPdfTextExtraction(provider, model) {
    return normalizeProviderName(provider) === "openai" && openAiModelSupportsDirectPdfInput(model);
  }

  function getProviderCapabilitiesFromConfig(config) {
    var safeConfig = isObject(config) ? config : {};
    var provider = normalizeProviderName(safeConfig.provider);
    var supportsDirectPdfInput = supportsDirectPdfTextExtraction(provider, safeConfig.model);
    return {
      provider: provider,
      model: cleanString(safeConfig.model),
      supportsDirectPdfInput: supportsDirectPdfInput,
      supportsDirectPdfTextExtraction: supportsDirectPdfInput,
      supportsTextCleanup: provider === "minimax" || provider === "openai" || provider === "deepseek" || provider === "ollama"
    };
  }

  function getProviderCapabilities(request) {
    var req = isObject(request) ? request : {};
    var config = resolveProviderRuntimeConfig(isObject(req.settings) ? req.settings : {});
    return getProviderCapabilitiesFromConfig(config);
  }

  async function callOpenAiLikeProvider(config, prompt, options) {
    var endpoint = "/chat/completions";
    var requestUrl = typeof constants.joinApiUrl === "function"
      ? constants.joinApiUrl(config.baseUrl, endpoint)
      : config.baseUrl + endpoint;

    var payload = {
      model: config.model,
      messages: [
        { role: "system", content: config.systemPrompt || DEFAULT_SYSTEM_PROMPT },
        { role: "user", content: cleanString(prompt) }
      ],
      temperature: 0
    };

    var response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.apiKey
      },
      body: JSON.stringify(payload),
      signal: options && options.signal
    });

    var raw = await response.text();
    var parsedPayload = {};
    var parseError = "";
    if (cleanString(raw)) {
      try {
        parsedPayload = JSON.parse(raw);
      } catch {
        parseError = "Provider returned invalid JSON payload.";
      }
    }

    return {
      response: response,
      payload: isObject(parsedPayload) ? parsedPayload : {},
      rawResponse: clipText(raw, MAX_PREVIEW_LENGTH),
      parseError: parseError,
      requestPayloadPreview: clipText(safeJsonStringify(payload, 2), MAX_PREVIEW_LENGTH)
    };
  }

  async function callOllamaProvider(config, prompt, options) {
    var endpoint = "/api/chat";
    var requestUrl = typeof constants.joinApiUrl === "function"
      ? constants.joinApiUrl(config.baseUrl, endpoint)
      : config.baseUrl + endpoint;

    var payload = {
      model: config.model,
      stream: false,
      messages: [
        { role: "system", content: config.systemPrompt || DEFAULT_SYSTEM_PROMPT },
        { role: "user", content: cleanString(prompt) }
      ]
    };

    var headers = {
      "Content-Type": "application/json"
    };
    if (cleanString(config.apiKey)) {
      headers.Authorization = "Bearer " + config.apiKey;
    }

    var response = await fetch(requestUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: options && options.signal
    });

    var raw = await response.text();
    var parsedPayload = {};
    var parseError = "";
    if (cleanString(raw)) {
      try {
        parsedPayload = JSON.parse(raw);
      } catch {
        parseError = "Provider returned invalid JSON payload.";
      }
    }

    return {
      response: response,
      payload: isObject(parsedPayload) ? parsedPayload : {},
      rawResponse: clipText(raw, MAX_PREVIEW_LENGTH),
      parseError: parseError,
      requestPayloadPreview: clipText(safeJsonStringify(payload, 2), MAX_PREVIEW_LENGTH)
    };
  }

  function extractProviderText(provider, payload) {
    var safeProvider = normalizeProviderName(provider);
    var safePayload = isObject(payload) ? payload : {};

    if (safeProvider === "minimax") {
      return extractTextBlocks(safePayload).join("\n");
    }

    if (safeProvider === "openai" || safeProvider === "deepseek") {
      if (Array.isArray(safePayload.output)) {
        var outputTexts = [];
        safePayload.output.forEach(function eachOutput(outputItem) {
          var contentItems = Array.isArray(outputItem && outputItem.content) ? outputItem.content : [];
          contentItems.forEach(function eachContent(contentItem) {
            var text = cleanString(contentItem && (contentItem.text || contentItem.output_text));
            if (text) {
              outputTexts.push(text);
            }
          });
        });
        if (outputTexts.length) {
          return outputTexts.join("\n");
        }
      }
      if (cleanString(safePayload.output_text)) {
        return cleanString(safePayload.output_text);
      }
      var choices = Array.isArray(safePayload.choices) ? safePayload.choices : [];
      var first = choices.length ? choices[0] : {};
      var message = isObject(first && first.message) ? first.message : {};
      return cleanString(message.content);
    }

    if (safeProvider === "ollama") {
      var messageObject = isObject(safePayload.message) ? safePayload.message : {};
      return cleanString(messageObject.content || safePayload.response);
    }

    return "";
  }

  function buildInvalidSettingsResult() {
    return {
      ok: false,
      code: "INVALID_API_SETTINGS",
      error: "API settings are incomplete."
    };
  }

  async function runProviderPrompt(request, options) {
    var req = isObject(request) ? request : {};
    var prompt = cleanString(req.prompt);
    if (!prompt) {
      return {
        ok: false,
        code: "INVALID_PROMPT",
        error: "Prompt is required."
      };
    }

    var resolved = await resolveRuntimeSettings(req);
    var config = resolveProviderRuntimeConfig(resolved.settings);

    if (!config.provider || !config.model || !config.apiKey) {
      return buildInvalidSettingsResult();
    }

    var callResult;
    try {
      if (config.provider === "minimax") {
        callResult = await callMiniMax({
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
          requestUrl: (typeof constants.joinApiUrl === "function"
            ? constants.joinApiUrl(config.baseUrl, constants.API_ENDPOINTS && constants.API_ENDPOINTS.GENERATE_RESUME ? constants.API_ENDPOINTS.GENERATE_RESUME : "/v1/messages")
            : config.baseUrl + (constants.API_ENDPOINTS && constants.API_ENDPOINTS.GENERATE_RESUME ? constants.API_ENDPOINTS.GENERATE_RESUME : "/v1/messages")),
          systemPrompt: config.systemPrompt,
          anthropicVersion: config.anthropicVersion
        }, prompt, options || {});
      } else if (config.provider === "openai" || config.provider === "deepseek") {
        callResult = await callOpenAiLikeProvider(config, prompt, options || {});
      } else if (config.provider === "ollama") {
        callResult = await callOllamaProvider(config, prompt, options || {});
      } else {
        return {
          ok: false,
          code: "UNSUPPORTED_PROVIDER",
          error: "Unsupported provider."
        };
      }
    } catch {
      return {
        ok: false,
        code: "MODEL_REQUEST_FAILED",
        error: "Connection request failed."
      };
    }

    if (!callResult || callResult.parseError) {
      return {
        ok: false,
        code: "MODEL_RESPONSE_PARSE_FAILED",
        error: "Provider response parse failed."
      };
    }

    if (!callResult.response || callResult.response.ok !== true) {
      return {
        ok: false,
        code: "MODEL_REQUEST_FAILED",
        error: "Connection request failed.",
        status: callResult && callResult.response ? callResult.response.status : 0
      };
    }

    var text = extractProviderText(config.provider, callResult.payload);
    return {
      ok: Boolean(text),
      code: text ? "OK" : "EMPTY_RESPONSE",
      error: text ? "" : "Provider response was empty.",
      provider: config.provider,
      model: config.model,
      text: text
    };
  }

  function parsePotentialJsonObject(input) {
    var source = cleanString(input)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (!source) {
      return null;
    }

    try {
      var direct = JSON.parse(source);
      return isObject(direct) ? direct : null;
    } catch {
      // continue
    }

    var start = source.indexOf("{");
    var end = source.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      var sliced = JSON.parse(source.slice(start, end + 1));
      return isObject(sliced) ? sliced : null;
    } catch {
      return null;
    }
  }

  function buildJsonRetryInstruction(retryReason, schemaText) {
    var reason = cleanString(retryReason);
    if (!reason) return "";
    return [
      "Your previous response could not be parsed or validated.",
      "Previous response was invalid because: " + reason,
      "Return ONLY valid JSON.",
      "Do not wrap JSON in markdown code fences.",
      "Do not include explanations before or after JSON.",
      "Use exactly this schema:",
      schemaText
    ].join("\n");
  }

  async function testConnection(request, options) {
    var result = await runProviderPrompt({
      settings: isObject(request) ? request.settings : {},
      prompt: "Reply with OK only."
    }, options || {});

    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED"
      };
    }

    return {
      ok: true,
      code: "OK"
    };
  }

  async function extractCurrentJobWithAi(request, options) {
    var req = isObject(request) ? request : {};
    var pageSnapshot = isObject(req.pageSnapshot) ? req.pageSnapshot : {};
    var parsedJobHint = isObject(req.jobPosting) ? req.jobPosting : {};
    var pageText = clipText(cleanString(pageSnapshot.pageText), 18000);
    var pageTitle = cleanString(pageSnapshot.title);
    var pageUrl = cleanString(req.url || pageSnapshot.url || parsedJobHint.url || parsedJobHint.jobUrl);

    var prompt = [
      "You extract job posting details from webpage content.",
      "Return strict JSON only.",
      "No markdown. No comments. No explanation. No extra text.",
      "Use exactly this schema:",
      "{",
      '  "company": "",',
      '  "title": "",',
      '  "location": "",',
      '  "descriptionText": "",',
      '  "isJobPosting": true',
      "}",
      "Set isJobPosting to false when this is not a job posting page.",
      "PAGE_URL:",
      pageUrl || "(unknown)",
      "PAGE_TITLE:",
      pageTitle || "(unknown)",
      "PARSED_JOB_HINT_JSON:",
      safeJsonStringify(parsedJobHint, 2) || "{}",
      "PAGE_TEXT:",
      pageText || ""
    ].join("\n");

    var result = await runProviderPrompt({
      settings: req.settings,
      prompt: prompt
    }, options || {});

    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED"
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return {
        ok: false,
        code: "MODEL_JSON_PARSE_FAILED"
      };
    }

    var safeParsed = isObject(parsed) ? parsed : {};
    var rawIsJobPosting = safeParsed.isJobPosting;
    var isJobPosting = rawIsJobPosting === true || cleanString(rawIsJobPosting).toLowerCase() === "true";

    return {
      ok: true,
      code: "OK",
      data: {
        company: cleanString(safeParsed.company),
        title: cleanString(safeParsed.title),
        location: cleanString(safeParsed.location),
        descriptionText: cleanString(safeParsed.descriptionText),
        isJobPosting: isJobPosting
      }
    };
  }

  function hasJobTargetSignal(jobTargetInput) {
    var jobTarget = isObject(jobTargetInput) ? jobTargetInput : {};
    return Boolean(
      cleanString(jobTarget.role || jobTarget.title || jobTarget.rawTitle) ||
      cleanString(jobTarget.company) ||
      cleanString(jobTarget.summary || jobTarget.description || jobTarget.rawText) ||
      toStringArray(jobTarget.requirements).length ||
      toStringArray(jobTarget.responsibilities).length ||
      toStringArray(jobTarget.skills).length
    );
  }

  function hasCandidateSignal(candidateInput) {
    var candidate = isObject(candidateInput) ? candidateInput : {};
    var header = isObject(candidate.header) ? candidate.header : {};

    return Boolean(
      cleanString(header.name) ||
      cleanString(header.title) ||
      cleanString(candidate.summary) ||
      toStringArray(candidate.skills).length ||
      toStringArray(candidate.experience).length ||
      toStringArray(candidate.education).length ||
      toStringArray(candidate.projects).length
    );
  }

  function getJobTargetBuilder() {
    return isObject(global.Stage5JobTargetBuilder) ? global.Stage5JobTargetBuilder : null;
  }

  function getProfileLoader() {
    return isObject(global.Stage5ProfileLoader) ? global.Stage5ProfileLoader : null;
  }

  async function resolveJobTarget(request) {
    var req = isObject(request) ? request : {};
    var requestJob = isObject(req.jobData) ? req.jobData : {};
    var builder = getJobTargetBuilder();

    if (builder && typeof builder.loadJobTarget === "function") {
      var loaded = await builder.loadJobTarget({ jobPosting: requestJob });
      var loadedTarget = isObject(loaded) && isObject(loaded.jobTarget) ? loaded.jobTarget : {};
      return {
        jobTarget: loadedTarget,
        source: cleanString(loaded && loaded.source)
      };
    }

    if (builder && typeof builder.buildJobTarget === "function") {
      return {
        jobTarget: builder.buildJobTarget(requestJob),
        source: "request.jobData"
      };
    }

    return {
      jobTarget: requestJob,
      source: "request.jobData"
    };
  }

  async function resolveCandidateResume(request) {
    var req = isObject(request) ? request : {};
    var loader = getProfileLoader();

    if (loader && typeof loader.loadCandidateProfile === "function") {
      var loaded = await loader.loadCandidateProfile({
        profile: isObject(req.profile) ? req.profile : {},
        masterResume: isObject(req.masterResume) ? req.masterResume : {}
      });
      var candidateResume = isObject(loaded) && isObject(loaded.candidateResume) ? loaded.candidateResume : {};
      return {
        candidateResume: candidateResume,
        source: cleanString(loaded && loaded.source)
      };
    }

    return {
      candidateResume: {},
      source: ""
    };
  }

  function buildMiniMaxPayload(config, prompt, options) {
    var safeOptions = isObject(options) ? options : {};
    return {
      model: config.model,
      max_tokens: Number(safeOptions.maxTokens || 0) > 0 ? Number(safeOptions.maxTokens) : DEFAULT_MAX_TOKENS,
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

  async function callMiniMax(config, prompt, options) {
    var payload = buildMiniMaxPayload(config, prompt, options || {});

    var response = await fetch(config.requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.apiKey,
        "x-api-key": config.apiKey,
        "anthropic-version": config.anthropicVersion
      },
      body: JSON.stringify(payload),
      signal: options && options.signal
    });

    var raw = await response.text();
    var parsedPayload = {};
    var parseError = "";

    if (cleanString(raw)) {
      try {
        parsedPayload = JSON.parse(raw);
      } catch {
        parseError = "Provider returned invalid JSON payload.";
      }
    }

    return {
      response: response,
      payload: isObject(parsedPayload) ? parsedPayload : {},
      rawResponse: clipText(raw, MAX_PREVIEW_LENGTH),
      parseError: parseError,
      requestPayloadPreview: clipText(safeJsonStringify(payload, 2), MAX_PREVIEW_LENGTH)
    };
  }

  async function callOpenAiResponsesWithPdf(config, prompt, pdfBase64, fileName, options) {
    var safeOptions = isObject(options) ? options : {};
    var fileData = cleanString(pdfBase64);
    if (fileData && fileData.indexOf("data:application/pdf;base64,") !== 0) {
      fileData = "data:application/pdf;base64," + fileData.replace(/^data:application\/pdf;base64,/i, "");
    }
    var endpoint = "/responses";
    var requestUrl = typeof constants.joinApiUrl === "function"
      ? constants.joinApiUrl(config.baseUrl, endpoint)
      : config.baseUrl + endpoint;
    var payload = {
      model: config.model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: cleanString(fileName) || "resume.pdf",
              file_data: fileData
            },
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ],
      max_output_tokens: Number(safeOptions.maxTokens || 0) > 0 ? Number(safeOptions.maxTokens) : 12000
    };

    var response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.apiKey
      },
      body: JSON.stringify(payload),
      signal: options && options.signal
    });

    var raw = await response.text();
    var parsedPayload = {};
    var parseError = "";
    if (cleanString(raw)) {
      try {
        parsedPayload = JSON.parse(raw);
      } catch {
        parseError = "Provider returned invalid JSON payload.";
      }
    }

    var previewPayload = Object.assign({}, payload, {
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: cleanString(fileName) || "resume.pdf",
              file_data: "[pdf_base64_omitted]"
            },
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ]
    });

    return {
      response: response,
      payload: isObject(parsedPayload) ? parsedPayload : {},
      rawResponse: clipText(raw, MAX_PREVIEW_LENGTH),
      parseError: parseError,
      requestPayloadPreview: clipText(safeJsonStringify(previewPayload, 2), MAX_PREVIEW_LENGTH)
    };
  }

  function extractTextBlocks(payload) {
    var parser = isObject(global.Stage5TailoredJsonParser) ? global.Stage5TailoredJsonParser : null;
    if (parser && typeof parser.extractTextBlocks === "function") {
      return parser.extractTextBlocks(payload);
    }

    var blocks = payload && Array.isArray(payload.content) ? payload.content : [];
    var texts = [];

    for (var index = 0; index < blocks.length; index += 1) {
      var block = isObject(blocks[index]) ? blocks[index] : {};
      if (cleanString(block.type) !== "text") {
        continue;
      }
      var text = cleanString(block.text);
      if (text) {
        texts.push(text);
      }
    }

    return texts;
  }

  function parseTailoredJson(input) {
    var parser = isObject(global.Stage5TailoredJsonParser) ? global.Stage5TailoredJsonParser : null;
    if (parser && typeof parser.parseTailoredResumeJson === "function") {
      return parser.parseTailoredResumeJson(input);
    }

    try {
      var parsed = JSON.parse(cleanString(input));
      if (isObject(parsed)) {
        return {
          ok: true,
          parsed: parsed,
          parseError: "",
          text: cleanString(input)
        };
      }
    } catch {
      // no-op
    }

    return {
      ok: false,
      parsed: null,
      parseError: "Model returned text, but no valid JSON object could be parsed.",
      text: cleanString(input)
    };
  }

  function shouldTreatAsMaxTokenTruncation(payload, parsedResult) {
    var safePayload = isObject(payload) ? payload : {};
    var stopReason = cleanString(
      safePayload.stop_reason ||
      safePayload.stopReason ||
      safePayload.stop ||
      safePayload.finish_reason ||
      safePayload.finishReason
    ).toLowerCase();

    if (stopReason.indexOf("max_tokens") !== -1 || stopReason.indexOf("max token") !== -1) {
      return true;
    }

    var sourceText = cleanString(parsedResult && parsedResult.text);
    return Boolean(sourceText && sourceText.indexOf("{") !== -1 && sourceText[sourceText.length - 1] !== "}");
  }

  function buildRepairPrompt(nonJsonText) {
    var repair = isObject(global.Stage5TailoredJsonRepair) ? global.Stage5TailoredJsonRepair : null;
    if (repair && typeof repair.buildTailoredResumeRepairPrompt === "function") {
      return repair.buildTailoredResumeRepairPrompt(nonJsonText, { maxSourceLength: MAX_PREVIEW_LENGTH });
    }

    return [
      "Convert the following content into one valid JSON object only.",
      "Do not output markdown, comments, explanations, or extra text.",
      "SOURCE_TEXT:",
      clipText(cleanString(nonJsonText), MAX_PREVIEW_LENGTH)
    ].join("\n");
  }

  function normalizeDraft(parsedTailored, candidateResume, jobTarget) {
    var normalizer = isObject(global.Stage5TailoredResumeNormalizer) ? global.Stage5TailoredResumeNormalizer : null;
    if (normalizer && typeof normalizer.normalizeTailoredResumeDraft === "function") {
      return normalizer.normalizeTailoredResumeDraft(parsedTailored, candidateResume, jobTarget);
    }
    return parsedTailored;
  }

  function mergeDraft(candidateResume, normalizedDraft, jobTarget) {
    var merger = isObject(global.Stage5TailoredResumeMerger) ? global.Stage5TailoredResumeMerger : null;
    if (merger && typeof merger.mergeTailoredResume === "function") {
      return merger.mergeTailoredResume(candidateResume, normalizedDraft, jobTarget);
    }
    return normalizedDraft;
  }

  function buildTailoredResumePrompt(jobTarget, candidateResume, promptOptions) {
    var customInstructions = normalizeCustomInstructions(
      isObject(promptOptions) ? promptOptions.customInstructions : ""
    );
    var builder = isObject(global.Stage5TailoredPromptBuilder) ? global.Stage5TailoredPromptBuilder : null;
    if (builder && typeof builder.buildTailoredResumePrompt === "function") {
      return builder.buildTailoredResumePrompt(jobTarget || {}, candidateResume || {}, {
        customInstructions: customInstructions
      });
    }

    return [
      "You are generating structured resume JSON from candidate facts and job context.",
      "The user has provided additional preferences below. Follow them only when they do not conflict with required output schema and formatting rules.",
      "",
      "User additional instructions:",
      customInstructions || "(none)",
      "",
      "Return one valid JSON object for a tailored resume draft.",
      "Do not output markdown.",
      "Do not output explanations.",
      "Follow the required schema exactly.",
      "JOB_TARGET:",
      safeJsonStringify(jobTarget || {}, 2),
      "CANDIDATE_RESUME:",
      safeJsonStringify(candidateResume || {}, 2)
    ].join("\n");
  }

  function buildResponsePreview(draft, paths, marker) {
    var safePaths = isObject(paths) ? paths : {};
    var summary = [
      "jsonPath=" + (cleanString(safePaths.jsonPath) || "-"),
      "htmlPath=" + (cleanString(safePaths.htmlPath) || "-"),
      "pdfPath=" + (cleanString(safePaths.pdfPath) || "-")
    ].join("\n");

    return clipText(
      (marker ? marker + "\n" : "") +
        safeJsonStringify(draft || {}, 2) +
        "\n\n[artifact_summary]\n" +
        summary,
      RESPONSE_PREVIEW_LENGTH
    );
  }

  function createBaseResult() {
    return {
      ok: false,
      message: "",
      error: "",
      code: "",
      stage: STAGES.INIT,
      stageText: "Initialization",
      jobTarget: null,
      candidateResume: null,
      tailoredResumeDraft: null,
      jsonPath: "",
      htmlPath: "",
      pdfPath: "",
      provider: "",
      model: "",
      requestUrl: "",
      requestPrompt: "",
      requestPayloadPreview: "",
      rawResponse: "",
      responsePreview: "",
      status: 0,
      statusText: "",
      settingsSource: "",
      jobTargetSource: "",
      candidateSource: "",
      artifactStage: ""
    };
  }

  function toResultFailure(base, patch) {
    var next = mergeObjects(base, patch);
    next.ok = false;
    next.message = cleanString(next.message) || "Resume generation failed.";
    next.error = cleanString(next.error) || next.message;
    next.code = cleanString(next.code) || ERROR_CODES.MODEL_REQUEST_FAILED;
    next.responsePreview = clipText(cleanString(next.responsePreview) || cleanString(next.error), RESPONSE_PREVIEW_LENGTH);
    return next;
  }

  function toResultSuccess(base, patch) {
    var next = mergeObjects(base, patch);
    next.ok = true;
    next.error = "";
    next.stage = STAGES.DONE;
    next.stageText = "Done";
    next.artifactStage = "done";
    return next;
  }

  async function writeArtifacts(draft, jobTarget, baseResult) {
    var result = mergeObjects(baseResult, {});
    var writer = isObject(global.Stage5ArtifactWriter) ? global.Stage5ArtifactWriter : null;
    var htmlBuilder = isObject(global.Stage5ResumeHtmlBuilder) ? global.Stage5ResumeHtmlBuilder : null;
    var pdfBuilder = isObject(global.Stage5ResumePdfBuilder) ? global.Stage5ResumePdfBuilder : null;

    var baseName = "tailored_resume";
    if (writer && typeof writer.buildTailoredArtifactBaseName === "function") {
      baseName = writer.buildTailoredArtifactBaseName(draft, jobTarget, { prefix: "tailored_resume" });
    }

    var htmlText = "";

    try {
      result.stage = STAGES.WRITE_JSON;
      result.stageText = "Writing JSON artifact";
      var jsonArtifact = await writer.writeJsonArtifact(draft, {
        baseName: baseName,
        jobTarget: jobTarget,
        tailoredResumeDraft: draft
      });
      result.jsonPath = cleanString(jsonArtifact && jsonArtifact.path);
      result.artifactStage = "json_write";
    } catch (jsonError) {
      throw toResultFailure(result, {
        message: "Tailored draft generated, but JSON artifact write failed.",
        error: getErrorMessage(jsonError),
        code: ERROR_CODES.TAILORED_JSON_WRITE_FAILED,
        stage: STAGES.WRITE_JSON,
        stageText: "Writing JSON artifact",
        artifactStage: "json_write",
        tailoredResumeDraft: draft,
        responsePreview: buildResponsePreview(draft, result, "[json_write_failed]")
      });
    }

    try {
      result.stage = STAGES.BUILD_HTML;
      result.stageText = "Building HTML artifact";
      htmlText = htmlBuilder.buildTailoredResumeHtml(draft, { jobTarget: jobTarget });
      result.artifactStage = "html_build";
    } catch (htmlBuildError) {
      throw toResultFailure(result, {
        message: "Tailored draft and JSON artifact generated, but HTML build failed.",
        error: getErrorMessage(htmlBuildError),
        code: ERROR_CODES.TAILORED_HTML_BUILD_FAILED,
        stage: STAGES.BUILD_HTML,
        stageText: "Building HTML artifact",
        artifactStage: "html_build",
        tailoredResumeDraft: draft,
        responsePreview: buildResponsePreview(draft, result, "[html_build_failed]")
      });
    }

    try {
      result.stage = STAGES.WRITE_HTML;
      result.stageText = "Writing HTML artifact";
      var htmlArtifact = await writer.writeHtmlArtifact(htmlText, {
        baseName: baseName,
        jobTarget: jobTarget,
        tailoredResumeDraft: draft
      });
      result.htmlPath = cleanString(htmlArtifact && htmlArtifact.path);
      result.artifactStage = "html_write";
    } catch (htmlWriteError) {
      throw toResultFailure(result, {
        message: "Tailored draft and JSON artifact generated, but HTML artifact write failed.",
        error: getErrorMessage(htmlWriteError),
        code: ERROR_CODES.TAILORED_HTML_WRITE_FAILED,
        stage: STAGES.WRITE_HTML,
        stageText: "Writing HTML artifact",
        artifactStage: "html_write",
        tailoredResumeDraft: draft,
        responsePreview: buildResponsePreview(draft, result, "[html_write_failed]")
      });
    }

    try {
      result.stage = STAGES.BUILD_PDF;
      result.stageText = "Building PDF artifact";
      var pdfBytes = pdfBuilder.buildTailoredResumePdfBytes(draft, { htmlText: htmlText, jobTarget: jobTarget });
      result.artifactStage = "pdf_build";

      result.stage = STAGES.WRITE_PDF;
      result.stageText = "Writing PDF artifact";
      var pdfArtifact = await writer.writePdfArtifact(pdfBytes, {
        baseName: baseName,
        jobTarget: jobTarget,
        tailoredResumeDraft: draft
      });
      result.pdfPath = cleanString(pdfArtifact && pdfArtifact.path);
      result.artifactStage = "pdf_write";
      return result;
    } catch (pdfError) {
      var code = result.stage === STAGES.BUILD_PDF
        ? ERROR_CODES.TAILORED_PDF_BUILD_FAILED
        : ERROR_CODES.TAILORED_PDF_WRITE_FAILED;

      throw toResultFailure(result, {
        message:
          code === ERROR_CODES.TAILORED_PDF_BUILD_FAILED
            ? "Tailored draft with JSON/HTML artifacts generated, but PDF build failed."
            : "Tailored draft with JSON/HTML artifacts generated, but PDF artifact write failed.",
        error: getErrorMessage(pdfError),
        code: code,
        stage: result.stage,
        stageText: result.stageText,
        artifactStage: result.stage === STAGES.BUILD_PDF ? "pdf_build" : "pdf_write",
        tailoredResumeDraft: draft,
        responsePreview: buildResponsePreview(draft, result, "[pdf_failed]")
      });
    }
  }

  async function generateResume(request, options) {
    var result = createBaseResult();
    var req = isObject(request) ? request : {};
    var repairApplied = false;
    var responseMarker = "[model_first_pass]";

    if (!constants || typeof constants !== "object") {
      return toResultFailure(result, {
        message: "Stage5Constants is unavailable.",
        error: "Stage5Constants is unavailable.",
        code: ERROR_CODES.MISSING_CONSTANTS,
        stage: STAGES.SETTINGS,
        stageText: "Loading settings"
      });
    }

    try {
      result.stage = STAGES.SETTINGS;
      result.stageText = "Loading settings";

      var resolvedSettings = await resolveRuntimeSettings(req);
      var config = resolveProviderConfig(resolvedSettings.settings);

      result.provider = config.provider;
      result.model = config.model;
      result.requestUrl = config.requestUrl;
      result.settingsSource = resolvedSettings.source;

      if (config.provider !== (constants.DEFAULT_PROVIDER || DEFAULT_PROVIDER)) {
        return toResultFailure(result, {
          message: "Unsupported provider: " + config.provider,
          error: "Unsupported provider: " + config.provider,
          code: ERROR_CODES.UNSUPPORTED_PROVIDER,
          stage: STAGES.SETTINGS,
          stageText: "Loading settings"
        });
      }

      if (!config.apiKey) {
        return toResultFailure(result, {
          message: "MiniMax API key is missing in extension settings.",
          error: "MiniMax API key is missing in extension settings (providers.minimax.apiKey).",
          code: ERROR_CODES.MISSING_MINIMAX_API_KEY,
          stage: STAGES.SETTINGS,
          stageText: "Loading settings"
        });
      }

      result.stage = STAGES.LOAD_JOB;
      result.stageText = "Loading job posting";
      var loadedJob = await resolveJobTarget(req);
      result.jobTarget = isObject(loadedJob.jobTarget) ? loadedJob.jobTarget : {};
      result.jobTargetSource = cleanString(loadedJob.source);

      if (!hasJobTargetSignal(result.jobTarget)) {
        return toResultFailure(result, {
          message: "Job posting is missing. Please run extraction first.",
          error: "Job posting is missing from storage (jobPosting) and fallback job.default.json is unavailable.",
          code: ERROR_CODES.MISSING_JOB_POSTING,
          stage: STAGES.LOAD_JOB,
          stageText: "Loading job posting"
        });
      }

      result.stage = STAGES.LOAD_CANDIDATE;
      result.stageText = "Loading candidate profile";
      var loadedCandidate = await resolveCandidateResume(req);
      result.candidateResume = isObject(loadedCandidate.candidateResume) ? loadedCandidate.candidateResume : {};
      result.candidateSource = cleanString(loadedCandidate.source);

      if (!hasCandidateSignal(result.candidateResume)) {
        return toResultFailure(result, {
          message: "Candidate profile is missing.",
          error: "Candidate profile/resume is missing from storage and fallback defaults.",
          code: ERROR_CODES.MISSING_CANDIDATE_PROFILE,
          stage: STAGES.LOAD_CANDIDATE,
          stageText: "Loading candidate profile"
        });
      }

      result.stage = STAGES.BUILD_PROMPT;
      result.stageText = "Building tailored prompt";
      var customInstructions = normalizeCustomInstructions(
        isObject(resolvedSettings.settings) ? resolvedSettings.settings.aiCustomInstructions : ""
      );
      var prompt = buildTailoredResumePrompt(result.jobTarget, result.candidateResume, {
        customInstructions: customInstructions
      });
      var requestPayload = buildMiniMaxPayload(config, prompt);

      result.requestPrompt = prompt;
      result.requestPayloadPreview = clipText(safeJsonStringify(requestPayload, 2), MAX_PREVIEW_LENGTH);

      result.stage = STAGES.MODEL_REQUEST;
      result.stageText = "Requesting model output";
      var firstPass;
      try {
        firstPass = await callMiniMax(config, prompt, options || {});
      } catch (requestError) {
        return toResultFailure(result, {
          message: "Model request failed.",
          error: getErrorMessage(requestError),
          code: ERROR_CODES.MODEL_REQUEST_FAILED,
          stage: STAGES.MODEL_REQUEST,
          stageText: "Requesting model output"
        });
      }

      result.rawResponse = firstPass.rawResponse;
      result.status = firstPass.response.status;
      result.statusText = cleanString(firstPass.response.statusText);
      result.requestPayloadPreview = firstPass.requestPayloadPreview;

      if (firstPass.parseError) {
        return toResultFailure(result, {
          message: "Model response payload parse failed.",
          error: firstPass.parseError,
          code: ERROR_CODES.MODEL_REQUEST_FAILED,
          stage: STAGES.MODEL_REQUEST,
          stageText: "Requesting model output"
        });
      }

      if (!firstPass.response.ok) {
        return toResultFailure(result, {
          message: "Model request failed with HTTP " + String(firstPass.response.status) + ".",
          error: getErrorMessage(firstPass.payload) || firstPass.response.statusText,
          code: ERROR_CODES.MODEL_REQUEST_FAILED,
          stage: STAGES.MODEL_REQUEST,
          stageText: "Requesting model output",
          responsePreview: clipText(firstPass.rawResponse, RESPONSE_PREVIEW_LENGTH)
        });
      }

      result.stage = STAGES.MODEL_PARSE;
      result.stageText = "Parsing model JSON";
      var firstBlocks = extractTextBlocks(firstPass.payload);
      var firstText = firstBlocks.join("\n");

      if (!firstBlocks.length) {
        return toResultFailure(result, {
          message: "Model JSON parse failed.",
          error: "Model response did not include text content for tailored JSON.",
          code: ERROR_CODES.MODEL_JSON_PARSE_FAILED,
          stage: STAGES.MODEL_PARSE,
          stageText: "Parsing model JSON"
        });
      }

      var firstParsed = parseTailoredJson(firstText);

      var parsedTailored = null;
      if (firstParsed.ok && isObject(firstParsed.parsed)) {
        parsedTailored = firstParsed.parsed;
      } else {
        result.stage = STAGES.MODEL_REPAIR;
        result.stageText = "Repairing model JSON";

        var repairPrompt = buildRepairPrompt(firstParsed.text || firstText);
        var repairPass;

        try {
          repairPass = await callMiniMax(config, repairPrompt, options || {});
        } catch (repairRequestError) {
          return toResultFailure(result, {
            message: "Model JSON repair request failed.",
            error: getErrorMessage(repairRequestError),
            code: ERROR_CODES.MODEL_JSON_REPAIR_FAILED,
            stage: STAGES.MODEL_REPAIR,
            stageText: "Repairing model JSON",
            responsePreview: clipText((firstParsed.text || firstText) + "\n\n[repair_request_failed]", RESPONSE_PREVIEW_LENGTH)
          });
        }

        result.rawResponse = clipText(
          firstPass.rawResponse + "\n\n===== JSON REPAIR RESPONSE =====\n" + repairPass.rawResponse,
          MAX_PREVIEW_LENGTH
        );
        result.status = repairPass.response.status;
        result.statusText = cleanString(repairPass.response.statusText);

        if (repairPass.parseError) {
          return toResultFailure(result, {
            message: "Model JSON repair payload parse failed.",
            error: repairPass.parseError,
            code: ERROR_CODES.MODEL_JSON_REPAIR_FAILED,
            stage: STAGES.MODEL_REPAIR,
            stageText: "Repairing model JSON"
          });
        }

        if (!repairPass.response.ok) {
          return toResultFailure(result, {
            message: "Model JSON repair request failed with HTTP " + String(repairPass.response.status) + ".",
            error: getErrorMessage(repairPass.payload) || repairPass.response.statusText,
            code: ERROR_CODES.MODEL_JSON_REPAIR_FAILED,
            stage: STAGES.MODEL_REPAIR,
            stageText: "Repairing model JSON"
          });
        }

        var repairBlocks = extractTextBlocks(repairPass.payload);
        var repairText = repairBlocks.join("\n");
        var repairedParsed = parseTailoredJson(repairText);

        if (!repairedParsed.ok || !isObject(repairedParsed.parsed)) {
          var parseFailureCode = shouldTreatAsMaxTokenTruncation(firstPass.payload, firstParsed)
            ? ERROR_CODES.MODEL_JSON_TRUNCATED_BY_MAX_TOKENS
            : ERROR_CODES.MODEL_JSON_REPAIR_FAILED;

          return toResultFailure(result, {
            message:
              parseFailureCode === ERROR_CODES.MODEL_JSON_TRUNCATED_BY_MAX_TOKENS
                ? "Model JSON appears truncated by max tokens."
                : "Model JSON repair failed.",
            error: cleanString(repairedParsed.parseError) || "Model JSON repair output is still not a valid JSON object.",
            code: parseFailureCode,
            stage: STAGES.MODEL_REPAIR,
            stageText: "Repairing model JSON",
            responsePreview: clipText((firstParsed.text || firstText) + "\n\n[repair_failed]\n" + repairText, RESPONSE_PREVIEW_LENGTH)
          });
        }

        repairApplied = true;
        responseMarker = "[model_second_pass_repaired]";
        parsedTailored = repairedParsed.parsed;
      }

      if (!isObject(parsedTailored)) {
        return toResultFailure(result, {
          message: "Model JSON parse failed.",
          error: cleanString(firstParsed.parseError) || "Model returned no valid JSON object.",
          code: shouldTreatAsMaxTokenTruncation(firstPass.payload, firstParsed)
            ? ERROR_CODES.MODEL_JSON_TRUNCATED_BY_MAX_TOKENS
            : ERROR_CODES.MODEL_JSON_PARSE_FAILED,
          stage: STAGES.MODEL_PARSE,
          stageText: "Parsing model JSON",
          responsePreview: clipText(firstParsed.text || firstText, RESPONSE_PREVIEW_LENGTH)
        });
      }

      result.stage = STAGES.NORMALIZE_DRAFT;
      result.stageText = "Normalizing tailored draft";
      var normalizedDraft;
      try {
        normalizedDraft = normalizeDraft(parsedTailored, result.candidateResume, result.jobTarget);
      } catch (normalizeError) {
        return toResultFailure(result, {
          message: "Tailored draft normalize failed.",
          error: getErrorMessage(normalizeError),
          code: ERROR_CODES.TAILORED_DRAFT_NORMALIZE_FAILED,
          stage: STAGES.NORMALIZE_DRAFT,
          stageText: "Normalizing tailored draft"
        });
      }

      result.stage = STAGES.MERGE_DRAFT;
      result.stageText = "Merging tailored draft";
      var mergedDraft;
      try {
        mergedDraft = mergeDraft(result.candidateResume, normalizedDraft, result.jobTarget);
      } catch (mergeError) {
        return toResultFailure(result, {
          message: "Tailored draft merge failed.",
          error: getErrorMessage(mergeError),
          code: ERROR_CODES.TAILORED_DRAFT_MERGE_FAILED,
          stage: STAGES.MERGE_DRAFT,
          stageText: "Merging tailored draft"
        });
      }

      if (!isObject(mergedDraft)) {
        return toResultFailure(result, {
          message: "Tailored draft merge failed.",
          error: "Tailored merge returned an invalid object.",
          code: ERROR_CODES.TAILORED_DRAFT_MERGE_FAILED,
          stage: STAGES.MERGE_DRAFT,
          stageText: "Merging tailored draft"
        });
      }

      result.tailoredResumeDraft = mergedDraft;

      var artifactWriterMissing =
        !isObject(global.Stage5ArtifactWriter) ||
        typeof global.Stage5ArtifactWriter.writeJsonArtifact !== "function" ||
        typeof global.Stage5ArtifactWriter.writeHtmlArtifact !== "function" ||
        typeof global.Stage5ArtifactWriter.writePdfArtifact !== "function";
      var htmlBuilderMissing =
        !isObject(global.Stage5ResumeHtmlBuilder) ||
        typeof global.Stage5ResumeHtmlBuilder.buildTailoredResumeHtml !== "function";
      var pdfBuilderMissing =
        !isObject(global.Stage5ResumePdfBuilder) ||
        typeof global.Stage5ResumePdfBuilder.buildTailoredResumePdfBytes !== "function";

      if (artifactWriterMissing) {
        return toResultFailure(result, {
          message: "Artifact writer is unavailable.",
          error: "Stage5ArtifactWriter is unavailable or incomplete.",
          code: ERROR_CODES.TAILORED_JSON_WRITE_FAILED,
          stage: STAGES.WRITE_JSON,
          stageText: "Writing JSON artifact",
          responsePreview: buildResponsePreview(mergedDraft, result, "[artifact_writer_missing]")
        });
      }

      if (htmlBuilderMissing) {
        return toResultFailure(result, {
          message: "HTML builder is unavailable.",
          error: "Stage5ResumeHtmlBuilder is unavailable.",
          code: ERROR_CODES.TAILORED_HTML_BUILD_FAILED,
          stage: STAGES.BUILD_HTML,
          stageText: "Building HTML artifact",
          responsePreview: buildResponsePreview(mergedDraft, result, "[html_builder_missing]")
        });
      }

      if (pdfBuilderMissing) {
        return toResultFailure(result, {
          message: "PDF builder is unavailable.",
          error: "Stage5ResumePdfBuilder is unavailable.",
          code: ERROR_CODES.TAILORED_PDF_BUILD_FAILED,
          stage: STAGES.BUILD_PDF,
          stageText: "Building PDF artifact",
          responsePreview: buildResponsePreview(mergedDraft, result, "[pdf_builder_missing]")
        });
      }

      try {
        var artifactResult = await writeArtifacts(mergedDraft, result.jobTarget, result);
        return toResultSuccess(artifactResult, {
          message: repairApplied
            ? "Tailored resume artifacts generated after JSON repair."
            : "Tailored resume artifacts generated.",
          code: repairApplied ? "MODEL_JSON_REPAIRED" : "TAILORED_RESUME_GENERATED",
          responsePreview: buildResponsePreview(mergedDraft, artifactResult, responseMarker)
        });
      } catch (artifactFailure) {
        return artifactFailure;
      }
    } catch (unexpectedError) {
      return toResultFailure(result, {
        message: "Unexpected Stage 5 runtime error.",
        error: getErrorMessage(unexpectedError),
        code: ERROR_CODES.MODEL_REQUEST_FAILED,
        responsePreview: clipText(getErrorMessage(unexpectedError), RESPONSE_PREVIEW_LENGTH)
      });
    }
  }

  async function findApplyButtonWithAi(request, options) {
    var req = isObject(request) ? request : {};
    var candidates = Array.isArray(req.candidates) ? req.candidates : [];
    var pageUrl = cleanString(req.url || "");
    var pageTitle = cleanString(req.pageTitle || "");
    var pageText = clipText(cleanString(req.pageText || ""), 6000);

    var candidateLines = candidates.slice(0, 50).map(function formatCandidate(c, i) {
      var line = i + ": " + String(c.tagName || "el") + " text=\"" + String(c.text || "").substring(0, 80) + "\"";
      if (c.href) { line += " href=" + String(c.href).substring(0, 120); }
      if (c.dataTestId) { line += " data-test-id=" + String(c.dataTestId); }
      if (c.role && c.role !== String(c.tagName || "")) { line += " role=" + String(c.role); }
      if (c.selector) { line += " selector=" + String(c.selector); }
      return line;
    }).join("\n");

    var prompt = [
      "You are identifying the Apply button on a job posting page.",
      "Return strict JSON only. No markdown. No comments. No explanation.",
      "Use exactly this schema:",
      "{",
      "  \"found\": true,",
      "  \"reason\": \"\",",
      "  \"buttonText\": \"\",",
      "  \"selectorHint\": \"\",",
      "  \"candidateIndex\": 0",
      "}",
      "If no safe Apply button is identifiable: {\"found\": false, \"reason\": \"...\"}",
      "RULES:",
      "- Choose the button/link that OPENS the job application form from the job listing page.",
      "- Do NOT choose Submit, Send Application, final form submit, unrelated navigation, or sign-in buttons.",
      "- Prefer candidates with text: Apply, Apply Now, Start Application, Apply for this job, Continue to apply.",
      "PAGE_URL: " + (pageUrl || "(unknown)"),
      "PAGE_TITLE: " + (pageTitle || "(unknown)"),
      "CANDIDATES:",
      candidateLines || "(none)",
      "PAGE_TEXT_EXCERPT:",
      pageText || ""
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return { ok: false, code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED" };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED" };
    }

    var safe = isObject(parsed) ? parsed : {};
    return {
      ok: true,
      code: "OK",
      data: {
        found: safe.found === true,
        reason: cleanString(safe.reason),
        buttonText: cleanString(safe.buttonText),
        selectorHint: cleanString(safe.selectorHint),
        candidateIndex: typeof safe.candidateIndex === "number" ? safe.candidateIndex : -1
      }
    };
  }

  async function translateResumeJson(request, options) {
    var req = isObject(request) ? request : {};
    var sourceLanguage = cleanString(req.sourceLanguage) === "zh" ? "Chinese" : "English";
    var targetLanguage = cleanString(req.targetLanguage) === "zh" ? "Chinese" : "English";
    var resumeJson = safeJsonStringify(isObject(req.resume) ? req.resume : {}, 2);
    if (!resumeJson || resumeJson === "{}") {
      return {
        ok: false,
        code: "INVALID_RESUME",
        error: "Resume JSON is required."
      };
    }

    function collectSectionTextPaths(value, path, parent) {
      var paths = [];
      if (Array.isArray(value)) {
        value.forEach(function(item, index) {
          paths = paths.concat(collectSectionTextPaths(item, path + "[" + String(index) + "]", value));
        });
        return paths;
      }
      if (!isObject(value)) {
        if (typeof value === "string" && cleanString(value) && path.indexOf("sections[") !== -1) {
          var lowered = path.toLowerCase();
          var parentType = cleanString(parent && parent.type);
          var isHumanText =
            lowered.slice(-12) === ".sectionname" ||
            lowered.slice(-5) === ".text" ||
            lowered.slice(-6) === ".value";
          var isProtected =
            lowered.indexOf(".date.") !== -1 ||
            lowered.slice(-5) === ".date" ||
            parentType === "date" ||
            lowered.indexOf(".id") !== -1;
          if (isHumanText && !isProtected) {
            paths.push(path + " = " + JSON.stringify(value));
          }
        }
        return paths;
      }
      Object.keys(value).forEach(function(key) {
        paths = paths.concat(collectSectionTextPaths(value[key], path ? path + "." + key : key, value));
      });
      return paths;
    }

    var sectionTextPaths = collectSectionTextPaths(req.resume, "", null).slice(0, 160).join("\n");

    var prompt = [
      "Translate the resume from " + sourceLanguage + " to " + targetLanguage + ".",
      "Return only valid JSON. Do not wrap JSON in markdown. Do not include comments or explanations.",
      "Return the translated resume object directly, with the exact same object keys, arrays, IDs, and ordering as the input.",
      "Preserve all IDs, arrays, object keys, and ordering.",
      "Translate every human-readable text field inside each resume section, including nested bullets and multiline content. Do not only translate section titles.",
      "In this schema, section content is commonly stored at sections[].blocks[].lines[].text. Translate title, subtitle, bullet, and paragraph line text unless the line is a protected date/name/URL/technology-only value.",
      "Also translate human-readable legacy block text fields inside sections when present, including title.value, subtitle.value, description.value, and bullets[].value, unless protected.",
      "Translate line by line.",
      "If a field contains multiple lines, translate each line independently and preserve the same number of lines in the same order.",
      "Preserve the same number of bullet lines and text lines.",
      "Do not add, remove, merge, split, reorder, summarize, improve, embellish, or rewrite content.",
      "Only translate existing human-readable text fields.",
      "Do not treat an entire sentence as protected merely because it contains a company name, school name, technology, number, or proper noun. Keep the protected token unchanged, but translate the surrounding human-readable words.",
      "Keep names, URLs, emails, phone numbers, dates, GPA, numbers, technologies, tools, programming languages, company names, school names, product names, and proper nouns unchanged unless clearly necessary.",
      "Do not tailor the resume to any job. Do not generate a new resume.",
      "",
      "SECTION_TEXT_FIELDS_THAT_MUST_BE_CONSIDERED_FOR_TRANSLATION:",
      sectionTextPaths || "(none)",
      "",
      "RESUME_JSON:",
      resumeJson
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || { maxTokens: 12000 });
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: cleanString(result && result.error) || "Translation request failed."
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return {
        ok: false,
        code: "MODEL_JSON_PARSE_FAILED",
        error: "AI returned invalid resume JSON."
      };
    }

    return {
      ok: true,
      code: "OK",
      provider: result.provider,
      model: result.model,
      translatedResume: parsed
    };
  }

  function buildCompactResumeSummary(resumeDraft) {
    if (!isObject(resumeDraft)) {
      return "";
    }
    var draftLanguage = cleanString(resumeDraft.activeResumeLanguage) === "zh" ? "zh" : "en";
    var draftResumes = isObject(resumeDraft.resumes) ? resumeDraft.resumes : null;
    var resume = draftResumes && isObject(draftResumes[draftLanguage])
      ? draftResumes[draftLanguage]
      : (isObject(resumeDraft.resume) ? resumeDraft.resume : resumeDraft);
    var header = isObject(resume.header) ? resume.header : {};
    var contact = isObject(header.contact) ? header.contact : {};
    var links = Array.isArray(contact.links) ? contact.links : [];
    var sections = Array.isArray(resume.sections) ? resume.sections : [];
    var summary = {
      activeResumeLanguage: draftLanguage,
      contact: {
        firstName: cleanString(contact.firstName || header.firstName),
        lastName: cleanString(contact.lastName || header.lastName),
        email: cleanString(contact.email || (isObject(header.email) ? header.email.value : header.email)),
        phone: cleanString(contact.phone || (isObject(header.phone) ? header.phone.value : header.phone)),
        location: cleanString(contact.location || (isObject(header.location) ? header.location.value : header.location)),
        links: links.map(function mapLink(link) {
          return { text: cleanString(link && link.text) };
        }).filter(function keepLink(link) {
          return Boolean(link.text);
        })
      },
      sections: sections.map(function mapSection(section) {
        var blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
        return {
          name: cleanString(section && (section.sectionName || section.title || section.type)),
          entries: blocks.map(function mapBlock(block) {
            var blockLines = Array.isArray(block && block.lines) ? block.lines : [];
            return {
              lines: blockLines.map(function mapLine(line) {
                return {
                  type: cleanString(line && line.type),
                  text: cleanString(line && line.text),
                  bold: Boolean(line && line.bold),
                  italic: Boolean(line && line.italic)
                };
              }).filter(function keepLine(line) {
                return Boolean(line.type || line.text);
              })
            };
          })
        };
      }).filter(function keepSection(section) {
        return Boolean(section.name || section.entries.length);
      })
    };
    return JSON.stringify(summary, null, 2);
  }

  async function generateJobGuidance(request) {
    var req = isObject(request) ? request : {};
    var app = isObject(req.application) ? req.application : {};
    var jobText = clipText(
      cleanString(app.jobDescriptionText || app.descriptionText || app.pageText) ||
      cleanString(app.pageTitle),
      6000
    );
    var resumeText = buildCompactResumeSummary(req.resumeDraft);

    var resolved = await resolveRuntimeSettings({ settings: req.settings });
    var config = resolveProviderRuntimeConfig(resolved.settings);

    if (!config.provider || !config.model || !config.apiKey) {
      return {
        ok: false,
        code: "INVALID_API_SETTINGS",
        error: "no_provider"
      };
    }

    if (!jobText) {
      return {
        ok: false,
        code: "NO_JOB_CONTENT",
        error: "no_job_content"
      };
    }

    var prompt = [
      "You are helping a user tailor a resume for a specific job application.",
      "Use only the provided job content and resume content.",
      "Do not invent experiences, companies, dates, skills, metrics, awards, or projects.",
      "Do not rewrite the resume. Only provide guidance.",
      "Return concise guidance as JSON with exactly these keys:",
      '{"jobSummary":"<one paragraph>","keySkills":["..."],"resumeSuggestions":["..."]}',
      "No markdown. No extra text. Strict JSON only.",
      "",
      "SECTIONS:",
      "1. jobSummary: Briefly summarize what the role involves based on the job content.",
      "2. keySkills: List 4-8 skills/competencies the employer appears to value.",
      "3. resumeSuggestions: Give 3-6 practical suggestions for revising the current resume.",
      "",
      "JOB CONTENT:",
      jobText,
      "",
      "CURRENT RESUME:",
      resumeText || "(no resume content available)"
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: "generation_failed"
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      var raw = cleanString(result.text);
      return {
        ok: false,
        code: "PARSE_FAILED",
        error: "parse_failed",
        rawText: raw
      };
    }

    return {
      ok: true,
      code: "OK",
      provider: result.provider,
      model: result.model,
      guidance: {
        id: "guidance_" + Date.now(),
        generatedAt: new Date().toISOString(),
        modelProvider: cleanString(result.provider),
        modelName: cleanString(result.model),
        jobSummary: cleanString(parsed.jobSummary),
        keySkills: Array.isArray(parsed.keySkills) ? parsed.keySkills.map(function(s) { return cleanString(s); }).filter(Boolean) : [],
        resumeSuggestions: Array.isArray(parsed.resumeSuggestions) ? parsed.resumeSuggestions.map(function(s) { return cleanString(s); }).filter(Boolean) : [],
        source: "ai_job_resume_guidance"
      }
    };
  }

  async function generateJobGuidanceItem(request, options) {
    var req = isObject(request) ? request : {};
    var app = isObject(req.application) ? req.application : {};
    var guidanceType = cleanString(req.guidanceType);
    var jobText = clipText(
      cleanString(app.jobDescriptionText || app.descriptionText || app.description || app.rawText || app.pageText) ||
      cleanString(app.pageTitle),
      6000
    );
    var resumeText = cleanString(req.resumeSummary) || buildCompactResumeSummary(req.resumeDraft);
    var activeResumeLanguage = cleanString(req.activeResumeLanguage) || cleanString(req.resumeDraft && req.resumeDraft.activeResumeLanguage) || "en";
    var jobSummary = cleanString(req.jobSummary);
    var keySkills = cleanString(req.keySkills);
    var resumeHasContent = req.resumeHasContent === true;
    var resolved = await resolveRuntimeSettings({ settings: req.settings });
    var config = resolveProviderRuntimeConfig(resolved.settings);

    if (!config.provider || !config.model || !config.apiKey) {
      return {
        ok: false,
        code: "INVALID_API_SETTINGS",
        error: "no_provider"
      };
    }

    if (!jobText) {
      return {
        ok: false,
        code: "NO_JOB_CONTENT",
        error: "no_job_content"
      };
    }

    var itemInstruction;
    if (guidanceType === "job-summary") {
      itemInstruction = [
        "Generate only the first guidance item.",
        "Title: What this job does",
        "Content: one concise paragraph describing what the role is about based only on the job content."
      ].join("\n");
    } else if (guidanceType === "key-skills") {
      itemInstruction = [
        "Generate only the second guidance item.",
        "Title: Key skills evaluated",
        "Content: 4-8 concise bullet lines summarizing the skills, tools, and competencies the role evaluates."
      ].join("\n");
    } else if (guidanceType === "revision-suggestions") {
      itemInstruction = [
        "You are generating resume revision suggestions for this specific application.",
        "Title: Resume revision suggestions",
        "Use the job summary, key skills evaluated, and current application resume content.",
        "Give 3-6 specific suggestions based on what is actually present in the resume.",
        "Do not say no resume content was provided if current resume content is included.",
        "Do not invent experience, metrics, companies, dates, or skills.",
        "If the resume lacks relevant content, say which existing sections or bullets could be revised and what additional truthful details the user may consider adding.",
        "Clearly distinguish what is already present, what is missing or weak, and what could be improved.",
        resumeHasContent
          ? "The current application resume content is provided below."
          : "The current application resume appears mostly empty. If you mention this, say: I do not see much resume content yet."
      ].join("\n");
    } else {
      return {
        ok: false,
        code: "INVALID_GUIDANCE_TYPE",
        error: "invalid_guidance_type"
      };
    }

    var prompt = [
      "You are helping a user tailor a resume for a specific job application.",
      "Do not rewrite the resume. Do not return resume JSON. Only provide the requested guidance text.",
      "Return strict JSON only:",
      '{"content":"..."}',
      "",
      itemInstruction,
      "",
      "JOB CONTEXT:",
      "Company: " + (cleanString(app.company) || "(unknown)"),
      "Job title: " + (cleanString(app.jobTitle || app.role || app.title) || "(unknown)"),
      "Location: " + (cleanString(app.location) || "(unknown)"),
      "Active resume language: " + activeResumeLanguage,
      "",
      "WHAT THIS JOB DOES:",
      jobSummary || "(not generated yet)",
      "",
      "KEY SKILLS EVALUATED:",
      keySkills || "(not generated yet)",
      "",
      "JOB CONTENT:",
      jobText,
      "",
      "CURRENT APPLICATION RESUME:",
      resumeText || "I do not see much resume content yet."
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: "generation_failed"
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return {
        ok: false,
        code: "PARSE_FAILED",
        error: "parse_failed"
      };
    }

    return {
      ok: true,
      code: "OK",
      provider: result.provider,
      model: result.model,
      guidanceType: guidanceType,
      content: cleanString(parsed.content)
    };
  }

  var RESUME_FUNCTION_MANUAL = [
    "Available local resume functions:",
    "",
    "1. setContactField({ field, value })",
    "Set contact field. field = firstName | lastName | email | phone | location.",
    "",
    "2. addContactLink({ text })",
    "Add one plain-text contact link. Do not add https. Do not make it a hyperlink.",
    "",
    "3. deleteContactLink({ linkId })",
    "Delete one contact link by linkId.",
    "",
    "4. addSection({ name })",
    "Add a resume section. Returns a new sectionId usable as $lastSection.",
    "",
    "5. setSection({ sectionId, name })",
    "Rename a resume section.",
    "",
    "6. deleteSection({ sectionId })",
    "Delete a resume section.",
    "",
    "7. moveSection({ sectionId, direction })",
    "Move a section. direction = up | down.",
    "",
    "8. addEntry({ sectionId })",
    "Add an entry under a section. Returns a new entryId usable as $lastEntry.",
    "",
    "9. deleteEntry({ sectionId, entryId })",
    "Delete an entry.",
    "",
    "10. moveEntry({ sectionId, entryId, direction })",
    "Move an entry. direction = up | down.",
    "",
    "11. addLine({ sectionId, entryId, type, text, bold, italic })",
    "Add a line. type = title | date | subtitle | bullet | paragraph.",
    "title lines are always bold. subtitle lines are always italic.",
    "",
    "12. setLine({ sectionId, entryId, lineId, type?, text?, bold?, italic? })",
    "Update a line.",
    "",
    "13. deleteLine({ sectionId, entryId, lineId })",
    "Delete a line.",
    "",
    "14. moveLine({ sectionId, entryId, lineId, direction })",
    "Move a line. direction = up | down.",
    "",
    "You may use \"$lastSection\" as sectionId after a previous addSection result.",
    "You may use \"$lastEntry\" as entryId after a previous addEntry result.",
    "You may return up to 10 local function calls in one response.",
    "Do not directly rewrite the whole resume JSON. Return function calls only."
  ].join("\n");

  function formatResumeFunctionManualForPrompt() {
    return RESUME_FUNCTION_MANUAL.replace(/^Available local resume functions:\n\n/, "");
  }

  async function planResumeEdit(request, options) {
    var req = isObject(request) ? request : {};
    var userMessage = cleanString(req.userMessage);
    var resumeSummary = cleanString(req.resumeSummary);
    var guidanceContext = isObject(req.guidanceContext) ? req.guidanceContext : null;
    var chatHistory = formatVisibleChatHistory(req.chatHistory);

    if (!userMessage) {
      return { ok: false, code: "INVALID_INPUT", error: "userMessage is required." };
    }

    var isAppContext = Boolean(guidanceContext);

    var outputFormatLines = [
      "Return strict JSON only. No markdown fences. No explanation outside JSON.",
      "",
      "{\"assistantMessage\":\"...\",\"functionCalls\":[{\"name\":\"...\",\"args\":{...}}]}",
      "",
      "Rules:",
      "- functionCalls must be an array.",
      "- functionCalls length must be between 0 and 10.",
      "- functionCalls may be [] if no safe action is possible.",
      "- Do not allow more than 10 function calls. If the request needs more, return only an empty array and explain that the edit must be split into smaller batches.",
      "- assistantMessage must be user-readable.",
      "- function names must exactly match the allowed list.",
      "- Do not return the entire resume JSON.",
      "- Do not directly rewrite the whole resume JSON.",
      "- You may return up to 10 local function calls in one response.",
      "- Use multiple calls when the user's request naturally requires several small edits.",
      "- Do not exceed 10 function calls.",
      "- Prefer fewer calls when possible.",
      "- Do not combine unrelated major changes unless the user requested them.",
      "- Do not add https:// to contact links.",
      "- title lines are always bold; subtitle lines are always italic.",
      "- The current resume state includes ids. Use those ids for existing contact links, sections, entries, and lines.",
      "- Use fuzzy matching against the current resume state. If the user has a typo, infer the likely existing target when confidence is high.",
      "- Example: experince likely means an existing Experience section. Prefer existing matching sections/entries over creating duplicates.",
      "- Do not invent ids. If no suitable target exists, use addSection or addEntry as appropriate.",
      "",
      "Examples:",
      "- If the user asks to update name, email, and phone, return multiple setContactField calls.",
      "- If the user asks to add one education entry, return addSection if needed, addEntry, and several addLine calls.",
      "- If the user asks to add one project with multiple bullets, return addEntry and addLine calls, staying within the 10-call limit."
    ].join("\n");

    var promptParts = [
      "# Role",
      "You are a resume editing assistant.",
      "Use only the provided local resume functions. Do not invent facts or details.",
      "Do not directly rewrite or overwrite the full resume JSON. Return local function calls only."
    ];

    if (isAppContext) {
      promptParts.push("");
      promptParts.push("# Application Context");
      promptParts.push("You are editing only the selected application-specific resume draft. Do not modify the global Profile or other applications.");
    }

    promptParts.push("");
    promptParts.push("# Current Resume State");
    promptParts.push(resumeSummary || "(empty resume)");
    promptParts.push("");
    promptParts.push("# Available Local Resume Functions");
    promptParts.push(formatResumeFunctionManualForPrompt());
    promptParts.push("");
    promptParts.push("# Chat History");
    promptParts.push(chatHistory);
    promptParts.push("");
    promptParts.push("# Current User Request");
    promptParts.push(userMessage);
    promptParts.push("");
    promptParts.push("# Output Format");
    promptParts.push(outputFormatLines);

    var prompt = promptParts.join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return { ok: false, code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED", error: cleanString(result && result.error) || "AI request failed." };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "AI returned an invalid response format." };
    }
    if (!Array.isArray(parsed.functionCalls)) {
      return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "AI returned an invalid functionCalls value." };
    }
    if (parsed.functionCalls.length > RESUME_MAX_FUNCTION_CALLS) {
      var correctionPrompt = [
        prompt,
        "",
        "# Correction Required",
        "Your previous response returned more than 10 function calls.",
        "Return the same JSON shape again, but reduce functionCalls to at most 10 calls.",
        "Do not include more than 10 calls. If the whole request cannot be safely completed within 10 calls, return a safe first batch of up to 10 calls or return [] and explain that the edit must be split.",
        "",
        "# Previous Invalid Response",
        safeJsonStringify(parsed, 2)
      ].join("\n");
      var correctionResult = await runProviderPrompt({ settings: req.settings, prompt: correctionPrompt }, options || {});
      if (!correctionResult || correctionResult.ok !== true) {
        return { ok: false, code: "FUNCTION_CALL_LIMIT_EXCEEDED", error: "AI returned more than 10 function calls and could not reduce the batch." };
      }
      parsed = parsePotentialJsonObject(correctionResult.text);
      if (!parsed || !Array.isArray(parsed.functionCalls)) {
        return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "AI returned an invalid reduced functionCalls value." };
      }
      if (parsed.functionCalls.length > RESUME_MAX_FUNCTION_CALLS) {
        return { ok: false, code: "FUNCTION_CALL_LIMIT_EXCEEDED", error: "AI returned more than 10 function calls after reduction." };
      }
    }

    return {
      ok: true,
      code: "OK",
      assistantMessage: cleanString(parsed.assistantMessage) || "Processing your request.",
      functionCalls: parsed.functionCalls
    };
  }

  async function selfCheckFunctionCalls(request, options) {
    var req = isObject(request) ? request : {};
    var userMessage = cleanString(req.userMessage);
    var rawFunctionCalls = req.functionCalls;
    if (!Array.isArray(rawFunctionCalls)) {
      return { ok: true, approved: false, reason: "Self-check rejected the batch because functionCalls is not an array." };
    }
    if (rawFunctionCalls.length > RESUME_MAX_FUNCTION_CALLS) {
      return { ok: true, approved: false, reason: "Self-check rejected the batch because it contains more than 10 function calls." };
    }
    var functionCalls = rawFunctionCalls;
    var functionCallsJson = safeJsonStringify(functionCalls, 2);
    var resumeSummary = cleanString(req.resumeSummary);
    var guidanceContext = isObject(req.guidanceContext) ? req.guidanceContext : null;
    var chatHistory = formatVisibleChatHistory(req.chatHistory);
    var isAppContext = Boolean(guidanceContext);

    var rejectRules = [
      "- functionCalls is not an array.",
      "- The batch contains more than 10 function calls.",
      "- Uses an unknown function name.",
      "- Is unrelated to the user request.",
      "- Makes destructive changes not explicitly requested.",
      "- References a sectionId/entryId/lineId/linkId not present in the current resume state, except $lastSection after a previous addSection result or $lastEntry after a previous addEntry result.",
      "- Creates a duplicate section or entry while ignoring a suitable existing target from the current resume state.",
      "- Would overwrite the entire resume JSON.",
      "- Adds invented facts the user did not provide."
    ];

    if (isAppContext) {
      rejectRules.push("- Would edit the global Profile instead of the application-specific resume.");
      rejectRules.push("- Adds content not supported by the visible chat history, guidance messages, or the user's own details.");
    }

    var promptParts = [
      "You are reviewing proposed resume function calls for safety and accuracy.",
      "Return strict JSON only. No markdown fences. No explanation outside JSON.",
      "",
      "Output format:",
      "{\"approved\":true,\"reason\":\"...\"}",
      "",
      "Review the entire proposed functionCalls array as one all-or-nothing batch.",
      "Approve only if every call is safe, correct, relevant, supported, and within the 10-call limit.",
      "",
      "Reject if any function call:"
    ].concat(rejectRules);

    promptParts.push("");
    promptParts.push("AVAILABLE LOCAL RESUME FUNCTIONS:");
    promptParts.push(formatResumeFunctionManualForPrompt());
    promptParts.push("");
    promptParts.push("CHAT HISTORY:");
    promptParts.push(chatHistory);
    promptParts.push("");
    promptParts.push("CURRENT RESUME STATE:");
    promptParts.push(resumeSummary || "(empty resume)");
    promptParts.push("");
    promptParts.push("USER REQUEST:");
    promptParts.push(userMessage);
    promptParts.push("");
    promptParts.push("PROPOSED FUNCTION CALLS:");
    promptParts.push(functionCallsJson);

    var prompt = promptParts.join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return { ok: true, approved: false, reason: "Self-check request failed. Skipping execution for safety." };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: true, approved: false, reason: "Self-check returned invalid response. Skipping execution for safety." };
    }
    return {
      ok: true,
      approved: parsed.approved === true,
      reason: cleanString(parsed.reason) || ""
    };
  }

  async function recoverResumeFunctionCalls(request, options) {
    var req = isObject(request) ? request : {};
    var userMessage = cleanString(req.userMessage);
    var resumeSummary = cleanString(req.resumeSummary);
    var failedCallJson = safeJsonStringify(isObject(req.failedCall) ? req.failedCall : {}, 2);
    var missingTargetJson = safeJsonStringify(isObject(req.missingTarget) ? req.missingTarget : {}, 2);
    var candidatesJson = safeJsonStringify(req.candidates || {}, 2);
    var guidanceContext = isObject(req.guidanceContext) ? req.guidanceContext : null;
    var isAppContext = Boolean(guidanceContext);

    if (!userMessage) {
      return { ok: false, code: "INVALID_INPUT", error: "userMessage is required." };
    }

    var promptParts = [
      "You are recovering from a failed local resume function call.",
      "A target id was not found. Decide whether to use an existing similar target, create a missing Section/Entry, ask the user, or abort.",
      "Return strict JSON only. No markdown fences. No explanation outside JSON.",
      "",
      "Output format:",
      "{\"assistantMessage\":\"...\",\"action\":\"retry_with_revised_calls|create_missing_target|ask_user|abort\",\"functionCalls\":[{\"name\":\"...\",\"args\":{...}}]}",
      "",
      "Rules:",
      "- Use only the provided local resume functions.",
      "- functionCalls must be an array with 0 to 10 calls.",
      "- Do not return more than 10 function calls.",
      "- Do not directly rewrite or return the whole resume JSON.",
      "- Do not invent ids. Use ids from CURRENT RESUME STATE or $lastSection/$lastEntry placeholders after creating targets.",
      "- Prefer existing similar sections/entries over creating duplicates.",
      "- Before creating a new Section, check for semantic or typographic matches such as experince -> Experience, project -> Projects, school -> Education.",
      "- Use create_missing_target only when no suitable existing target exists and creation is reasonable for the user request.",
      "- If unsure, choose ask_user and include a concise question in assistantMessage.",
      "- If unsafe or impossible, choose abort.",
      "- If creating a section then adding content, use addSection, then addEntry with sectionId \"$lastSection\", then addLine with sectionId \"$lastSection\" and entryId \"$lastEntry\".",
      "- If creating an entry in an existing section, use addEntry then $lastEntry for subsequent addLine calls.",
      "- Do not add https:// to contact links.",
      "- title lines are always bold; subtitle lines are always italic.",
      "",
      RESUME_FUNCTION_MANUAL
    ];

    if (isAppContext) {
      promptParts.push("");
      promptParts.push("APPLICATION CONTEXT:");
      promptParts.push("Only edit the selected application-specific resume. Do not modify the global Profile or other applications.");
    }

    promptParts.push("");
    promptParts.push("CURRENT RESUME STATE:");
    promptParts.push(resumeSummary || "(empty resume)");
    promptParts.push("");
    promptParts.push("LOCAL CANDIDATES:");
    promptParts.push(candidatesJson || "{}");
    promptParts.push("");
    promptParts.push("ORIGINAL USER REQUEST:");
    promptParts.push(userMessage);
    promptParts.push("");
    promptParts.push("FAILED FUNCTION CALL:");
    promptParts.push(failedCallJson || "{}");
    promptParts.push("");
    promptParts.push("MISSING TARGET ERROR:");
    promptParts.push(missingTargetJson || "{}");

    var result = await runProviderPrompt({ settings: req.settings, prompt: promptParts.join("\n") }, options || {});
    if (!result || result.ok !== true) {
      return { ok: false, code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED", error: cleanString(result && result.error) || "AI recovery request failed." };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "AI recovery returned an invalid response format." };
    }
    if (!Array.isArray(parsed.functionCalls)) {
      return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "AI recovery returned an invalid functionCalls value." };
    }
    if (parsed.functionCalls.length > RESUME_MAX_FUNCTION_CALLS) {
      return { ok: false, code: "FUNCTION_CALL_LIMIT_EXCEEDED", error: "AI recovery returned more than 10 function calls." };
    }

    var action = cleanString(parsed.action);
    var allowedActions = ["retry_with_revised_calls", "create_missing_target", "ask_user", "abort"];
    if (allowedActions.indexOf(action) === -1) {
      action = "ask_user";
    }

    return {
      ok: true,
      code: "OK",
      assistantMessage: cleanString(parsed.assistantMessage) || "I could not confidently recover the missing resume target.",
      action: action,
      functionCalls: parsed.functionCalls
    };
  }

  async function answerApplicationNotesQuestion(request, options) {
    var req = isObject(request) ? request : {};
    var userMessage = cleanString(req.userMessage);
    var notesContext = isObject(req.notesContext) ? req.notesContext : {};
    var chatHistory = formatVisibleChatHistory(req.chatHistory);
    var localNotesContext = {};
    Object.keys(notesContext).forEach(function copyLocalNotesContext(key) {
      if (key === "onlineResearchContext" || key === "onlineResearchAvailable" || key === "resumePdfContext" || key === "resumePdfContextAvailable") {
        return;
      }
      localNotesContext[key] = notesContext[key];
    });
    var notesContextJson = safeJsonStringify(localNotesContext, 2);
    var onlineResearchContext = cleanString(notesContext.onlineResearchContext);

    if (!userMessage) {
      return { ok: false, code: "INVALID_INPUT", error: "userMessage is required." };
    }

    var prompt = [
      "# Role",
      "You are helping the user review job application notes.",
      "This is a read-only Q&A task.",
      "Use the provided local application notes and application metadata.",
      "If online research context is available, use it only as supplemental context.",
      "Clearly distinguish:",
      "1. what comes from local notes",
      "2. what comes from online research",
      "3. your combined recommendation",
      "",
      "# Local Application Notes",
      notesContextJson || "{}",
      "",
      "# Optional Online Research Context",
      onlineResearchContext || "(no online research context provided)",
      "",
      "# Chat History",
      chatHistory,
      "",
      "# Current User Question",
      userMessage,
      "",
      "# Answer Rules",
      "- Do not modify notes, applications, resumes, Profile, status, settings, or storage.",
      "- Do not ask for or use write actions.",
      "- Do not invent user experiences, interview records, company replies, application statuses, dates, or notes.",
      "- Do not claim online research came from the user's notes.",
      "- Do not claim local notes contain information that is only from online research.",
      "- If no online research context is provided, answer from local notes only. Omit the online research section unless the user asks about online research; then state that online research is unavailable.",
      "- If local notes are insufficient, say that clearly.",
      "",
      "Preferred response format:",
      "Based on your local notes:",
      "- ...",
      "",
      "Based on online research:",
      "- ...",
      "",
      "Combined recommendation:",
      "- ..."
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: cleanString(result && result.error) || "AI notes request failed."
      };
    }

    return {
      ok: true,
      code: "OK",
      answer: cleanString(result.text)
    };
  }

  async function summarizeApplicationNotesConversation(request, options) {
    var req = isObject(request) ? request : {};
    var messages = Array.isArray(req.messages) ? req.messages : [];
    var normalizedMessages = messages.map(function(message) {
      var safe = isObject(message) ? message : {};
      var role = cleanString(safe.role).toLowerCase();
      var content = cleanString(safe.content || safe.text || safe.message);
      if ((role !== "user" && role !== "assistant") || !content) {
        return null;
      }
      return {
        role: role,
        content: content,
        createdAt: cleanString(safe.createdAt)
      };
    }).filter(Boolean).slice(-CHAT_HISTORY_VISIBLE_LIMIT);

    if (!normalizedMessages.length) {
      return { ok: false, code: "INVALID_INPUT", error: "messages are required." };
    }

    var prompt = [
      "# Role",
      "You summarize an AI Note Assistant conversation for a job application note export.",
      "",
      "# Conversation",
      safeJsonStringify(normalizedMessages, 2),
      "",
      "# Instructions",
      "- Write a concise practical summary of the conversation.",
      "- Preserve important decisions, facts, follow-ups, companies, roles, deadlines, and risks when present.",
      "- Do not invent details that are not in the conversation.",
      "- Return only the summary text."
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: cleanString(result && result.error) || "AI notes summary request failed."
      };
    }

    return {
      ok: true,
      code: "OK",
      summary: cleanString(result.text)
    };
  }

  async function extractResumeMarkdownFromText(request, options) {
    var req = isObject(request) ? request : {};
    var pdfText = clipText(cleanString(req.pdfText), 24000);
    var fileName = cleanString(req.fileName);
    var schemaText = '{"markdown":"string","confidence":"high | medium | low","warnings":["string"]}';
    if (!pdfText) {
      return { ok: false, code: "NO_PDF_TEXT", error: "No extractable PDF text was provided." };
    }

    var prompt = [
      "Convert this resume text into clean Markdown.",
      "",
      "The input may come from PDF extraction or user-pasted resume text.",
      "It may contain minor extraction artifacts such as:",
      "- broken line breaks",
      "- missing spaces",
      "- extra spaces",
      "- broken bullets",
      "- split headings",
      "- broken date ranges",
      "- columns merged in imperfect order",
      "",
      "Rules:",
      "- Preserve all meaningful content.",
      "- Preserve contact information.",
      "- Preserve section headings.",
      "- Preserve education, experience, projects, skills, research, leadership, awards, and all other sections.",
      "- Preserve dates, titles, subtitles, bullet points, paragraphs, and skill lines.",
      "- Preserve original order as much as possible.",
      "- Use Markdown headings for section headings.",
      "- Use Markdown bullet lists for bullet points.",
      "- You may make reasonable guesses to fix minor PDF extraction artifacts, such as broken line breaks, missing spaces, extra spaces, broken bullets, or obvious OCR/extraction typos.",
      "- You may infer likely section structure when headings and content are slightly broken.",
      "- You may repair obvious formatting damage when the intended content is clear.",
      "- Do not invent new achievements, companies, schools, dates, metrics, skills, or facts.",
      "- Do not add content that is not supported by the extracted text.",
      "- Do not summarize.",
      "- Do not rewrite achievements for style.",
      "- Do not improve wording beyond fixing extraction artifacts.",
      "- If something is too corrupted to infer safely, keep the readable fragment and mention the uncertainty in warnings.",
      "- Return JSON only.",
      "",
      "Return:",
      "{",
      '  "markdown": "...",',
      '  "confidence": "high | medium | low",',
      '  "warnings": []',
      "}",
      "",
      buildJsonRetryInstruction(req.retryReason, schemaText),
      "",
      fileName ? "FILE NAME: " + fileName : "",
      "",
      "# Resume Text",
      pdfText
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: cleanString(result && result.error) || "Failed to convert extracted text into Markdown."
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "Failed to convert extracted text into Markdown." };
    }

    var markdown = cleanString(parsed.markdown);
    if (!markdown) {
      return { ok: false, code: "NO_MARKDOWN", error: "No readable text was extracted from this PDF." };
    }

    return {
      ok: true,
      code: "OK",
      markdown: markdown,
      confidence: cleanString(parsed.confidence) || "medium",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(cleanString).filter(Boolean) : [],
      source: "text-cleanup"
    };
  }

  async function extractResumePlainTextFromPdf(request, options) {
    var req = isObject(request) ? request : {};
    var pdfBase64 = cleanString(req.pdfBase64).replace(/^data:application\/pdf;base64,/i, "");
    var fileName = cleanString(req.fileName) || "resume.pdf";
    if (!pdfBase64) {
      return { ok: false, code: "INVALID_INPUT", error: "PDF input is required." };
    }

    var resolved = await resolveRuntimeSettings(req);
    var config = resolveProviderRuntimeConfig(resolved.settings);
    if (!config.provider || !config.model || !config.apiKey) {
      return buildInvalidSettingsResult();
    }
    var capabilities = getProviderCapabilitiesFromConfig(config);
    if (!capabilities.supportsDirectPdfTextExtraction) {
      return {
        ok: false,
        code: "PDF_INPUT_UNSUPPORTED",
        error: "The current AI provider does not support direct PDF text extraction."
      };
    }

    var prompt = [
      "You are extracting raw text from a PDF resume.",
      "",
      "Read the uploaded PDF directly.",
      "Extract ALL visible text from the resume.",
      "",
      "Rules:",
      "- Extract all visible text, not only contact information.",
      "- Preserve original wording as much as possible.",
      "- Preserve section headings.",
      "- Preserve titles, dates, subtitles, bullet points, paragraphs, and skill lines.",
      "- Preserve reading order as much as possible.",
      "- Do not summarize.",
      "- Do not rewrite.",
      "- Do not improve wording.",
      "- Do not invent missing content.",
      "- If some text is unreadable, mention it in warnings.",
      "- Return JSON only.",
      "",
      "Return:",
      "{",
      '  "plainText": "string",',
      '  "confidence": "high | medium | low",',
      '  "warnings": ["string"]',
      "}"
    ].join("\n");

    var result;
    try {
      var callResult = await callOpenAiResponsesWithPdf({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        systemPrompt: config.systemPrompt,
        anthropicVersion: config.anthropicVersion
      }, prompt, pdfBase64, fileName, Object.assign({}, options || {}, { maxTokens: 12000 }));
      if (!callResult || callResult.parseError) {
        return {
          ok: false,
          code: "MODEL_RESPONSE_PARSE_FAILED",
          error: "Failed to extract text from this PDF. Please try again."
        };
      }
      if (!callResult.response || callResult.response.ok !== true) {
        return {
          ok: false,
          code: "MODEL_REQUEST_FAILED",
          error: "Failed to extract text from this PDF. Please try again.",
          status: callResult && callResult.response ? callResult.response.status : 0
        };
      }
      result = {
        ok: true,
        text: extractProviderText(config.provider, callResult.payload)
      };
    } catch {
      return {
        ok: false,
        code: "MODEL_REQUEST_FAILED",
        error: "Failed to extract text from this PDF. Please try again."
      };
    }

    if (!result || result.ok !== true || !cleanString(result.text)) {
      return {
        ok: false,
        code: "EMPTY_RESPONSE",
        error: "Failed to extract text from this PDF. Please try again."
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "Failed to extract text from this PDF. Please try again." };
    }

    var plainText = cleanString(parsed.plainText);
    if (!plainText) {
      return { ok: false, code: "NO_READABLE_TEXT", error: "No readable text was extracted from this PDF." };
    }

    var confidence = cleanString(parsed.confidence).toLowerCase();
    if (["high", "medium", "low"].indexOf(confidence) === -1) {
      confidence = "medium";
    }

    return {
      ok: true,
      code: "OK",
      plainText: plainText,
      confidence: confidence,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(cleanString).filter(Boolean) : [],
      source: "OpenAI direct PDF text extraction"
    };
  }

  async function extractResumeMarkdownFromPdf(request, options) {
    var req = isObject(request) ? request : {};
    var pdfBase64 = cleanString(req.pdfBase64).replace(/^data:application\/pdf;base64,/i, "");
    var fileName = cleanString(req.fileName) || "resume.pdf";
    if (!pdfBase64) {
      return { ok: false, code: "INVALID_INPUT", error: "PDF input is required." };
    }

    var resolved = await resolveRuntimeSettings(req);
    var config = resolveProviderRuntimeConfig(resolved.settings);
    if (!config.provider || !config.model || !config.apiKey) {
      return buildInvalidSettingsResult();
    }
    var capabilities = getProviderCapabilitiesFromConfig(config);
    if (!capabilities.supportsDirectPdfInput) {
      return {
        ok: false,
        code: "PDF_INPUT_UNSUPPORTED",
        error: "The current AI provider does not support direct PDF extraction."
      };
    }

    var prompt = [
      "You are extracting content from a PDF resume.",
      "",
      "Extract ALL visible text from the uploaded PDF resume and convert it into clean Markdown.",
      "",
      "Rules:",
      "- Extract all text, not only contact information.",
      "- Preserve section headings.",
      "- Preserve education, experience, projects, skills, research, leadership, awards, and all other sections.",
      "- Preserve titles, dates, subtitles, bullet points, paragraphs, and skill lines.",
      "- Preserve the original order as much as possible.",
      "- Use Markdown headings for section headings.",
      "- Use Markdown bullet lists for bullet points.",
      "- Do not summarize.",
      "- Do not rewrite.",
      "- Do not improve wording.",
      "- Do not invent missing content.",
      "- If some text is unreadable, mention it in warnings.",
      "- Return JSON only.",
      "",
      "Return:",
      "{",
      '  "markdown": "...",',
      '  "confidence": "high | medium | low",',
      '  "warnings": []',
      "}"
    ].join("\n");

    var result;
    try {
      var callResult = await callOpenAiResponsesWithPdf({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        systemPrompt: config.systemPrompt,
        anthropicVersion: config.anthropicVersion
      }, prompt, pdfBase64, fileName, Object.assign({}, options || {}, { maxTokens: 12000 }));
      if (!callResult || callResult.parseError) {
        return {
          ok: false,
          code: "MODEL_RESPONSE_PARSE_FAILED",
          error: "Failed to extract text from this PDF. Please try again."
        };
      }
      if (!callResult.response || callResult.response.ok !== true) {
        return {
          ok: false,
          code: "MODEL_REQUEST_FAILED",
          error: "Failed to extract text from this PDF. Please try again.",
          status: callResult && callResult.response ? callResult.response.status : 0
        };
      }
      result = {
        ok: true,
        text: extractProviderText(config.provider, callResult.payload)
      };
    } catch {
      return {
        ok: false,
        code: "MODEL_REQUEST_FAILED",
        error: "Failed to extract text from this PDF. Please try again."
      };
    }

    if (!result || result.ok !== true || !cleanString(result.text)) {
      return {
        ok: false,
        code: "EMPTY_RESPONSE",
        error: "Failed to extract text from this PDF. Please try again."
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "Failed to extract text from this PDF. Please try again." };
    }

    var markdown = cleanString(parsed.markdown);
    if (!markdown) {
      return { ok: false, code: "NO_READABLE_TEXT", error: "No readable text was extracted from this PDF." };
    }

    var confidence = cleanString(parsed.confidence).toLowerCase();
    if (["high", "medium", "low"].indexOf(confidence) === -1) {
      confidence = "medium";
    }

    return {
      ok: true,
      code: "OK",
      markdown: markdown,
      plainText: cleanString(parsed.plainText),
      confidence: confidence,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(cleanString).filter(Boolean) : [],
      source: "OpenAI direct PDF extraction"
    };
  }

  function buildImportProgressText(progress) {
    var rows = Array.isArray(progress) ? progress : [];
    return rows.slice(-40).map(function mapRow(row, index) {
      var safe = isObject(row) ? row : {};
      var label = cleanString(safe.summary || safe.message || safe.reason);
      return String(index + 1) + ". " + label;
    }).filter(Boolean).join("\n");
  }

  async function planResumeImportStep(request, options) {
    var req = isObject(request) ? request : {};
    var markdown = clipText(cleanString(req.markdown), 28000);
    var resumeSummary = cleanString(req.resumeSummary);
    var activeResumeLanguage = cleanString(req.activeResumeLanguage) || "en";
    var progressText = buildImportProgressText(req.progress);
    var checklistJson = safeJsonStringify(req.importChecklist || {}, 2);
    var remainingItemsJson = safeJsonStringify(Array.isArray(req.remainingItems) ? req.remainingItems : [], 2);
    var schemaText = '{"status":"continue | complete | ask_user | abort","assistantMessage":"string","functionCalls":[{"name":"addSection","args":{}}],"reason":"string","remainingItems":["string"]}';
    var selfCheckRejectionReason = cleanString(req.selfCheckRejectionReason);
    var selfCheckRejectionCount = Number(req.selfCheckRejectionCount || 0);
    var selfCheckTargetCallHint = cleanString(req.selfCheckTargetCallHint);
    if (!markdown) {
      return { ok: false, code: "INVALID_INPUT", error: "markdown is required." };
    }

    var selfCheckRejectionBlock = selfCheckRejectionReason ? [
      "SELF-CHECK REJECTION:",
      "The previous proposed batch was rejected by self-check.",
      "Rejection reason: " + selfCheckRejectionReason,
      "This is rejection attempt " + String(selfCheckRejectionCount) + " of 3.",
      "",
      "Please propose a smaller and safer batch.",
      "Rules:",
      "- Reduce the batch to 1 to 2 function calls.",
      "- Focus on one obvious content unit only.",
      "- Skip placeholder/template content.",
      "- Preserve the same Markdown content meaning.",
      "- Do not invent content.",
      "- Do not exceed 10 function calls.",
      selfCheckTargetCallHint ? "- Try " + selfCheckTargetCallHint + " function call" + (selfCheckTargetCallHint === "1" ? "" : "s") + " for this attempt." : "- If unsure, import only one obvious item from the Markdown.",
      ""
    ].join("\n") : "";

    var prompt = [
      "You are importing a Markdown resume into a structured resume editor.",
      "",
      "Use local resume functions only.",
      "",
      "Hard limit:",
      "You may return at most 10 function calls.",
      "",
      "Preferred behavior:",
      "Return only 1 to 3 function calls per round.",
      "Import one small content unit at a time.",
      "Smaller safe batches are preferred because they are easier to verify.",
      "Continue iterating until all meaningful Markdown content is represented.",
      "",
      "Important proposal size rule:",
      "- Prefer 1 to 3 function calls per round.",
      "- Import only one small content unit at a time.",
      "- Use more than 3 calls only if the content is simple, obvious, and clearly safe.",
      "- Never exceed 10 calls.",
      "- Smaller proposals are better than large proposals.",
      "- The import should complete through many small iterations.",
      "",
      "Content unit definition:",
      "A content unit can be contact information group, one section title, one entry title, one entry title + date, one subtitle, one bullet point, one paragraph, one skills line, or one link.",
      "Do not import an entire long section in one round.",
      "Return strict JSON only. No markdown fences. No explanation outside JSON.",
      "",
      "Output format:",
      '{"status":"continue|complete|ask_user|abort","assistantMessage":"string","functionCalls":[{"name":"addSection","args":{}}],"reason":"string","remainingItems":[]}',
      "",
      "Rules:",
      "- If status is continue, functionCalls must contain 1 to 10 calls.",
      "- status=continue with functionCalls=[] is invalid.",
      "- Prefer 1 to 3 calls.",
      "- If status is complete, functionCalls should be empty or omitted.",
      "- If status is ask_user, pause import and explain the needed user decision in assistantMessage.",
      "- If status is abort, stop import and explain why in assistantMessage.",
      "- Import all meaningful content from the Markdown.",
      "- Import the next pending real content unit from IMPORT CHECKLIST DETECTED FROM MARKDOWN.",
      "- Do not import the whole resume at once.",
      "- Do not import a full long section at once.",
      "- Do not stop after contact information.",
      "- Import sections, entries, dates, subtitles, bullets, paragraphs, and skills.",
      "- Preserve wording as closely as possible.",
      "- Do not summarize.",
      "- Do not rewrite achievements.",
      "- Do not invent missing content.",
      "- Do not import placeholders such as YOUR NAME, Phone number, email address, City, State, Month Year, Company Name, or text that is clearly template guidance.",
      "- If the next Markdown content looks like a placeholder/template, skip it and move to the next real content.",
      "- Do not import placeholder contact info.",
      "- Do not import placeholder entries.",
      "- Do not import template instruction text.",
      "- If there is no safe real content to import, return status = ask_user with an explanation.",
      "- If all remaining items are placeholders, return status=ask_user and say: The remaining content appears to be template placeholder text. Please paste actual resume content.",
      "- Use existing sections if they already match.",
      "- Create new sections and entries when needed.",
      "- Use Title for main item names.",
      "- Use Date for dates.",
      "- Use Subtitle for organization/location/degree/technology context.",
      "- Use Bullet Point for bullet items.",
      "- Use Paragraph for summary or skills lines.",
      "- Skills sections may use Paragraph lines.",
      "- Stop only when all meaningful Markdown content is represented in the resume state.",
      "- Use only the allowed local functions listed below.",
      "- Do not invent ids. Use ids from CURRENT RESUME STATE or $lastSection/$lastEntry placeholders after creating targets.",
      "- Before adding a section, check whether a similar section already exists.",
      "- Before adding a contact link, check whether the same text already exists.",
      "- Before adding an entry, check whether the same title already exists in that section.",
      "- Prefer existing sections and entries instead of creating duplicates.",
      "- Import links as plain text. Do not add https:// and do not make links clickable.",
      "- Map contact info to firstName, lastName, email, phone, location, and plain-text links.",
      "- Title lines must be bold true. Subtitle lines must be italic true.",
      "- Do not attempt partial inline bold or italic.",
      "- Date lines should be added to the same entry as the earliest title they describe.",
      "- Named sections are valid even without entries.",
      "",
      buildJsonRetryInstruction(req.retryReason, schemaText + " functionCalls must contain at most 10 calls."),
      "",
      selfCheckRejectionBlock,
      RESUME_FUNCTION_MANUAL,
      "",
      "EXTRACTED RESUME MARKDOWN:",
      markdown,
      "",
      "CURRENT ACTIVE RESUME LANGUAGE:",
      activeResumeLanguage,
      "",
      "CURRENT RESUME STATE:",
      resumeSummary || "(empty resume)",
      "",
      "IMPORT PROGRESS SO FAR:",
      progressText || "(no steps imported yet)",
      "",
      "IMPORT CHECKLIST DETECTED FROM MARKDOWN:",
      checklistJson || "{}",
      "",
      "REMAINING ITEMS THAT MUST BE IMPORTED BEFORE COMPLETE:",
      remainingItemsJson || "[]"
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: cleanString(result && result.error) || "Failed to plan resume import step."
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "AI returned an invalid import step response." };
    }

    var status = cleanString(parsed.status);
    var allowedStatuses = ["continue", "complete", "ask_user", "abort"];
    if (allowedStatuses.indexOf(status) === -1) {
      return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "AI returned an invalid import status." };
    }
    var parsedFunctionCalls = Array.isArray(parsed.functionCalls)
      ? parsed.functionCalls.filter(isObject)
      : (isObject(parsed.functionCall) ? [parsed.functionCall] : []);
    if (status === "continue" && !parsedFunctionCalls.length) {
      return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "AI returned continue without functionCalls." };
    }
    if (parsedFunctionCalls.length > RESUME_MAX_FUNCTION_CALLS) {
      return { ok: false, code: "FUNCTION_CALL_LIMIT_EXCEEDED", error: "AI returned more than 10 function calls." };
    }

    return {
      ok: true,
      code: "OK",
      status: status,
      assistantMessage: cleanString(parsed.assistantMessage),
      functionCalls: parsedFunctionCalls,
      reason: cleanString(parsed.reason),
      importedItem: cleanString(parsed.importedItem),
      remainingItems: Array.isArray(parsed.remainingItems) ? parsed.remainingItems.map(cleanString).filter(Boolean) : []
    };
  }

  async function selfCheckResumeImportFunctionCall(request, options) {
    var req = isObject(request) ? request : {};
    var markdown = clipText(cleanString(req.markdown), 18000);
    var resumeSummary = cleanString(req.resumeSummary);
    var functionCalls = Array.isArray(req.functionCalls)
      ? req.functionCalls.filter(isObject)
      : (isObject(req.functionCall) ? [req.functionCall] : []);
    var functionCallJson = safeJsonStringify(functionCalls, 2);
    var progressText = buildImportProgressText(req.progress);
    var schemaText = '{"approved":true,"reason":"string"}';

    var prompt = [
      "You are reviewing a proposed batch of local resume function calls for an uploaded resume import.",
      "Return strict JSON only. No markdown fences. No explanation outside JSON.",
      "",
      "Output format:",
      '{"approved":true,"reason":"string"}',
      "",
      "Approve if:",
      "- The batch imports one small content unit.",
      "- The content roughly matches the Markdown.",
      "- No facts are invented.",
      "- No placeholders are imported.",
      "- The target location is reasonable.",
      "Do not be overly strict about minor formatting differences.",
      "",
      "Reject only if:",
      "- Placeholder/template text is imported as real resume content.",
      "- The batch imports too much at once.",
      "- Content is clearly wrong.",
      "- Content is invented.",
      "- Content is missing important meaning.",
      "- The wrong target is used.",
      "- Function calls exceed 10.",
      "- Function calls are unsafe.",
      "- Function calls overwrite unrelated resume data.",
      "- The batch returns or overwrites full resume JSON.",
      "",
      buildJsonRetryInstruction(req.retryReason, schemaText),
      "",
      RESUME_FUNCTION_MANUAL,
      "",
      "EXTRACTED RESUME MARKDOWN:",
      markdown,
      "",
      "CURRENT RESUME STATE:",
      resumeSummary || "(empty resume)",
      "",
      "IMPORT PROGRESS SO FAR:",
      progressText || "(no steps imported yet)",
      "",
      "PROPOSED FUNCTION CALLS:",
      functionCallJson
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: cleanString(result && result.error) || "Self-check request failed."
      };
    }

    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "Self-check returned invalid response." };
    }
    if (typeof parsed.approved !== "boolean") {
      return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "Self-check approved field must be boolean." };
    }

    return {
      ok: true,
      approved: parsed.approved,
      reason: cleanString(parsed.reason)
    };
  }

  async function auditResumeImportCoverage(request, options) {
    var req = isObject(request) ? request : {};
    var markdown = clipText(cleanString(req.markdown), 22000);
    var resumeSummary = cleanString(req.resumeSummary);
    var checklistJson = safeJsonStringify(req.importChecklist || {}, 2);
    var remainingItemsJson = safeJsonStringify(Array.isArray(req.remainingItems) ? req.remainingItems : [], 2);
    var schemaText = '{"complete":true,"missingItems":[],"notes":"string"}';
    var prompt = [
      "You are auditing an uploaded resume import.",
      "Compare the extracted Markdown resume against the final structured resume summary.",
      "Does the structured resume include all meaningful content from the Markdown resume?",
      "Check contact info, every section heading, every major entry, dates, subtitles, bullet points, paragraphs, and skill lines.",
      "Do not require exact formatting, but do require meaningful content coverage.",
      "Return JSON only:",
      '{"complete":true,"missingItems":[],"notes":"string"}',
      "",
      buildJsonRetryInstruction(req.retryReason, schemaText),
      "",
      "EXTRACTED RESUME MARKDOWN:",
      markdown,
      "",
      "IMPORT CHECKLIST:",
      checklistJson || "{}",
      "",
      "LOCAL REMAINING ITEMS:",
      remainingItemsJson || "[]",
      "",
      "FINAL RESUME STATE SUMMARY:",
      resumeSummary || "(empty resume)"
    ].join("\n");

    var result = await runProviderPrompt({ settings: req.settings, prompt: prompt }, options || {});
    if (!result || result.ok !== true) {
      return {
        ok: false,
        code: cleanString(result && result.code) || "MODEL_REQUEST_FAILED",
        error: cleanString(result && result.error) || "Failed to audit imported resume."
      };
    }
    var parsed = parsePotentialJsonObject(result.text);
    if (!parsed) {
      return { ok: false, code: "MODEL_JSON_PARSE_FAILED", error: "AI returned an invalid import audit response." };
    }
    if (typeof parsed.complete !== "boolean") {
      return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "AI audit response must include boolean complete." };
    }
    if (!Array.isArray(parsed.missingItems)) {
      return { ok: false, code: "MODEL_SCHEMA_INVALID", error: "AI audit response must include missingItems array." };
    }
    return {
      ok: true,
      code: "OK",
      complete: parsed.complete === true,
      missingItems: Array.isArray(parsed.missingItems) ? parsed.missingItems.map(cleanString).filter(Boolean) : [],
      notes: cleanString(parsed.notes)
    };
  }

  global.Stage5Api = Object.freeze({
    ERROR_CODES: ERROR_CODES,
    STAGES: STAGES,
    generateResume: generateResume,
    testConnection: testConnection,
    extractCurrentJobWithAi: extractCurrentJobWithAi,
    findApplyButtonWithAi: findApplyButtonWithAi,
    translateResumeJson: translateResumeJson,
    generateJobGuidance: generateJobGuidance,
    generateJobGuidanceItem: generateJobGuidanceItem,
    getProviderCapabilities: getProviderCapabilities,
    planResumeEdit: planResumeEdit,
    selfCheckFunctionCalls: selfCheckFunctionCalls,
    recoverResumeFunctionCalls: recoverResumeFunctionCalls,
    answerApplicationNotesQuestion: answerApplicationNotesQuestion,
    summarizeApplicationNotesConversation: summarizeApplicationNotesConversation,
    extractResumePlainTextFromPdf: extractResumePlainTextFromPdf,
    extractResumeMarkdownFromPdf: extractResumeMarkdownFromPdf,
    extractResumeMarkdownFromText: extractResumeMarkdownFromText,
    planResumeImportStep: planResumeImportStep,
    selfCheckResumeImportFunctionCall: selfCheckResumeImportFunctionCall,
    auditResumeImportCoverage: auditResumeImportCoverage,
    buildTailoredResumePrompt: buildTailoredResumePrompt,
    buildRequestPrompt: function buildRequestPrompt(jobTarget, promptOptions) {
      return buildTailoredResumePrompt(jobTarget || {}, {}, promptOptions || {});
    }
  });
})(globalThis);
