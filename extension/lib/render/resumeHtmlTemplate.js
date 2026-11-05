(function attachStage5ResumeHtmlTemplate(global) {
  "use strict";

  var textWrap = global.Stage5RenderTextWrap || {};
  var DEFAULT_MAX_LINE_LENGTH =
    typeof textWrap.DEFAULT_MAX_LINE_LENGTH === "number" && Number.isFinite(textWrap.DEFAULT_MAX_LINE_LENGTH)
      ? textWrap.DEFAULT_MAX_LINE_LENGTH
      : 115;

  function escapeHtml(value) {
    var text = typeof value === "string" ? value : String(value || "");
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fallbackWrapTextAtLineLength(value, maxChars) {
    var limit = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Math.floor(Number(maxChars)) : DEFAULT_MAX_LINE_LENGTH;
    var source = (typeof value === "string" ? value : String(value || "")).replace(/\r\n?/g, "\n");
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

    return output.join("\n");
  }

  function wrapTextAtLineLength(value, maxChars) {
    if (typeof textWrap.wrapTextAtLineLength === "function") {
      return textWrap.wrapTextAtLineLength(value, maxChars);
    }
    return fallbackWrapTextAtLineLength(value, maxChars);
  }

  function renderWrappedText(value, maxChars) {
    var wrapped = wrapTextAtLineLength(value, maxChars || DEFAULT_MAX_LINE_LENGTH);
    var lines = String(wrapped || "").replace(/\r\n?/g, "\n").split("\n");
    var html = "";

    for (var index = 0; index < lines.length; index += 1) {
      if (index > 0) {
        html += "<br />";
      }
      html += escapeHtml(lines[index]);
    }

    return html;
  }

  function renderList(items, emptyText) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return '<p class="empty">' + escapeHtml(emptyText || "(none)") + "</p>";
    }

    var html = "<ul>";
    for (var index = 0; index < list.length; index += 1) {
      html += "<li>" + renderWrappedText(list[index], DEFAULT_MAX_LINE_LENGTH) + "</li>";
    }
    html += "</ul>";
    return html;
  }

  function renderExperience(entries) {
    var list = Array.isArray(entries) ? entries : [];
    if (!list.length) {
      return '<p class="empty">(none)</p>';
    }

    var html = "";
    for (var index = 0; index < list.length; index += 1) {
      var item = list[index] && typeof list[index] === "object" ? list[index] : {};
      var company = typeof item.company === "string" ? item.company : "";
      var title = typeof item.title === "string" ? item.title : "";
      var location = typeof item.location === "string" ? item.location : "";
      var startDate = typeof item.startDate === "string" ? item.startDate : "";
      var endDate = typeof item.endDate === "string" ? item.endDate : "";
      var bullets = Array.isArray(item.bullets) ? item.bullets : [];
      var heading = [title, company].filter(Boolean).join(" @ ");
      var meta = [location, [startDate, endDate].filter(Boolean).join(" - ")].filter(Boolean).join(" | ");

      html += '<article class="entry">';
      html += "<h3>" + renderWrappedText(heading || "Experience", DEFAULT_MAX_LINE_LENGTH) + "</h3>";
      if (meta) {
        html += '<p class="entry-meta">' + renderWrappedText(meta, DEFAULT_MAX_LINE_LENGTH) + "</p>";
      }
      html += renderList(bullets, "(no bullets)");
      html += "</article>";
    }

    return html;
  }

  function renderEducation(entries) {
    var list = Array.isArray(entries) ? entries : [];
    if (!list.length) {
      return '<p class="empty">(none)</p>';
    }

    var html = "";
    for (var index = 0; index < list.length; index += 1) {
      var item = list[index] && typeof list[index] === "object" ? list[index] : {};
      var school = typeof item.school === "string" ? item.school : "";
      var degree = typeof item.degree === "string" ? item.degree : "";
      var major = typeof item.major === "string" ? item.major : (typeof item.field === "string" ? item.field : "");
      var location = typeof item.location === "string" ? item.location : "";
      var startDate = typeof item.startDate === "string" ? item.startDate : "";
      var endDate = typeof item.endDate === "string" ? item.endDate : "";
      var gpa = typeof item.gpa === "string" ? item.gpa : "";
      var coursework = typeof item.coursework === "string" ? item.coursework : "";
      var description = typeof item.description === "string" ? item.description : "";
      var heading = [degree, major].filter(Boolean).join(", ") || "Education";
      var meta = [school, location, [startDate, endDate].filter(Boolean).join(" - ")].filter(Boolean).join(" | ");

      html += '<article class="entry">';
      html += "<h3>" + renderWrappedText(heading, DEFAULT_MAX_LINE_LENGTH) + "</h3>";
      html += '<p class="entry-meta">' + renderWrappedText(meta, DEFAULT_MAX_LINE_LENGTH) + "</p>";
      if (gpa) {
        html += '<p class="entry-detail">GPA: ' + escapeHtml(gpa) + "</p>";
      }
      if (coursework) {
        html += '<p class="entry-detail">Relevant Coursework: ' + renderWrappedText(coursework, DEFAULT_MAX_LINE_LENGTH) + "</p>";
      }
      if (description) {
        html += '<p class="entry-detail">' + renderWrappedText(description, DEFAULT_MAX_LINE_LENGTH) + "</p>";
      }
      html += "</article>";
    }

    return html;
  }

  function renderProjects(entries) {
    var list = Array.isArray(entries) ? entries : [];
    if (!list.length) {
      return '<p class="empty">(none)</p>';
    }

    var html = "";
    for (var index = 0; index < list.length; index += 1) {
      var item = list[index] && typeof list[index] === "object" ? list[index] : {};
      var name = typeof item.name === "string" ? item.name : "";
      var role = typeof item.role === "string" ? item.role : "";
      var startDate = typeof item.startDate === "string" ? item.startDate : "";
      var endDate = typeof item.endDate === "string" ? item.endDate : "";
      var bullets = Array.isArray(item.bullets) ? item.bullets : [];

      html += '<article class="entry">';
      html += "<h3>" + renderWrappedText(name || "Project", DEFAULT_MAX_LINE_LENGTH) + "</h3>";
      html += '<p class="entry-meta">' + renderWrappedText([role, [startDate, endDate].filter(Boolean).join(" - ")].filter(Boolean).join(" | "), DEFAULT_MAX_LINE_LENGTH) + "</p>";
      html += renderList(bullets, "(no bullets)");
      html += "</article>";
    }

    return html;
  }

  function renderLinks(items) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return '<span class="empty">(none)</span>';
    }

    var html = "";
    for (var index = 0; index < list.length; index += 1) {
      var item = list[index] && typeof list[index] === "object" ? list[index] : {};
      var label = typeof item.label === "string" ? item.label : "";
      var url = typeof item.url === "string" ? item.url : "";
      var text = label || url;
      if (!text) {
        continue;
      }
      if (url) {
        html += '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + renderWrappedText(text, DEFAULT_MAX_LINE_LENGTH) + "</a>";
      } else {
        html += "<span>" + renderWrappedText(text, DEFAULT_MAX_LINE_LENGTH) + "</span>";
      }
      if (index < list.length - 1) {
        html += "<span class=\"dot\">•</span>";
      }
    }

    return html || '<span class="empty">(none)</span>';
  }

  function renderChips(items) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return '<span class="empty">(none)</span>';
    }

    var html = "";
    for (var index = 0; index < list.length; index += 1) {
      html += '<span class="chip">' + renderWrappedText(list[index], DEFAULT_MAX_LINE_LENGTH) + "</span>";
    }
    return html;
  }

  function renderTailoredResumeHtml(data) {
    var safe = data && typeof data === "object" ? data : {};
    var header = safe.header && typeof safe.header === "object" ? safe.header : {};

    var pageTitle = (typeof header.name === "string" && header.name) || "Tailored Resume";

    return '<!doctype html>\n' +
      '<html lang="en">\n' +
      '  <head>\n' +
      '    <meta charset="utf-8" />\n' +
      '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
      '    <title>' + escapeHtml(pageTitle) + ' - Tailored Resume</title>\n' +
      '    <style>\n' +
      '      body { margin: 0; background: #f5f7fb; color: #0f172a; font-family: "Segoe UI", Tahoma, Arial, sans-serif; }\n' +
      '      main { max-width: 900px; margin: 0 auto; padding: 24px; }\n' +
      '      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 14px; }\n' +
      '      h1 { margin: 0; font-size: 30px; line-height: 1.2; }\n' +
      '      h2 { margin: 0 0 10px; font-size: 19px; }\n' +
      '      h3 { margin: 0 0 6px; font-size: 16px; }\n' +
      '      p { margin: 0; line-height: 1.55; }\n' +
      '      ul { margin: 0; padding-left: 20px; }\n' +
      '      li { margin: 0 0 6px; line-height: 1.45; }\n' +
      '      .muted { color: #475569; font-size: 13px; margin-top: 6px; }\n' +
      '      .meta { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; color: #334155; font-size: 13px; }\n' +
      '      .links { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }\n' +
      '      .dot { color: #94a3b8; }\n' +
      '      .chips { display: flex; flex-wrap: wrap; gap: 8px; }\n' +
      '      .chip { background: #eef2ff; border: 1px solid #c7d2fe; color: #312e81; border-radius: 999px; padding: 4px 10px; font-size: 12px; }\n' +
      '      .entry { padding: 10px 0; border-top: 1px solid #e2e8f0; }\n' +
      '      .entry:first-child { border-top: 0; padding-top: 0; }\n' +
      '      .entry-meta { margin-bottom: 8px; color: #475569; font-size: 13px; }\n' +
      '      .empty { color: #64748b; font-style: italic; }\n' +
      '      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #334155; font-size: 12px; }\n' +
      '    </style>\n' +
      '  </head>\n' +
      '  <body>\n' +
      '    <main>\n' +
      '      <section class="card">\n' +
      '        <h1>' + renderWrappedText(header.name || "Tailored Resume", DEFAULT_MAX_LINE_LENGTH) + '</h1>\n' +
      '        <p class="muted">' + renderWrappedText(header.title || "", DEFAULT_MAX_LINE_LENGTH) + '</p>\n' +
      '        <div class="meta">\n' +
      '          <span>' + renderWrappedText(header.email || "", DEFAULT_MAX_LINE_LENGTH) + '</span>\n' +
      '          <span>' + renderWrappedText(header.phone || "", DEFAULT_MAX_LINE_LENGTH) + '</span>\n' +
      '          <span>' + renderWrappedText(header.location || "", DEFAULT_MAX_LINE_LENGTH) + '</span>\n' +
      '        </div>\n' +
      '        <div class="links">' + renderLinks(header.links) + '</div>\n' +
      '      </section>\n' +
      '      <section class="card">\n' +
      '        <h2>Target Role</h2>\n' +
      '        <p>' + renderWrappedText(safe.targetRole || "", DEFAULT_MAX_LINE_LENGTH) + '</p>\n' +
      '      </section>\n' +
      '      <section class="card">\n' +
      '        <h2>Professional Summary</h2>\n' +
      '        <p>' + (safe.professionalSummary ? renderWrappedText(safe.professionalSummary, DEFAULT_MAX_LINE_LENGTH) : '<span class="empty">(none)</span>') + '</p>\n' +
      '      </section>\n' +
      '      <section class="card">\n' +
      '        <h2>Experience</h2>\n' +
      '        ' + renderExperience(safe.tailoredExperience) + '\n' +
      '      </section>\n' +
      '      <section class="card">\n' +
      '        <h2>Education</h2>\n' +
      '        ' + renderEducation(safe.education) + '\n' +
      '      </section>\n' +
      '      <section class="card">\n' +
      '        <h2>Skills</h2>\n' +
      '        <div class="chips">' + renderChips(safe.selectedSkills) + '</div>\n' +
      '      </section>\n' +
      '      <section class="card">\n' +
      '        <h2>Projects</h2>\n' +
      '        ' + renderProjects(safe.projects) + '\n' +
      '      </section>\n' +
      '      <section class="card">\n' +
      '        <p class="mono">Generated by Stage 5 extension tailored resume pipeline.</p>\n' +
      '      </section>\n' +
      '    </main>\n' +
      '  </body>\n' +
      '</html>';
  }

  global.Stage5ResumeHtmlTemplate = Object.freeze({
    renderTailoredResumeHtml: renderTailoredResumeHtml
  });
})(globalThis);
