(function attachStage3Shared(global) {
  "use strict";

  /**
   * @typedef {Object} PageSnapshot
   * @property {string} url
   * @property {string} title
   * @property {string} extractedAt
   * @property {string} pageText
   * @property {string} hostname
   * @property {string} pathname
   * @property {string=} htmlLang
   * @property {{ canonicalUrl?: string, ogTitle?: string, ogDescription?: string }=} metadata
   * @property {{ probableSiteType?: "greenhouse" | "lever" | "workday" | "generic" | "unknown" }=} hints
   */

  /**
   * @template T
   * @typedef {{ ok: true, data: T }} OkResponse
   */

  /**
   * @typedef {{ ok: false, error: string, code?: string }} ErrorResponse
   */

  /**
   * @template T
   * @typedef {OkResponse<T> | ErrorResponse} ProtocolResponse
   */

  const MESSAGE_TYPES = Object.freeze({
    EXTRACT_CURRENT_PAGE: "EXTRACT_CURRENT_PAGE",
    READ_PAGE_CONTENT: "READ_PAGE_CONTENT",
    PREPARE_APPLICATION: "PREPARE_APPLICATION",
    PING: "PING"
  });

  const ERROR_CODES = Object.freeze({
    UNSUPPORTED_MESSAGE: "UNSUPPORTED_MESSAGE",
    TAB_QUERY_FAILED: "TAB_QUERY_FAILED",
    NO_ACTIVE_TAB: "NO_ACTIVE_TAB",
    NO_TAB_ID: "NO_TAB_ID",
    SEND_MESSAGE_FAILED: "SEND_MESSAGE_FAILED",
    CONTENT_NO_RESPONSE: "CONTENT_NO_RESPONSE",
    CONTENT_READ_FAILED: "CONTENT_READ_FAILED",
    BODY_MISSING: "BODY_MISSING",
    READ_PAGE_FAILED: "READ_PAGE_FAILED",
    STORAGE_SAVE_FAILED: "STORAGE_SAVE_FAILED",
    STORAGE_LOAD_FAILED: "STORAGE_LOAD_FAILED"
  });

  function normalizeErrorMessage(error) {
    if (typeof error === "string" && error.trim()) {
      return error;
    }

    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }

    return "Unknown error";
  }

  function ok(data) {
    return { ok: true, data: data };
  }

  function fail(error, code) {
    const payload = { ok: false, error: normalizeErrorMessage(error) };

    if (typeof code === "string" && code.trim()) {
      payload.code = code;
    }

    return payload;
  }

  global.Stage3Shared = Object.freeze({
    MESSAGE_TYPES: MESSAGE_TYPES,
    ERROR_CODES: ERROR_CODES,
    ok: ok,
    fail: fail
  });
})(globalThis);
