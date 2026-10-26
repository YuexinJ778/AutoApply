(function attachStage4JobParser(global) {
  "use strict";

  const TITLE_SEPARATORS = [" - ", " | ", " @ ", ", "];
  const ROLE_HINT_PATTERN =
    /(engineer|developer|intern|manager|director|designer|analyst|scientist|architect|specialist|consultant|coordinator|officer|lead|head|principal|staff)/i;

  const RESPONSIBILITIES_HEADINGS = [
    "responsibilities",
    "what you'll do",
    "what you'll do",
    "about the role"
  ];

  const REQUIREMENTS_HEADINGS = [
    "qualifications",
    "basic qualifications",
    "minimum qualifications",
    "requirements"
  ];

  const PREFERRED_HEADINGS = ["preferred qualifications", "nice to have", "who you are"];

  const ALL_SECTION_HEADINGS = [].concat(
    RESPONSIBILITIES_HEADINGS,
    REQUIREMENTS_HEADINGS,
    PREFERRED_HEADINGS
  );

  function cleanString(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim();
  }

  function cleanOptionalString(value) {
    const cleaned = cleanString(value);
    return cleaned ? cleaned : undefined;
  }

  function cleanStringArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(function mapItem(item) {
        return cleanString(item);
      })
      .filter(function keepItem(item) {
        return item.length > 0;
      });
  }

  function normalizeHeading(value) {
    return cleanString(value)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[:：]$/, "")
      .replace(/\s+/g, " ");
  }

  function detectSite(snapshot) {
    const hostname = cleanString(snapshot && snapshot.hostname).toLowerCase();
    const url = cleanString(snapshot && snapshot.url).toLowerCase();

    if (hostname.includes("greenhouse.io")) {
      return "greenhouse";
    }

    if (url.includes("greenhouse.io") || url.includes("greenhouse")) {
      return "greenhouse";
    }

    return "generic";
  }

  function toStableHash(input) {
    let hash = 2166136261;

    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
      hash >>>= 0;
    }

    return hash.toString(36);
  }

  function buildJobId(company, role, jobUrl) {
    const base = `${company.toLowerCase()}|${role.toLowerCase()}|${jobUrl.toLowerCase()}`;
    return `job_${toStableHash(base)}`;
  }

  function normalizeJobPosting(job) {
    const company = cleanString(job && job.company) || "Unknown Company";
    const role = cleanString(job && job.role) || "Unknown Role";
    const jobUrl = cleanString(job && job.jobUrl);

    return {
      id: buildJobId(company, role, jobUrl),
      sourceSite: cleanString(job && job.sourceSite) || "unknown",
      jobUrl: jobUrl,
      canonicalUrl: cleanOptionalString(job && job.canonicalUrl),
      company: company,
      role: role,
      location: cleanOptionalString(job && job.location),
      team: cleanOptionalString(job && job.team),
      employmentType: cleanOptionalString(job && job.employmentType),
      workplaceType: cleanOptionalString(job && job.workplaceType),
      salary: cleanOptionalString(job && job.salary),
      applicationUrl: cleanOptionalString(job && job.applicationUrl),
      responsibilities: cleanStringArray(job && job.responsibilities),
      requirements: cleanStringArray(job && job.requirements),
      preferredQualifications: cleanStringArray(job && job.preferredQualifications),
      rawText: cleanString(job && job.rawText),
      rawTitle: cleanString(job && job.rawTitle),
      parserVersion: "stage4-v1",
      parsedAt: new Date().toISOString()
    };
  }

  function looksLikeRole(value) {
    return ROLE_HINT_PATTERN.test(value);
  }

  function inferRoleAndCompany(title) {
    const fallback = {
      role: title || "Unknown Role",
      company: "Unknown Company"
    };

    if (!title) {
      return fallback;
    }

    for (const separator of TITLE_SEPARATORS) {
      if (!title.includes(separator)) {
        continue;
      }

      const parts = title
        .split(separator)
        .map(function trimPart(part) {
          return part.trim();
        })
        .filter(function keepPart(part) {
          return part.length > 0;
        });

      if (parts.length < 2) {
        continue;
      }

      const left = parts[0];
      const right = parts.slice(1).join(separator).trim();

      const leftLooksRole = looksLikeRole(left);
      const rightLooksRole = looksLikeRole(right);

      if (leftLooksRole && !rightLooksRole) {
        return { role: left, company: right || fallback.company };
      }

      if (rightLooksRole && !leftLooksRole) {
        return { role: right, company: left || fallback.company };
      }

      return { role: left || fallback.role, company: right || fallback.company };
    }

    return fallback;
  }

  function parseGeneric(snapshot) {
    const title = cleanString(snapshot && snapshot.title);
    const inferred = inferRoleAndCompany(title);

    return normalizeJobPosting({
      sourceSite: "generic",
      jobUrl: cleanString(snapshot && snapshot.url),
      canonicalUrl: cleanString(snapshot && snapshot.metadata && snapshot.metadata.canonicalUrl),
      company: inferred.company,
      role: inferred.role,
      responsibilities: [],
      requirements: [],
      preferredQualifications: [],
      rawText: cleanString(snapshot && snapshot.pageText),
      rawTitle: title
    });
  }

  function splitLines(text) {
    return cleanString(text)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function trimLine(line) {
        return line.trim();
      })
      .filter(function keepLine(line) {
        return line.length > 0;
      });
  }

  function detectSectionType(line) {
    const normalized = normalizeHeading(line);

    if (RESPONSIBILITIES_HEADINGS.includes(normalized)) {
      return "responsibilities";
    }

    if (REQUIREMENTS_HEADINGS.includes(normalized)) {
      return "requirements";
    }

    if (PREFERRED_HEADINGS.includes(normalized)) {
      return "preferredQualifications";
    }

    return null;
  }

  function cleanupSectionLine(line) {
    return cleanString(line)
      .replace(/^[\-\u2022\*\u25CF\u25E6\u2023\u2043\s]+/, "")
      .replace(/^\d+[\.)]\s+/, "")
      .trim();
  }

  function finalizeSectionItems(values) {
    const seen = new Set();
    const output = [];

    for (const value of values) {
      const cleaned = cleanupSectionLine(value);
      if (cleaned.length < 3) {
        continue;
      }

      const key = cleaned.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(cleaned);
    }

    return output;
  }

  function extractSectionsFromText(pageText) {
    const lines = splitLines(pageText);
    const buckets = {
      responsibilities: [],
      requirements: [],
      preferredQualifications: []
    };

    let activeSection = null;

    for (const line of lines) {
      const sectionType = detectSectionType(line);

      if (sectionType) {
        activeSection = sectionType;
        continue;
      }

      if (!activeSection) {
        continue;
      }

      const maybeHeading = normalizeHeading(line);
      if (ALL_SECTION_HEADINGS.includes(maybeHeading)) {
        activeSection = detectSectionType(line);
        continue;
      }

      if (line.endsWith(":") && line.length < 80) {
        activeSection = null;
        continue;
      }

      buckets[activeSection].push(line);
    }

    return {
      responsibilities: finalizeSectionItems(buckets.responsibilities),
      requirements: finalizeSectionItems(buckets.requirements),
      preferredQualifications: finalizeSectionItems(buckets.preferredQualifications)
    };
  }

  function inferLocation(lines) {
    for (const line of lines.slice(0, 80)) {
      if (/\b(remote|hybrid|on[-\s]?site|onsite)\b/i.test(line)) {
        return cleanString(line);
      }

      if (/\b[A-Za-z .'-]+,\s*[A-Z]{2}\b/.test(line)) {
        return cleanString(line);
      }
    }

    return undefined;
  }

  function inferTeam(lines) {
    for (const line of lines.slice(0, 100)) {
      const match = line.match(/^(team|department|organization|org)\s*[:\-]\s*(.+)$/i);
      if (match && match[2]) {
        return cleanString(match[2]);
      }
    }

    return undefined;
  }

  function inferCompanyFromUrl(url) {
    const resolvedUrl = cleanString(url);

    if (!resolvedUrl) {
      return "Unknown Company";
    }

    try {
      const parsed = new URL(resolvedUrl);
      const segments = parsed.pathname
        .split("/")
        .map(function trimSegment(segment) {
          return segment.trim();
        })
        .filter(function keepSegment(segment) {
          return segment.length > 0;
        });

      if (segments.length > 0) {
        return segments[0]
          .replace(/[\-_]+/g, " ")
          .replace(/\b\w/g, function uppercase(char) {
            return char.toUpperCase();
          })
          .trim();
      }
    } catch {
      // ignore URL parse errors
    }

    return "Unknown Company";
  }

  function parseGreenhouse(snapshot) {
    const title = cleanString(snapshot && snapshot.title);
    const rawText = cleanString(snapshot && snapshot.pageText);
    const lines = splitLines(rawText);

    const inferred = inferRoleAndCompany(title);
    let company = inferred.company;

    if (!company || company === "Unknown Company") {
      company = inferCompanyFromUrl(snapshot && snapshot.url);
    }

    const sections = extractSectionsFromText(rawText);

    return normalizeJobPosting({
      sourceSite: "greenhouse",
      jobUrl: cleanString(snapshot && snapshot.url),
      canonicalUrl: cleanString(snapshot && snapshot.metadata && snapshot.metadata.canonicalUrl),
      company: company,
      role: inferred.role,
      location: inferLocation(lines),
      team: inferTeam(lines),
      responsibilities: sections.responsibilities,
      requirements: sections.requirements,
      preferredQualifications: sections.preferredQualifications,
      rawText: rawText,
      rawTitle: title
    });
  }

  function parseJobPosting(snapshot) {
    const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
    const detectedSite = detectSite(safeSnapshot);
    const parsed = detectedSite === "greenhouse" ? parseGreenhouse(safeSnapshot) : parseGeneric(safeSnapshot);

    return normalizeJobPosting({
      ...parsed,
      sourceSite: detectedSite || parsed.sourceSite || "generic"
    });
  }

  global.Stage4JobParser = Object.freeze({
    detectSite: detectSite,
    normalizeJobPosting: normalizeJobPosting,
    parseGeneric: parseGeneric,
    parseGreenhouse: parseGreenhouse,
    parseJobPosting: parseJobPosting
  });
})(globalThis);
