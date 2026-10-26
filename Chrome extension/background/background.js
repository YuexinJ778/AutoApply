importScripts("../lib/types.js", "../lib/jobParser.js", "../storage/localStore.js");

const shared = globalThis.Stage3Shared;
const parser = globalThis.Stage4JobParser;
const storage = globalThis.Stage3Storage;
const { MESSAGE_TYPES, ERROR_CODES, ok, fail } = shared;

const EXTRA_ERROR_CODES = Object.freeze({
  RESTRICTED_PAGE: "RESTRICTED_PAGE",
  CONTENT_SCRIPT_INJECTION_FAILED: "CONTENT_SCRIPT_INJECTION_FAILED",
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  PARSER_UNAVAILABLE: "PARSER_UNAVAILABLE",
  PARSE_FAILED: "PARSE_FAILED"
});

function buildError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error.error === "string" && error.error.trim()) {
    return error.error;
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // ignore serialization errors
  }

  return String(error);
}

function getErrorCode(error, fallbackCode) {
  if (error && typeof error.code === "string" && error.code.trim()) {
    return error.code;
  }

  return fallbackCode;
}

function isRestrictedPageUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    const restrictedProtocols = new Set([
      "chrome:",
      "chrome-extension:",
      "edge:",
      "about:",
      "devtools:",
      "brave:",
      "opera:",
      "vivaldi:"
    ]);

    return restrictedProtocols.has(parsedUrl.protocol);
  } catch {
    return true;
  }
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(buildError(chrome.runtime.lastError.message, ERROR_CODES.TAB_QUERY_FAILED));
        return;
      }

      resolve(tabs || []);
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(buildError(chrome.runtime.lastError.message, ERROR_CODES.SEND_MESSAGE_FAILED));
        return;
      }

      resolve(response);
    });
  });
}

function injectContentScripts(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: ["lib/types.js", "utils/extractVisibleText.js", "content/content.js"]
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(
            buildError(
              chrome.runtime.lastError.message,
              EXTRA_ERROR_CODES.CONTENT_SCRIPT_INJECTION_FAILED
            )
          );
          return;
        }

        resolve();
      }
    );
  });
}

async function requestPageContentFromTab(tabId) {
  try {
    return await sendMessageToTab(tabId, { type: MESSAGE_TYPES.READ_PAGE_CONTENT });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    if (!errorMessage.includes("Receiving end does not exist")) {
      throw error;
    }

    await injectContentScripts(tabId);
    return await sendMessageToTab(tabId, { type: MESSAGE_TYPES.READ_PAGE_CONTENT });
  }
}

async function saveArtifacts(pageSnapshot, jobPosting) {
  if (typeof storage.saveParserArtifacts === "function") {
    await storage.saveParserArtifacts(pageSnapshot, jobPosting);
    return;
  }

  if (typeof storage.savePageSnapshot === "function") {
    await storage.savePageSnapshot(pageSnapshot);
  } else if (typeof storage.saveLastPageSnapshot === "function") {
    await storage.saveLastPageSnapshot(pageSnapshot);
  }

  if (typeof storage.saveJobPosting === "function") {
    await storage.saveJobPosting(jobPosting);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[background] service worker installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[background] onMessage", message, {
    tabId: sender?.tab?.id,
    url: sender?.tab?.url
  });

  if (message?.type === MESSAGE_TYPES.PING) {
    sendResponse(ok({ message: "background alive", parserLoaded: !!parser }));
    return;
  }

  if (message?.type !== MESSAGE_TYPES.EXTRACT_CURRENT_PAGE) {
    sendResponse(
      fail(
        `Unsupported message type: ${String(message?.type || "undefined")}`,
        ERROR_CODES.UNSUPPORTED_MESSAGE
      )
    );
    return;
  }

  if (!storage || typeof storage.getLastPageSnapshot !== "function") {
    sendResponse(fail("Storage module is unavailable", ERROR_CODES.STORAGE_SAVE_FAILED));
    return;
  }

  if (!parser || typeof parser.parseJobPosting !== "function") {
    sendResponse(fail("Parser module is unavailable", EXTRA_ERROR_CODES.PARSER_UNAVAILABLE));
    return;
  }

  (async () => {
    try {
      const tabs = await queryActiveTab();
      const activeTab = tabs[0];

      if (!activeTab) {
        sendResponse(fail("No active tab found", ERROR_CODES.NO_ACTIVE_TAB));
        return;
      }

      if (typeof activeTab.id !== "number") {
        sendResponse(fail("Active tab id is missing", ERROR_CODES.NO_TAB_ID));
        return;
      }

      if (isRestrictedPageUrl(activeTab.url)) {
        sendResponse(
          fail(
            `Cannot extract from restricted page: ${activeTab.url || "unknown URL"}`,
            EXTRA_ERROR_CODES.RESTRICTED_PAGE
          )
        );
        return;
      }

      const contentResponse = await requestPageContentFromTab(activeTab.id);

      if (!contentResponse) {
        sendResponse(fail("Content script did not respond", ERROR_CODES.CONTENT_NO_RESPONSE));
        return;
      }

      if (!contentResponse.ok) {
        sendResponse(
          fail(
            getErrorMessage(contentResponse.error || contentResponse),
            contentResponse.code || ERROR_CODES.CONTENT_READ_FAILED
          )
        );
        return;
      }

      const pageSnapshot = contentResponse.data;
      let jobPosting;

      try {
        jobPosting = parser.parseJobPosting(pageSnapshot);
      } catch (parseError) {
        console.error("[background] parser failed", parseError);
        sendResponse(
          fail(
            `Failed to parse job posting: ${getErrorMessage(parseError)}`,
            EXTRA_ERROR_CODES.PARSE_FAILED
          )
        );
        return;
      }

      try {
        await saveArtifacts(pageSnapshot, jobPosting);
      } catch (storageError) {
        console.error("[background] failed to save artifacts", storageError);
        sendResponse(
          fail(
            `Failed to save artifacts: ${getErrorMessage(storageError)}`,
            ERROR_CODES.STORAGE_SAVE_FAILED
          )
        );
        return;
      }

      sendResponse(
        ok({
          pageSnapshot: pageSnapshot,
          jobPosting: jobPosting
        })
      );
    } catch (error) {
      console.error("[background] extract flow failed", error);
      const messageText = getErrorMessage(error);
      const code = getErrorCode(error, ERROR_CODES.SEND_MESSAGE_FAILED);
      sendResponse(fail(messageText, code));
    }
  })();

  return true;
});
