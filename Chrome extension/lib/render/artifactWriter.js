(function attachStage5ArtifactWriter(global) {
  "use strict";

  var OUTPUT_DIR = "stage5_output";

  function cleanString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function slugify(text, fallback) {
    var value = cleanString(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (value) {
      return value.slice(0, 48);
    }

    return fallback || "item";
  }

  function formatTimestampForFilename(date) {
    var d = date instanceof Date ? date : new Date();
    var pad = function pad(value) {
      return String(value).padStart(2, "0");
    };

    return (
      String(d.getFullYear()) +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "_" +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }

  function buildTailoredArtifactBaseName(tailoredResumeDraft, jobTarget, options) {
    var draft = tailoredResumeDraft && typeof tailoredResumeDraft === "object" ? tailoredResumeDraft : {};
    var header = draft.header && typeof draft.header === "object" ? draft.header : {};
    var target = jobTarget && typeof jobTarget === "object" ? jobTarget : {};
    var opts = options && typeof options === "object" ? options : {};

    var prefix = slugify(opts.prefix || "tailored_resume", "tailored_resume");
    var timestamp = formatTimestampForFilename(new Date());
    var company = slugify(target.company, "company");
    var role = slugify(draft.targetRole || target.role || target.title || header.title, "role");

    return prefix + "_" + timestamp + "_" + company + "_" + role;
  }

  function uint8ArrayToBase64(bytes) {
    var binary = "";
    var len = bytes.length;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Store artifact content in chrome.storage.local under OUTPUT_DIR/<filename>.
  // Returns { path: storageKey } where storageKey is also the retrieval key.
  // No download dialog is shown and no file is written to the filesystem.
  function storeLocalArtifact(filename, content, mimeType) {
    return new Promise(function executor(resolve, reject) {
      if (!global.chrome || !chrome.storage || !chrome.storage.local) {
        reject(new Error("chrome.storage.local is unavailable."));
        return;
      }

      var storageKey = OUTPUT_DIR + "/" + filename;
      var record = {
        filename: filename,
        storageKey: storageKey,
        mimeType: cleanString(mimeType) || "application/octet-stream",
        content: content,
        createdAt: new Date().toISOString()
      };

      var payload = {};
      payload[storageKey] = record;

      chrome.storage.local.set(payload, function onSet() {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve({ path: storageKey, storageKey: storageKey });
      });
    });
  }

  function resolveBaseName(input, fallbackDraft, fallbackJobTarget) {
    var options = input && typeof input === "object" ? input : {};
    if (cleanString(options.baseName)) {
      return cleanString(options.baseName);
    }

    return buildTailoredArtifactBaseName(options.tailoredResumeDraft || fallbackDraft, options.jobTarget || fallbackJobTarget, {
      prefix: cleanString(options.prefix) || "tailored_resume"
    });
  }

  async function writeJsonArtifact(tailoredResumeDraft, options) {
    var baseName = resolveBaseName(options, tailoredResumeDraft, options && options.jobTarget);
    var filename = baseName + ".json";
    var jsonText = JSON.stringify(tailoredResumeDraft, null, 2) + "\n";
    var stored = await storeLocalArtifact(filename, jsonText, "application/json");
    return {
      filename: filename,
      path: stored.path,
      content: jsonText,
      baseName: baseName
    };
  }

  async function writeHtmlArtifact(htmlText, options) {
    var baseName = resolveBaseName(options, options && options.tailoredResumeDraft, options && options.jobTarget);
    var filename = baseName + ".html";
    var stored = await storeLocalArtifact(filename, String(htmlText || ""), "text/html");
    return {
      filename: filename,
      path: stored.path,
      baseName: baseName
    };
  }

  async function writePdfArtifact(pdfBytes, options) {
    var baseName = resolveBaseName(options, options && options.tailoredResumeDraft, options && options.jobTarget);
    var filename = baseName + ".pdf";
    var bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array([]);
    var base64Data = uint8ArrayToBase64(bytes);
    var stored = await storeLocalArtifact(filename, base64Data, "application/pdf");
    return {
      filename: filename,
      path: stored.path,
      baseName: baseName
    };
  }

  global.Stage5ArtifactWriter = Object.freeze({
    OUTPUT_DIR: OUTPUT_DIR,
    buildTailoredArtifactBaseName: buildTailoredArtifactBaseName,
    writeJsonArtifact: writeJsonArtifact,
    writeHtmlArtifact: writeHtmlArtifact,
    writePdfArtifact: writePdfArtifact
  });
})(globalThis);
