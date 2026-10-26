(function attachStage5ResumePdfBuilder(global) {
  "use strict";

  var validation = global.Stage5Validation || {};
  var textWrap = global.Stage5RenderTextWrap || {};
  var DEFAULT_MAX_LINE_LENGTH =
    typeof textWrap.DEFAULT_MAX_LINE_LENGTH === "number" && Number.isFinite(textWrap.DEFAULT_MAX_LINE_LENGTH)
      ? textWrap.DEFAULT_MAX_LINE_LENGTH
      : 115;

  var PDF_PAGE_WIDTH = 595;
  var PDF_PAGE_HEIGHT = 842;
  var PDF_LEFT_MARGIN = 48;
  var PDF_TOP_MARGIN = 56;
  var PDF_BOTTOM_MARGIN = 48;
  var PDF_LINE_HEIGHT = 14;

  function cleanString(value) {
    if (typeof validation.cleanString === "function") {
      return validation.cleanString(value);
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function ensureArray(value) {
    if (typeof validation.ensureArray === "function") {
      return validation.ensureArray(value);
    }
    return Array.isArray(value) ? value : [];
  }

  function fallbackSplitWrappedLines(text, maxChars) {
    var limit = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Math.floor(Number(maxChars)) : DEFAULT_MAX_LINE_LENGTH;
    var source = (typeof text === "string" ? text : String(text || "")).replace(/\r\n?/g, "\n");
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
        var breakIndex = limit;
        for (var index = limit; index > 0; index -= 1) {
          var char = remaining[index - 1];
          if (/\s/.test(char) || /[,.!?;:)/\]]/.test(char)) {
            breakIndex = index;
            break;
          }
        }

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

    return output.length ? output : [""];
  }

  function wrapText(text, maxChars) {
    var limit = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Math.floor(Number(maxChars)) : DEFAULT_MAX_LINE_LENGTH;

    if (typeof textWrap.splitWrappedLines === "function") {
      return textWrap.splitWrappedLines(text, limit);
    }

    return fallbackSplitWrappedLines(text, limit);
  }

  function sanitizePdfText(text) {
    var source = typeof text === "string" ? text : String(text || "");
    var output = "";

    for (var index = 0; index < source.length; index += 1) {
      var ch = source[index];
      var code = source.charCodeAt(index);
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

  function buildPdfContentStream(pageLines) {
    var commands = ["BT", "/F1 11 Tf"];

    for (var index = 0; index < pageLines.length; index += 1) {
      var line = pageLines[index];
      commands.push("/F1 " + String(line.size) + " Tf");
      commands.push("1 0 0 1 " + String(line.x) + " " + String(line.y) + " Tm");
      commands.push("(" + sanitizePdfText(line.text) + ") Tj");
    }

    commands.push("ET");
    return commands.join("\n");
  }

  function buildSimplePdf(lines) {
    var pages = [[]];
    var currentY = PDF_PAGE_HEIGHT - PDF_TOP_MARGIN;

    function ensureSpace(requiredLines) {
      var requiredHeight = requiredLines * PDF_LINE_HEIGHT;
      if (currentY - requiredHeight < PDF_BOTTOM_MARGIN) {
        pages.push([]);
        currentY = PDF_PAGE_HEIGHT - PDF_TOP_MARGIN;
      }
    }

    for (var index = 0; index < lines.length; index += 1) {
      var entry = lines[index] && typeof lines[index] === "object" ? lines[index] : {};
      var wrappedLines = wrapText(cleanString(entry.text), DEFAULT_MAX_LINE_LENGTH);

      for (var wrappedIndex = 0; wrappedIndex < wrappedLines.length; wrappedIndex += 1) {
        ensureSpace(1);
        pages[pages.length - 1].push({
          text: cleanString(wrappedLines[wrappedIndex]),
          x: PDF_LEFT_MARGIN + (entry.indent || 0),
          y: currentY,
          size: entry.size || 11
        });
        currentY -= PDF_LINE_HEIGHT;
      }
    }

    var objects = [];

    function addObject(payload) {
      objects.push(payload);
      return objects.length;
    }

    var fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    var pageIds = [];
    var contentIds = [];

    for (var pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      var stream = buildPdfContentStream(pages[pageIndex]);
      var contentPayload = "<< /Length " + String(stream.length) + " >>\nstream\n" + stream + "\nendstream";
      var contentId = addObject(contentPayload);
      contentIds.push(contentId);
      pageIds.push(0);
    }

    var pagesId = addObject("<< /Type /Pages /Kids [" + pageIds.map(function mapPage() { return "0 0 R"; }).join(" ") + "] /Count " + String(pageIds.length) + " >>");

    for (var contentIndex = 0; contentIndex < contentIds.length; contentIndex += 1) {
      var pagePayload =
        "<< /Type /Page /Parent " + String(pagesId) + " 0 R /MediaBox [0 0 " + String(PDF_PAGE_WIDTH) + " " + String(PDF_PAGE_HEIGHT) + "] " +
        "/Resources << /Font << /F1 " + String(fontId) + " 0 R >> >> /Contents " + String(contentIds[contentIndex]) + " 0 R >>";
      pageIds[contentIndex] = addObject(pagePayload);
    }

    objects[pagesId - 1] = "<< /Type /Pages /Kids [" + pageIds.map(function mapId(id) { return String(id) + " 0 R"; }).join(" ") + "] /Count " + String(pageIds.length) + " >>";
    var catalogId = addObject("<< /Type /Catalog /Pages " + String(pagesId) + " 0 R >>");

    var pdf = "%PDF-1.4\n%STAGE5\n";
    var offsets = [0];

    for (var objectIndex = 0; objectIndex < objects.length; objectIndex += 1) {
      offsets.push(pdf.length);
      pdf += String(objectIndex + 1) + " 0 obj\n" + objects[objectIndex] + "\nendobj\n";
    }

    var xrefOffset = pdf.length;
    pdf += "xref\n0 " + String(objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (var offsetIndex = 1; offsetIndex < offsets.length; offsetIndex += 1) {
      pdf += String(offsets[offsetIndex]).padStart(10, "0") + " 00000 n \n";
    }

    pdf += "trailer\n<< /Size " + String(objects.length + 1) + " /Root " + String(catalogId) + " 0 R >>\nstartxref\n" + String(xrefOffset) + "\n%%EOF\n";
    return new TextEncoder().encode(pdf);
  }

  function linesFromHtml(htmlText) {
    if (typeof DOMParser !== "function") {
      return [];
    }

    try {
      var doc = new DOMParser().parseFromString(htmlText, "text/html");
      var text = cleanString(doc && doc.body ? (doc.body.innerText || doc.body.textContent) : "");
      if (!text) {
        return [];
      }

      var lines = text.split(/\r?\n/).map(function mapLine(line) { return cleanString(line); }).filter(Boolean);
      var output = [];
      for (var index = 0; index < lines.length; index += 1) {
        var wrapped = wrapText(lines[index], DEFAULT_MAX_LINE_LENGTH);
        for (var wrappedIndex = 0; wrappedIndex < wrapped.length; wrappedIndex += 1) {
          output.push({ text: wrapped[wrappedIndex], size: 10, indent: 0 });
        }
      }
      return output;
    } catch {
      return [];
    }
  }

  function addSection(lines, title, list, fallbackIndent) {
    var items = ensureArray(list);
    if (!items.length) {
      return;
    }

    lines.push({ text: "", size: 11, indent: 0 });
    lines.push({ text: String(title || "").toUpperCase(), size: 12, indent: 0 });

    for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      var wrapped = wrapText(String(items[itemIndex] || ""), DEFAULT_MAX_LINE_LENGTH);
      for (var lineIndex = 0; lineIndex < wrapped.length; lineIndex += 1) {
        var prefix = lineIndex === 0 ? "- " : "  ";
        lines.push({ text: prefix + wrapped[lineIndex], size: 10, indent: fallbackIndent || 14 });
      }
    }
  }

  function linesFromTailoredDraft(draft) {
    var safe = draft && typeof draft === "object" ? draft : {};
    var header = safe.header && typeof safe.header === "object" ? safe.header : {};
    var lines = [];

    var name = cleanString(header.name) || "Tailored Resume";
    var subtitle = [cleanString(header.title), cleanString(safe.targetRole)].filter(Boolean).join(" | ");

    lines.push({ text: name, size: 18, indent: 0 });
    if (subtitle) {
      lines.push({ text: subtitle, size: 11, indent: 0 });
    }

    var contact = [cleanString(header.email), cleanString(header.phone), cleanString(header.location)].filter(Boolean).join(" | ");
    if (contact) {
      lines.push({ text: contact, size: 10, indent: 0 });
    }

    if (cleanString(safe.professionalSummary)) {
      lines.push({ text: "", size: 11, indent: 0 });
      lines.push({ text: "PROFESSIONAL SUMMARY", size: 12, indent: 0 });
      var summaryLines = wrapText(cleanString(safe.professionalSummary), DEFAULT_MAX_LINE_LENGTH);
      for (var summaryIndex = 0; summaryIndex < summaryLines.length; summaryIndex += 1) {
        lines.push({ text: summaryLines[summaryIndex], size: 11, indent: 0 });
      }
    }

    var experience = ensureArray(safe.tailoredExperience);
    if (experience.length) {
      lines.push({ text: "", size: 11, indent: 0 });
      lines.push({ text: "EXPERIENCE", size: 12, indent: 0 });
      for (var expIndex = 0; expIndex < experience.length; expIndex += 1) {
        var exp = experience[expIndex] && typeof experience[expIndex] === "object" ? experience[expIndex] : {};
        var heading = [cleanString(exp.title), cleanString(exp.company)].filter(Boolean).join(" @ ");
        if (heading) {
          lines.push({ text: heading, size: 11, indent: 0 });
        }
        var meta = [cleanString(exp.location), [cleanString(exp.startDate), cleanString(exp.endDate)].filter(Boolean).join(" - ")].filter(Boolean).join(" | ");
        if (meta) {
          lines.push({ text: meta, size: 10, indent: 0 });
        }
        addSection(lines, "", ensureArray(exp.bullets), 14);
      }
    }

    addSection(lines, "SKILLS", ensureArray(safe.selectedSkills), 14);

    var educationLines = [];
    var education = ensureArray(safe.education);
    for (var eduIndex = 0; eduIndex < education.length; eduIndex += 1) {
      var edu = education[eduIndex] && typeof education[eduIndex] === "object" ? education[eduIndex] : {};
      var eduText = [cleanString(edu.degree), cleanString(edu.field), cleanString(edu.school)].filter(Boolean).join(", ");
      var eduMeta = [cleanString(edu.location), [cleanString(edu.startDate), cleanString(edu.endDate)].filter(Boolean).join(" - ")].filter(Boolean).join(" | ");
      if (eduText) {
        educationLines.push(eduText + (eduMeta ? " (" + eduMeta + ")" : ""));
      }
    }
    addSection(lines, "EDUCATION", educationLines, 14);

    var projectLines = [];
    var projects = ensureArray(safe.projects);
    for (var projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
      var project = projects[projectIndex] && typeof projects[projectIndex] === "object" ? projects[projectIndex] : {};
      var projectHeading = [cleanString(project.name), cleanString(project.role)].filter(Boolean).join(" | ");
      if (projectHeading) {
        projectLines.push(projectHeading);
      }
      var bullets = ensureArray(project.bullets);
      for (var bulletIndex = 0; bulletIndex < bullets.length; bulletIndex += 1) {
        projectLines.push(String(bullets[bulletIndex] || ""));
      }
    }
    addSection(lines, "PROJECTS", projectLines, 14);

    return lines;
  }

  function buildTailoredResumePdfBytes(tailoredResumeDraft, options) {
    var opts = options && typeof options === "object" ? options : {};
    var htmlText = typeof opts.htmlText === "string" ? opts.htmlText : "";
    var lines = linesFromHtml(htmlText);
    if (!lines.length) {
      lines = linesFromTailoredDraft(tailoredResumeDraft);
    }
    return buildSimplePdf(lines);
  }

  global.Stage5ResumePdfBuilder = Object.freeze({
    buildTailoredResumePdfBytes: buildTailoredResumePdfBytes,
    linesFromTailoredDraft: linesFromTailoredDraft
  });
})(globalThis);
