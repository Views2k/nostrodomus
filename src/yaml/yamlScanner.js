// Nostrodomus YAML scanner compatibility module.
// Pure scanner facade over yamlCompletionContext.
// This file intentionally has no DOM, editor state, localStorage, fetch, or global side effects.

import { SECURITY_LIMITS } from '../core/runtimeConstants.js';
import {
  blockScalarContextAt,
  currentYamlPath as contextCurrentYamlPath,
  describeYamlCompletionContext,
  extractCompletionPrefix,
  inferFocusKind,
  inferYamlScalarValueKind,
  isDashboardActionPath,
  shouldSuggestForContext,
  stripYamlCommentRespectingQuotes,
  yamlBranchState as contextYamlBranchState,
  yamlCursorRole as contextYamlCursorRole,
  yamlKeyFromLine,
} from './yamlCompletionContext.js';

export function yamlPathText(ctx) {
  const path = Array.isArray(ctx?.yamlPath) ? ctx.yamlPath : [];
  return path.map(item => String(item || '').toLowerCase()).filter(Boolean).join('.');
}

export function recentYamlText(sourceTextOrCtx, cursorPosition = undefined, radius = 2400) {
  if (sourceTextOrCtx && typeof sourceTextOrCtx === 'object' && typeof sourceTextOrCtx.sourceText === 'string') {
    const source = sourceTextOrCtx.sourceText;
    const pos = Number.isFinite(Number(sourceTextOrCtx.cursorPosition)) ? Number(sourceTextOrCtx.cursorPosition) : source.length;
    return source.slice(Math.max(0, pos - radius), pos).toLowerCase();
  }
  const source = String(sourceTextOrCtx || '');
  const pos = Number.isFinite(Number(cursorPosition)) ? Math.max(0, Math.min(source.length, Math.floor(Number(cursorPosition)))) : source.length;
  return source.slice(Math.max(0, pos - radius), pos).toLowerCase();
}

export function currentYamlPath(doc, pos) {
  return contextCurrentYamlPath(String(doc || ''), pos);
}

export function yamlCursorRole(info) {
  return contextYamlCursorRole(info || {});
}

export function yamlCurrentKey(info) {
  const parsed = yamlKeyFromLine(info?.line || '');
  return parsed ? parsed.key : '';
}

// A trailing YAML or Python comment begins at an unquoted `#` at line start or after whitespace,
// as in stripYamlCommentRespectingQuotes. If one appears in the text before the cursor, the
// cursor is inside that comment. A `#` after another character (an `a#b` value) or inside quotes
// is not a comment; CSS `#id` and `#fff` are left out by the language check of the caller.
function cursorInsideHashComment(text) {
  const s = String(text || '');
  let quote = '';
  let escaped = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(s[i - 1] || ''))) return true;
  }
  return false;
}

export function isCommentContext(lang, info, recent = '') {
  const line = info?.line || '';
  const beforeCursor = info?.beforeCursor || '';
  const trimmed = line.trim();
  if (!trimmed) return false;

  const beforeTrim = beforeCursor.trimStart();
  const lineBeforeCursor = beforeCursor;
  const scanned = `${recent || ''}\n${beforeCursor}`;

  // `/* … */` is a comment only in CSS and JS, `<!-- … -->` only in HTML, so those scans depend on
  // the detected language: a `/*` in a YAML string (a URL) or a `<!--` in markdown content is not
  // a comment. The cross-line scans below read the whole recent text (about 1,600 characters), so
  // a wrong hit would silence completion for everything after it. A card_mod style block reports
  // lang 'css' and a `<tag` line reports 'html'.
  const cssLike = lang === 'css' || lang === 'js';
  const htmlLike = lang === 'html';

  // Line-start comment markers depend on the language: `#` is a comment in YAML and Python but an
  // id selector in a card_mod CSS block; `//` is a comment in JS and CSS but a value (a `//host`
  // path) in YAML. Each counts only where it starts a comment, as in the before-cursor checks
  // below. `{#` is a Jinja comment everywhere.
  if ((lang === 'yaml' || lang === 'python') && trimmed.startsWith('#')) return true;
  // Trailing comment: the cursor is after an unquoted `#` later on the value line
  // (`entity: light.a # kit|`), where an accepted row would overwrite the comment word.
  if ((lang === 'yaml' || lang === 'python') && cursorInsideHashComment(lineBeforeCursor)) return true;
  if (cssLike && trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('{#')) return true;
  if (htmlLike && trimmed.startsWith('<!--')) return true;

  if (cssLike) {
    const cssOpen = lineBeforeCursor.lastIndexOf('/*');
    const cssClose = lineBeforeCursor.lastIndexOf('*/');
    if (cssOpen !== -1 && cssOpen > cssClose) return true;
    if (beforeTrim.startsWith('/*')) return true;
  }

  if (htmlLike) {
    const htmlOpen = lineBeforeCursor.lastIndexOf('<!--');
    const htmlClose = lineBeforeCursor.lastIndexOf('-->');
    if (htmlOpen !== -1 && htmlOpen > htmlClose) return true;
  }

  const jinjaOpen = lineBeforeCursor.lastIndexOf('{#');
  const jinjaClose = lineBeforeCursor.lastIndexOf('#}');
  if (jinjaOpen !== -1 && jinjaOpen > jinjaClose) return true;

  // In a CSS block inside YAML (card_mod `style: |`), a `/*` above the block opener is YAML text,
  // not a CSS comment, so the cross-line `/*` scan reads only the block body. CSS text without a
  // block opener is scanned in full.
  const cssBody = (() => {
    if (!cssLike) return scanned;
    const lines = scanned.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/^\s*(?:-\s*)?[\w-]+\s*:\s*[|>][+-]?\s*(?:#.*)?$/.test(lines[i])) return lines.slice(i + 1).join('\n');
    }
    return scanned;
  })();
  if (cssLike && cssBody.lastIndexOf('/*') > cssBody.lastIndexOf('*/')) return true;
  if (htmlLike && scanned.lastIndexOf('<!--') > scanned.lastIndexOf('-->')) return true;
  if (scanned.lastIndexOf('{#') > scanned.lastIndexOf('#}')) return true;

  if ((lang === 'js' || lang === 'css') && beforeTrim.startsWith('//')) return true;
  if ((lang === 'yaml' || lang === 'python') && beforeTrim.startsWith('#')) return true;
  return false;
}

export function stripYamlComment(value) {
  return stripYamlCommentRespectingQuotes(value);
}

export function directYamlKey(raw) {
  return yamlKeyFromLine(raw);
}

export function yamlBranchState(doc, pos) {
  return contextYamlBranchState(String(doc || ''), pos);
}

export function yamlScalarValueKind(yamlKey) {
  return inferYamlScalarValueKind(yamlKey);
}

export function isScalarValueKind(valueKind) {
  return ['number', 'duration', 'string', 'boolean', 'theme', 'icon', 'entity', 'service', 'action', 'trigger-type', 'condition-type', 'card-type', 'automation-mode'].includes(String(valueKind || ''));
}

export function isScalarConfigContext(ctx) {
  return Boolean(ctx && ctx.yamlRole === 'value' && isScalarValueKind(ctx.valueKind));
}

export function scalarValueContext(ctx) {
  return isScalarConfigContext(ctx) ? {
    valueKind: ctx.valueKind,
    yamlKey: ctx.yamlKey || '',
    pathText: yamlPathText(ctx),
    focusKind: ctx.focusKind || '',
  } : null;
}

export function yamlFocusKind(path = [], yamlKey = '') {
  return inferFocusKind(path, yamlKey);
}

export function detectContext(sourceText, cursorPosition = undefined, options = {}) {
  const ctx = describeYamlCompletionContext(sourceText, cursorPosition, options);
  const source = String(sourceText || '');
  const pos = Number.isFinite(Number(cursorPosition)) ? Math.max(0, Math.min(source.length, Math.floor(Number(cursorPosition)))) : source.length;
  const lineStart = source.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  let lineEnd = source.indexOf('\n', pos);
  if (lineEnd < 0) lineEnd = source.length;
  const currentLine = source.slice(lineStart, lineEnd);
  const lineNumber = source.slice(0, pos).split('\n').length;
  const beforeCursor = currentLine.slice(0, pos - lineStart);
  const afterCursor = currentLine.slice(pos - lineStart);
  const blockScalar = blockScalarContextAt(source, pos);
  const blockScalarIndent = blockScalar?.indent ?? null;
  const yamlPath = ctx.yamlPath || [];
  const yamlKey = ctx.yamlKey || '';

  return {
    ...ctx,
    pathText: yamlPathText(ctx),
    focusKind: ctx.focusKind || yamlFocusKind(yamlPath, yamlKey),
    currentLine,
    lineNumber,
    beforeCursor,
    afterCursor,
    selection: options.selection || null,
    existingKeyContext: Boolean(yamlKey && beforeCursor.includes(':')),
    scalarValueContext: scalarValueContext(ctx),
    blockScalarIndent,
    blockScalar,
    recent: recentYamlText(source, pos, SECURITY_LIMITS.maxDocScanChars),
    prefix: ctx.prefix || extractCompletionPrefix({ beforeCursor }, ctx.yamlRole),
    shouldSuggest: shouldSuggestForContext(ctx.yamlRole, { beforeCursor }, options),
    dashboardActionPath: isDashboardActionPath(yamlPath, yamlKey),
  };
}
