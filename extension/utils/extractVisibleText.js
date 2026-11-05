(function attachStage3TextUtils(global) {
  "use strict";

  const DEFAULT_MAX_TEXT_LENGTH = 120000;

  function normalizeNewlines(text) {
    return text.replace(/\r\n?/g, "\n");
  }

  function collapseSpaces(text) {
    return text.replace(/[ \t\f\v]+/g, " ");
  }

  function trimLines(text) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .join("\n");
  }

  function collapseExtraBlankLines(text) {
    return text.replace(/(?:\n\s*){3,}/g, "\n\n");
  }

  function clampTextLength(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    const remaining = text.length - maxLength;
    return `${text.slice(0, maxLength)}\n\n[TRUNCATED ${remaining} CHARS]`;
  }

  function extractVisibleText(rawText, options) {
    const config = options || {};
    const maxLength = Number.isFinite(config.maxLength) && config.maxLength > 0
      ? Math.floor(config.maxLength)
      : DEFAULT_MAX_TEXT_LENGTH;

    const source = typeof rawText === "string" ? rawText : "";

    let cleaned = normalizeNewlines(source);
    cleaned = collapseSpaces(cleaned);
    cleaned = trimLines(cleaned);
    cleaned = collapseExtraBlankLines(cleaned);
    cleaned = cleaned.trim();
    cleaned = clampTextLength(cleaned, maxLength);

    return cleaned;
  }

  global.Stage3TextUtils = Object.freeze({
    DEFAULT_MAX_TEXT_LENGTH: DEFAULT_MAX_TEXT_LENGTH,
    extractVisibleText: extractVisibleText
  });
})(globalThis);
