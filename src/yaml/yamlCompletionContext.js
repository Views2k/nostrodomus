// Nostrodomus YAML completion context descriptor module.
// Pure cursor/text -> context helpers with fixture coverage.

import { leadingWhitespace } from '../core/sanitize.js';
import * as branchState from './yamlBranchState.js';
import { recentLinesBeforeCursor } from './recentLines.js';

export const CONTEXT_DESCRIPTOR_VERSION = 1;

const DEFAULT_CONTEXT_DESCRIPTOR = Object.freeze({
  descriptorVersion: CONTEXT_DESCRIPTOR_VERSION,
  lang: 'yaml',
  prefix: '',
  pathText: '',
  yamlPath: Object.freeze([]),
  yamlKey: '',
  yamlRole: 'blank',
  valueKind: '',
  focusKind: '',
  branchState: null,
  scope: '',
  shouldSuggest: false,
  triggerKind: 'typing',
  isTriggerChar: false,
  afterKeyColon: false,
});


export const CONTEXT_DESCRIPTOR_FIELD_NAMES = Object.freeze(Object.keys(DEFAULT_CONTEXT_DESCRIPTOR));
export const YAML_CONTEXT_ROLES = Object.freeze(['blank', 'comment', 'key', 'list-key', 'value']);
const YAML_VALUE_KINDS = Object.freeze([
  '', 'action', 'automation-mode', 'boolean', 'card-type', 'condition-type', 'duration', 'entity', 'icon', 'number', 'service', 'string', 'scalar', 'theme', 'trigger-type'
]);

export function contextDescriptorValidationErrors(ctx) {
  const errors = [];
  if (!ctx || typeof ctx !== 'object') return ['descriptor must be an object'];
  if (ctx.descriptorVersion !== CONTEXT_DESCRIPTOR_VERSION) errors.push(`descriptorVersion must be ${CONTEXT_DESCRIPTOR_VERSION}`);
  for (const field of CONTEXT_DESCRIPTOR_FIELD_NAMES) {
    if (!(field in ctx)) errors.push(`missing field: ${field}`);
  }
  if (ctx.lang && !['yaml', 'css', 'jinja'].includes(String(ctx.lang))) errors.push(`unsupported lang: ${ctx.lang}`);
  if (!YAML_CONTEXT_ROLES.includes(String(ctx.yamlRole || ''))) errors.push(`unsupported yamlRole: ${ctx.yamlRole}`);
  if (!YAML_VALUE_KINDS.includes(String(ctx.valueKind || ''))) errors.push(`unsupported valueKind: ${ctx.valueKind}`);
  if (!Array.isArray(ctx.yamlPath)) errors.push('yamlPath must be an array');
  for (const field of ['prefix', 'pathText', 'yamlKey', 'yamlRole', 'valueKind', 'focusKind', 'scope', 'triggerKind']) {
    if (field in ctx && typeof ctx[field] !== 'string') errors.push(`${field} must be a string`);
  }
  for (const field of ['shouldSuggest', 'isTriggerChar', 'afterKeyColon']) {
    if (field in ctx && typeof ctx[field] !== 'boolean') errors.push(`${field} must be a boolean`);
  }
  return errors;
}

export function isValidContextDescriptor(ctx) {
  return contextDescriptorValidationErrors(ctx).length === 0;
}

const VALUE_KIND_BY_KEY = Object.freeze({
  action: 'action',
  card: 'card-type',
  condition: 'condition-type',
  entity: 'entity',
  entity_id: 'entity',
  icon: 'icon',
  mode: 'automation-mode',
  service: 'service',
  type: 'card-type',
});

const BOOLEAN_KEYS = new Set(['enabled', 'show_header_toggle', 'show_icon', 'show_name', 'show_state', 'tap_action_enabled']);
const NUMBER_KEYS = new Set([
  'brightness', 'brightness_pct', 'columns', 'height', 'hours_to_show', 'limit', 'line_size', 'line_width', 'margin',
  'max', 'min', 'opacity', 'padding', 'points_per_hour', 'refresh_interval', 'rows', 'size', 'step', 'stroke_width',
  'volume_level', 'width', 'z_index'
]);
const DURATION_KEYS = new Set(['delay', 'duration', 'for', 'hold_secs', 'scan_interval', 'tap_time', 'timeout', 'transition']);
const STRING_KEYS = new Set(['label', 'name', 'navigation_path', 'title', 'unit', 'unit_of_measurement', 'url_path']);
function clampCursor(sourceText, cursorPosition) {
  const size = String(sourceText || '').length;
  const numeric = Number(cursorPosition);
  if (!Number.isFinite(numeric)) return size;
  return Math.max(0, Math.min(size, Math.floor(numeric)));
}

function lineInfoAt(sourceText, cursorPosition) {
  const text = String(sourceText || '');
  const pos = clampCursor(text, cursorPosition);
  const lineStart = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  let lineEnd = text.indexOf('\n', pos);
  if (lineEnd < 0) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const col = pos - lineStart;
  return {
    pos,
    lineStart,
    lineEnd,
    line,
    col,
    beforeCursor: line.slice(0, col),
    afterCursor: line.slice(col),
  };
}

function splitRecentLines(sourceText, cursorPosition) {
  return recentLinesBeforeCursor(sourceText, cursorPosition);
}

// currentYamlPath and blockScalarContextAt are asked for the same text and cursor several times
// in one completion refresh (the context adapter, the branch scan, the providers). The last
// answer of each is kept; a copy is handed out so a caller can never change the kept one.
const lastPath = { text: null, pos: -1, value: null };
const lastBlockScalar = { text: null, pos: -1, value: undefined };

export function stripYamlCommentRespectingQuotes(value) {
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

export function yamlKeyFromLine(rawLine) {
  // Allow `$` and `.` in keys so card_mod shadow-DOM style blocks (`ha-card$: |`, `.: |`) register
  // as block-scalar openers and enter the CSS lane, instead of being read as YAML with no key.
  const line = String(rawLine || '');
  const match = line.match(/^(\s*)(?:-\s*)?([A-Za-z0-9_$.-]+)\s*:\s*(.*)$/);
  if (match) {
    return {
      indent: match[1].length,
      key: match[2],
      value: stripYamlCommentRespectingQuotes(match[3] || ''),
    };
  }
  // card_mod selectors as keys: quoted (`"ha-card $": |`), or with spaces when the value opens a
  // block scalar (`ha-icon $ ha-svg-icon: |`). Without these the block was not seen as a block
  // scalar and its CSS got YAML card keys.
  const quoted = line.match(/^(\s*)(?:-\s*)?(?:"([^"]*)"|'([^']*)')\s*:(?:\s+(.*))?$/);
  if (quoted) {
    return {
      indent: quoted[1].length,
      key: quoted[2] ?? quoted[3] ?? '',
      value: stripYamlCommentRespectingQuotes(quoted[4] || ''),
    };
  }
  const spaced = line.match(/^(\s*)(?:-\s*)?([A-Za-z0-9_$.:#>~+*[\]="'()-][^#]*?)\s*:\s+([|>][-+0-9]*\s*(?:#.*)?)$/);
  if (spaced && /\s/.test(spaced[2])) {
    return {
      indent: spaced[1].length,
      key: spaced[2].trim(),
      value: stripYamlCommentRespectingQuotes(spaced[3] || ''),
    };
  }
  return null;
}

// Block-scalar close bound: for a dash-prefixed opener (`- style: |`) sibling keys of
// the same list item sit at the KEY'S column (after the dash), deeper than the plain
// leading-whitespace indent, so the bound must include the dash segment width.
// The dash counts as a sequence indicator only when whitespace follows it: a key
// that merely begins with a dash (`-foo:`) is a plain mapping key at its own indent.
function yamlKeyColumn(rawLine, info) {
  const dash = /^(\s*)(-[ \t]+)/.exec(String(rawLine || ''));
  return dash ? dash[1].length + dash[2].length : info.indent;
}

export function yamlCursorRole(info) {
  const line = info?.line || '';
  const beforeCursor = info?.beforeCursor || '';
  const trimmed = line.trim();
  if (!trimmed) return 'blank';
  if (trimmed.startsWith('#')) return 'comment';
  if (/^\s*-\s*$/.test(beforeCursor)) return 'list-key';
  const colon = line.indexOf(':');
  if (colon < 0) return 'key';
  if ((info?.col ?? 0) <= colon) return 'key';
  return 'value';
}

// Keys whose value is a nested block (mapping or sequence), not a scalar. At the editor
// auto-indent column an empty one of these is being OPENED, so the cursor descends into
// it; an empty SCALAR field at its own column is a sibling being left blank and must pop.
// Structural Home Assistant card/automation keys only -- an unknown key defaults to the
// safe pop (the pre-auto-indent behavior), never to a wrong descend.
// Excludes keys that also take a scalar value (columns/rows are NUMBER_KEYS; layout is a
// mushroom/tile scalar; confirmation is boolean-capable) -- a key must be unambiguously a
// block to descend into it, or a field left empty would wrongly keep its leaf.
const BLOCK_CONTAINER_KEYS = new Set([
  'data', 'service_data', 'target',
  'tap_action', 'hold_action', 'double_tap_action',
  'triggers', 'conditions', 'actions', 'sequence', 'then', 'else',
  'choose', 'repeat', 'parallel',
  'entities', 'cards', 'card', 'elements', 'segments', 'sections', 'views', 'badges', 'grid_options',
  'variables', 'card_mod', 'styles', 'browser_mod', 'visibility',
]);

export function currentYamlPath(sourceText, cursorPosition) {
  const pathText = String(sourceText || '');
  const pathPos = clampCursor(pathText, cursorPosition);
  if (lastPath.value && lastPath.pos === pathPos && lastPath.text === pathText) return lastPath.value.slice();
  const value = computeCurrentYamlPath(pathText, pathPos);
  lastPath.text = pathText;
  lastPath.pos = pathPos;
  lastPath.value = value;
  return value.slice();
}

function computeCurrentYamlPath(sourceText, cursorPosition) {
  const lines = splitRecentLines(sourceText, cursorPosition);
  const stack = [];
  let blockScalarIndent = null;

  for (const raw of lines) {
    const trimmed = String(raw || '').trim();
    const indent = leadingWhitespace(raw).length;

    if (blockScalarIndent !== null) {
      if (trimmed && indent <= blockScalarIndent) blockScalarIndent = null;
      else continue;
    }

    const info = yamlKeyFromLine(raw);
    if (!info) continue;
    while (stack.length && stack[stack.length - 1].indent >= info.indent) stack.pop();
    stack.push({ indent: info.indent, key: info.key });
    if (/^[|>]/.test(String(info.value || '').trim())) blockScalarIndent = yamlKeyColumn(raw, info);
  }

  // Cursor-line sibling pop: when the cursor line did not parse as a key (a partial
  // key being typed, a blank, a comment, a dedent), the loop above never consulted
  // its indent, so a completed sibling would stay on the stack as a phantom leaf.
  // Pop entries at or below the cursor column. Three carve-outs: content of an open
  // block scalar stays anchored to its opener; dash lines pop strictly-deeper entries
  // only (a `- item` legally sits at its parent key's own indent); and an empty-valued
  // BLOCK-CONTAINER key immediately above the cursor is a block opener whose auto-indent
  // lands the new line at the key's OWN column (editors do not add a level), so a cursor
  // there opens that key's block rather than dedenting -- keep the opener. A SCALAR field
  // left empty (`transition:`) is not a container: the cursor there is a sibling field,
  // so it must still pop, or the block's own lane (service fields) dies.
  const cursorLine = lines[lines.length - 1] || '';
  if (blockScalarIndent === null && !yamlKeyFromLine(cursorLine)) {
    const cursorIndent = leadingWhitespace(cursorLine).length;
    const dashItem = /^\s*-(\s|$)/.test(cursorLine);
    const openerAbove = yamlKeyFromLine(lines[lines.length - 2] || '');
    const openerIsContainer = openerAbove
      && !String(openerAbove.value || '').trim()
      && BLOCK_CONTAINER_KEYS.has(String(openerAbove.key || '').toLowerCase());
    const openerIndent = openerIsContainer ? openerAbove.indent : null;
    const keepsOpener = openerIndent !== null && cursorIndent >= openerIndent;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.indent > cursorIndent) { stack.pop(); continue; }
      if (top.indent === cursorIndent && !dashItem && !(keepsOpener && top.indent === openerIndent)) { stack.pop(); continue; }
      break;
    }
  }

  return stack.map(item => item.key);
}

export function yamlBranchState(sourceText, cursorPosition) {
  return branchState.yamlBranchState(sourceText, cursorPosition);
}

function normalizedPathParts(path = []) {
  return Array.isArray(path) ? path.map(item => String(item || '').toLowerCase()).filter(Boolean) : [];
}

function pathIncludes(path = [], names = []) {
  const wanted = new Set(names.map(name => String(name || '').toLowerCase()));
  return normalizedPathParts(path).some(part => wanted.has(part));
}

function pathText(path = []) {
  return normalizedPathParts(path).join('.');
}

export function isDashboardActionPath(path = [], yamlKey = '') {
  const key = String(yamlKey || '').toLowerCase();
  const text = pathText(path);
  return ['tap_action', 'hold_action', 'double_tap_action'].includes(key) || /(^|\.)(tap_action|hold_action|double_tap_action)(\.|$)/.test(text);
}

function isAutomationScriptPath(path = [], yamlKey = '') {
  const key = String(yamlKey || '').toLowerCase();
  const text = pathText(path);
  if (['triggers', 'trigger', 'conditions', 'condition', 'actions', 'action', 'sequence', 'then', 'else', 'choose', 'repeat', 'parallel'].includes(key)) return true;
  return /(^|\.)(triggers|trigger|conditions|condition|actions|action|sequence|then|else|choose|repeat|parallel)(\.|$)/.test(text);
}

export function inferYamlScalarValueKind(yamlKey) {
  const key = String(yamlKey || '').toLowerCase();
  if (!key) return '';
  if (NUMBER_KEYS.has(key) || /(_width|_height|_size|_count|_minutes|_seconds|_hours|_pct|_percent)$/.test(key)) return 'number';
  if (DURATION_KEYS.has(key) || /(_duration|_timeout|_interval)$/.test(key)) return 'duration';
  if (STRING_KEYS.has(key)) return 'string';
  return '';
}

// NOT the live value-kind classifier. The runtime completion path derives valueKind from the two
// live copies — runtimeContextAdapter.yamlValueKind (detection) and yamlContextClassifier.yamlValueKind
// (provision) — which are pinned equivalent by tests/context/yaml_value_kind_parity.test.mjs. This
// (yamlKey, path, role) variant feeds only describeYamlCompletionContext / the yamlScanner facade and
// is not on the live lane; it uses a different path convention and intentionally diverges. To fix or
// add a completion value lane, edit the two live copies together — never here (that is exactly the
// dead-branch trap that silently broke the registry/platform/condition lanes).
export function inferYamlValueKind(yamlKey, path = [], role = '') {
  const key = String(yamlKey || '').toLowerCase();
  const lowerPath = normalizedPathParts(path);
  const text = lowerPath.join('.');
  if (role !== 'value' && role !== 'list-key') return '';
  if (!key && role === 'list-key' && /(^|\.)(entities)(\.|$)/.test(text)) return 'entity';
  if (!key) return '';
  if (key === 'entity' || key === 'entity_id' || key === 'entities' || key.endsWith('entity') || key.endsWith('entity_id')) return 'entity';
  if (key === 'service' || key === 'service_name' || key === 'perform_action') return 'service';
  if (key === 'action') return isAutomationScriptPath(lowerPath, key) && !isDashboardActionPath(lowerPath, key) ? 'service' : 'action';
  if (key === 'type') {
    if (pathIncludes(lowerPath, ['triggers', 'trigger'])) return 'trigger-type';
    if (pathIncludes(lowerPath, ['conditions', 'condition'])) return 'condition-type';
    return 'card-type';
  }
  if (key === 'trigger' || (key === 'platform' && pathIncludes(lowerPath, ['triggers', 'trigger']))) return 'trigger-type';
  if (key === 'condition' && pathIncludes(lowerPath, ['conditions', 'condition', 'choose', 'if'])) return 'condition-type';
  if (key === 'icon' || key.endsWith('_icon')) return 'icon';
  if (key === 'theme') return 'theme';
  // `mode:` under a service `data:` block is a service field, not the automation run-mode
  // (kept in sync with the adapter/classifier copies).
  if (key === 'mode' && !pathIncludes(lowerPath, ['data'])) return 'automation-mode';
  if (BOOLEAN_KEYS.has(key)) return 'boolean';
  if (lowerPath.includes('target') && (key === 'entity_id' || key === 'device_id' || key === 'area_id')) return 'entity';
  if (lowerPath.includes('data') && key.endsWith('_id')) return 'entity';
  if (VALUE_KIND_BY_KEY[key]) return VALUE_KIND_BY_KEY[key];
  return inferYamlScalarValueKind(key);
}

export function inferFocusKind(path = [], yamlKey = '') {
  const parts = Array.isArray(path) ? path.map(item => String(item || '').toLowerCase()) : [];
  const key = String(yamlKey || '').toLowerCase();
  const joined = parts.join('.');
  if (parts.some(part => part === 'style' || part === 'styles' || part === 'card_mod') || /(?:^|\.)style(?:\.|$)/.test(joined)) return 'style-block';
  if (parts.some(part => part === 'target') || key === 'entity_id' || key === 'entity') return 'entity-list';
  if (parts.some(part => part === 'tap_action' || part === 'hold_action' || part === 'double_tap_action')) return 'action-block';
  if (parts.some(part => part === 'trigger' || part === 'triggers')) return 'trigger-block';
  if (parts.some(part => part === 'condition' || part === 'conditions')) return 'condition-block';
  if (parts.some(part => part === 'action' || part === 'actions' || part === 'sequence')) return 'automation-action';
  return '';
}

function inferEmbeddedLanguage(sourceText, cursorPosition, path = []) {
  const text = String(sourceText || '');
  const pos = clampCursor(text, cursorPosition);
  const before = text.slice(Math.max(0, pos - 1200), pos);
  const parts = Array.isArray(path) ? path.map(item => String(item || '').toLowerCase()) : [];
  if (/({{|{%|{#)[\s\S]*$/.test(before) || /\|\s*[A-Za-z_][\w_]*$/.test(before.split('\n').pop() || '')) return 'jinja';
  if (parts.includes('card_mod') || parts.includes('style') || parts.includes('styles')) return 'css';
  return 'yaml';
}

// Classify which Home Assistant template-function argument the cursor sits in, so the live-entity
// provider can fire inside `states('|')` / `is_state('|')` / `state_attr('x', '|')`. Pure,
// regex-only, fail-dark: returns the fixed shape on any miss/hostile input and never throws.
// expectKind 'entity' for a first-arg id position; 'attribute' for state_attr's second arg
// (computed forward-compatibly; the provider serves only 'entity' until an attribute cache exists).
// is_state's second arg is the value to match, not an entity, so it returns the empty default and no
// entity completion fires there.
export function classifyJinjaCallArg(textBefore) {
  const empty = { fn: '', argIndex: -1, inStringLiteral: false, expectKind: '' };
  try {
    const s = typeof textBefore === 'string' ? textBefore : '';
    const tail = s.slice(-200);
    // state_attr 2nd arg: state_attr('light.x', '|   (first arg closed, comma, cursor in arg 2)
    // The arg token is an id being typed ([\w.-]); crucially it must NOT contain ')' or the match
    // would run PAST the call's close and leak fn/expectKind onto a later, unrelated expression
    // (an UNQUOTED arg like states(x) has no closing quote to stop the old [^'"]* pattern).
    const arg1 = tail.match(/\b(state_attr)\s*\(\s*(['"])[^'"]*\2\s*,\s*(['"]?)([\w.-]*)$/);
    if (arg1) {
      return { fn: 'state_attr', argIndex: 1, inStringLiteral: arg1[3] === "'" || arg1[3] === '"', expectKind: 'attribute' };
    }
    // 1st arg of an entity-taking function: states('| / is_state('| / state_attr('| / expand('| / ...
    const arg0 = tail.match(/\b(states|is_state|state_attr|expand|area_id|device_id|has_value)\s*\(\s*(['"]?)([\w.-]*)$/);
    if (arg0) {
      return { fn: arg0[1], argIndex: 0, inStringLiteral: arg0[2] === "'" || arg0[2] === '"', expectKind: 'entity' };
    }
  } catch { /* fail-dark */ }
  return empty;
}

// The opening of a template block that the typed word follows directly: '{%', '{% ', '{%- ' and
// so on, or '' when the text in front of the word does not end in one (inside `{{ }}`, further
// into a block, or when the `{%` is itself the typed prefix). Rows that bring their own `{%` use
// it to tell whether they fit at the cursor and how much of their text is already there.
export function templateBlockOpening(ctx) {
  const before = String(ctx?.beforeCursor || '');
  const prefix = String(ctx?.prefix || '');
  const head = prefix && before.endsWith(prefix) ? before.slice(0, before.length - prefix.length) : before;
  const open = /\{%-?[ \t]*$/.exec(head);
  return open ? open[0] : '';
}

// Whether a new CSS rule can start at the cursor of a style block: not between the braces of an
// open rule (the context adapter reports that as cssInsideRule) and not after a property colon on
// the cursor line (`color: ha`). A pseudo-class colon (`:host ha`) has no blank after it.
export function cssRuleCanStartAt(ctx) {
  if (ctx?.cssInsideRule === true) return false;
  const before = String(ctx?.beforeCursor || '');
  const prefix = String(ctx?.prefix || '');
  const head = prefix && before.endsWith(prefix) ? before.slice(0, before.length - prefix.length) : before;
  return !/:(?:\s|$)/.test(head);
}

export function extractCompletionPrefix(info, role = '') {
  const before = String(info?.beforeCursor || '');
  if (role === 'value') {
    const colon = before.lastIndexOf(':');
    const valueText = colon >= 0 ? before.slice(colon + 1) : before;
    const match = valueText.match(/([A-Za-z0-9_./:-]+)$/);
    return match ? match[1] : '';
  }
  const match = before.match(/([A-Za-z0-9_-]+)$/);
  return match ? match[1] : '';
}

export function shouldSuggestForContext(role, info, options = {}) {
  if (options.force === true) return true;
  if (role === 'comment') return false;
  const before = String(info?.beforeCursor || '');
  if (!before.trim()) return true;
  if (role === 'key' || role === 'list-key' || role === 'value' || role === 'blank') return true;
  return false;
}


export function blockScalarContextAt(sourceText, cursorPosition) {
  const text = String(sourceText || '');
  const pos = clampCursor(text, cursorPosition);
  if (lastBlockScalar.value !== undefined && lastBlockScalar.pos === pos && lastBlockScalar.text === text) {
    const kept = lastBlockScalar.value;
    return kept ? { ...kept, path: kept.path.slice() } : null;
  }
  const value = computeBlockScalarContextAt(text, pos);
  lastBlockScalar.text = text;
  lastBlockScalar.pos = pos;
  lastBlockScalar.value = value;
  return value ? { ...value, path: value.path.slice() } : null;
}

function computeBlockScalarContextAt(text, pos) {
  const lines = splitRecentLines(text, pos);
  const stack = [];
  let active = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] || '';
    const trimmed = raw.trim();
    const indent = leadingWhitespace(raw).length;

    if (active) {
      if (trimmed && indent <= active.bound) active = null;
      else continue;
    }

    if (!trimmed || trimmed.startsWith('#') || /^---\s*$/.test(trimmed) || /^\.\.\.\s*$/.test(trimmed)) continue;

    const info = yamlKeyFromLine(raw);
    if (!info) continue;
    while (stack.length && stack[stack.length - 1].indent >= info.indent) stack.pop();
    stack.push({ indent: info.indent, key: info.key });
    if (/^[|>]/.test(String(info.value || '').trim())) {
      active = {
        key: info.key,
        indent: info.indent,
        bound: yamlKeyColumn(raw, info),
        path: stack.map(item => item.key),
        indicator: String(info.value || '').trim()[0] || '|',
        lineIndex: index,
      };
    }
  }

  if (!active) return null;
  return {
    key: active.key,
    indent: active.indent,
    path: active.path,
    indicator: active.indicator,
  };
}

export function describeYamlCompletionContext(sourceText, cursorPosition = undefined, options = {}) {
  const text = String(sourceText || '');
  const pos = clampCursor(text, cursorPosition);
  const info = lineInfoAt(text, pos);
  const blockScalar = blockScalarContextAt(text, pos);
  const path = blockScalar?.path || currentYamlPath(text, pos);
  const lineKey = yamlKeyFromLine(info.line);
  const role = blockScalar ? 'value' : yamlCursorRole(info);
  const yamlKey = blockScalar?.key || lineKey?.key || path[path.length - 1] || '';
  const lang = inferEmbeddedLanguage(text, pos, path);
  const valueKind = inferYamlValueKind(yamlKey, path, role);
  const focusKind = inferFocusKind(path, yamlKey);
  const prefix = extractCompletionPrefix(info, role);
  const afterKeyColon = role === 'value' && /:\s*$/.test(info.beforeCursor);
  const triggerKind = options.triggerKind || 'typing';

  return {
    descriptorVersion: CONTEXT_DESCRIPTOR_VERSION,
    lang,
    prefix,
    pathText: path.join('.').toLowerCase(),
    yamlPath: path,
    yamlKey,
    yamlRole: role,
    valueKind,
    focusKind,
    branchState: yamlBranchState(text, pos),
    scope: path.join('.').toLowerCase(),
    shouldSuggest: shouldSuggestForContext(role, info, options),
    triggerKind,
    isTriggerChar: options.isTriggerChar === true || /[:\-\s]$/.test(info.beforeCursor),
    afterKeyColon,
  };
}
