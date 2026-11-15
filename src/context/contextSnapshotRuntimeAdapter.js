// Nostrodomus ContextSnapshot dry-run runtime adapter.
//
// Keep this module pure: no DOM access, browser storage, timers, observers, Home Assistant
// reads, runtime state mutation, logging, or network access. The browser bundle owns exposing
// diagnostics globals and recording runtime errors.

import { completionWordTo, contextAdapterYamlKey } from '../yaml/runtimeContextAdapter.js';

const CONTEXT_SNAPSHOT_CONTRACT_VERSION = 1;
export const NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_STAGE = 'context-snapshot-dry-run';
const NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_VERSION = 1;
const NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_MAX_SCAN_CHARS = 20000;

export function createContextSnapshotContract() {
  return {
    version: CONTEXT_SNAPSHOT_CONTRACT_VERSION,
    language: '',
    scope: '',
    confidence: 0,
    cursor: { pos: 0, line: '', col: 0, beforeCursor: '', afterCursor: '' },
    yaml: { role: '', key: '', path: [], indent: 0, isBlankLine: false, afterKeyColon: false, valueKind: '', blockValueKind: '', isComment: false },
    branch: { kind: '', parentKey: '', actionValue: '', activeChildKey: '', usedKeys: [], missingKeys: [], canContinue: false },
    card: { type: '', customType: '', looksLikeButtonCard: false },
    suggestion: { triggerKind: '', prefix: '', from: 0, to: 0, shouldSuggest: false, suppressPopup: false, idleReason: '' },
    runtime: { entitiesAvailable: false, servicesAvailable: false, devicesAvailable: false, areasAvailable: false },
  };
}

function contextAdapterEmptySnapshot() {
  const base = createContextSnapshotContract();
  return JSON.parse(JSON.stringify(base));
}

export function contextAdapterClampPosition(doc, pos) {
  const safeDoc = typeof doc === 'string' ? doc : '';
  const raw = Number.isFinite(pos) ? pos : safeDoc.length;
  return Math.max(0, Math.min(safeDoc.length, raw));
}

export function contextAdapterLineInfo(doc, pos) {
  const safeDoc = typeof doc === 'string' ? doc : '';
  const safePos = contextAdapterClampPosition(safeDoc, pos);
  const start = safeDoc.lastIndexOf('\n', safePos - 1) + 1;
  let end = safeDoc.indexOf('\n', safePos);
  if (end < 0) end = safeDoc.length;
  const line = safeDoc.slice(start, end);
  const col = safePos - start;
  return {
    pos: safePos,
    line,
    col,
    beforeCursor: line.slice(0, col),
    afterCursor: line.slice(col),
  };
}

export function contextAdapterYamlRole(lineInfo) {
  const line = lineInfo?.line || '';
  const before = lineInfo?.beforeCursor || '';
  const trimmed = line.trim();
  if (!trimmed) return 'blank';
  if (trimmed.startsWith('#')) return 'comment';
  if (/^\s*-\s*$/.test(before)) return 'list-key';
  const colon = line.indexOf(':');
  if (colon < 0) return 'key';
  return (lineInfo?.col ?? 0) <= colon ? 'key' : 'value';
}

export function normalizeContextSnapshot(snapshot, overrides) {
  const normalized = Object.assign(contextAdapterEmptySnapshot(), snapshot || {});
  const patch = overrides || {};
  for (const key of Object.keys(patch)) {
    if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key]) && normalized[key] && typeof normalized[key] === 'object') {
      normalized[key] = Object.assign({}, normalized[key], patch[key]);
    } else {
      normalized[key] = patch[key];
    }
  }
  return normalized;
}

export function collectContextSnapshotDryRun(input) {
  const options = input || {};
  const rawDoc = typeof options.doc === 'string' ? options.doc : '';
  // Only the last part of a text longer than the scan cap is read, or, for a cursor above that
  // part, the part that ends with the cursor's own line. The cursor position counts from the
  // start of the whole text and is shifted by the part cut off; positions in the readout count
  // from the start of the part read.
  let sliceStart = rawDoc.length > NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_MAX_SCAN_CHARS
    ? rawDoc.length - NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_MAX_SCAN_CHARS
    : 0;
  let sliceEnd = rawDoc.length;
  const rawPos = Number.isFinite(options.pos) ? options.pos : rawDoc.length;
  const cursorPos = contextAdapterClampPosition(rawDoc, rawPos);
  if (cursorPos < sliceStart) {
    const lineEnd = rawDoc.indexOf('\n', cursorPos);
    sliceEnd = Math.min(lineEnd < 0 ? rawDoc.length : lineEnd, cursorPos + NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_MAX_SCAN_CHARS);
    sliceStart = Math.max(0, sliceEnd - NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_MAX_SCAN_CHARS);
  }
  const doc = sliceStart > 0 || sliceEnd < rawDoc.length ? rawDoc.slice(sliceStart, sliceEnd) : rawDoc;
  const pos = contextAdapterClampPosition(doc, rawPos - sliceStart);
  const cursor = contextAdapterLineInfo(doc, pos);
  const role = contextAdapterYamlRole(cursor);
  const isComment = role === 'comment';
  const prefixMatch = /[A-Za-z0-9_:$#{}%./-]+$/.exec(cursor.beforeCursor || '');
  const snapshot = normalizeContextSnapshot(null, {
    language: 'yaml',
    scope: options.scope || 'dry-run',
    confidence: 0.25,
    cursor,
    yaml: {
      role,
      key: contextAdapterYamlKey(cursor.line),
      path: Array.isArray(options.path) ? options.path.slice(0, 20) : [],
      indent: (cursor.beforeCursor.match(/^\s*/) || [''])[0].length,
      isBlankLine: !(cursor.line || '').trim(),
      afterKeyColon: /:\s*$/.test(cursor.beforeCursor || ''),
      valueKind: '',
      blockValueKind: '',
      isComment,
    },
    suggestion: {
      triggerKind: 'dry-run',
      prefix: prefixMatch ? prefixMatch[0] : '',
      from: pos,
      to: pos,
      wordTo: completionWordTo(doc, pos, { lang: 'yaml', yamlRole: role }),
      shouldSuggest: ['blank', 'key', 'list-key'].includes(role) && !isComment,
      suppressPopup: isComment,
      idleReason: 'runtime-adapter-dry-run-only',
    },
    runtime: {
      entitiesAvailable: false,
      servicesAvailable: false,
      devicesAvailable: false,
      areasAvailable: false,
    },
  });
  return {
    ok: true,
    dryRunOnly: true,
    stage: NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_STAGE,
    version: NOSTRODOMUS_CONTEXT_RUNTIME_ADAPTER_VERSION,
    snapshot,
    warnings: [],
  };
}
