// Nostrodomus YAML branch-state inference module.
//
// Pure helper used by yamlCompletionContext/yamlScanner/runtimeContextAdapter.
// Keep this file free of DOM, editor, browser storage, network, timer, and runtime state ownership.

import { leadingWhitespace } from '../core/sanitize.js';
import { recentLinesBeforeCursor } from './recentLines.js';

const ACTION_PARENT_KEYS = new Set(['action', 'actions', 'sequence', 'then', 'else', 'choose', 'repeat', 'parallel']);

function splitRecentLines(sourceText, cursorPosition) {
  return recentLinesBeforeCursor(sourceText, cursorPosition);
}

function stripYamlCommentRespectingQuotes(value) {
  const text = String(value || '');
  let quote = '';
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1] || ''))) {
      return text.slice(0, i).trim();
    }
  }
  return text.trim();
}

function yamlBranchKeyFromLine(rawLine) {
  const match = String(rawLine || '').match(/^(\s*)(?:-\s*)?([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
  if (!match) return null;
  return {
    indent: match[1].length,
    key: match[2],
    value: stripYamlCommentRespectingQuotes(match[3] || ''),
  };
}

export function yamlBranchState(sourceText, cursorPosition) {
  const lines = splitRecentLines(sourceText, cursorPosition);
  if (!lines.length) return null;
  const currentRaw = lines[lines.length - 1] || '';
  const currentIndent = leadingWhitespace(currentRaw).length;
  const currentKeyInfo = yamlBranchKeyFromLine(currentRaw);

  let parentIndex = -1;
  let parentKey = '';
  let parentIndent = -1;
  let parentValue = '';

  if (currentKeyInfo && ACTION_PARENT_KEYS.has(currentKeyInfo.key)) {
    parentIndex = lines.length - 1;
    parentKey = currentKeyInfo.key;
    parentIndent = currentKeyInfo.indent;
    parentValue = currentKeyInfo.value;
  } else {
    for (let i = lines.length - 2; i >= 0; i -= 1) {
      const info = yamlBranchKeyFromLine(lines[i]);
      if (!info) continue;
      if (info.indent >= currentIndent && currentIndent > 0) continue;
      if (ACTION_PARENT_KEYS.has(info.key)) {
        parentIndex = i;
        parentKey = info.key;
        parentIndent = info.indent;
        parentValue = info.value;
        break;
      }
    }
  }

  if (parentIndex < 0) return null;

  const childIndent = parentIndent + 2;
  const siblings = {};
  for (let i = parentIndex + 1; i < lines.length; i += 1) {
    const info = yamlBranchKeyFromLine(lines[i]);
    if (!info) continue;
    if (info.indent <= parentIndent) break;
    if (info.indent === childIndent) siblings[info.key] = { value: info.value, indent: info.indent, lineIndex: i };
  }

  return {
    parentKey,
    parentIndent,
    // The parent line's own already-parsed scalar value (e.g. the service id on
    // a modern `- action: light.turn_on` step) — exposed, not re-parsed.
    parentValue,
    currentIndent,
    siblings,
    action: siblings.action?.value || siblings.service?.value || '',
  };
}
