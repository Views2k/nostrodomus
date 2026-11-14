// Observe-only embedded-language detector.
//
// Pure data-in/data-out module. It is intentionally not wired into live provider
// routing: it classifies lane evidence for diagnostics and tests only, then
// reports drivesAutocomplete=false.

import { CURSOR_MARKER, LANGUAGE_FIXTURES, languageFixtureCursorOffset, languageFixtureTextWithoutCursor } from './languageFixtures.js';
import { getLanguageLane, LANGUAGE_LANE_IDS } from './languageLanes.js';
import { classifyEmbeddedLanguageSnapshot } from './embeddedLanguageDetectorContract.js';
import { LANE_RANKING_FIXTURES } from './laneRankingFixtures.js';

export const EMBEDDED_LANGUAGE_DETECTOR_VERSION = 1;
export const EMBEDDED_LANGUAGE_DETECTOR_STAGE = "priority10-observe-only-embedded-language-detector";
const EMBEDDED_LANGUAGE_DETECTOR_SOURCE = "priority10-observe-only";

const EMBEDDED_LANGUAGE_DETECTOR_EVIDENCE_ORDER = Object.freeze([
  "cursor-inside-jinja-delimiters",
  "cursor-inside-button-card-javascript-template",
  "card-mod-style-block-css-context",
  "cursor-inside-json-object",
  "markdown-html-content-context",
  "contract-classifier-fallback",
  "weak-evidence-yaml-fallback",
]);

function toText(value) {
  return String(value ?? "");
}

function clampOffset(value, text) {
  const length = toText(text).length;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return length;
  return Math.max(0, Math.min(length, Math.trunc(numeric)));
}

function normalizePath(path) {
  if (Array.isArray(path)) return path.map((part) => toText(part).trim().toLowerCase()).filter(Boolean);
  return toText(path).split(/[/.>\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
}

function pathHas(path, ...needles) {
  const parts = normalizePath(path);
  return needles.some((needle) => parts.includes(toText(needle).toLowerCase()));
}

function normalizeInput(input = {}) {
  const rawText = toText(input.text ?? input.source);
  const markerOffset = rawText.indexOf(CURSOR_MARKER);
  const text = rawText.replace(CURSOR_MARKER, "");
  const cursorOffset = clampOffset(markerOffset >= 0 ? markerOffset : input.cursorOffset, text);
  const before = text.slice(0, cursorOffset);
  const after = text.slice(cursorOffset);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEndRaw = after.indexOf("\n");
  const lineEnd = lineEndRaw >= 0 ? cursorOffset + lineEndRaw : text.length;
  const line = text.slice(lineStart, lineEnd);
  const scalarStyle = toText(input.scalarStyle).trim().toLowerCase();
  return Object.freeze({
    text,
    cursorOffset,
    before,
    after,
    line,
    yamlPath: Object.freeze(normalizePath(input.yamlPath)),
    scalarStyle,
    blockScalar: scalarStyle === "literal" || scalarStyle === "folded" || scalarStyle === "block",
    hostCardType: toText(input.hostCardType ?? input.cardType),
  });
}

function lastIndexOfAny(text, tokens) {
  return tokens.reduce((best, token) => Math.max(best, text.lastIndexOf(token)), -1);
}

function cursorInsideDelimitedRegion(ctx, openTokens, closeTokens) {
  const open = lastIndexOfAny(ctx.before, openTokens);
  const close = lastIndexOfAny(ctx.before, closeTokens);
  if (open < 0 || close > open) return false;
  const nextClose = closeTokens.some((token) => ctx.after.includes(token));
  return nextClose || open >= 0;
}

function hasJinjaEvidence(ctx) {
  const balanced = /\{[{%#][\s\S]*[}%#]\}/.test(ctx.text);
  if (balanced) return true;
  if (!cursorInsideDelimitedRegion(ctx, ["{{", "{%", "{#"], ["}}", "%}", "#}"])) return false;
  const pathLooksTemplate = pathHas(ctx.yamlPath, "template", "content", "secondary", "primary", "message", "label", "name");
  const templateFunction = /\b(?:states|is_state|state_attr|now|as_timestamp)\s*\(/.test(ctx.text);
  return ctx.blockScalar || templateFunction || (pathLooksTemplate && /\{[{%#]\s*\b(?:if|for|set|states|is_state|state_attr)\b/.test(ctx.text));
}

function hasButtonCardJavaScriptEvidence(ctx) {
  return cursorInsideDelimitedRegion(ctx, ["[[["], ["]]]"])
    || /\[\[\[[\s\S]*\]\]\]/.test(ctx.text)
    || (/\breturn\b/.test(ctx.line) && /\b(?:entity|states|variables|hass)\b/.test(ctx.text));
}

function hasCssEvidence(ctx) {
  const pathLooksCss = pathHas(ctx.yamlPath, "card_mod", "style", "styles", "extra_styles");
  const styleBlock = ctx.blockScalar && pathLooksCss;
  const cssToken = /(?:ha-card|:host|::?part|--[a-z0-9-]+|#[a-z0-9_-]+|\.[a-z0-9_-]+|\b[a-z-]+\s*:|[{;}])/i.test(ctx.text);
  const propertyLine = /\b[a-z-]+\s*:\s*[^\n;]*/i.test(ctx.line);
  return (styleBlock && cssToken) || (pathHas(ctx.yamlPath, "card_mod") && propertyLine);
}

function hasJsonEvidence(ctx) {
  const trimmed = ctx.text.trim();
  const open = ctx.before.lastIndexOf("{");
  const close = ctx.before.lastIndexOf("}");
  const insideObject = open >= 0 && close < open;
  const quotedKey = /"[^"\n]+"\s*:/.test(ctx.text);
  const strictObject = /^\{[\s\S]*\}$/.test(trimmed) && quotedKey;
  const dataObject = pathHas(ctx.yamlPath, "data", "service_data", "payload") && insideObject && quotedKey;
  return strictObject || dataObject;
}

function hasMarkdownHtmlEvidence(ctx) {
  const contentBlock = pathHas(ctx.yamlPath, "content", "description", "message") && ctx.blockScalar;
  const markdown = /(^|\n)\s{0,4}#{1,6}\s+\S/.test(ctx.text)
    || /\*\*[^*]+\*\*/.test(ctx.text)
    || /\[[^\]]+\]\([^)]+\)/.test(ctx.text);
  const html = /<\/?(?:ha-[a-z0-9-]+|div|span|a|br|strong|em|ha-icon|ha-alert)\b/i.test(ctx.text);
  return contentBlock && (markdown || html);
}

function detectorResult(ctx, laneId, confidence, reason, evidence) {
  const lane = getLanguageLane(laneId) || getLanguageLane("yaml");
  return Object.freeze({
    laneId: lane?.id || "yaml",
    confidence,
    reason,
    evidence,
    source: EMBEDDED_LANGUAGE_DETECTOR_SOURCE,
    stage: EMBEDDED_LANGUAGE_DETECTOR_STAGE,
    cursorOffset: ctx.cursorOffset,
    yamlPath: ctx.yamlPath.slice(),
    scalarStyle: ctx.scalarStyle,
    observeOnly: true,
    registersProviders: false,
    drivesAutocomplete: false,
    opensPopup: false,
    insertsText: false,
    mutatesScoring: false,
  });
}

export function detectEmbeddedLanguage(input = {}) {
  const ctx = normalizeInput(input);
  if (hasJinjaEvidence(ctx)) {
    return detectorResult(ctx, "jinja2", "high", "cursor is inside or adjacent to Jinja delimiters", "cursor-inside-jinja-delimiters");
  }
  if (hasButtonCardJavaScriptEvidence(ctx)) {
    return detectorResult(ctx, "javascript", "high", "cursor is inside or adjacent to a button-card JavaScript template", "cursor-inside-button-card-javascript-template");
  }
  if (hasCssEvidence(ctx)) {
    return detectorResult(ctx, "css", "high", "card_mod/style path with CSS evidence", "card-mod-style-block-css-context");
  }
  if (hasJsonEvidence(ctx)) {
    return detectorResult(ctx, "json", "medium", "cursor is inside a JSON-shaped object", "cursor-inside-json-object");
  }
  if (hasMarkdownHtmlEvidence(ctx)) {
    return detectorResult(ctx, "markdown-html", "medium", "content block has Markdown or safe HTML evidence", "markdown-html-content-context");
  }

  const fallback = classifyEmbeddedLanguageSnapshot({
    yamlPath: ctx.yamlPath,
    scalarStyle: ctx.scalarStyle,
    text: ctx.text,
  });
  if (fallback?.laneId && fallback.laneId !== "yaml") {
    return detectorResult(ctx, fallback.laneId, fallback.confidence || "medium", fallback.reason || "contract classifier fallback", "contract-classifier-fallback");
  }
  return detectorResult(ctx, "yaml", "low", "weak evidence remains in host YAML", "weak-evidence-yaml-fallback");
}

export function detectLanguageFixture(fixture) {
  const cursorOffset = languageFixtureCursorOffset(fixture);
  const result = detectEmbeddedLanguage({
    yamlPath: fixture?.yamlPath,
    scalarStyle: fixture?.scalarStyle,
    text: fixture?.text,
    cursorOffset,
  });
  const expectedLaneId = toText(fixture?.laneId);
  return Object.freeze({
    fixtureId: toText(fixture?.id),
    expectedLaneId,
    actualLaneId: result.laneId,
    ok: result.laneId === expectedLaneId,
    expectation: toText(fixture?.expectation),
    textWithoutCursor: languageFixtureTextWithoutCursor(fixture),
    result,
  });
}

function detectRankingFixtureLane(fixture) {
  const result = detectEmbeddedLanguage({
    yamlPath: fixture?.yamlPath,
    text: fixture?.text,
    scalarStyle: toText(fixture?.text).includes("\n") ? "literal" : "plain",
  });
  const expectedLaneIds = Array.isArray(fixture?.expectedLaneIds) ? fixture.expectedLaneIds : [fixture?.laneId].filter(Boolean);
  return Object.freeze({
    fixtureId: toText(fixture?.id),
    expectedLaneIds: Object.freeze(expectedLaneIds.map((lane) => toText(lane))),
    actualLaneId: result.laneId,
    ok: expectedLaneIds.includes(result.laneId),
    result,
  });
}

export function embeddedLanguageDetectorImplementationStatus(options = {}) {
  const languageFixtures = Array.isArray(options.languageFixtures) ? options.languageFixtures : LANGUAGE_FIXTURES;
  const rankingFixtures = Array.isArray(options.rankingFixtures) ? options.rankingFixtures : LANE_RANKING_FIXTURES;
  const fixtureResults = languageFixtures.map((fixture) => detectLanguageFixture(fixture));
  const rankingResults = rankingFixtures.map((fixture) => detectRankingFixtureLane(fixture));
  const allResults = fixtureResults.concat(rankingResults);
  const passing = allResults.filter((item) => item.ok).length;
  const evidence = Object.create(null);
  for (const item of allResults) {
    const key = item.result?.evidence || "unknown";
    evidence[key] = (evidence[key] || 0) + 1;
  }
  return Object.freeze({
    ok: passing === allResults.length,
    stage: EMBEDDED_LANGUAGE_DETECTOR_STAGE,
    detectorVersion: EMBEDDED_LANGUAGE_DETECTOR_VERSION,
    laneIds: LANGUAGE_LANE_IDS.slice(),
    evidenceOrder: EMBEDDED_LANGUAGE_DETECTOR_EVIDENCE_ORDER.slice(),
    fixtureCount: fixtureResults.length,
    rankingFixtureCount: rankingResults.length,
    passing,
    failing: allResults.length - passing,
    evidence: Object.freeze({ ...evidence }),
    observeOnly: true,
    registersProviders: false,
    drivesAutocomplete: false,
    opensPopup: false,
    insertsText: false,
    mutatesScoring: false,
    fixtureResults: Object.freeze(fixtureResults),
    rankingResults: Object.freeze(rankingResults),
  });
}
