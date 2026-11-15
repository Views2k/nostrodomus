// Nostrodomus diagnostics core module.
// Pure diagnostics summaries, redaction and bounded string formatting. No settings UI, DOM
// mounting, browser storage, clipboard, popup UI or network access.

export const DIAGNOSTICS_READOUT_MAX_TEXT = 240;
export const DIAGNOSTICS_READOUT_MAX_WARNINGS = 10;

export function safeContextSummary(ctx = null) {
  if (!ctx) return null;
  return {
    lang: ctx.lang || "",
    scope: ctx.scope || "",
    confidence: ctx.confidence || 0,
    yamlRole: ctx.yamlRole || "",
    yamlKey: ctx.yamlKey || "",
    triggerKind: ctx.triggerKind || "",
    isTriggerChar: !!ctx.isTriggerChar,
    isBlankLine: !!ctx.isBlankLine,
    shouldSuggest: !!ctx.shouldSuggest,
    prefixLength: String(ctx.prefix || "").length,
    yamlPathDepth: Array.isArray(ctx.yamlPath) ? ctx.yamlPath.length : 0,
    inComment: !!ctx.inComment,
  };
}

export function diagnosticsReadoutString(value, limit = DIAGNOSTICS_READOUT_MAX_TEXT) {
  const text = String(value ?? "");
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

export function diagnosticsReadoutBool(value) {
  return value === true;
}

// Keys that hold the user's own text in a diagnostics payload: the cursor line and typed prefix of
// the active-editor readout, and suggestion labels, friendly names and documentation. A redacted
// report carries their lengths only, as safeContextSummary does for the prefix.
const DIAGNOSTICS_USER_TEXT_KEYS = new Set([
  "linePreview", "beforeCursorPreview", "afterCursorPreview", "line", "beforeCursor", "afterCursor",
  "prefix", "label", "detail", "documentation",
]);

export function redactDiagnosticsUserText(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 12) return value;
  if (Array.isArray(value)) return value.map(item => redactDiagnosticsUserText(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (DIAGNOSTICS_USER_TEXT_KEYS.has(key) && typeof item === "string") out[`${key}Length`] = item.length;
    else out[key] = redactDiagnosticsUserText(item, depth + 1);
  }
  return out;
}

export function diagnosticsReadoutSafeWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];
  return warnings.slice(0, DIAGNOSTICS_READOUT_MAX_WARNINGS).map((item) => ({
    code: diagnosticsReadoutString(item?.code, 64),
    legacy: diagnosticsReadoutString(item?.legacy, 160),
    snapshot: diagnosticsReadoutString(item?.snapshot, 160),
  }));
}

export function diagnosticsReadoutSummary(api = null) {
  const summary = {
    available: !!api,
    stage: api?.stage || "not loaded",
    enabled: api?.isEnabled?.() === true,
    diagnosticsOnly: api?.diagnosticsOnly === true,
    shadowOnly: api?.shadowOnly === true,
    drivesAutocomplete: api?.drivesAutocomplete === true,
    mutatesRuntime: api?.mutatesRuntime === true,
    rendersUi: api?.rendersUi === true,
    networkAccess: api?.networkAccess === true,
    activeEditorOk: false,
    activeEditorFound: false,
    activeEditorWarning: "not checked",
  };

  try {
    const active = api?.readActiveEditor?.() || null;
    if (active) {
      // readActiveEditor returns an envelope with the editor readout under activeEditor.
      const editor = active.activeEditor && typeof active.activeEditor === "object" ? active.activeEditor : active;
      summary.activeEditorOk = active.ok === true;
      summary.activeEditorFound = editor.editorFound === true;
      summary.activeEditorWarning = editor.warning || "none";
    }
  } catch (err) {
    summary.activeEditorWarning = diagnosticsReadoutString(err?.message || err, 180);
  }

  return summary;
}

export function diagnosticsReadoutBundle(options = {}) {
  const api = options?.api || null;
  return {
    readout: options?.readout || diagnosticsReadoutSummary(api),
  };
}
