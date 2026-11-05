const shared = globalThis.Stage3Shared;
const textUtils = globalThis.Stage3TextUtils;
const { MESSAGE_TYPES, ERROR_CODES, ok, fail } = shared;

console.log("[content] script loaded", { url: window.location.href });

function getOptionalMetaContent(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    return undefined;
  }

  const content = (element.getAttribute("content") || "").trim();
  return content || undefined;
}

function getCanonicalUrl() {
  const canonicalElement = document.querySelector('link[rel="canonical"]');
  if (!canonicalElement) {
    return undefined;
  }

  const href = (canonicalElement.getAttribute("href") || "").trim();
  if (!href) {
    return undefined;
  }

  try {
    return new URL(href, window.location.href).href;
  } catch {
    return href;
  }
}

function buildMetadata() {
  const metadata = {
    canonicalUrl: getCanonicalUrl(),
    ogTitle: getOptionalMetaContent('meta[property="og:title"]'),
    ogDescription: getOptionalMetaContent('meta[property="og:description"]')
  };

  if (!metadata.canonicalUrl && !metadata.ogTitle && !metadata.ogDescription) {
    return undefined;
  }

  return metadata;
}

function detectProbableSiteType(hostname, pathname, url) {
  const host = (hostname || "").toLowerCase();
  const path = (pathname || "").toLowerCase();
  const fullUrl = (url || "").toLowerCase();

  if (
    host.includes("greenhouse.io") ||
    host.includes("boards.greenhouse") ||
    path.includes("greenhouse") ||
    fullUrl.includes("greenhouse")
  ) {
    return "greenhouse";
  }

  if (
    host.includes("lever.co") ||
    host.includes("jobs.lever") ||
    path.includes("lever") ||
    fullUrl.includes("lever.co")
  ) {
    return "lever";
  }

  if (
    host.includes("workday.com") ||
    host.includes("myworkdayjobs.com") ||
    path.includes("workday") ||
    fullUrl.includes("workday")
  ) {
    return "workday";
  }

  if (host || path || fullUrl) {
    return "generic";
  }

  return "unknown";
}

function buildPageSnapshot() {
  if (!document.body) {
    return fail("Document body is not available", ERROR_CODES.BODY_MISSING);
  }

  const rawText = document.body.innerText || "";
  const cleanedText = textUtils
    ? textUtils.extractVisibleText(rawText, { maxLength: 120000 })
    : rawText.trim();

  const url = window.location.href;
  const hostname = window.location.hostname || "";
  const pathname = window.location.pathname || "";
  const metadata = buildMetadata();
  let htmlSnapshot = "";
  try {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, iframe, svg").forEach((node) => node.remove());
    htmlSnapshot = String(clone.innerHTML || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120000);
  } catch {
    htmlSnapshot = "";
  }

  const pageSnapshot = {
    url: url,
    title: document.title || "",
    extractedAt: new Date().toISOString(),
    pageText: cleanedText,
    htmlSnapshot: htmlSnapshot,
    hostname: hostname,
    pathname: pathname,
    htmlLang: document.documentElement ? document.documentElement.lang || "" : "",
    hints: {
      probableSiteType: detectProbableSiteType(hostname, pathname, url)
    }
  };

  if (metadata) {
    pageSnapshot.metadata = metadata;
  }

  return ok(pageSnapshot);
}

function resolveApplyRuntime() {
  const runtime = globalThis.Stage6ApplyRuntime;
  if (runtime && typeof runtime.runPrepareOnlyApplyFlow === "function") {
    return runtime;
  }
  return null;
}

const APPLY_SKIP_TEXT = /\b(submit|submit application|send application|send|finish|complete application|final submit|sign in|sign up|log in|register|cancel|close|back|next|previous|save draft)\b/i;
const APPLY_CLICKABLE_SELECTOR = "a, button, [role=\"button\"], [role=\"link\"], input[type=\"submit\"], input[type=\"button\"], [data-test-id=\"apply-button\"]";
const APPLY_PRIORITY_SELECTORS = [
  "button[data-test-id=\"apply-button\"]",
  "[data-test-id=\"apply-button\"]",
  "button[role=\"link\"]"
];
const APPLY_NOW_SPAN_SELECTOR = "button span";
const APPLY_NOW_TEXT_RE = /\bapply\s+now\b/i;
const TESTER_ALLOWED_RE = /\b(apply|start.{0,30}application|begin.{0,30}application|continue.{0,30}application)\b/i;
const TESTER_FORBIDDEN_RE = /\b(submit application|send application|final submit|complete application|submit|finish)\b/i;
const APPLICATION_FORM_FILLABLE_SELECTOR = [
  "input:not([type=\"hidden\"])",
  "textarea",
  "select",
  "input[type=\"file\"]",
  "[contenteditable=\"true\"]",
  "[contenteditable=\"\"]",
  "[contenteditable=\"plaintext-only\"]",
  "[role=\"textbox\"]",
  "[role=\"combobox\"]",
  "[role=\"listbox\"]",
  "[role=\"radiogroup\"]",
  "[role=\"checkbox\"]",
  "[role=\"radio\"]"
].join(",");
const TESTER_FILLABLE_SEL = APPLICATION_FORM_FILLABLE_SELECTOR;

const APPLICATION_KEYWORDS = [
  "first name",
  "last name",
  "email",
  "phone",
  "resume",
  "upload resume",
  "work authorization",
  "sponsorship",
  "education",
  "experience",
  "linkedin",
  "portfolio",
  "cover letter",
  "voluntary self identification",
  "eeo",
  "disability",
  "veteran"
];

const APPLICATION_LABEL_RE = /first[\s-]*name|last[\s-]*name|e[\s-]*mail|phone|resume|upload[\s-]*resume|work[\s-]*(authorization|authorisation)|sponsorship|education|experience|linkedin|portfolio|cover[\s-]*letter|voluntary[\s-]*self[\s-]*identification|eeo|disability|veteran/gi;

function collectGroupedFieldCount(elements, attrName) {
  const groups = new Set();
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const rawName = String(element.getAttribute(attrName) || "").trim();
    groups.add(rawName ? rawName.toLowerCase() : "__single__" + String(index));
  }
  return groups.size;
}

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] || "").trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

function findKeywordMatches(inputText) {
  const text = String(inputText || "");
  if (!text) {
    return [];
  }
  const matches = [];
  const keywordRegex = new RegExp(APPLICATION_LABEL_RE.source, "gi");
  const raw = text.match(keywordRegex) || [];
  for (let index = 0; index < raw.length; index += 1) {
    matches.push(String(raw[index] || "").toLowerCase().replace(/\s+/g, " ").trim());
  }
  return uniqueCaseInsensitive(matches).slice(0, 20);
}

function collectApplicationFormContext() {
  const forms = Array.from(document.querySelectorAll("form"));
  const inputs = Array.from(document.querySelectorAll("input:not([type=\"hidden\"])"));
  const textareas = Array.from(document.querySelectorAll("textarea"));
  const selects = Array.from(document.querySelectorAll("select"));
  const fileInputs = inputs.filter(function onlyFiles(input) {
    return String(input.type || "").toLowerCase() === "file";
  });
  const radioInputs = inputs.filter(function onlyRadios(input) {
    return String(input.type || "").toLowerCase() === "radio";
  });
  const checkboxInputs = inputs.filter(function onlyCheckboxes(input) {
    return String(input.type || "").toLowerCase() === "checkbox";
  });
  const contentEditableNodes = Array.from(document.querySelectorAll(
    "[contenteditable=\"true\"],[contenteditable=\"\"],[contenteditable=\"plaintext-only\"]"
  ));
  const customControlNodes = Array.from(document.querySelectorAll(
    "[role=\"textbox\"],[role=\"combobox\"],[role=\"listbox\"],[role=\"radiogroup\"],[role=\"checkbox\"],[role=\"radio\"]"
  ));

  const fillableNodes = new Set();
  const fillableInputs = inputs.filter(function keepFillable(input) {
    const type = String(input.type || "").toLowerCase();
    return !["button", "submit", "reset", "hidden", "image"].includes(type);
  });
  fillableInputs.forEach(function addInput(node) { fillableNodes.add(node); });
  textareas.forEach(function addTextarea(node) { fillableNodes.add(node); });
  selects.forEach(function addSelect(node) { fillableNodes.add(node); });
  contentEditableNodes.forEach(function addEditable(node) { fillableNodes.add(node); });
  customControlNodes.forEach(function addCustom(node) { fillableNodes.add(node); });

  const labels = Array.from(document.querySelectorAll("label"))
    .map(function mapLabel(node) { return String(node.textContent || "").trim(); })
    .filter(Boolean);
  const inputSignals = fillableInputs.map(function mapInput(input) {
    return [
      String(input.getAttribute("aria-label") || ""),
      String(input.getAttribute("placeholder") || ""),
      String(input.getAttribute("name") || ""),
      String(input.id || "")
    ].join(" ");
  });
  const textareaSignals = textareas.map(function mapTextarea(node) {
    return [
      String(node.getAttribute("aria-label") || ""),
      String(node.getAttribute("placeholder") || ""),
      String(node.getAttribute("name") || ""),
      String(node.id || "")
    ].join(" ");
  });
  const selectSignals = selects.map(function mapSelect(node) {
    return [
      String(node.getAttribute("aria-label") || ""),
      String(node.getAttribute("name") || ""),
      String(node.id || "")
    ].join(" ");
  });
  const formSignals = forms
    .map(function mapFormText(formNode) {
      return String(formNode.textContent || "").replace(/\s+/g, " ").trim().slice(0, 2000);
    })
    .filter(Boolean);
  const keywordSourceText = labels.concat(inputSignals, textareaSignals, selectSignals, formSignals).join("\n");
  const matchedKeywords = findKeywordMatches(keywordSourceText);

  const dialogs = Array.from(document.querySelectorAll("[role=\"dialog\"],[role=\"alertdialog\"],dialog"));
  const hasModal = dialogs.some(function hasVisibleDialog(dialogNode) {
    try {
      const style = window.getComputedStyle(dialogNode);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  });

  const iframes = Array.from(document.querySelectorAll("iframe"));
  const hasIframe = iframes.some(function hasVisibleIframe(frameNode) {
    const src = String(frameNode.getAttribute("src") || "");
    if (!src || src.startsWith("javascript:") || src === "about:blank" || src.startsWith("#")) {
      return false;
    }
    try {
      const style = window.getComputedStyle(frameNode);
      return style.display !== "none" && style.visibility !== "hidden" && frameNode.offsetWidth > 100 && frameNode.offsetHeight > 100;
    } catch {
      return false;
    }
  });

  return {
    url: window.location.href,
    pageTitle: document.title || "",
    fillableFieldCount: fillableNodes.size,
    formElementCount: forms.length,
    inputCount: fillableInputs.length,
    textareaCount: textareas.length,
    selectCount: selects.length,
    fileInputCount: fileInputs.length,
    radioGroupCount: collectGroupedFieldCount(radioInputs, "name"),
    checkboxGroupCount: collectGroupedFieldCount(checkboxInputs, "name"),
    contentEditableCount: contentEditableNodes.length,
    customControlCount: customControlNodes.length,
    matchedKeywords: matchedKeywords,
    matchedLabels: matchedKeywords,
    hasModal: hasModal,
    hasIframe: hasIframe
  };
}

function detectApplicationForm() {
  const context = collectApplicationFormContext();
  const hasApplicationKeyword = context.matchedKeywords.length > 0;
  const hasMeaningfulFields = context.fillableFieldCount >= 3
    || (context.fillableFieldCount >= 2 && (context.fileInputCount > 0 || context.radioGroupCount > 0 || context.checkboxGroupCount > 0));
  const hasApplicationStructure = context.formElementCount > 0 || context.radioGroupCount > 0 || context.checkboxGroupCount > 0;

  let opened = false;
  let reason = "not_detected";
  if (context.hasModal && (hasMeaningfulFields || hasApplicationKeyword || hasApplicationStructure)) {
    opened = true;
    reason = "dialog_with_application_form";
  } else if (context.hasIframe && (hasMeaningfulFields || hasApplicationKeyword)) {
    opened = true;
    reason = "application_iframe";
  } else if (hasMeaningfulFields && (hasApplicationKeyword || hasApplicationStructure || context.fileInputCount > 0)) {
    opened = true;
    reason = "application_fields_and_labels";
  } else if (hasApplicationKeyword && context.fillableFieldCount >= 2) {
    opened = true;
    reason = "application_keywords_with_fields";
  } else if (context.fileInputCount > 0 && (context.fillableFieldCount >= 1 || hasApplicationKeyword)) {
    opened = true;
    reason = "resume_upload_section_detected";
  }

  return {
    ...context,
    opened: opened,
    reason: reason,
    keywordCandidates: APPLICATION_KEYWORDS.slice()
  };
}

function getClickableText(element) {
  return String(element.textContent || element.value || element.getAttribute("aria-label") || "")
    .trim()
    .replace(/\s+/g, " ")
    .substring(0, 120);
}

function isVisibleCandidate(element) {
  if (!element || !(element instanceof Element)) {
    return false;
  }

  try {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
  } catch {}

  try {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
  } catch {
    return Boolean(element.offsetParent);
  }

  return true;
}

function getCandidateHref(element) {
  return String(element.getAttribute("href") || (element instanceof HTMLAnchorElement ? element.href : "") || "");
}

function isDisabledCandidate(element) {
  return Boolean(
    element.disabled ||
    element.getAttribute("disabled") !== null ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function computeCandidateSafetyStatus(checkText) {
  if (TESTER_FORBIDDEN_RE.test(checkText)) {
    return { safetyStatus: "forbidden", safetyReason: "matches forbidden final-submit terms" };
  }
  if (APPLY_SKIP_TEXT.test(checkText)) {
    return { safetyStatus: "skipped", safetyReason: "matches general non-apply action filter" };
  }
  if (TESTER_ALLOWED_RE.test(checkText)) {
    return { safetyStatus: "allowed", safetyReason: "matches allowed apply entry terms" };
  }
  return { safetyStatus: "neutral", safetyReason: "no matched term" };
}

function computeApplyCandidateScore(meta) {
  const tagName = String(meta.tagName || "").toLowerCase();
  const text = String(meta.text || "");
  const ariaLabel = String(meta.ariaLabel || "");
  const href = String(meta.href || "");
  const roleAttr = String(meta.role || "").toLowerCase();
  const dataTestId = String(meta.dataTestId || "").toLowerCase();
  const classNameLower = String(meta.className || "").toLowerCase();
  const visible = Boolean(meta.visible);
  const disabled = Boolean(meta.disabled);
  const checkText = (text + " " + ariaLabel).trim();
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  const effectiveRole = roleAttr || tagName;
  const safety = computeCandidateSafetyStatus(checkText);

  let score = 0;

  if (dataTestId === "apply-button") { score += 120; }
  if (normalizedText === "apply now") { score += 100; }
  if (effectiveRole === "link" || effectiveRole === "button") { score += 40; }
  if (classNameLower.includes("apply")) { score += 20; }
  if (safety.safetyStatus === "allowed") { score += 3; }
  if (safety.safetyStatus === "forbidden") { score -= 5; }
  if (safety.safetyStatus === "skipped") { score -= 2; }
  if (tagName === "a" || tagName === "button") { score += 1; }
  if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !href.startsWith("mailto:") && !href.startsWith("tel:")) { score += 1; }
  if (visible) { score += 1; }
  if (!disabled) { score += 1; }

  return {
    score: score,
    safetyStatus: safety.safetyStatus,
    safetyReason: safety.safetyReason
  };
}

function getCandidateSelector(el) {
  const tag = el.tagName.toLowerCase();
  const dt = el.getAttribute("data-test-id");
  if (dt) { return tag + "[data-test-id=\"" + dt + "\"]"; }
  if (el.id) { return tag + "#" + el.id; }
  return tag;
}

function collectApplyClickableElements() {
  const seen = new Set();
  const elements = [];

  function addElement(input) {
    if (!(input instanceof Element) || seen.has(input)) {
      return;
    }
    seen.add(input);
    elements.push(input);
  }

  const selectors = [APPLY_CLICKABLE_SELECTOR].concat(APPLY_PRIORITY_SELECTORS);
  for (let i = 0; i < selectors.length; i += 1) {
    const found = Array.from(document.querySelectorAll(selectors[i]));
    for (let idx = 0; idx < found.length; idx += 1) {
      addElement(found[idx]);
    }
  }

  const spans = Array.from(document.querySelectorAll(APPLY_NOW_SPAN_SELECTOR));
  for (let spanIndex = 0; spanIndex < spans.length; spanIndex += 1) {
    const span = spans[spanIndex];
    if (!APPLY_NOW_TEXT_RE.test(getClickableText(span))) {
      continue;
    }
    const button = span.closest("button");
    if (button) {
      addElement(button);
    }
  }

  return elements;
}

function collectApplyCandidatesInternal(maxCandidates) {
  const allClickable = collectApplyClickableElements();
  const candidates = [];

  for (let domIndex = 0; domIndex < allClickable.length; domIndex += 1) {
    const element = allClickable[domIndex];
    const tagName = element.tagName.toLowerCase();
    const text = getClickableText(element);
    if (!text || text.length < 2) {
      continue;
    }

    const ariaLabel = String(element.getAttribute("aria-label") || "").substring(0, 80);
    const id = String(element.id || "").substring(0, 60);
    const name = String(element.getAttribute("name") || "").substring(0, 60);
    const className = String(typeof element.className === "string" ? element.className : "").replace(/\s+/g, " ").substring(0, 120);
    const href = getCandidateHref(element);
    const role = String(element.getAttribute("role") || tagName).toLowerCase();
    const visible = isVisibleCandidate(element);
    const disabled = isDisabledCandidate(element);
    const dataTestId = String(element.getAttribute("data-test-id") || "");
    const selector = getCandidateSelector(element);
    const r = element.getBoundingClientRect();
    const rect = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    const scoreData = computeApplyCandidateScore({
      tagName: tagName,
      text: text,
      ariaLabel: ariaLabel,
      href: href,
      role: role,
      dataTestId: dataTestId,
      className: className,
      visible: visible,
      disabled: disabled
    });

    candidates.push({
      candidateIndex: candidates.length,
      domIndex: domIndex,
      tagName: tagName,
      text: text,
      ariaLabel: ariaLabel,
      id: id,
      name: name,
      className: className,
      href: href,
      role: role,
      dataTestId: dataTestId,
      selector: selector,
      visible: visible,
      disabled: disabled,
      rect: rect,
      score: scoreData.score,
      safetyStatus: scoreData.safetyStatus,
      safetyReason: scoreData.safetyReason,
      element: element
    });
  }

  candidates.sort(function byScore(a, b) {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.domIndex - b.domIndex;
  });
  candidates.forEach(function reindex(candidate, index) {
    candidate.candidateIndex = index;
  });

  if (typeof maxCandidates === "number" && maxCandidates > 0 && candidates.length > maxCandidates) {
    const truncated = candidates.slice(0, maxCandidates);
    truncated.forEach(function reindexTruncated(candidate, index) {
      candidate.candidateIndex = index;
    });
    return truncated;
  }

  return candidates;
}

function collectApplyCandidates() {
  const ranked = collectApplyCandidatesInternal(120);
  const candidates = [];

  for (let index = 0; index < ranked.length; index += 1) {
    const item = ranked[index];
    if (!item.visible || item.disabled) {
      continue;
    }
    if (APPLY_SKIP_TEXT.test(item.text)) {
      continue;
    }

    candidates.push({
      ...item,
      candidateIndex: candidates.length
    });

    if (candidates.length >= 60) {
      break;
    }
  }

  return candidates;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[content] onMessage", message, {
    fromId: sender?.id
  });

  if (message?.type === MESSAGE_TYPES.PING) {
    sendResponse(ok({ message: "content script alive" }));
    return;
  }

  if (message?.type === MESSAGE_TYPES.PREPARE_APPLICATION) {
    console.log("[Stage6][SF-HSBC] message received", {
      url: window.location.href
    });

    const applyRuntime = resolveApplyRuntime();
    if (!applyRuntime || typeof applyRuntime.runPrepareOnlyApplyFlow !== "function") {
      console.error("[Stage6][SF-HSBC] runtime unavailable", {
        hasStage6ApplyRuntime: Boolean(globalThis.Stage6ApplyRuntime),
        runtimeKeys: globalThis.Stage6ApplyRuntime ? Object.keys(globalThis.Stage6ApplyRuntime) : []
      });
      sendResponse(
        fail("Apply runtime is unavailable", ERROR_CODES.UNSUPPORTED_MESSAGE)
      );
      return;
    }

    console.log("[Stage6][SF-HSBC] runtime ready", {
      url: window.location.href
    });

    (async () => {
      try {
        const result = await applyRuntime.runPrepareOnlyApplyFlow();
        sendResponse(ok(result));
      } catch (error) {
        console.error("[content] prepare application failed", error);
        sendResponse(
          fail(error, ERROR_CODES.READ_PAGE_FAILED)
        );
      }
    })();
    return true;
  }

  if (message?.type === MESSAGE_TYPES.COLLECT_APPLY_CANDIDATES) {
    try {
      const candidates = collectApplyCandidates().map(function project(item) {
        return {
          index: item.candidateIndex,
          text: item.text,
          href: item.href,
          tagName: item.tagName,
          role: item.role,
          dataTestId: item.dataTestId || "",
          selector: item.selector || "",
          visible: Boolean(item.visible),
          disabled: Boolean(item.disabled),
          score: Number(item.score) || 0
        };
      });
      sendResponse(ok({ candidates: candidates }));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type === MESSAGE_TYPES.CLICK_APPLY_CANDIDATE) {
    try {
      const data = message.data && typeof message.data === "object" ? message.data : {};
      const targetIndex = typeof data.candidateIndex === "number" ? data.candidateIndex : -1;
      const targetText = String(data.buttonText || "").trim().toLowerCase();
      const candidates = collectApplyCandidates();
      let selectedCandidate = null;

      if (targetIndex >= 0 && targetIndex < candidates.length) {
        selectedCandidate = candidates[targetIndex];
      }

      if (!selectedCandidate && targetText) {
        selectedCandidate = candidates.find(function findByText(candidate) {
          return String(candidate.text || "").toLowerCase().includes(targetText);
        }) || null;
      }

      // Direct fallback: look for the explicit apply-button before giving up
      if (!selectedCandidate) {
        const dtEl = document.querySelector("button[data-test-id=\"apply-button\"],[data-test-id=\"apply-button\"]");
        if (dtEl) {
          const dtText = getClickableText(dtEl);
          if (dtText && !APPLY_SKIP_TEXT.test(dtText)) {
            const dtHref = getCandidateHref(dtEl);
            try { dtEl.scrollIntoView({ block: "center", inline: "center" }); } catch {}
            try { dtEl.focus(); } catch {}
            ["mouseover", "mousedown", "mouseup", "click"].forEach(function dispatchEvDt(type) {
              try { dtEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch {}
            });
            try { dtEl.click(); } catch {}
            sendResponse(ok({ clicked: true, href: dtHref }));
            return;
          }
        }
        sendResponse(fail("Candidate element not found", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }

      if (APPLY_SKIP_TEXT.test(selectedCandidate.text)) {
        sendResponse(fail("Unsafe apply target rejected", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }

      const el = selectedCandidate.element instanceof Element
        ? selectedCandidate.element
        : (selectedCandidate.selector ? document.querySelector(selectedCandidate.selector) : null);
      if (!el) {
        sendResponse(fail("Candidate element is no longer available", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }

      const href = getCandidateHref(el);

      try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
      try { el.focus(); } catch {}
      ["mouseover", "mousedown", "mouseup", "click"].forEach(function dispatchEv(type) {
        try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch {}
      });
      try { el.click(); } catch {}

      sendResponse(ok({ clicked: true, href: href }));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type === MESSAGE_TYPES.GET_CANDIDATE_RECT) {
    try {
      const data = message.data && typeof message.data === "object" ? message.data : {};
      const targetIndex = typeof data.candidateIndex === "number" ? data.candidateIndex : -1;
      const targetText = String(data.buttonText || "").trim().toLowerCase();
      const candidates = collectApplyCandidates();
      let selectedCandidate = null;

      if (targetIndex >= 0 && targetIndex < candidates.length) {
        selectedCandidate = candidates[targetIndex];
      }
      if (!selectedCandidate && targetText) {
        selectedCandidate = candidates.find(function findByText(c) {
          return String(c.text || "").toLowerCase().includes(targetText);
        }) || null;
      }
      if (!selectedCandidate) {
        const dtEl = document.querySelector("button[data-test-id=\"apply-button\"],[data-test-id=\"apply-button\"]");
        if (dtEl && !APPLY_SKIP_TEXT.test(getClickableText(dtEl))) {
          try { dtEl.scrollIntoView({ block: "center", inline: "center" }); } catch {}
          const dr = dtEl.getBoundingClientRect();
          sendResponse(ok({ rect: { left: dr.left, top: dr.top, width: dr.width, height: dr.height } }));
          return;
        }
        sendResponse(fail("Candidate not found for rect", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }
      if (APPLY_SKIP_TEXT.test(selectedCandidate.text)) {
        sendResponse(fail("Unsafe candidate rejected for rect", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }

      const el = selectedCandidate.element instanceof Element
        ? selectedCandidate.element
        : (selectedCandidate.selector ? document.querySelector(selectedCandidate.selector) : null);
      if (!el) {
        sendResponse(fail("Candidate element unavailable for rect", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }

      try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
      const r = el.getBoundingClientRect();
      sendResponse(ok({ rect: { left: r.left, top: r.top, width: r.width, height: r.height } }));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type === MESSAGE_TYPES.SCAN_APPLY_CANDIDATES_FULL) {
    try {
      const context = collectApplicationFormContext();
      const candidates = collectApplyCandidatesInternal(80).map(function stripElement(candidate) {
        return {
          candidateIndex: candidate.candidateIndex,
          domIndex: candidate.domIndex,
          tagName: candidate.tagName,
          text: candidate.text,
          ariaLabel: candidate.ariaLabel,
          id: candidate.id,
          name: candidate.name,
          className: candidate.className,
          href: candidate.href,
          role: candidate.role,
          dataTestId: candidate.dataTestId,
          selector: candidate.selector,
          visible: candidate.visible,
          disabled: candidate.disabled,
          rect: candidate.rect,
          score: candidate.score,
          safetyStatus: candidate.safetyStatus,
          safetyReason: candidate.safetyReason
        };
      });

      sendResponse(ok({
        candidates: candidates,
        pageContext: {
          ...context
        }
      }));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type === MESSAGE_TYPES.GET_PAGE_CONTEXT) {
    try {
      sendResponse(ok(collectApplicationFormContext()));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type === MESSAGE_TYPES.TESTER_CLICK_ELEMENT) {
    try {
      const data = message.data && typeof message.data === "object" ? message.data : {};
      const candidateIndex = typeof data.candidateIndex === "number" ? data.candidateIndex : -1;
      const domIndex = typeof data.domIndex === "number" ? data.domIndex : -1;
      const candidates = collectApplyCandidatesInternal(120);
      let selected = null;
      if (candidateIndex >= 0 && candidateIndex < candidates.length) {
        selected = candidates[candidateIndex];
      }
      if (!selected && domIndex >= 0) {
        selected = candidates.find(function byDomIndex(candidate) {
          return candidate.domIndex === domIndex;
        }) || null;
      }
      const el = selected && selected.element instanceof Element ? selected.element : null;
      if (!el) {
        sendResponse(fail("Element not found for tester candidate", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }
      const text = getClickableText(el);
      if (TESTER_FORBIDDEN_RE.test(text)) {
        sendResponse(fail("Unsafe element rejected: matches forbidden final-submit terms", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }
      const href = getCandidateHref(el);
      try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
      try { el.focus(); } catch {}
      ["mouseover", "mousedown", "mouseup", "click"].forEach(function dispatchEv(type) {
        try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch {}
      });
      try { el.click(); } catch {}
      sendResponse(ok({ clicked: true, href: href }));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type === MESSAGE_TYPES.TESTER_GET_ELEMENT_RECT) {
    try {
      const data = message.data && typeof message.data === "object" ? message.data : {};
      const candidateIndex = typeof data.candidateIndex === "number" ? data.candidateIndex : -1;
      const domIndex = typeof data.domIndex === "number" ? data.domIndex : -1;
      const candidates = collectApplyCandidatesInternal(120);
      let selected = null;
      if (candidateIndex >= 0 && candidateIndex < candidates.length) {
        selected = candidates[candidateIndex];
      }
      if (!selected && domIndex >= 0) {
        selected = candidates.find(function byDomIndex(candidate) {
          return candidate.domIndex === domIndex;
        }) || null;
      }
      const el = selected && selected.element instanceof Element ? selected.element : null;
      if (!el) {
        sendResponse(fail("Element not found for tester candidate rect", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }
      const text = getClickableText(el);
      if (TESTER_FORBIDDEN_RE.test(text)) {
        sendResponse(fail("Unsafe element rejected: matches forbidden final-submit terms", ERROR_CODES.READ_PAGE_FAILED));
        return;
      }
      try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
      const r = el.getBoundingClientRect();
      sendResponse(ok({ rect: { left: r.left, top: r.top, width: r.width, height: r.height } }));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type === MESSAGE_TYPES.DETECT_APPLICATION_FORM) {
    try {
      sendResponse(ok(detectApplicationForm()));
    } catch (error) {
      sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
    }
    return;
  }

  if (message?.type !== MESSAGE_TYPES.READ_PAGE_CONTENT) {
    sendResponse(
      fail(
        `Unsupported message type: ${String(message?.type || "undefined")}`,
        ERROR_CODES.UNSUPPORTED_MESSAGE
      )
    );
    return;
  }

  try {
    sendResponse(buildPageSnapshot());
  } catch (error) {
    console.error("[content] failed to build page snapshot", error);
    sendResponse(fail(error, ERROR_CODES.READ_PAGE_FAILED));
  }
});
