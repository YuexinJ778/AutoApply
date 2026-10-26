(function attachStage5RenderTextWrap(global) {
  "use strict";

  var DEFAULT_MAX_LINE_LENGTH = 115;

  function cleanString(value) {
    return typeof value === "string" ? value : String(value || "");
  }

  function normalizeMaxChars(maxChars) {
    var parsed = Number(maxChars);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return DEFAULT_MAX_LINE_LENGTH;
    }
    return Math.floor(parsed);
  }

  function findBreakIndex(line, maxChars) {
    for (var index = maxChars; index > 0; index -= 1) {
      var char = line[index - 1];
      if (/\s/.test(char) || /[,.!?;:)/\]]/.test(char)) {
        return index;
      }
    }
    return maxChars;
  }

  function splitWrappedLines(text, maxChars) {
    var limit = normalizeMaxChars(maxChars);
    var source = cleanString(text).replace(/\r\n?/g, "\n");
    var sourceLines = source.split("\n");
    var output = [];

    for (var lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
      var line = sourceLines[lineIndex];
      if (!line) {
        output.push("");
        continue;
      }

      var remaining = line;
      while (remaining.length > limit) {
        var breakIndex = findBreakIndex(remaining, limit);
        var segment = remaining.slice(0, breakIndex).replace(/\s+$/g, "");

        if (!segment) {
          breakIndex = limit;
          segment = remaining.slice(0, breakIndex);
        }

        output.push(segment);
        remaining = remaining.slice(breakIndex).replace(/^\s+/g, "");
      }

      output.push(remaining);
    }

    if (!output.length) {
      return [""];
    }

    return output;
  }

  function wrapTextAtLineLength(text, maxChars) {
    return splitWrappedLines(text, maxChars).join("\n");
  }

  global.Stage5RenderTextWrap = Object.freeze({
    DEFAULT_MAX_LINE_LENGTH: DEFAULT_MAX_LINE_LENGTH,
    splitWrappedLines: splitWrappedLines,
    wrapTextAtLineLength: wrapTextAtLineLength
  });
})(globalThis);
