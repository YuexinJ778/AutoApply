(function attachResumeA4Template(global) {
  "use strict";

  function cleanString(value) {
    if (typeof value !== "string") {
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      return "";
    }
    return value.trim();
  }

  function escapeHtml(value) {
    return cleanString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveText(field, lang) {
    if (field === null || field === undefined) return "";
    if (typeof field === "string") return cleanString(field);
    if (typeof field === "object") {
      if (field.waived) return "";
      var enVal = cleanString(field.en);
      var zhVal = cleanString(field.zh);
      if (lang === "zh") return zhVal || enVal;
      return enVal || zhVal;
    }
    return "";
  }

  function normalizeHref(value) {
    var raw = cleanString(value);
    if (!raw) return "";
    if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
    return "https://" + raw.replace(/^\/+/, "");
  }

  function mailtoHref(value) {
    var raw = cleanString(value);
    return raw ? "mailto:" + raw : "";
  }

  function telHref(value) {
    var raw = cleanString(value).replace(/[^\d+]/g, "");
    return raw ? "tel:" + raw : "";
  }

  function isWaived(data, key) {
    var settings = data && data.settings && typeof data.settings === "object" ? data.settings : {};
    var waivers = settings.requiredFieldWaivers && typeof settings.requiredFieldWaivers === "object" ? settings.requiredFieldWaivers : {};
    return Boolean(waivers[key]);
  }

  function collapseRepeatedName(value) {
    var text = cleanString(value).replace(/\s+/g, " ");
    if (!text) return "";
    var tokens = text.split(" ").filter(Boolean);
    if (tokens.length > 1) {
      var compactTokens = [];
      tokens.forEach(function(token) {
        if (compactTokens[compactTokens.length - 1] !== token) {
          compactTokens.push(token);
        }
      });
      text = compactTokens.join(" ");
    }
    var compact = text.replace(/\s+/g, "");
    for (var size = 1; size <= Math.floor(compact.length / 2); size += 1) {
      if (compact.length % size !== 0) continue;
      var unit = compact.slice(0, size);
      if (unit && unit.repeat(compact.length / size) === compact) {
        return unit;
      }
    }
    return text;
  }

  function buildNameFromParts(parts, lang, data) {
    var safe = parts && typeof parts === "object" ? parts : {};
    var omitFirst = isWaived(data, "first_name");
    var omitLast = isWaived(data, "last_name");
    var firstName = omitFirst ? "" : cleanString(safe.firstName);
    var middleName = cleanString(safe.middleName);
    var lastName = omitLast ? "" : cleanString(safe.lastName);
    if (lang === "zh") {
      return collapseRepeatedName([lastName, middleName, firstName].filter(Boolean).join(""));
    }
    return collapseRepeatedName([firstName, middleName, lastName].filter(Boolean).join(" "));
  }

  function legacyNameValue(parts) {
    var safe = parts && typeof parts === "object" ? parts : {};
    if (cleanString(safe.firstName) || cleanString(safe.middleName) || cleanString(safe.lastName)) {
      return "";
    }
    return collapseRepeatedName(cleanString(safe.displayName || safe.fullName || safe.name));
  }

  function resolveName(profile, lang, data) {
    if (isWaived(data, "full_name") || (isWaived(data, "first_name") && isWaived(data, "last_name"))) return "";
    var name = profile.name && typeof profile.name === "object" ? profile.name : null;
    if (name && name.waived) return "";
    if (name) {
      var en = name.en && typeof name.en === "object" ? name.en : {};
      var zh = name.zh && typeof name.zh === "object" ? name.zh : {};
      var active = lang === "zh" ? zh : en;
      var fallback = lang === "zh" ? en : zh;
      var activeName = buildNameFromParts(active, lang, data) || legacyNameValue(active);
      if (activeName) return activeName;
      if (lang === "zh") {
        activeName = collapseRepeatedName(cleanString(profile.nameZh || profile.chineseName || profile.zhName));
        if (activeName) return activeName;
      } else {
        activeName = buildNameFromParts(profile, "en", data) || collapseRepeatedName(cleanString(profile.fullName || profile.name));
        if (activeName) return activeName;
      }
      return buildNameFromParts(fallback, lang === "zh" ? "en" : "zh", data) || legacyNameValue(fallback);
    }
    if (lang === "zh") {
      return collapseRepeatedName(cleanString(profile.nameZh || profile.chineseName || profile.zhName)) ||
        buildNameFromParts(profile, "en", data) ||
        collapseRepeatedName(cleanString(profile.fullName));
    }
    return buildNameFromParts(profile, "en", data) || collapseRepeatedName(cleanString(profile.fullName));
  }

  function sectionTitle(key, lang) {
    var labels = {
      summary: { en: "Summary", zh: "摘要" },
      experience: { en: "Experience", zh: "經歷" },
      education: { en: "Education", zh: "學歷" },
      projects: { en: "Projects", zh: "專案" },
      skills: { en: "Skills", zh: "技能" }
    };
    var field = labels[key] || {};
    return lang === "zh" ? cleanString(field.zh || field.en) : cleanString(field.en || field.zh);
  }

  function formatDateRange(startDate, endDate) {
    var start = cleanString(startDate);
    var end = cleanString(endDate);
    if (!start && !end) return "";
    if (!start) return end;
    if (!end) return start + " – Present";
    return start + " – " + end;
  }

  function getA4Css() {
    return [
      "@page { size: A4; margin: 0; }",
      "*, *::before, *::after { box-sizing: border-box; }",
      "html, body {",
      "  margin: 0; padding: 0;",
      "  background: #f3f4f6;",
      "  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;",
      "  font-size: 10pt; color: #1a1a1a; line-height: 1.4;",
      "}",
      ".resume-page {",
      "  width: 210mm; min-height: 297mm;",
      "  background: #ffffff;",
      "  margin: 0 auto;",
      "  padding: 12mm 14mm;",
      "}",
      ".resume-header { margin-bottom: 5mm; }",
      ".resume-name {",
      "  font-size: 20pt; font-weight: 700;",
      "  letter-spacing: -0.5px; margin: 0 0 1mm; line-height: 1.15;",
      "}",
      ".resume-name-sub { font-size: 12pt; color: #444; margin: 0 0 2mm; }",
      ".resume-contact {",
      "  display: flex; flex-wrap: wrap; gap: 0 8px;",
      "  font-size: 8.5pt; color: #333;",
      "  border-top: 1.5px solid #1a1a1a;",
      "  padding-top: 2mm; margin-top: 2mm;",
      "}",
      ".resume-contact a { color: #333; text-decoration: none; }",
      ".resume-contact-sep { color: #bbb; }",
      ".resume-section { margin-bottom: 4.5mm; }",
      ".resume-section-title {",
      "  font-size: 9.5pt; font-weight: 700;",
      "  text-transform: uppercase; letter-spacing: 0.9px;",
      "  border-bottom: 1px solid #1a1a1a;",
      "  padding-bottom: 1px; margin: 0 0 2.5mm;",
      "}",
      ".resume-item { margin-bottom: 2.5mm; break-inside: avoid; page-break-inside: avoid; }",
      ".resume-item-header {",
      "  display: flex; justify-content: space-between; align-items: baseline; gap: 6px;",
      "}",
      ".resume-item-primary { font-weight: 700; font-size: 10pt; }",
      ".resume-item-date { font-size: 8.5pt; color: #555; white-space: nowrap; flex-shrink: 0; }",
      ".resume-line-bold { font-weight: 700; }",
      ".resume-line-italic { font-style: italic; }",
      ".resume-line-date-only { margin: 0.5mm 0 0; text-align: right; font-size: 8.5pt; color: #555; }",
      ".resume-item-sub { font-size: 9pt; color: #444; margin: 0.5mm 0 0; font-style: italic; }",
      ".resume-bullets { margin: 1.5mm 0 0 4mm; padding: 0 0 0 10px; list-style: disc; font-size: 9pt; line-height: 1.45; }",
      ".resume-bullets li { margin-bottom: 1px; }",
      ".resume-skill-row { font-size: 9pt; margin-bottom: 1.5mm; line-height: 1.4; }",
      ".resume-skill-category { font-weight: 700; }",
      ".resume-summary-text { font-size: 9pt; line-height: 1.55; }",
      "@media print {",
      "  html, body {",
      "    width: 210mm; min-height: 297mm;",
      "    margin: 0; padding: 0; background: white;",
      "    -webkit-print-color-adjust: exact; print-color-adjust: exact;",
      "  }",
      "  .resume-page { margin: 0; box-shadow: none; }",
      "  .resume-section, .resume-item { break-inside: avoid; page-break-inside: avoid; }",
      "}"
    ].join("\n");
  }

  function renderHeader(data, lang) {
    var profile = data.profile && typeof data.profile === "object" ? data.profile : {};
    var fullName = resolveName(profile, lang, data);
    var email = isWaived(data, "email") ? "" : cleanString(profile.email);
    var phone = isWaived(data, "phone") ? "" : cleanString(profile.phone);
    var location = isWaived(data, "location") ? "" : resolveText(profile.location, lang);

    var contactParts = [];
    if (email) contactParts.push('<a href="' + escapeHtml(mailtoHref(email)) + '">' + escapeHtml(email) + '</a>');
    if (phone) contactParts.push('<a href="' + escapeHtml(telHref(phone)) + '">' + escapeHtml(phone) + '</a>');
    if (location) contactParts.push(escapeHtml(location));

    var html = '<header class="resume-header">';
    if (fullName) html += '<h1 class="resume-name">' + escapeHtml(fullName) + '</h1>';
    if (contactParts.length) {
      html += '<div class="resume-contact">';
      contactParts.forEach(function(part, i) {
        if (i > 0) html += '<span class="resume-contact-sep"> | </span>';
        html += '<span>' + part + '</span>';
      });
      html += '</div>';
    }
    html += '</header>';
    return html;
  }

  function renderSummary(data, lang) {
    var summaries = Array.isArray(data.summaries) ? data.summaries : [];
    var active = summaries.filter(function(s) { return s && s.enabled !== false && !s.waived; });
    var summary = active.find(function(s) { return s.isDefault; }) || active[0];
    if (!summary) return "";
    var text = resolveText(summary.text, lang);
    if (!text) return "";
    return '<section class="resume-section">' +
      '<h2 class="resume-section-title">' + escapeHtml(sectionTitle("summary", lang)) + '</h2>' +
      '<p class="resume-summary-text">' + escapeHtml(text) + '</p>' +
      '</section>';
  }

  function renderExperience(data, lang) {
    var experiences = Array.isArray(data.experiences) ? data.experiences : [];
    var active = experiences.filter(function(e) { return e && e.enabled !== false && !e.waived; });
    if (!active.length) return "";

    var html = '<section class="resume-section"><h2 class="resume-section-title">' + escapeHtml(sectionTitle("experience", lang)) + '</h2>';
    active.forEach(function(exp) {
      var company = resolveText(exp.company, lang);
      var title = resolveText(exp.title, lang);
      var location = resolveText(exp.location, lang);
      var dateRange = formatDateRange(exp.startDate, exp.endDate);
      var bullets = Array.isArray(exp.bullets)
        ? exp.bullets.filter(function(b) { return b && b.enabled !== false && !b.waived; })
        : [];

      html += '<div class="resume-item">';
      html += '<div class="resume-item-header">';
      var primary = [title, company].filter(Boolean).join(" · ") || "Position";
      html += '<span class="resume-item-primary">' + escapeHtml(primary) + '</span>';
      if (dateRange) html += '<span class="resume-item-date">' + escapeHtml(dateRange) + '</span>';
      html += '</div>';
      if (location) html += '<p class="resume-item-sub">' + escapeHtml(location) + '</p>';
      if (bullets.length) {
        html += '<ul class="resume-bullets">';
        bullets.forEach(function(b) {
          var text = resolveText(b.en !== undefined || b.zh !== undefined ? b : (b.text !== undefined ? b.text : b), lang);
          if (!text && typeof b === "object" && b.text) text = cleanString(b.text);
          if (text) html += '<li>' + escapeHtml(text) + '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    });
    html += '</section>';
    return html;
  }

  function renderEducation(data, lang) {
    var education = Array.isArray(data.education) ? data.education : [];
    var active = education.filter(function(e) { return e && e.enabled !== false && !e.waived; });
    if (!active.length) return "";

    var html = '<section class="resume-section"><h2 class="resume-section-title">' + escapeHtml(sectionTitle("education", lang)) + '</h2>';
    active.forEach(function(edu) {
      var school = resolveText(edu.school, lang);
      var degree = resolveText(edu.degree, lang);
      var major = resolveText(edu.major, lang);
      var location = resolveText(edu.location, lang);
      var coursework = resolveText(edu.coursework, lang);
      var description = resolveText(edu.description, lang);
      var dateRange = formatDateRange(edu.startDate, edu.endDate);
      var gpa = cleanString(edu.gpa);

      html += '<div class="resume-item">';
      html += '<div class="resume-item-header">';
      var degreeAndMajor = [degree, major].filter(Boolean).join(", ");
      html += '<span class="resume-item-primary">' + escapeHtml(degreeAndMajor || school || "Education") + '</span>';
      if (dateRange) html += '<span class="resume-item-date">' + escapeHtml(dateRange) + '</span>';
      html += '</div>';
      if (school || location) {
        html += '<p class="resume-item-sub">' + escapeHtml([school, location].filter(Boolean).join(" · ")) + '</p>';
      }
      if (gpa) html += '<p class="resume-item-sub">GPA: ' + escapeHtml(gpa) + '</p>';
      if (coursework) html += '<p class="resume-item-sub">' + escapeHtml(coursework) + '</p>';
      if (description) html += '<p class="resume-summary-text">' + escapeHtml(description) + '</p>';
      html += '</div>';
    });
    html += '</section>';
    return html;
  }

  function renderProjects(data, lang) {
    var projects = Array.isArray(data.projects) ? data.projects : [];
    var active = projects.filter(function(p) { return p && p.enabled !== false && !p.waived; });
    if (!active.length) return "";

    var html = '<section class="resume-section"><h2 class="resume-section-title">' + escapeHtml(sectionTitle("projects", lang)) + '</h2>';
    active.forEach(function(proj) {
      var name = resolveText(proj.name, lang);
      var role = resolveText(proj.role, lang);
      var organization = resolveText(proj.organization, lang);
      var location = resolveText(proj.location, lang);
      var dateRange = formatDateRange(proj.startDate, proj.endDate);
      var bullets = Array.isArray(proj.bullets)
        ? proj.bullets.filter(function(b) { return b && b.enabled !== false && !b.waived; })
        : [];

      html += '<div class="resume-item">';
      html += '<div class="resume-item-header">';
      var primary = [name, role].filter(Boolean).join(" · ") || "Project";
      html += '<span class="resume-item-primary">' + escapeHtml(primary) + '</span>';
      if (dateRange) html += '<span class="resume-item-date">' + escapeHtml(dateRange) + '</span>';
      html += '</div>';
      if (organization || location) html += '<p class="resume-item-sub">' + escapeHtml([organization, location].filter(Boolean).join(" · ")) + '</p>';
      if (bullets.length) {
        html += '<ul class="resume-bullets">';
        bullets.forEach(function(b) {
          var text = resolveText(b.en !== undefined || b.zh !== undefined ? b : (b.text !== undefined ? b.text : b), lang);
          if (!text && typeof b === "object" && b.text) text = cleanString(b.text);
          if (text) html += '<li>' + escapeHtml(text) + '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    });
    html += '</section>';
    return html;
  }

  function renderSkills(data, lang) {
    var skills = data.skills && typeof data.skills === "object" ? data.skills : {};
    var SKILL_LABELS = {
      languages: { en: "Languages", zh: "程式語言" },
      frameworks: { en: "Frameworks", zh: "框架" },
      libraries: { en: "Libraries", zh: "函式庫" },
      tools: { en: "Tools", zh: "工具" },
      cloud: { en: "Cloud", zh: "雲端" },
      databases: { en: "Databases", zh: "資料庫" },
      dataMl: { en: "Data / ML", zh: "資料 / ML" },
      other: { en: "Other", zh: "其他" }
    };

    if (Array.isArray(skills.categories)) {
      var active = skills.categories.filter(function(c) { return c && c.enabled !== false && !c.waived; });
      if (!active.length) return "";
      var html = '<section class="resume-section"><h2 class="resume-section-title">' + escapeHtml(sectionTitle("skills", lang)) + '</h2>';
      active.forEach(function(cat) {
        var category = resolveText(cat.category, lang);
        var items = Array.isArray(cat.items) ? cat.items.filter(Boolean).join(", ") : "";
        if (!items) return;
        html += '<div class="resume-skill-row">';
        if (category) html += '<span class="resume-skill-category">' + escapeHtml(category) + ": </span>";
        html += escapeHtml(items);
        html += '</div>';
      });
      html += '</section>';
      return html;
    }

    var rows = [];
    Object.keys(SKILL_LABELS).forEach(function(key) {
      var items = Array.isArray(skills[key]) ? skills[key].filter(Boolean) : [];
      if (items.length) {
        rows.push({ label: resolveText(SKILL_LABELS[key], lang), items: items.join(", ") });
      }
    });

    if (!rows.length) return "";
    var html = '<section class="resume-section"><h2 class="resume-section-title">' + escapeHtml(sectionTitle("skills", lang)) + '</h2>';
    rows.forEach(function(row) {
      html += '<div class="resume-skill-row">';
      html += '<span class="resume-skill-category">' + escapeHtml(row.label) + ": </span>";
      html += escapeHtml(row.items);
      html += '</div>';
    });
    html += '</section>';
    return html;
  }

  function resolveLanguage(language) {
    var lang = cleanString(language || "").toLowerCase();
    if (lang === "en" || lang === "zh") return lang;
    return "en";
  }

  function resumeFieldValue(field) {
    if (field === null || field === undefined) return "";
    if (typeof field === "string" || typeof field === "number") return cleanString(field);
    if (typeof field === "object") {
      if (field.waived) return "";
      return cleanString(field.value);
    }
    return "";
  }

  function renderMultilineText(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function renderGenericHeader(resume) {
    var header = resume && resume.header && typeof resume.header === "object" ? resume.header : {};
    var contact = header.contact && typeof header.contact === "object" ? header.contact : {};
    var name = header.name && typeof header.name === "object" ? header.name : {};
    var lang = resume && resume.language === "zh" ? "zh" : "en";
    var firstName = cleanString(contact.firstName) || (name.waived ? "" : cleanString(name.firstName));
    var lastName = cleanString(contact.lastName) || (name.waived ? "" : cleanString(name.lastName));
    var fullName = lang === "zh"
      ? [lastName, firstName].filter(Boolean).join("")
      : [firstName, lastName].filter(Boolean).join(" ");
    fullName = collapseRepeatedName(fullName);
    var email = cleanString(contact.email) || resumeFieldValue(header.email);
    var phone = cleanString(contact.phone) || resumeFieldValue(header.phone);
    var location = cleanString(contact.location) || resumeFieldValue(header.location);
    var links = Array.isArray(contact.links) ? contact.links : [];
    var contactParts = [];
    if (email) contactParts.push(escapeHtml(email));
    if (phone) contactParts.push(escapeHtml(phone));
    if (location) contactParts.push(escapeHtml(location));
    links.forEach(function(link) {
      var text = cleanString(link && typeof link === "object" ? link.text : link);
      if (text) contactParts.push(escapeHtml(text));
    });
    var html = '<header class="resume-header">';
    if (fullName) html += '<h1 class="resume-name">' + escapeHtml(fullName) + '</h1>';
    if (contactParts.length) {
      html += '<div class="resume-contact">';
      contactParts.forEach(function(part, i) {
        if (i > 0) html += '<span class="resume-contact-sep"> | </span>';
        html += '<span>' + part + '</span>';
      });
      html += '</div>';
    }
    html += '</header>';
    return html;
  }

  function normalizeGenericLine(line, index) {
    var raw = line && typeof line === "object" ? line : {};
    var type = cleanString(raw.type);
    if (["title", "date", "subtitle", "bullet", "paragraph"].indexOf(type) === -1) {
      type = "paragraph";
    }
    return {
      type: type,
      text: cleanString(raw.text !== undefined ? raw.text : line),
      bold: type === "title" ? true : Boolean(raw.bold),
      italic: type === "subtitle" ? true : Boolean(raw.italic),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index + 1
    };
  }

  function lineTextClass(line) {
    var classes = [];
    if (line.bold) classes.push("resume-line-bold");
    if (line.italic) classes.push("resume-line-italic");
    return classes.length ? ' class="' + classes.join(" ") + '"' : "";
  }

  function renderLineText(line) {
    return '<span' + lineTextClass(line) + '>' + escapeHtml(line.text) + '</span>';
  }

  function renderMultilineLineText(line) {
    return '<span' + lineTextClass(line) + '>' + renderMultilineText(line.text) + '</span>';
  }

  function legacyLinesFromBlock(block) {
    var lines = [];
    function addLine(type, field, defaults) {
      var text = resumeFieldValue(field);
      if (!text) return;
      lines.push(normalizeGenericLine({
        type: type,
        text: text,
        bold: defaults && defaults.bold,
        italic: defaults && defaults.italic
      }, lines.length));
    }
    addLine("title", block.title, { bold: true });
    addLine("date", block.date, {});
    addLine("subtitle", block.subtitle, { italic: true });
    (Array.isArray(block.bullets) ? block.bullets : []).forEach(function(bullet) {
      if (!bullet || bullet.waived) return;
      var text = cleanString(bullet.value !== undefined ? bullet.value : bullet);
      if (text) addLine("bullet", text, {});
    });
    addLine("paragraph", block.description, {});
    return lines;
  }

  function renderEntryLines(block) {
    var sourceLines = Array.isArray(block.lines) && block.lines.length ? block.lines : legacyLinesFromBlock(block);
    var lines = sourceLines
      .map(normalizeGenericLine)
      .filter(function(line) { return cleanString(line.text); })
      .sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); });
    if (!lines.length) return "";

    var firstTitleIndex = -1;
    var firstDateIndex = -1;
    lines.forEach(function(line, index) {
      if (firstTitleIndex < 0 && line.type === "title") firstTitleIndex = index;
      if (firstDateIndex < 0 && line.type === "date") firstDateIndex = index;
    });

    var html = '<div class="resume-item">';
    var bulletBuffer = "";
    function flushBullets() {
      if (bulletBuffer) {
        html += '<ul class="resume-bullets">' + bulletBuffer + '</ul>';
        bulletBuffer = "";
      }
    }

    lines.forEach(function(line, index) {
      if (firstTitleIndex >= 0 && firstDateIndex >= 0 && index === firstDateIndex) {
        return;
      }
      if (line.type !== "bullet") {
        flushBullets();
      }
      if (line.type === "title") {
        if (index === firstTitleIndex && firstDateIndex >= 0) {
          html += '<div class="resume-item-header">';
          html += '<span class="resume-item-primary">' + renderLineText(line) + '</span>';
          html += '<span class="resume-item-date">' + renderLineText(lines[firstDateIndex]) + '</span>';
          html += '</div>';
        } else {
          html += '<div class="resume-item-header"><span class="resume-item-primary">' + renderLineText(line) + '</span></div>';
        }
      } else if (line.type === "date") {
        html += '<p class="resume-line-date-only">' + renderLineText(line) + '</p>';
      } else if (line.type === "subtitle") {
        html += '<p class="resume-item-sub">' + renderLineText(line) + '</p>';
      } else if (line.type === "bullet") {
        bulletBuffer += '<li>' + renderLineText(line) + '</li>';
      } else {
        html += '<p class="resume-summary-text">' + renderMultilineLineText(line) + '</p>';
      }
    });
    flushBullets();
    html += '</div>';
    return html;
  }

  function renderGenericSections(resume) {
    var sections = Array.isArray(resume && resume.sections) ? resume.sections : [];
    var html = "";
    sections
      .filter(function(section) { return section && !section.waived; })
      .sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); })
      .forEach(function(section) {
        var sectionName = cleanString(section.sectionName);
        var blocks = Array.isArray(section.blocks) ? section.blocks : [];
        var body = "";
        blocks
          .filter(function(block) { return block && !block.waived; })
          .sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); })
          .forEach(function(block) {
            body += renderEntryLines(block);
          });
        if (sectionName) {
          html += '<section class="resume-section">';
          html += '<h2 class="resume-section-title">' + escapeHtml(sectionName) + '</h2>';
          html += body + '</section>';
        }
      });
    return html;
  }

  function renderA4Html(data, language) {
    var safe = data && typeof data === "object" ? data : {};
    var resume = safe.resume && typeof safe.resume === "object" ? safe.resume : null;
    var lang = resume && resume.language === "zh" ? "zh" : resolveLanguage(language);
    var htmlLang = lang === "zh" ? "zh-TW" : "en";

    var bodyContent = resume
      ? renderGenericHeader(resume) + renderGenericSections(resume)
      : renderHeader(safe, lang) +
        renderSummary(safe, lang) +
        renderExperience(safe, lang) +
        renderEducation(safe, lang) +
        renderProjects(safe, lang) +
        renderSkills(safe, lang);

    return "<!doctype html>\n" +
      '<html lang="' + escapeHtml(htmlLang) + '">\n' +
      "<head>\n" +
      '  <meta charset="utf-8" />\n' +
      "  <title>Resume</title>\n" +
      "  <style>" + getA4Css() + "</style>\n" +
      "</head>\n" +
      "<body>\n" +
      '  <div class="resume-page">\n' +
      bodyContent + "\n" +
      "  </div>\n" +
      "</body>\n" +
      "</html>";
  }

  global.ResumeA4Template = Object.freeze({
    renderA4Html: renderA4Html,
    resolveLanguage: resolveLanguage,
    resolveText: resolveText
  });
})(globalThis);
