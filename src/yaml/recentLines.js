// The lines before the cursor that the YAML context helpers scan.
//
// One completion refresh asks for the same window from currentYamlPath (two or three times),
// blockScalarContextAt, dashboardActionBranchState, yamlBranchState and the catalog card lookup.
// The window covers up to 24,000 characters, so the one of the last request is kept and a
// refresh splits the text once instead of once per caller.
//
// Pure: no DOM, editor, storage, network or timers. The returned array is frozen and shared;
// callers read it and never change it.

import { SECURITY_LIMITS } from '../core/runtimeConstants.js';

let lastText = null;
let lastPos = -1;
let lastLines = null;

function clampCursorPosition(sourceText, cursorPosition) {
  const size = String(sourceText || '').length;
  const numeric = Number(cursorPosition);
  if (!Number.isFinite(numeric)) return size;
  return Math.max(0, Math.min(size, Math.floor(numeric)));
}

/**
 * The last SECURITY_LIMITS.maxYamlPathLines lines of the SECURITY_LIMITS.maxDocScanChars
 * characters before the cursor. The last entry is the cursor line up to the cursor.
 * @param {string} sourceText
 * @param {number} [cursorPosition]
 * @returns {readonly string[]}
 */
export function recentLinesBeforeCursor(sourceText, cursorPosition) {
  const text = String(sourceText || '');
  const pos = clampCursorPosition(text, cursorPosition);
  if (lastLines && pos === lastPos && text === lastText) return lastLines;
  const start = Math.max(0, pos - SECURITY_LIMITS.maxDocScanChars);
  const lines = Object.freeze(text.slice(start, pos).split('\n').slice(-SECURITY_LIMITS.maxYamlPathLines));
  lastText = text;
  lastPos = pos;
  lastLines = lines;
  return lines;
}

// The number of line breaks before the position, plus one. Counted without building the lines.
export function lineNumberAt(sourceText, position) {
  const text = String(sourceText || '');
  const pos = clampCursorPosition(text, position);
  let count = 1;
  for (let at = text.indexOf('\n'); at !== -1 && at < pos; at = text.indexOf('\n', at + 1)) count += 1;
  return count;
}
