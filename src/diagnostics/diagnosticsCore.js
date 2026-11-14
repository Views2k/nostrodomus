// Nostrodomus diagnostics core module.
// This layer owns pure diagnostics summaries, safe string formatting, and markup string generation.
// It must not own settings UI, DOM mounting, browser storage, clipboard, popup UI, or network behavior.

import { escapeHtml } from '../core/security.js';

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

export function itemSummary(item = null, helpers = {}) {
    if (!item) return null;
    return {
      type: item.type || "",
      source: item.source || "",
      provider: item.provider || "",
      lang: item.lang || "",
      detail: typeof helpers.itemDetail === "function" ? helpers.itemDetail(item) : (item.detail || ""),
      documentation: typeof helpers.itemDocumentation === "function" ? helpers.itemDocumentation(item) : (item.documentation || ""),
      labelLength: String(item.label || "").length,
      insertLength: String(item.insert || "").length,
    };
  }

export function diagnosticValue(label, value) {
    return `
      <div class="nostrodomus-diagnostic-row">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(value)}</span>
      </div>
    `;
  }

export function diagnosticCard(title, body, note = "") {
    return `
      <section class="nostrodomus-diagnostic-card">
        <div class="nostrodomus-diagnostic-card-title">${escapeHtml(title)}</div>
        ${note ? `<div class="nostrodomus-setting-desc">${escapeHtml(note)}</div>` : ""}
        <div class="nostrodomus-diagnostic-card-body">${body}</div>
      </section>
    `;
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
// report carries their lengths only, as safeContextSummary and itemSummary already do for the
// prefix and the label.
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
        // Reading editorFound and warning from the envelope itself always gave "no" and "none".
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

// Legacy string-markup builder kept for static-contract compatibility only.
// The live Diagnostics panel renders through createSettingsElement in
// src/diagnostics/telemetryRuntime.js; nothing imports this builder at runtime.
export function diagnosticsMarkup(options = {}) {
    const ctx = options.context || safeContextSummary(options.rawContext || null);
    const rt = options.runtimeSummary || {};
    const h = options.health || {};
    const providers = Array.isArray(options.providers) ? options.providers : [];
    const providerText = providers.map(p => `${p.id}: ${p.lastCount || 0} in ${p.lastMs || 0}ms`).join(" | ") || "none";
    const readout = options.readout || diagnosticsReadoutSummary(options.api || null);
    const settingDescription = typeof options.settingDesc === "function"
      ? options.settingDesc
      : (text) => `<div class="nostrodomus-setting-desc">${escapeHtml(text)}</div>`;
    const rows = pairs => pairs.map(([label, value]) => diagnosticValue(label, value)).join("");
    const yn = value => (value ? "yes" : "no");

    const cards = [
      diagnosticCard("Runtime", rows([
        ["Health", h.ok ? "OK" : "Needs attention"],
        ["Version", options.version || ""],
        ["Engine enabled", yn(options.enabled)],
        ["Suggestion popup", options.popupOpen ? "open" : "closed"],
        ["Last error", options.lastErrorMessage || "none"],
      ]), "Local state only. Nothing is sent anywhere."),
      diagnosticCard("Editor", rows([
        ["Editor detected", yn(options.editorDetected)],
        ["Scoped editor", yn(options.editorScoped)],
        ["Edit dialog", options.editDialogActive ? "active" : "none"],
        ["Active readout", readout.activeEditorOk ? "OK" : "unavailable"],
        ["Editor found", yn(readout.activeEditorFound)],
        ["Readout note", readout.activeEditorWarning || "none"],
      ]), "If browser console has focus, active editor may correctly show unavailable."),
      diagnosticCard("ContextSnapshot", rows([
        ["Readout API", readout.available ? "loaded" : "not loaded"],
        ["Stage", readout.stage],
        ["Diagnostics only", yn(readout.diagnosticsOnly)],
        ["Shadow only", yn(readout.shadowOnly)],
        ["Drives autocomplete", yn(readout.drivesAutocomplete)],
        ["Mutates runtime", yn(readout.mutatesRuntime)],
        ["Renders UI", yn(readout.rendersUi)],
        ["Network access", yn(readout.networkAccess)],
      ]), "This engine path is diagnostics-only; it cannot drive autocomplete."),
      diagnosticCard("Current Legacy Context", rows([
        ["Language", ctx?.lang || "none"],
        ["YAML role", ctx?.yamlRole || "none"],
        ["YAML key", ctx?.yamlKey || "none"],
        ["Comment context", yn(ctx?.inComment)],
        ["Should suggest", yn(ctx?.shouldSuggest)],
        ["Suggestions", String(options.itemCount || 0)],
      ]), "Redacted summary of the currently active legacy autocomplete context."),
      diagnosticCard("Providers + Runtime", rows([
        ["Providers", providerText],
        ["Runtime HA", rt.hasHass ? `yes (${rt.entities || 0} entities, ${rt.services || 0} services)` : "not detected yet"],
        ["Cache entries", String(options.cacheEntries || 0)],
        ["Index counts", options.indexCounts || "none"],
      ]), "Counts are bounded to keep diagnostics lightweight."),
    ];

    const buttons = [
      ["data-diag-refresh", "Refresh"],
      ["data-diag-copy", "Copy full report"],
      ["data-diag-copy-context", "Copy context"],
      ["data-diag-health", "Log health"],
    ].map(([attr, label]) => `<button ${attr} class="nostrodomus-pill">${label}</button>`).join("");

    return `
      <div style="font-weight:850;margin-bottom:3px">Diagnostics</div>
      ${settingDescription("Local-only troubleshooting data. Reports are redacted by default, stay in your browser, and are never sent anywhere by this engine.")}
      <div class="nostrodomus-diagnostics-grid">${cards.join("")}</div>
      <div class="nostrodomus-action-row">${buttons}</div>
      <label><input type="checkbox" data-k="debugMode" ${options.debugMode ? "checked" : ""}> Debug console messages</label>
      ${settingDescription("Off by default. Console APIs remain available, but the UI now covers the common diagnostics path.")}
    `;
  }
