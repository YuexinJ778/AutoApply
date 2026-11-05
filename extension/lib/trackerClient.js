(function attachTrackerClient(global) {
  "use strict";

  const DEFAULT_URL = "http://127.0.0.1:8765";
  const TIMEOUT_MS = 8000;
  const START_HELP = "Run python -m streamlit run server/app.py and open the dashboard page.";

  async function getSettings() {
    const values = await chrome.storage.local.get("trackerSettings");
    const saved = values.trackerSettings || {};
    return { url: saved.url || DEFAULT_URL, token: saved.token || "" };
  }

  async function saveSettings(values) {
    const settings = {
      url: values.url.trim().replace(/\/+$/, "") || DEFAULT_URL,
      token: values.token.trim()
    };
    await chrome.storage.local.set({ trackerSettings: settings });
    return settings;
  }

  function serverMessage(payload, status) {
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) {
      return payload.detail.map(item => `${item.loc.join(".")}: ${item.msg}`).join("; ");
    }
    return `Tracker request failed (${status}).`;
  }

  async function request(path, options = {}) {
    const settings = await getSettings();
    if (!settings.token) {
      throw new Error("Tracker token is missing. Copy it from dashboard Settings → Local API.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers = { Authorization: `Bearer ${settings.token}` };
      if (options.json !== undefined) headers["Content-Type"] = "application/json";
      const send = global.fetch.bind(global);
      const requestOptions = {
        method: options.method || "GET",
        headers,
        body: options.form || (options.json !== undefined ? JSON.stringify(options.json) : undefined),
        signal: controller.signal
      };
      let response;
      try {
        response = await send(settings.url + path, requestOptions);
      } catch (error) {
        const message = error.name === "AbortError"
          ? "Tracker request timed out."
          : "Tracker is not running.";
        throw new Error(`${message} ${START_HELP}`, { cause: error });
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(serverMessage(payload, response.status));
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  function createJob(job) {
    return request("/api/jobs", {
      method: "POST",
      json: {
        company: job.company,
        job_title: job.job_title,
        job_url: job.job_url,
        location: job.location || "",
        email: job.email || ""
      }
    });
  }

  function getJobs(url) {
    return request("/api/jobs" + (url === undefined ? "" : `?url=${encodeURIComponent(url)}`));
  }

  function patchJob(id, updates) {
    return request(`/api/jobs/${encodeURIComponent(id)}`, { method: "PATCH", json: updates });
  }

  function getStatuses() {
    return request("/api/statuses");
  }

  function getSummary() {
    return request("/api/summary");
  }

  function getNotes(id) {
    return request(`/api/jobs/${encodeURIComponent(id)}/notes`);
  }

  function saveNotes(id, notes) {
    return request(`/api/jobs/${encodeURIComponent(id)}/notes`, { method: "PUT", json: { notes } });
  }

  function uploadResume(id, blob, filename = "resume.pdf", label = filename) {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("label", label);
    return request(`/api/jobs/${encodeURIComponent(id)}/resumes`, { method: "POST", form });
  }

  function buildImportPayload(records) {
    return {
      jobs: records.map(record => {
        const job = {
          company: record.company || "",
          jobTitle: record.jobTitle || record.role || "",
          jobUrl: record.jobUrl || record.url || "",
          status: record.status || "Saved",
          location: record.location || "",
          appliedAt: record.appliedAt || "",
          notes: record.notes || ""
        };
        for (const key of ["filledFieldCount", "formFieldCount", "createdAt", "updatedAt"]) {
          if (record[key] !== undefined) job[key] = record[key];
        }
        return job;
      })
    };
  }

  function importJobs(records) {
    return request("/api/import", { method: "POST", json: buildImportPayload(records) });
  }

  async function getDashboardUrl() {
    const target = new URL((await getSettings()).url);
    target.port = "8501";
    target.pathname = "/";
    target.search = "";
    target.hash = "";
    return target.href;
  }

  async function openDashboard() {
    return chrome.tabs.create({ url: await getDashboardUrl() });
  }

  global.AutoApplyTracker = Object.freeze({
    getSettings, saveSettings, createJob, getJobs, patchJob, uploadResume,
    getStatuses, getSummary, getNotes, saveNotes,
    buildImportPayload, importJobs, getDashboardUrl, openDashboard,
    testConnection: getStatuses
  });
})(globalThis);
