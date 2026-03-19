(function () {
  const DEFAULT_SOURCE = "\\documentclass{article}\n\\begin{document}\nHello Resume\n\\end{document}";
  const TEXLIVE_ENDPOINT = "/engine/texlive/";
  const LOCAL_TEX_RESOURCES = [
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/article.cls",
      aliases: ["article.cls", "tex/latex/base/article.cls", "../tex/article.cls"]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/size10.clo",
      aliases: ["size10.clo", "tex/latex/base/size10.clo", "../tex/size10.clo"]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/ot1cmr.fd",
      aliases: [
        "ot1cmr.fd",
        "OT1cmr.fd",
        "tex/latex/base/ot1cmr.fd",
        "../tex/ot1cmr.fd"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/t1cmr.fd",
      aliases: [
        "t1cmr.fd",
        "T1cmr.fd",
        "tex/latex/base/t1cmr.fd",
        "../tex/t1cmr.fd"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/ts1cmr.fd",
      aliases: [
        "ts1cmr.fd",
        "TS1cmr.fd",
        "tex/latex/base/ts1cmr.fd",
        "../tex/ts1cmr.fd"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/omlcmr.fd",
      aliases: [
        "omlcmr.fd",
        "OMLcmr.fd",
        "tex/latex/base/omlcmr.fd",
        "../tex/omlcmr.fd"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/omscmr.fd",
      aliases: [
        "omscmr.fd",
        "OMScmr.fd",
        "tex/latex/base/omscmr.fd",
        "../tex/omscmr.fd"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/omxcmex.fd",
      aliases: [
        "omxcmex.fd",
        "OMXcmex.fd",
        "tex/latex/base/omxcmex.fd",
        "../tex/omxcmex.fd"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/ts1enc.def",
      aliases: ["ts1enc.def", "tex/latex/base/ts1enc.def", "../tex/ts1enc.def"]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/base/tuenc.def",
      aliases: ["tuenc.def", "tex/latex/base/tuenc.def", "../tex/tuenc.def"]
    },
    {
      source: "engine/texlive/xetexfontlist.txt",
      aliases: ["xetexfontlist.txt", "../tex/xetexfontlist.txt"]
    },
    {
      source: "engine/texlive/fonts/opentype/public/lm/lmroman10-regular.otf",
      aliases: [
        "lmroman10-regular.otf",
        "fonts/opentype/public/lm/lmroman10-regular.otf",
        "../tex/lmroman10-regular.otf"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/l3backend/l3backend-xdvipdfmx.def",
      aliases: [
        "l3backend-xdvipdfmx.def",
        "tex/latex/l3backend/l3backend-xdvipdfmx.def",
        "../tex/l3backend-xdvipdfmx.def"
      ]
    },
    {
      source: "engine/texlive/texmf-dist/tex/latex/l3backend/l3backend-dvipdfmx.def",
      aliases: [
        "l3backend-dvipdfmx.def",
        "tex/latex/l3backend/l3backend-dvipdfmx.def",
        "../tex/l3backend-dvipdfmx.def"
      ]
    }
  ];
  const LOCAL_DVIPDFMX_RESOURCES = [
    {
      source: "engine/texlive/fonts/opentype/public/lm/lmroman10-regular.otf",
      aliases: [
        "lmroman10-regular.otf",
        "fonts/opentype/public/lm/lmroman10-regular.otf",
        "../tex/lmroman10-regular.otf"
      ]
    },
    {
      source: "engine/texlive/fonts/map/pdftex/updmap/pdftex.map",
      aliases: ["pdftex.map", "fonts/map/pdftex/updmap/pdftex.map", "../tex/pdftex.map"]
    },
    {
      source: "engine/texlive/fonts/map/dvipdfmx/updmap/kanjix.map",
      aliases: ["kanjix.map", "fonts/map/dvipdfmx/updmap/kanjix.map", "../tex/kanjix.map"]
    },
    {
      source: "engine/texlive/fonts/map/dvipdfmx/ckx.map",
      aliases: ["ckx.map", "fonts/map/dvipdfmx/ckx.map", "../tex/ckx.map"]
    },
    {
      source: "engine/texlive/fonts/map/glyphlist/pdfglyphlist.txt",
      aliases: [
        "pdfglyphlist.txt",
        "fonts/map/glyphlist/pdfglyphlist.txt",
        "../tex/pdfglyphlist.txt"
      ]
    },
    {
      source: "engine/texlive/fonts/map/glyphlist/glyphlist.txt",
      aliases: [
        "glyphlist.txt",
        "fonts/map/glyphlist/glyphlist.txt",
        "../tex/glyphlist.txt"
      ]
    }
  ];

  const latexInput = document.getElementById("latexInput");
  const compileBtn = document.getElementById("compileBtn");
  const engineStatus = document.getElementById("engineStatus");
  const compileStatus = document.getElementById("compileStatus");
  const logsEl = document.getElementById("logs");
  const resultEl = document.getElementById("result");

  let xetexEngine = null;
  let dvipdfmxEngine = null;
  let xetexFormatBytes = null;
  let localTexResourceBytes = [];
  let localDvipdfmxResourceBytes = [];
  let isEngineReady = false;
  let currentBlobUrl = null;

  function setEngineStatus(message, cls) {
    engineStatus.className = "status" + (cls ? " " + cls : "");
    engineStatus.textContent = message;
  }

  function setCompileStatus(message, cls) {
    compileStatus.className = "status" + (cls ? " " + cls : "");
    compileStatus.textContent = message;
  }

  function setLogs(text) {
    logsEl.textContent = text && String(text).trim() ? String(text) : "No logs yet.";
  }

  function appendLogs(text) {
    const chunk = text == null ? "" : String(text).trim();
    if (!chunk) {
      return;
    }
    if (!logsEl.textContent || logsEl.textContent === "No logs yet.") {
      logsEl.textContent = chunk;
      return;
    }
    logsEl.textContent += "\n" + chunk;
  }

  function clearResult() {
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    resultEl.textContent = "No compilation result yet.";
  }

  function renderPdfResult(pdfBytes) {
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    currentBlobUrl = URL.createObjectURL(pdfBlob);

    const link = document.createElement("a");
    link.href = currentBlobUrl;
    link.download = "smoke-test.pdf";
    link.textContent = "Download PDF";

    const frame = document.createElement("iframe");
    frame.src = currentBlobUrl;
    frame.title = "LaTeX PDF Preview";

    resultEl.innerHTML = "";
    resultEl.appendChild(link);
    resultEl.appendChild(frame);
  }

  function formatStatus(status) {
    return typeof status === "number" ? String(status) : "unknown";
  }

  function formatLog(label, result) {
    const logText = result && result.log ? String(result.log) : "(no log output)";
    return "=== " + label + " ===\n" + logText;
  }

  function detectTexVersionHint(bytes) {
    if (!bytes || !bytes.length || typeof TextDecoder !== "function") {
      return null;
    }
    let text = "";
    try {
      const probe = bytes.subarray(0, Math.min(bytes.length, 4096));
      text = new TextDecoder("utf-8").decode(probe);
    } catch (_) {
      return null;
    }

    const bracketMatch = text.match(/\\Provides(?:Class|File)\s*\{[^}]+\}\s*\[([^\]]+)\]/m);
    if (bracketMatch && bracketMatch[1]) {
      return bracketMatch[1].replace(/\s+/g, " ").trim();
    }

    const explMatch = text.match(/\\ProvidesExplFile\s*\{[^}]+\}\s*\{([^}]+)\}/m);
    if (explMatch && explMatch[1]) {
      return explMatch[1].replace(/\s+/g, " ").trim();
    }

    return null;
  }

  function ensureMemFsFolderForFilePath(engine, path) {
    if (!engine || typeof engine.makeMemFSFolder !== "function") {
      return;
    }
    if (!path || path.indexOf("..") !== -1) {
      return;
    }
    const idx = path.lastIndexOf("/");
    if (idx <= 0) {
      return;
    }
    const dir = path.slice(0, idx);
    const parts = dir.split("/");
    let current = "";
    for (const part of parts) {
      if (!part || part === "." || part === "..") {
        continue;
      }
      current = current ? current + "/" + part : part;
      engine.makeMemFSFolder(current);
    }
  }

  async function loadLocalXetexFormat() {
    const resp = await fetch("engine/swiftlatexxetex.fmt");
    if (!resp.ok) {
      throw new Error("Unable to load local format file engine/swiftlatexxetex.fmt (HTTP " + resp.status + ")");
    }
    const raw = await resp.arrayBuffer();
    if (!raw || raw.byteLength === 0) {
      throw new Error("Local format file engine/swiftlatexxetex.fmt is empty.");
    }
    xetexFormatBytes = new Uint8Array(raw);
    appendLogs("Loaded local format: engine/swiftlatexxetex.fmt (" + raw.byteLength + " bytes)");
  }

  async function loadLocalTexResources() {
    const loaded = [];
    for (const resource of LOCAL_TEX_RESOURCES) {
      const resp = await fetch(resource.source);
      if (!resp.ok) {
        appendLogs("[debug] MISSING local TeX resource: " + resource.source + " (HTTP " + resp.status + ")");
        throw new Error("Unable to load local TeX resource " + resource.source + " (HTTP " + resp.status + ")");
      }
      const raw = await resp.arrayBuffer();
      if (!raw || raw.byteLength === 0) {
        throw new Error("Local TeX resource is empty: " + resource.source);
      }
      appendLogs("[debug] EXISTS local TeX resource: " + resource.source);
      const bytes = new Uint8Array(raw);
      const versionHint = detectTexVersionHint(bytes);
      loaded.push({
        source: resource.source,
        aliases: resource.aliases,
        bytes: bytes,
        versionHint: versionHint
      });
      appendLogs(
        "Loaded local TeX resource: " +
          resource.source +
          " (" +
          raw.byteLength +
          " bytes) -> aliases: " +
          resource.aliases.join(", ") +
          (versionHint ? " | version: " + versionHint : "")
      );
    }
    localTexResourceBytes = loaded;
  }

  async function loadLocalDvipdfmxResources() {
    const loaded = [];
    for (const resource of LOCAL_DVIPDFMX_RESOURCES) {
      const resp = await fetch(resource.source);
      if (!resp.ok) {
        appendLogs("[debug] MISSING local Dvipdfmx resource: " + resource.source + " (HTTP " + resp.status + ")");
        throw new Error("Unable to load local Dvipdfmx resource " + resource.source + " (HTTP " + resp.status + ")");
      }
      const raw = await resp.arrayBuffer();
      if (!raw || raw.byteLength === 0) {
        throw new Error("Local Dvipdfmx resource is empty: " + resource.source);
      }
      appendLogs("[debug] EXISTS local Dvipdfmx resource: " + resource.source);
      const bytes = new Uint8Array(raw);
      const versionHint = detectTexVersionHint(bytes);
      loaded.push({
        source: resource.source,
        aliases: resource.aliases,
        bytes: bytes,
        versionHint: versionHint
      });
      appendLogs(
        "Loaded local Dvipdfmx resource: " +
          resource.source +
          " (" +
          raw.byteLength +
          " bytes) -> aliases: " +
          resource.aliases.join(", ") +
          (versionHint ? " | version: " + versionHint : "")
      );
    }
    localDvipdfmxResourceBytes = loaded;
  }

  async function initializeEngine() {
    setEngineStatus("Initializing", "warn");
    setCompileStatus("Idle", "");
    setLogs("Engine initialization started...");
    appendLogs("[debug] Worker texlive endpoint configured in engine: " + TEXLIVE_ENDPOINT);
    appendLogs("[debug] XeTeX and Dvipdfmx run in separate worker runtimes (each has its own /work and /tex).");
    appendLogs("[debug] Dvipdfmx fallback kpse endpoint pattern: " + TEXLIVE_ENDPOINT + "xetex/<format>/<filename>");

    try {
      if (typeof window.XeTeXEngine !== "function") {
        throw new Error("Missing engine hook: window.XeTeXEngine (engine/XeTeXEngine.js)");
      }
      if (typeof window.DvipdfmxEngine !== "function") {
        throw new Error("Missing engine hook: window.DvipdfmxEngine (engine/DvipdfmxEngine.js)");
      }

      xetexEngine = new window.XeTeXEngine();
      dvipdfmxEngine = new window.DvipdfmxEngine();

      await xetexEngine.loadEngine();
      await dvipdfmxEngine.loadEngine();
      await loadLocalXetexFormat();
      await loadLocalTexResources();
      await loadLocalDvipdfmxResources();

      isEngineReady = true;
      setEngineStatus("Ready", "ok");
      appendLogs("Engine initialization complete.");
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      isEngineReady = false;
      setEngineStatus("Failed: " + message, "err");
      appendLogs("Engine initialization failed: " + message);
    }
  }

  async function runCompile() {
    clearResult();
    setLogs("");
    setCompileStatus("Running...", "warn");

    if (!isEngineReady || !xetexEngine || !dvipdfmxEngine) {
      setCompileStatus("Failed: engine not ready.", "err");
      appendLogs("Compile blocked because engine status is not Ready.");
      return;
    }

    try {
      const source = latexInput.value && latexInput.value.trim() ? latexInput.value : DEFAULT_SOURCE;
      if (!xetexFormatBytes) {
        throw new Error("Local format file not loaded in memory.");
      }
      if (!localTexResourceBytes.length) {
        throw new Error("Local TeX resource bundle not loaded in memory.");
      }

      xetexEngine.writeMemFSFile("swiftlatexxetex.fmt", xetexFormatBytes);
      for (const resource of localTexResourceBytes) {
        for (const alias of resource.aliases) {
          ensureMemFsFolderForFilePath(xetexEngine, alias);
          xetexEngine.writeMemFSFile(alias, resource.bytes);
        }
      }
      appendLogs(
        "[debug] Injected " +
          localTexResourceBytes.length +
          " local resources into XeTeX memfs before compile."
      );
      for (const resource of localTexResourceBytes) {
        appendLogs(
          "[debug] Injected resource: " +
            resource.source +
            (resource.versionHint ? " | version: " + resource.versionHint : "")
        );
      }
      xetexEngine.writeMemFSFile("main.tex", source);
      xetexEngine.setEngineMainFile("main.tex");
      const xetexResult = await xetexEngine.compileLaTeX();
      appendLogs(formatLog("XeTeX", xetexResult));
      if (xetexResult && xetexResult.log && xetexResult.log.indexOf("l3backend-xdvipdfmx.def") !== -1) {
        appendLogs("[debug] XeTeX log confirms runtime attempted to resolve l3backend-xdvipdfmx.def.");
      }

      if (!xetexResult || xetexResult.status !== 0 || !xetexResult.pdf) {
        throw new Error("XeTeX compile failed (status " + formatStatus(xetexResult && xetexResult.status) + ").");
      }

      if (!localDvipdfmxResourceBytes.length) {
        throw new Error("Local Dvipdfmx resource bundle not loaded in memory.");
      }

      appendLogs("[debug] Dvipdfmx runtime working dir: /work");
      appendLogs("[debug] Dvipdfmx runtime tex cache dir: /tex");
      for (const resource of localDvipdfmxResourceBytes) {
        for (const alias of resource.aliases) {
          ensureMemFsFolderForFilePath(dvipdfmxEngine, alias);
          dvipdfmxEngine.writeMemFSFile(alias, resource.bytes);
        }
      }
      appendLogs(
        "[debug] Injected " +
          localDvipdfmxResourceBytes.length +
          " local resources into Dvipdfmx memfs before compile."
      );
      for (const resource of localDvipdfmxResourceBytes) {
        appendLogs(
          "[debug] Injected Dvipdfmx resource: " +
            resource.source +
            (resource.versionHint ? " | version: " + resource.versionHint : "")
        );
      }

      dvipdfmxEngine.writeMemFSFile("main.xdv", xetexResult.pdf);
      dvipdfmxEngine.setEngineMainFile("main.xdv");
      const pdfResult = await dvipdfmxEngine.compilePDF();
      appendLogs(formatLog("Dvipdfmx", pdfResult));

      if (!pdfResult || pdfResult.status !== 0 || !pdfResult.pdf) {
        throw new Error("Dvipdfmx conversion failed (status " + formatStatus(pdfResult && pdfResult.status) + ").");
      }

      renderPdfResult(pdfResult.pdf);
      setCompileStatus("Success: PDF produced.", "ok");
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setCompileStatus("Failed: " + message, "err");
      appendLogs("Error: " + message);
      if (message.indexOf("l3backend-xdvipdfmx.def") !== -1) {
        appendLogs("[debug] Failure still references l3backend-xdvipdfmx.def after local preload.");
      }
      resultEl.textContent = "Compilation failed. See logs above.";
    }
  }

  compileBtn.addEventListener("click", runCompile);
  initializeEngine();
})();
