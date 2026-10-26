(function attachStage5TailoredJsonParser(global) {
  "use strict";

  var validation = global.Stage5Validation || {};
  var ERROR_CODE = "TAILORED_RESUME_JSON_PARSE_FAILED";

  function cleanString(value) {
    if (typeof validation.cleanString === "function") {
      return validation.cleanString(value);
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function extractTextBlocks(payload) {
    var blocks = payload && Array.isArray(payload.content) ? payload.content : [];
    var texts = [];

    for (var index = 0; index < blocks.length; index += 1) {
      var block = blocks[index] && typeof blocks[index] === "object" ? blocks[index] : {};
      if (cleanString(block.type) !== "text") {
        continue;
      }
      var text = cleanString(block.text);
      if (!text) {
        continue;
      }
      texts.push(text);
    }

    return texts;
  }

  function stripCodeFence(text) {
    var trimmed = cleanString(text);
    if (!trimmed) {
      return "";
    }

    if (!trimmed.startsWith("```")) {
      return trimmed;
    }

    var lines = trimmed.split(/\r?\n/);
    var filtered = [];

    for (var index = 0; index < lines.length; index += 1) {
      var line = lines[index].trim();
      if (line.startsWith("```")) {
        continue;
      }
      filtered.push(lines[index]);
    }

    return filtered.join("\n").trim();
  }

  function tryParseJsonObject(text) {
    var source = cleanString(text);
    if (!source) {
      return null;
    }

    try {
      var parsed = JSON.parse(source);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }

    return null;
  }

  function findJsonObjectCandidate(text) {
    var source = cleanString(text);
    if (!source) {
      return "";
    }

    for (var start = 0; start < source.length; start += 1) {
      if (source[start] !== "{") {
        continue;
      }

      var depth = 0;
      var inString = false;
      var escaped = false;

      for (var end = start; end < source.length; end += 1) {
        var ch = source[end];

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
            var candidate = source.slice(start, end + 1);
            if (tryParseJsonObject(candidate)) {
              return candidate;
            }
          }
        }
      }
    }

    return "";
  }

  function extractTextFromInput(input) {
    if (typeof input === "string") {
      return cleanString(input);
    }

    if (input && typeof input === "object") {
      var texts = extractTextBlocks(input);
      if (texts.length) {
        return texts.join("\n");
      }

      if (typeof input.text === "string") {
        return cleanString(input.text);
      }

      if (typeof input.raw === "string") {
        return cleanString(input.raw);
      }
    }

    return "";
  }

  function parseTailoredResumeJson(input) {
    var text = extractTextFromInput(input);
    if (!text) {
      return {
        ok: false,
        code: ERROR_CODE,
        text: "",
        parsed: null,
        parseError: "Model response did not include text content."
      };
    }

    var direct = tryParseJsonObject(text);
    if (direct) {
      return { ok: true, code: "", text: text, parsed: direct, parseError: "" };
    }

    var withoutFence = stripCodeFence(text);
    var fenceParsed = tryParseJsonObject(withoutFence);
    if (fenceParsed) {
      return { ok: true, code: "", text: withoutFence, parsed: fenceParsed, parseError: "" };
    }

    var candidate = findJsonObjectCandidate(withoutFence || text);
    var candidateParsed = tryParseJsonObject(candidate);
    if (candidateParsed) {
      return { ok: true, code: "", text: candidate, parsed: candidateParsed, parseError: "" };
    }

    return {
      ok: false,
      code: ERROR_CODE,
      text: text,
      parsed: null,
      parseError: "Model returned text, but no valid tailored resume JSON object could be parsed."
    };
  }

  global.Stage5TailoredJsonParser = Object.freeze({
    ERROR_CODE: ERROR_CODE,
    extractTextBlocks: extractTextBlocks,
    parseTailoredResumeJson: parseTailoredResumeJson
  });
})(globalThis);
