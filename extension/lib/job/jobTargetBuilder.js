(function attachStage5JobTargetBuilder(global) {
  "use strict";

  var validation = global.Stage5Validation || {};
  var normalizer = global.Stage5JobTargetNormalizer || {};

  var JOB_STORAGE_PRIORITY = Object.freeze(["jobPosting"]);

  var NOISE_PATTERNS = [
    "recommended video",
    "recommended article",
    "similar job",
    "you may also like",
    "people also viewed",
    "wellbeing",
    "cookie",
    "privacy policy",
    "terms of use"
  ];

  function cleanString(value) {
    if (typeof validation.cleanString === "function") {
      return validation.cleanString(value);
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function toStringArray(value, maxItems) {
    if (typeof validation.toStringArray === "function") {
      return validation.toStringArray(value, maxItems);
    }

    var items = Array.isArray(value) ? value : [];
    var output = [];
    var seen = new Set();

    for (var index = 0; index < items.length; index += 1) {
      var text = cleanString(items[index]);
      if (!text) {
        continue;
      }
      var key = text.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(text);
      if (maxItems && output.length >= maxItems) {
        break;
      }
    }

    return output;
  }

  function normalizeJobTarget(value) {
    if (normalizer && typeof normalizer.normalizeJobTarget === "function") {
      return normalizer.normalizeJobTarget(value);
    }
    return value && typeof value === "object" ? value : {};
  }

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function getStorageArea() {
    if (global.chrome && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function getLocal(keys) {
    return new Promise(function wrap(resolve) {
      var storage = getStorageArea();
      if (!storage) {
        resolve({});
        return;
      }

      storage.get(keys, function onGet(result) {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(result || {});
      });
    });
  }

  async function readExtensionJson(relativePath) {
    try {
      var baseUrl = global.chrome && chrome.runtime && typeof chrome.runtime.getURL === "function"
        ? chrome.runtime.getURL(relativePath)
        : relativePath;
      var response = await fetch(baseUrl, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      var payload = await response.json();
      return isObject(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  function isNoiseLine(value) {
    var normalized = cleanString(value).toLowerCase();
    if (!normalized) {
      return true;
    }

    for (var index = 0; index < NOISE_PATTERNS.length; index += 1) {
      if (normalized.indexOf(NOISE_PATTERNS[index]) !== -1) {
        return true;
      }
    }

    return false;
  }

  function buildSummary(jobPosting) {
    var text = cleanString(jobPosting.summary || jobPosting.description || jobPosting.rawText);
    if (!text) {
      return "";
    }

    var lines = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function trimLine(line) {
        return cleanString(line);
      })
      .filter(function keepLine(line) {
        return line && !isNoiseLine(line);
      });

    return lines.join(" ").slice(0, 800);
  }

  function collectKeywordCandidates(jobPosting) {
    var values = [];

    values = values.concat(toStringArray(jobPosting.requirements, 24));
    values = values.concat(toStringArray(jobPosting.preferredQualifications, 24));
    values = values.concat(toStringArray(jobPosting.responsibilities, 24));

    var role = cleanString(jobPosting.role || jobPosting.title || jobPosting.rawTitle);
    if (role) {
      values.push(role);
    }

    return toStringArray(values, 40);
  }

  function pickSkillsFromKeywords(keywords) {
    var output = [];
    var seen = new Set();

    for (var index = 0; index < keywords.length; index += 1) {
      var phrase = cleanString(keywords[index]);
      if (!phrase) {
        continue;
      }

      var parts = phrase
        .split(/[;,/()|]/)
        .map(function trimPart(part) {
          return cleanString(part);
        })
        .filter(Boolean);

      for (var partIndex = 0; partIndex < parts.length; partIndex += 1) {
        var token = parts[partIndex];
        if (token.length < 2 || token.length > 50) {
          continue;
        }

        var key = token.toLowerCase();
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        output.push(token);

        if (output.length >= 32) {
          return output;
        }
      }
    }

    return output;
  }

  function buildJobTarget(jobPostingInput) {
    var jobPosting = isObject(jobPostingInput) ? jobPostingInput : {};

    var title = cleanString(jobPosting.title || jobPosting.role || jobPosting.rawTitle);
    var role = cleanString(jobPosting.role || jobPosting.title || jobPosting.rawTitle);
    var requirements = toStringArray(jobPosting.requirements, 32);
    var responsibilities = toStringArray(jobPosting.responsibilities, 32);
    var preferredQualifications = toStringArray(jobPosting.preferredQualifications, 24);
    var keywords = toStringArray(jobPosting.keywords, 32);

    if (!keywords.length) {
      keywords = collectKeywordCandidates(jobPosting);
    }

    var skills = toStringArray(jobPosting.skills, 32);
    if (!skills.length) {
      skills = pickSkillsFromKeywords(keywords);
    }

    return normalizeJobTarget({
      title: title || role,
      role: role || title,
      company: cleanString(jobPosting.company),
      location: cleanString(jobPosting.location),
      summary: buildSummary(jobPosting),
      responsibilities: responsibilities,
      requirements: requirements,
      preferredQualifications: preferredQualifications,
      keywords: keywords,
      skills: skills,
      sourceUrl: cleanString(jobPosting.jobUrl || jobPosting.sourceUrl || jobPosting.url || jobPosting.canonicalUrl),
      extractedAt: cleanString(jobPosting.parsedAt || jobPosting.extractedAt || new Date().toISOString())
    });
  }

  async function loadJobTarget(options) {
    void options;
    var storagePayload = await getLocal(JOB_STORAGE_PRIORITY);

    if (isObject(storagePayload.jobPosting)) {
      return {
        jobTarget: buildJobTarget(storagePayload.jobPosting),
        source: "chrome.storage.local:jobPosting"
      };
    }


    var jobDefault = await readExtensionJson("lib/data/job.default.json");
    if (jobDefault) {
      return {
        jobTarget: buildJobTarget(jobDefault),
        source: "lib/data/job.default.json"
      };
    }

    return {
      jobTarget: buildJobTarget({}),
      source: "generated-empty"
    };
  }

  global.Stage5JobTargetBuilder = Object.freeze({
    JOB_STORAGE_PRIORITY: JOB_STORAGE_PRIORITY,
    buildJobTarget: buildJobTarget,
    loadJobTarget: loadJobTarget
  });
})(globalThis);
