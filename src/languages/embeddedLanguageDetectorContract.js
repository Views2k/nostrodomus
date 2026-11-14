// Embedded-language detector contract.
//
// This module is pure contract logic for fixtures and provider-contract tests.
// It does not read browser globals, Home Assistant state, editor objects,
// storage, timers, providers, Settings, popup state, or insertion/session state.

import { LANGUAGE_LANE_IDS, getLanguageLane } from './languageLanes.js';
import { CURSOR_MARKER, LANGUAGE_FIXTURES, languageFixtureCursorOffset, languageFixtureTextWithoutCursor } from './languageFixtures.js';

export const EMBEDDED_LANGUAGE_DETECTOR_CONTRACT_VERSION = 1;
export const EMBEDDED_LANGUAGE_DETECTOR_STAGE = "priority10-fixture-detector-contract";

export const EMBEDDED_LANGUAGE_EVIDENCE_ORDER = Object.freeze([
  "yaml-structural-host",
  "jinja-delimiters",
  "card-mod-style-block",
  "button-card-javascript-template",
  "json-shaped-object",
  "markdown-html-content",
  "weak-evidence-stays-yaml",
]);

function toText(value) {
  return String(value ?? "");
}

function normalizePath(path) {
  if (Array.isArray(path)) return path.map((part) => toText(part).trim().toLowerCase()).filter(Boolean);
  return toText(path).split(/[/.\s>]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
}

function pathHas(path, ...needles) {
  const parts = normalizePath(path);
  return needles.some((needle) => parts.includes(String(needle).toLowerCase()));
}

function sourceWithoutCursor(snapshot) {
  return toText(snapshot?.text ?? snapshot?.source).replace(CURSOR_MARKER, "");
}

function hasBalancedTemplateDelimiters(text) {
  return /\{\{[\s\S]*\}\}/.test(text) || /\{%[\s\S]*%\}/.test(text) || /\{#[\s\S]*#\}/.test(text);
}

function looksCssLike(text) {
  return /[{;}]/.test(text) && /(?:ha-card|:host|--[a-z0-9-]+|#[a-z0-9_-]+|\.[a-z0-9_-]+|\b[a-z-]+\s*:)/i.test(text);
}

function looksJavaScriptTemplate(text) {
  return /\[\[\[[\s\S]*\]\]\]/.test(text) || /\breturn\b/.test(text) && /\b(?:entity|states|variables|hass)\b/.test(text);
}

function looksJsonObject(text) {
  const trimmed = text.trim();
  const objectText = trimmed.startsWith("{") ? trimmed : (trimmed.match(/:\s*(\{[\s\S]*\})\s*$/)?.[1] || "");
  return /^\{[\s\S]*\}$/.test(objectText) && /"[^"]+"\s*:/.test(objectText);
}

function looksMarkdownHtml(text) {
  return /(^|\n)\s{0,4}#{1,6}\s+\S/.test(text)
    || /\*\*[^*]+\*\*/.test(text)
    || /\[[^\]]+\]\([^)]+\)/.test(text)
    || /<\/?(?:ha-[a-z0-9-]+|div|span|a|br|strong|em)\b/i.test(text);
}

function result(laneId, confidence, reason, evidence) {
  const lane = getLanguageLane(laneId) || getLanguageLane("yaml");
  return Object.freeze({
    laneId: lane?.id || "yaml",
    confidence,
    reason,
    evidence,
    source: "priority10-contract-only",
    drivesAutocomplete: false,
  });
}

export function classifyEmbeddedLanguageSnapshot(snapshot = {}) {
  const text = sourceWithoutCursor(snapshot);
  const path = normalizePath(snapshot.yamlPath);
  const scalarStyle = toText(snapshot.scalarStyle).toLowerCase();
  const blockScalar = scalarStyle === "literal" || scalarStyle === "folded" || scalarStyle === "block";

  if (hasBalancedTemplateDelimiters(text)) {
    return result("jinja2", "high", "balanced Jinja delimiters", "jinja-delimiters");
  }
  if ((pathHas(path, "card_mod") || pathHas(path, "style")) && blockScalar && looksCssLike(text)) {
    return result("css", "high", "card_mod/style block with CSS evidence", "card-mod-style-block");
  }
  if (looksJavaScriptTemplate(text)) {
    return result("javascript", "high", "button-card JavaScript template evidence", "button-card-javascript-template");
  }
  if (looksJsonObject(text)) {
    return result("json", "medium", "JSON-shaped object scalar", "json-shaped-object");
  }
  if (pathHas(path, "content") && blockScalar && looksMarkdownHtml(text)) {
    return result("markdown-html", "medium", "Markdown content with markup evidence", "markdown-html-content");
  }
  return result("yaml", "low", "weak or host-only evidence stays in YAML", "weak-evidence-stays-yaml");
}

export function classifyLanguageFixture(fixture) {
  if (!fixture || typeof fixture !== "object") {
    return result("yaml", "low", "missing fixture stays in YAML", "weak-evidence-stays-yaml");
  }
  return classifyEmbeddedLanguageSnapshot({
    yamlPath: fixture.yamlPath,
    scalarStyle: fixture.scalarStyle,
    text: fixture.text,
  });
}

function languageFixtureDetectorResult(fixture) {
  const cursorOffset = languageFixtureCursorOffset(fixture);
  const classification = classifyLanguageFixture(fixture);
  return Object.freeze({
    fixtureId: String(fixture?.id ?? ""),
    expectedLaneId: String(fixture?.laneId ?? ""),
    actualLaneId: classification.laneId,
    expectation: String(fixture?.expectation ?? ""),
    cursorOffset,
    hasCursor: cursorOffset >= 0,
    textWithoutCursor: languageFixtureTextWithoutCursor(fixture),
    ok: classification.laneId === String(fixture?.laneId ?? ""),
    classification,
  });
}

export function embeddedLanguageDetectorContractStatus(fixtures = LANGUAGE_FIXTURES) {
  const results = fixtures.map((fixture) => languageFixtureDetectorResult(fixture));
  const passing = results.filter((item) => item.ok).length;
  return Object.freeze({
    ok: passing === results.length,
    stage: EMBEDDED_LANGUAGE_DETECTOR_STAGE,
    contractVersion: EMBEDDED_LANGUAGE_DETECTOR_CONTRACT_VERSION,
    laneIds: LANGUAGE_LANE_IDS.slice(),
    evidenceOrder: EMBEDDED_LANGUAGE_EVIDENCE_ORDER.slice(),
    fixtureCount: results.length,
    passing,
    failing: results.length - passing,
    registersProviders: false,
    drivesAutocomplete: false,
    opensPopup: false,
    insertsText: false,
    results: Object.freeze(results),
  });
}
