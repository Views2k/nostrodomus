// Compact embedded-language diagnostics.
//
// This module is user-facing and observe-only. It reports the embedded language
// lane visible to diagnostics, kept small enough to ship in the production bundle.

export const EMBEDDED_LANGUAGE_DIAGNOSTICS_VERSION = 2;
export const EMBEDDED_LANGUAGE_DIAGNOSTICS_STAGE = 'embedded-language-diagnostics-compact';

function text(value) {
  return String(value ?? '');
}

function clip(value, limit = 96) {
  const valueText = text(value);
  return valueText.length > limit ? `${valueText.slice(0, limit)}…` : valueText;
}

function num(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function pathParts(path) {
  return Array.isArray(path) ? path.map((part) => clip(part, 48)).filter(Boolean).slice(0, 16) : [];
}

function inferScalarStyle(ctx = {}) {
  const explicit = text(ctx.scalarStyle).trim().toLowerCase();
  if (explicit) return explicit;
  const lang = text(ctx.lang || ctx.language).trim().toLowerCase();
  const scope = text(ctx.scope).trim().toLowerCase();
  const blockValueKind = text(ctx.blockValueKind || ctx.yaml?.blockValueKind).trim().toLowerCase();
  if (blockValueKind || /css|js|javascript|jinja|html/.test(lang)) return 'literal';
  if (/card[-_]mod|style|button-card|template|markdown|html/.test(scope)) return 'literal';
  return 'plain';
}

function lineText(ctx = {}) {
  return text(ctx.line || ctx.linePreview || ctx.beforeCursorPreview || ctx.beforeCursor) + (ctx.line || ctx.linePreview ? '' : text(ctx.afterCursorPreview || ctx.afterCursor));
}

export function embeddedLanguageDetectorInputFromContext(ctx = {}) {
  const line = lineText(ctx);
  const before = text(ctx.beforeCursor);
  const cursorOffset = Math.max(0, Math.min(line.length, before ? before.length : num(ctx.col, line.length)));
  return Object.freeze({
    text: line,
    cursorOffset,
    yamlPath: pathParts(ctx.yamlPath),
    scalarStyle: inferScalarStyle(ctx),
    hostCardType: clip(ctx.hostCardType || ctx.cardType || ctx.scope || '', 72),
  });
}

export function embeddedLanguageDetectorInputFromActiveEditorReadout(readout = {}) {
  const active = readout.activeEditor || readout;
  const snapshotContainer = active.snapshot || {};
  const snapshot = snapshotContainer.snapshot || snapshotContainer;
  const cursor = snapshot.cursor || active.editor || {};
  const line = text(cursor.linePreview);
  const before = text(cursor.beforeCursorPreview);
  const after = text(cursor.afterCursorPreview);
  const fullLine = line || before + after;
  const yaml = snapshot.yaml || {};
  return Object.freeze({
    text: fullLine,
    cursorOffset: Math.max(0, Math.min(fullLine.length, before ? before.length : num(cursor.column, fullLine.length))),
    yamlPath: pathParts(yaml.path),
    scalarStyle: inferScalarStyle(snapshot),
    hostCardType: clip(snapshot.card?.type || snapshot.card?.customType || snapshot.scope || '', 72),
  });
}

function laneFrom(input = {}) {
  const source = `${text(input.hostCardType)}\n${(input.yamlPath || []).join('.')}\n${text(input.text)}`.toLowerCase();
  if (/\[\[\[|javascript|\bjs\b|button-card|return\s+/.test(source)) return 'javascript';
  if (/card[-_]mod|style|css|border-|color:|background:/.test(source)) return 'css';
  if (/jinja|\{\{|\{%|states\(|is_state\(/.test(source)) return 'jinja';
  if (/<[a-z][\s\S]*>/i.test(text(input.text)) || /html/.test(source)) return 'html';
  if (/markdown/.test(source)) return 'markdown';
  return 'yaml';
}

function surfaceFor(laneId, input = {}) {
  const source = `${text(input.hostCardType)} ${(input.yamlPath || []).join('.')}`.toLowerCase();
  if (/button-card/.test(source)) return 'button-card';
  if (/card[-_]mod|style/.test(source)) return 'card-mod';
  if (/markdown/.test(source)) return 'markdown-card';
  if (/browser_mod/.test(source)) return 'browser-mod';
  return laneId;
}

function compactInput(input = {}) {
  return Object.freeze({
    cursorOffset: num(input.cursorOffset, 0),
    yamlPath: pathParts(input.yamlPath),
    yamlPathText: pathParts(input.yamlPath).join('.'),
    scalarStyle: clip(input.scalarStyle || 'plain', 24),
    hostCardType: clip(input.hostCardType || '', 72),
    textLength: text(input.text).length,
  });
}

function compactReadout(input = null) {
  if (!input) return null;
  const laneId = laneFrom(input);
  const surfaceId = surfaceFor(laneId, input);
  return Object.freeze({
    ok: true,
    input: compactInput(input),
    result: Object.freeze({
      ok: true,
      laneId,
      confidence: laneId === 'yaml' ? 'low' : 'high',
      evidence: surfaceId,
      observeOnly: true,
      drivesAutocomplete: false,
      registersProviders: false,
      opensPopup: false,
      insertsText: false,
      mutatesScoring: false,
    }),
    shadowDecision: Object.freeze({
      ok: true,
      laneId,
      topSurfaceIds: [surfaceId],
      observeOnly: true,
      diagnosticsOnly: true,
      shadowOnly: true,
      drivesAutocomplete: false,
      registersProviders: false,
      opensPopup: false,
      insertsText: false,
      mutatesScoring: false,
    }),
  });
}

export function createEmbeddedLanguageDiagnostics(input = {}, deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now() : Date.now();
  const legacyInput = input.detectorInput || embeddedLanguageDetectorInputFromContext(input.legacyContext || {});
  const activeInput = input.activeDetectorInput || (input.activeEditorReadout ? embeddedLanguageDetectorInputFromActiveEditorReadout(input.activeEditorReadout) : null);
  const liveItems = Array.isArray(input.liveItems) ? input.liveItems : [];
  return Object.freeze({
    ok: true,
    version: EMBEDDED_LANGUAGE_DIAGNOSTICS_VERSION,
    stage: EMBEDDED_LANGUAGE_DIAGNOSTICS_STAGE,
    at: now,
    localOnly: true,
    redacted: true,
    diagnosticsOnly: true,
    observeOnly: true,
    drivesAutocomplete: false,
    registersProviders: false,
    opensPopup: false,
    insertsText: false,
    mutatesScoring: false,
    liveSuggestionCount: liveItems.length,
    legacyContext: compactReadout(legacyInput),
    activeEditor: compactReadout(activeInput),
  });
}
