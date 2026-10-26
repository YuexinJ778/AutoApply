(function attachStage5Validation(global) {
  "use strict";

  function cleanString(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  }

  function cleanObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function dedupeStrings(values, maxItems) {
    var input = ensureArray(values);
    var output = [];
    var seen = new Set();
    var limit = typeof maxItems === "number" && maxItems > 0 ? maxItems : 0;

    for (var index = 0; index < input.length; index += 1) {
      var text = cleanString(input[index]);
      if (!text) {
        continue;
      }

      var key = text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(text);

      if (limit && output.length >= limit) {
        break;
      }
    }

    return output;
  }

  function toStringArray(value, maxItems) {
    return dedupeStrings(ensureArray(value), maxItems);
  }

  function coalesceString(values) {
    var list = ensureArray(values);
    for (var index = 0; index < list.length; index += 1) {
      var text = cleanString(list[index]);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function deepClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  global.Stage5Validation = Object.freeze({
    cleanString: cleanString,
    cleanObject: cleanObject,
    ensureArray: ensureArray,
    dedupeStrings: dedupeStrings,
    toStringArray: toStringArray,
    coalesceString: coalesceString,
    deepClone: deepClone
  });
})(globalThis);
