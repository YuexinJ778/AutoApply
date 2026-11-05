(function attachTrackerAiFunctions(global) {
  "use strict";

  const FUNCTION_DEFINITIONS = Object.freeze({
    setJobStatus: {
      parameters: ["company", "jobTitle?", "status"],
      description: "Set a job's configured status ID or label."
    },
    setAppliedDate: {
      parameters: ["company", "jobTitle?", "date"],
      description: "Set the application date using YYYY-MM-DD."
    },
    addJobNote: {
      parameters: ["company", "jobTitle?", "text"],
      description: "Append Markdown text to the job's existing notes."
    },
    addReminder: {
      parameters: ["company", "jobTitle?", "kind", "datetime", "title"],
      description: "Add a reminder. kind: interview, assessment, deadline, follow_up, or other. datetime: ISO date/time; a local time uses the request's IANA timezone."
    },
    completeReminder: {
      parameters: ["company", "jobTitle?", "title"],
      description: "Complete the uniquely named reminder for the job."
    }
  });
  const ALLOWED_FUNCTIONS = Object.freeze(Object.keys(FUNCTION_DEFINITIONS));
  const MAX_FUNCTION_CALLS = 10;
  const REMINDER_KINDS = new Set(["interview", "assessment", "deadline", "follow_up", "other"]);

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function invalid(error, call) {
    return { ok: false, code: "INVALID_ACTION", error, failedCall: call || null };
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) === 0) return false;
    const date = new Date(value + "T00:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validDatetime(value) {
    const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(value);
    return Boolean(match && validDate(match[1]));
  }

  function validateTrackerFunctionBatch(calls) {
    if (!Array.isArray(calls)) return invalid("functionCalls must be an array.");
    if (calls.length > MAX_FUNCTION_CALLS) return invalid("A tracker AI turn may execute at most 10 function calls.");
    for (const call of calls) {
      if (!isObject(call)) return invalid("Each function call must be an object.", call);
      if (!ALLOWED_FUNCTIONS.includes(call.name)) return invalid("Unknown tracker function: " + String(call.name), call);
      if (Object.keys(call).some(key => key !== "name" && key !== "args")) {
        return invalid("Function calls may contain only name and args.", call);
      }
      if (!isObject(call.args)) return invalid("Tracker function args must be an object.", call);
      const parameters = FUNCTION_DEFINITIONS[call.name].parameters;
      const names = parameters.map(parameter => parameter.replace(/\?$/, ""));
      const unknown = Object.keys(call.args).find(key => !names.includes(key));
      if (unknown) return invalid("Unsupported argument: " + unknown, call);
      for (const parameter of parameters) {
        const name = parameter.replace(/\?$/, "");
        if (parameter.endsWith("?") && !Object.hasOwn(call.args, name)) continue;
        if (typeof call.args[name] !== "string" || !call.args[name].trim()) {
          return invalid(name + " must be a nonempty string.", call);
        }
      }
      if (call.name === "setAppliedDate" && !validDate(call.args.date)) {
        return invalid("date must use a valid YYYY-MM-DD date.", call);
      }
      if (call.name === "addReminder") {
        if (!REMINDER_KINDS.has(call.args.kind)) return invalid("Unknown reminder kind: " + call.args.kind, call);
        if (!validDatetime(call.args.datetime)) return invalid("datetime must be a valid ISO date and time.", call);
      }
    }
    return { ok: true };
  }

  async function executeTrackerFunctions(calls, { timezone } = {}) {
    const validation = validateTrackerFunctionBatch(calls);
    if (!validation.ok) return validation;
    return global.AutoApplyTracker.executeActions(calls, timezone);
  }

  function formatTrackerFunctionManualForPrompt() {
    return ALLOWED_FUNCTIONS.map(name => {
      const definition = FUNCTION_DEFINITIONS[name];
      return `${name}(${definition.parameters.join(", ")}) — ${definition.description}`;
    }).join("\n");
  }

  global.TrackerAiFunctions = Object.freeze({
    ALLOWED_FUNCTIONS, MAX_FUNCTION_CALLS,
    validateTrackerFunctionBatch, executeTrackerFunctions, formatTrackerFunctionManualForPrompt
  });
})(globalThis);
