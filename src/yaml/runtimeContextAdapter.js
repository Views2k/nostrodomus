// Nostrodomus runtime context adapter.
// Owns the pure runtime detectContext; the browser bundle owns DOM and runtime state, so
// keep this file DOM-free and state-free: pass settings in through options.

import { leadingWhitespace } from '../core/sanitize.js';
import { NATIVE_CARD_TYPES } from '../core/runtimeConstants.js';
import {
  currentYamlPath,
  isCommentContext,
  yamlBranchState,
  yamlCursorRole,
} from './yamlScanner.js';
import { directYamlKey, stripYamlComment, yamlCurrentKey } from './plainYamlKey.js';
import { getProviderSurfaceByCardType } from '../providers/hacsProviderCatalog.js';
import { BUILT_IN_ICON_PREFIXES } from '../providers/iconSetCatalog.js';
import { blockScalarContextAt, classifyJinjaCallArg } from './yamlCompletionContext.js';
import { lineNumberAt, recentLinesBeforeCursor } from './recentLines.js';

const DEFAULT_SETTINGS = Object.freeze({
  triggerMode: 'auto',
  minChars: 1,
  suggestInComments: false,
});

const FALLBACK_ENTITY_DOMAINS = new Set([
  'alarm_control_panel', 'automation', 'binary_sensor', 'button', 'calendar', 'camera', 'climate',
  'cover', 'device_tracker', 'fan', 'humidifier', 'input_boolean', 'input_button', 'input_datetime',
  'input_number', 'input_select', 'input_text', 'light', 'lock', 'media_player', 'number', 'person',
  'remote', 'scene', 'script', 'select', 'sensor', 'siren', 'switch', 'timer', 'update', 'vacuum',
  'water_heater', 'weather', 'zone'
]);

// The entity domains of one data snapshot. The entities array belongs to the snapshot and is
// replaced together with it, so its domain set is built once (from up to 10,000 entity ids)
// and dropped with the array.
const domainSetByEntities = new WeakMap();

function runtimeEntityDomainSet(runtimeData = null) {
  const data = typeof runtimeData === 'function' ? runtimeData() : runtimeData;
  const entities = Array.isArray(data?.entities) ? data.entities : null;
  if (!entities) return FALLBACK_ENTITY_DOMAINS;
  const kept = domainSetByEntities.get(entities);
  if (kept) return kept;
  const domains = new Set();
  for (const id of entities) {
    const m = /^([a-z_][a-z0-9_]*)\./.exec(String(id || '').toLowerCase());
    if (m) domains.add(m[1]);
  }
  if (!domains.size) for (const domain of FALLBACK_ENTITY_DOMAINS) domains.add(domain);
  domainSetByEntities.set(entities, domains);
  return domains;
}

function unquoteYamlScalarToken(value = '') {
  return String(value || '').replace(/^['"]|['"]$/g, '').trim();
}

function yamlValuePrefixLooksLikeEntityId(value = '', runtimeData = null) {
  const token = unquoteYamlScalarToken(value);
  const match = /^([a-z_][a-z0-9_]*)\.[A-Za-z0-9_]*$/.exec(token);
  if (!match) return false;
  return runtimeEntityDomainSet(runtimeData).has(match[1]);
}

// The text of the template string the cursor is in (`{{ 'm3o:li|`), or null outside a string. It
// reads from the last {{ or {% before the cursor; a string does not span lines.
function templateStringBeforeCursor(recent) {
  const text = String(recent || '');
  const open = Math.max(text.lastIndexOf('{{'), text.lastIndexOf('{%'));
  if (open < 0) return null;
  let quote = '';
  let start = -1;
  for (let i = open + 2; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      start = i + 1;
    }
  }
  if (!quote) return null;
  const literal = text.slice(start);
  return literal.includes('\n') ? null : literal;
}

const ICON_NAME_START_RX = /^([a-z0-9][a-z0-9_-]*):[a-z0-9_.-]*$/i;

// Whether `text` starts like an icon name: the prefix of mdi or of an installed icon set, then a
// colon.
function looksLikeIconName(text, runtimeData = null) {
  const match = ICON_NAME_START_RX.exec(String(text || ''));
  if (!match) return false;
  const prefix = match[1].toLowerCase();
  if (BUILT_IN_ICON_PREFIXES.includes(prefix)) return true;
  const data = typeof runtimeData === 'function' ? runtimeData() : runtimeData;
  return Array.isArray(data?.iconSetPrefixes) && data.iconSetPrefixes.includes(prefix);
}

function yamlValueLinePrefix(info) {
  const line = String(info?.line || '');
  const col = Number.isFinite(Number(info?.col)) ? Math.max(0, Math.min(line.length, Number(info.col))) : line.length;
  const before = line.slice(0, col);
  const colon = before.indexOf(':');
  if (colon < 0) return '';
  return before.slice(colon + 1).trimStart();
}

const ACTION_PARENT_KEYS = new Set(['tap_action', 'hold_action', 'double_tap_action']);
const ICON_ACTION_KEYS = ['icon_tap_action', 'icon_hold_action', 'icon_double_tap_action'];
const ACTION_BRANCHES = Object.freeze({
  'call-service': { keys: ['service', 'target', 'data', 'confirmation'], required: ['service'], terminal: false },
  'perform-action': { keys: ['perform_action', 'target', 'data', 'confirmation'], required: ['perform_action'], terminal: false },
  navigate: { keys: ['navigation_path', 'confirmation'], required: ['navigation_path'], terminal: false },
  url: { keys: ['url_path', 'confirmation'], required: ['url_path'], terminal: false },
  'fire-dom-event': { keys: ['browser_mod', 'confirmation'], required: [], terminal: false },
  toggle: { keys: ['confirmation'], required: [], terminal: true },
  'more-info': { keys: ['entity', 'confirmation'], required: [], terminal: true },
  none: { keys: [], required: [], terminal: true },
});

export function contextAdapterYamlKey(line) {
  const match = /^\s*-?\s*([A-Za-z0-9_-]+)\s*:/.exec(line || '');
  return match ? match[1] : '';
}

export function lineInfo(doc, pos) {
  const text = String(doc || '');
  const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(text.length, Math.floor(Number(pos)))) : text.length;
  const before = text.slice(0, safePos);
  const after = text.slice(safePos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEndRaw = text.indexOf('\n', safePos);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, lineEnd);
  const beforeCursor = line.slice(0, safePos - lineStart);
  const afterCursor = line.slice(safePos - lineStart);
  const col = safePos - lineStart;
  // Counted, not split: splitting a long text builds one string per line before the cursor.
  const lineNumber = lineNumberAt(text, safePos);
  return { before, after, line, beforeCursor, afterCursor, lineStart, lineEnd, col, lineNumber };
}

export function completionWordTo(doc, pos, ctx = {}) {
  const text = String(doc || '');
  const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(text.length, Math.floor(Number(pos)))) : text.length;
  const lineEndRaw = text.indexOf('\n', safePos);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  const role = String(ctx?.yamlRole || '').toLowerCase();
  const lang = String(ctx?.lang || 'yaml').toLowerCase();
  let rx = /[A-Za-z0-9_.:\-/]/;
  if (lang === 'yaml' && (role === 'key' || role === 'blank' || role === 'list-key')) rx = /[A-Za-z0-9_-]/;
  let to = safePos;
  while (to < lineEnd && rx.test(text[to] || '')) to += 1;
  return to;
}

function resolveCatalogCardContext(doc, pos, yamlPath = []) {
  const text = String(doc || '');
  const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(text.length, Math.floor(Number(pos)))) : text.length;
  const lines = recentLinesBeforeCursor(text, safePos);
  const currentLine = lines[lines.length - 1] || '';
  const currentIndent = leadingWhitespace(currentLine).length;
  // The column of the key at the cursor. The card's own keys sit at the column of its type:
  // key; anything deeper is inside one of the card's blocks.
  const cursorDash = /^\s*(-\s+)/.exec(currentLine);
  const cursorKeyColumn = currentIndent + (cursorDash ? cursorDash[1].length : 0);
  // The line after an empty block opener (`card_mod:`, `tap_action:`) starts at the opener's own
  // column. The YAML path keeps the opener as its last key there, so that line is inside the block.
  const openerAbove = /^(\s*)([A-Za-z0-9_-]+):\s*$/.exec(lines[lines.length - 2] || '');
  const insideOpenerAbove = !!openerAbove && !cursorDash && openerAbove[1].length === currentIndent
    && String(yamlPath[yamlPath.length - 1] || '') === openerAbove[2]
    && !/^\s*[A-Za-z0-9_-]+\s*:/.test(currentLine);

  // `limit` is the deepest key column that can still belong to the mapping around the cursor or
  // to one of its ancestors. Deeper lines are the content of an earlier sibling.
  let limit = currentIndent;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const raw = lines[i] || '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = leadingWhitespace(raw).length;
    const dash = /^\s*(-\s+)/.exec(raw);
    const isCursorLine = i === lines.length - 1;
    if (!isCursorLine && indent + (dash ? dash[1].length : 0) > limit) continue;
    const match = /^\s*(?:-\s*)?type\s*:\s*([^#\s]+)/.exec(raw);
    if (match) {
      // The nearest type: line of the enclosing mapping decides. Walking on past a card type the
      // catalog does not know would hand that card the key list of an earlier card in the stack.
      const cardType = String(match[1] || '').replace(/^['"]|['"]$/g, '').trim();
      const surface = getProviderSurfaceByCardType(cardType);
      if (surface) {
        const typeKeyColumn = indent + (dash ? dash[1].length : 0);
        return { cardType, surfaceId: surface.id, nested: typeKeyColumn < cursorKeyColumn || insideOpenerAbove };
      }
      // A type: that is not a card type belongs to an item inside a card (an apexcharts series
      // `type: column`, a picture-elements element): the card's own type: line is further up.
      if (cardType.startsWith('custom:') || NATIVE_CARD_TYPES.includes(cardType)) return { cardType: '', surfaceId: '', nested: false };
    }
    // A list item start closes its mapping: earlier lines at the dash column are other items.
    if (!isCursorLine) limit = dash ? indent - 1 : Math.min(limit, indent);
  }

  return { cardType: '', surfaceId: '', nested: false };
}

function yamlPathParts(ctx) {
  return Array.isArray(ctx?.yamlPath) ? ctx.yamlPath.map(x => String(x || '').toLowerCase()) : [];
}

function yamlPathIncludes(ctx, names) {
  const wanted = new Set(names);
  return yamlPathParts(ctx).some(part => wanted.has(part));
}

function isDashboardActionContext(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  const pathText = yamlPathParts(ctx).join('.');
  return ['tap_action', 'hold_action', 'double_tap_action'].includes(key) || /(^|\.)(tap_action|hold_action|double_tap_action)(\.|$)/.test(pathText);
}

// Whether a `type:` key at this path names a card. The nearest block around it that is known
// decides: a card host (a card list, a nested card, popup content) keeps the card type list; a
// block whose items have a type of their own (tile features, chart series, mushroom chips, an
// entities card header or footer, a view, the steps of an automation or script) does not take a
// card type. With no known block the key belongs to the root card. Kept in sync with the
// classifier copy (parity test).
const CARD_TYPE_HOST_KEYS = new Set(['cards', 'card', 'content', 'sections', 'badges', 'elements', 'entities']);
const OTHER_TYPE_HOST_KEYS = new Set(['features', 'series', 'chips', 'header', 'footer', 'views', 'actions', 'sequence', 'parallel']);

function typeKeyHoldsCardType(path) {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (CARD_TYPE_HOST_KEYS.has(path[i])) return true;
    if (OTHER_TYPE_HOST_KEYS.has(path[i])) return false;
  }
  return true;
}

// The YAML path counts the first key of a list item as a parent of the item's other keys: a
// card written as `- features: ...` with `type:` below it at the key's column has type: at the
// path cards.features.type, the same path as the type: of one of its features. Only the column
// tells them apart. When the key on the cursor line is a sibling of the item's first key (the
// same column), this returns the path without that first key; otherwise the path itself.
function pathWithoutItemFirstKey(lines, yamlPath) {
  const cursorLine = lines[lines.length - 1] || '';
  if (yamlPath.length < 2 || /^\s*-(\s|$)/.test(cursorLine)) return yamlPath;
  const column = leadingWhitespace(cursorLine).length;
  for (let i = lines.length - 2; i >= 0; i -= 1) {
    const raw = lines[i] || '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = leadingWhitespace(raw).length;
    if (indent >= column) continue;
    // The nearest line that starts further left: the item's `- key:` line when the cursor key is
    // a sibling of that key.
    const item = /^\s*(-\s+)(["']?)([A-Za-z0-9_$.-]+)\2\s*:/.exec(raw);
    const firstKey = String(yamlPath[yamlPath.length - 2] || '').toLowerCase();
    if (item && indent + item[1].length === column && item[3].toLowerCase() === firstKey) {
      return [...yamlPath.slice(0, -2), yamlPath[yamlPath.length - 1]];
    }
    return yamlPath;
  }
  return yamlPath;
}

export function yamlScalarValueKind(ctx) {
  const key = String(ctx?.yamlKey || ctx || '').toLowerCase();
  if (!key) return '';

  const numericKeys = new Set([
    'height', 'width', 'line_width', 'line_size', 'stroke_width', 'columns', 'rows', 'min', 'max', 'step',
    'hours_to_show', 'points_per_hour', 'refresh_interval', 'font_size', 'size', 'border_width', 'padding', 'margin',
    'opacity', 'z_index', 'duration', 'delay', 'brightness', 'brightness_pct', 'volume_level',
  ]);
  if (numericKeys.has(key) || /(_width|_height|_size|_count|_minutes|_seconds|_hours|_pct|_percent)$/.test(key)) return 'number';

  const durationKeys = new Set(['for', 'timeout', 'delay', 'scan_interval', 'transition', 'hold_secs', 'tap_time']);
  if (durationKeys.has(key) || /(_duration|_timeout|_interval)$/.test(key)) return 'duration';

  const stringKeys = new Set(['name', 'title', 'label', 'unit', 'unit_of_measurement', 'state', 'state_display', 'navigation_path', 'url_path']);
  if (stringKeys.has(key)) return 'string';

  return '';
}

export function isScalarValueKind(kind) {
  return ['number', 'duration', 'string', 'scalar'].includes(String(kind || '').toLowerCase());
}

export function isScalarConfigContext(ctx) {
  if (!ctx || ctx.lang !== 'yaml') return false;
  if (isScalarValueKind(ctx.valueKind)) return true;
  if (ctx.yamlRole === 'value' && ctx.yamlKey && !ctx.valueKind) return true;
  return false;
}

export function yamlValueKind(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  const path = yamlPathParts(ctx);
  const pathText = path.join('.');

  if (!key && String(ctx?.yamlRole || '') === 'list-key' && /(^|\.)(entities)(\.|$)/.test(pathText)) return 'entity';
  if (!key) return '';

  // Area, device, floor and label ids, when the registryLane setting is on (it needs engineV2).
  // detectRuntimeContext computes valueKind with this copy, so the branch has to be here as well
  // as in yamlContextClassifier.yamlValueKind.
  if (ctx?.registryLaneEnabled === true) {
    if (key === 'area_id' || key === 'area') return 'area';
    if (key === 'device_id') return 'device';
    if (key === 'floor_id') return 'floor';
    if (key === 'label_id') return 'label';
  }

  const entityKeys = new Set(['entity', 'entity_id', 'entities']);
  if (entityKeys.has(key) || key.endsWith('entity') || key.endsWith('entity_id')) return 'entity';

  if (key === 'service' || key === 'service_name' || key === 'perform_action') return 'service';
  // A tile card's icon actions hold a dashboard action too (more-info, toggle, navigate).
  if (key === 'action') return isDashboardActionContext(ctx) || yamlPathIncludes(ctx, ICON_ACTION_KEYS) ? 'action' : 'service';
  if (key === 'type') {
    if (yamlPathIncludes(ctx, ['triggers', 'trigger'])) return 'trigger-type';
    if (yamlPathIncludes(ctx, ['conditions', 'condition'])) return 'condition-type';
    return typeKeyHoldsCardType(path) ? 'card-type' : '';
  }
  // `trigger:` sits under a plural `triggers:` list. `platform:` is the trigger-type key of the
  // older singular `trigger:` form, which Home Assistant still accepts, so it also takes the
  // singular parent.
  if (key === 'trigger' && yamlPathIncludes(ctx, ['triggers'])) return 'trigger-type';
  if (key === 'platform' && yamlPathIncludes(ctx, ['triggers', 'trigger'])) return 'trigger-type';
  if (key === 'condition' && yamlPathIncludes(ctx, ['conditions', 'condition', 'choose', 'if', 'while', 'until', 'visibility'])) return 'condition-type';
  if (key === 'icon' || key.endsWith('_icon')) return 'icon';
  if (key === 'theme') return 'theme';
  // `mode:` is the automation or script run mode at config scope, but under a service `data:`
  // block it is a service field (humidifier.set_mode's mode) with values of its own. Kept in
  // sync with the classifier copy (parity test).
  if (key === 'mode' && !yamlPathIncludes(ctx, ['data'])) return 'automation-mode';
  if (['enabled', 'show_state', 'show_name', 'show_icon', 'show_label', 'state_color', 'square', 'full_width'].includes(key)) return 'boolean';

  if (pathText.includes('target') && key === 'entity_id') return 'entity';
  if (pathText.includes('service') && key === 'service') return 'service';

  return yamlScalarValueKind(ctx);
}

export function yamlFocusKind(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  const role = String(ctx?.yamlRole || '').toLowerCase();
  const valueKind = String(ctx?.valueKind || yamlValueKind(ctx) || '').toLowerCase();
  const path = yamlPathParts(ctx);
  const pathText = path.join('.');

  if (valueKind) return valueKind;
  if (key === 'target' || pathText.includes('.target') || pathText.endsWith('target')) return 'target-block';
  if (isDashboardActionContext({ yamlKey: key, yamlPath: path })) return 'action-block';
  if (key === 'card_mod' || key === 'style' || key === 'styles' || pathText.includes('card_mod') || pathText.includes('styles')) return 'style-block';
  if (['triggers', 'trigger'].includes(key) || /(^|\.)(triggers|trigger)(\.|$)/.test(pathText)) return 'trigger-block';
  if (['conditions', 'condition'].includes(key) || /(^|\.)(conditions|condition)(\.|$)/.test(pathText)) return 'condition-block';
  if (['actions', 'action', 'sequence', 'then', 'else', 'choose', 'repeat', 'parallel'].includes(key) || /(^|\.)(actions|sequence|then|else|choose|repeat|parallel)(\.|$)/.test(pathText)) return 'automation-action';
  if (role === 'list-key' && pathText.endsWith('entities')) return 'entity-list';
  return '';
}

export function yamlBlockValueKeyKind(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  if (!key) return '';
  if ([
    'tap_action', 'hold_action', 'double_tap_action',
    'target', 'data', 'service_data', 'confirmation',
    'browser_mod', 'content', 'styles', 'style', 'state',
    'custom_fields', 'variables', 'cards', 'card', 'grid', 'icon', 'name', 'label',
    'triggers', 'conditions', 'actions', 'sequence', 'then', 'else', 'choose', 'repeat', 'parallel', 'if', 'default',
  ].includes(key)) return 'block-key';
  return '';
}

export function dashboardActionBranchState(doc, pos) {
  const text = String(doc || '');
  const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(text.length, Math.floor(Number(pos)))) : text.length;
  if (!text) return null;

  const lines = recentLinesBeforeCursor(text, safePos);
  if (!lines.length) return null;

  const currentRaw = lines[lines.length - 1] || '';
  const currentIndent = leadingWhitespace(currentRaw).length;
  const currentKeyInfo = directYamlKey(currentRaw);

  let parentIndex = -1;
  let parentKey = '';
  let parentIndent = -1;

  // Only a parent the cursor is inside counts: every line between the key and the cursor that is
  // not blank or a comment is indented deeper than it. A line at or left of its indent closed its
  // block (a sibling card or a new list item), and an earlier card's tap_action would otherwise
  // replace the card's keys with that action's keys and service.
  const enclosesCursor = (keyIndex, keyIndent) => {
    for (let j = keyIndex + 1; j < lines.length - 1; j += 1) {
      const trimmed = lines[j].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (leadingWhitespace(lines[j]).length <= keyIndent) return false;
    }
    return true;
  };

  if (currentKeyInfo && ACTION_PARENT_KEYS.has(currentKeyInfo.key)) {
    parentIndex = lines.length - 1;
    parentKey = currentKeyInfo.key;
    parentIndent = currentKeyInfo.indent;
  } else {
    for (let i = lines.length - 2; i >= 0; i -= 1) {
      const info = directYamlKey(lines[i]);
      if (!info) continue;
      if (info.indent >= currentIndent && currentIndent > 0) continue;
      if (ACTION_PARENT_KEYS.has(info.key) && enclosesCursor(i, info.indent)) {
        parentIndex = i;
        parentKey = info.key;
        parentIndent = info.indent;
        break;
      }
    }
  }

  // The loop above skips keys at or right of the cursor column. When none of the keys left of
  // it is a parent, such a key is taken if its block is still open (the cursor line may not be
  // indented yet).
  if (parentIndex < 0) {
    for (let i = lines.length - 2; i >= 0; i -= 1) {
      const info = directYamlKey(lines[i]);
      if (!info) continue;
      if (!ACTION_PARENT_KEYS.has(info.key) || !enclosesCursor(i, info.indent)) continue;
      parentIndex = i;
      parentKey = info.key;
      parentIndent = info.indent;
      break;
    }
  }

  if (parentIndex < 0) {
    // Automations and scripts: yamlBranchState has no `kind`, so one is added the way the
    // dashboard branch sets it (target-block inside a target: block, else action-block). The
    // fields serviceIdFromContext reads are kept. The dashboard-only `missingKeys` stays absent,
    // so the dashboard action-block code, which needs it, does not run for these.
    const fallback = yamlBranchState(text, safePos);
    if (!fallback) return null;
    const fallbackPath = currentYamlPath(text, safePos).join('.').toLowerCase();
    const fallbackInTarget = fallbackPath.endsWith('target') || fallbackPath.includes('.target');
    return { ...fallback, kind: fallbackInTarget ? 'target-block' : 'action-block' };
  }

  // A dash-prefixed action parent (`  - tap_action:`) puts its key two or more columns past the
  // line indent, and its children align to the key column, not to the line indent.
  const parentDash = (lines[parentIndex] || '').match(/^\s*(-\s+)/);
  const childIndent = parentIndent + (parentDash ? parentDash[1].length : 0) + 2;
  const siblings = {};
  const order = [];
  let activeChildKey = '';

  for (let i = parentIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i] || '';
    if (!raw.trim()) continue;
    const info = directYamlKey(raw);
    if (!info) continue;
    if (info.indent <= parentIndent) break;
    if (info.indent === childIndent) {
      siblings[info.key] = { value: info.value, indent: info.indent, lineIndex: i };
      if (!order.includes(info.key)) order.push(info.key);
      if (i === lines.length - 1) activeChildKey = info.key;
    }
  }

  if (currentKeyInfo && currentKeyInfo.indent === childIndent) {
    siblings[currentKeyInfo.key] = { value: currentKeyInfo.value, indent: currentKeyInfo.indent, lineIndex: lines.length - 1 };
    if (!order.includes(currentKeyInfo.key)) order.push(currentKeyInfo.key);
    activeChildKey = currentKeyInfo.key;
  }

  const actionValue = stripYamlComment(siblings.action?.value || '');
  const branch = ACTION_BRANCHES[actionValue] || null;
  const baseKeys = actionValue && branch ? branch.keys : ['action', 'service', 'target', 'data', 'navigation_path', 'url_path', 'confirmation'];
  const usedKeys = Object.keys(siblings).filter(k => siblings[k]?.value || k !== activeChildKey);
  const missingKeys = baseKeys.filter(k => !siblings[k] || (k === activeChildKey && !siblings[k].value));
  const path = currentYamlPath(text, safePos).join('.').toLowerCase();
  const inTarget = path.endsWith('target') || path.includes('.target') || activeChildKey === 'target';

  return {
    kind: inTarget ? 'target-block' : 'action-block',
    parentKey,
    parentIndent,
    childIndent,
    currentIndent,
    activeChildKey,
    actionValue,
    branchName: actionValue || 'unselected-action',
    branch,
    siblings,
    usedKeys,
    missingKeys,
    canContinue: !!actionValue && (!branch || !branch.terminal || missingKeys.length > 0),
  };
}

/**
 * @param {Record<string, any>} [settings]
 * @returns {Record<string, any>}
 */
function normalizedSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings && typeof settings === 'object' ? settings : {}),
  };
}

export function detectRuntimeContext(doc, pos, options = {}) {
  const text = String(doc || '');
  const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(text.length, Math.floor(Number(pos)))) : text.length;
  const settings = normalizedSettings(options.settings);
  const runtimeData = options.runtimeData || null;
  const triggerKind = options.triggerKind || 'typing';
  // surface is plain data resolved when the view is bound (the adapter never reads the DOM). It
  // is empty when engineV2 is off, and then none of the surface fields and adjustments below apply.
  const surface = typeof options.surface === 'string' ? options.surface : '';
  const jinjaLaneOption = options.jinjaLane === true;
  // The registryLane setting changes valueKind for area_id:, device_id:, floor_id: and
  // label_id:, and valueKind is computed below, so the setting comes in as an option like
  // jinjaLane. When it is off these keys keep the kind they have without it.
  const registryLaneOption = options.registryLane === true;
  const info = lineInfo(text, safePos);
  const recent = text.slice(Math.max(0, safePos - 1600), safePos);
  const yamlPath = currentYamlPath(text, safePos);

  let lang = 'yaml';
  let scope = 'yaml';
  let confidence = 0.5;

  if (/\[\[\[[\s\S]*$/.test(recent) && !/\]\]\][\s\S]*$/.test(recent.split('[[[').pop())) {
    lang = 'js';
    scope = 'button-card-js';
    confidence = 0.95;
  } else if (recent.lastIndexOf('{{') > recent.lastIndexOf('}}') || recent.lastIndexOf('{%') > recent.lastIndexOf('%}')) {
    // Inside an open template: the last {{ or {% comes after the last }} or %}. A single } (a
    // dict literal like {'on':'x'}) or % (a modulo) inside the template does not close it.
    lang = 'jinja';
    scope = 'jinja-template';
    confidence = 0.95;
  } else if (/<[a-zA-Z][^>]*$/.test(recent) || /<\/?[a-zA-Z][\s\S]*>$/.test(info.line.trim())) {
    lang = 'html';
    scope = 'html';
    confidence = 0.75;
  } else if ((blockScalarContextAt(text, safePos)?.path || []).some(k => ['style', 'styles', 'card_mod', 'extra_styles'].includes(String(k || '').toLowerCase()))) {
    lang = 'css';
    scope = 'card-mod-css';
    confidence = 0.9;
  } else if (/^\s*(def |import |from |class |if __name__|try:|except )/.test(info.line)) {
    lang = 'python';
    scope = 'python';
    confidence = 0.7;
  } else {
    lang = 'yaml';
    scope = yamlPath.join('.') || 'yaml-root';
    confidence = 0.65;
  }

  // The Developer tools template editor and template fields hold Jinja without a {{ }} around
  // it, so a bare `states('…')` reads as YAML. With the jinjaLane setting on, on such a surface,
  // a template call at the cursor makes the text Jinja. This only turns YAML into Jinja; text
  // inside {{ }} is Jinja already.
  if (lang === 'yaml' && jinjaLaneOption && (surface === 'devtools-template' || surface === 'template-field')) {
    const ja = classifyJinjaCallArg(recent);
    if (ja.fn) {
      lang = 'jinja';
      scope = 'jinja-template';
      confidence = 0.8;
    }
  }

  const prefixMatch = info.beforeCursor.match(/[A-Za-z0-9_:\-.$#{}%/]+$/);
  let prefix = prefixMatch ? prefixMatch[0] : '';
  // A bare list dash is structure, not typed text; as the prefix it would be replaced by the
  // accepted row.
  if (lang === 'yaml' && /^\s*-$/.test(info.beforeCursor)) prefix = '';
  // In a template and in JavaScript the braces, `%` and `$` in front of a word are syntax
  // (`{{st`, `{%if`, `${ent`), not typed text: `{{st` matches the rows that start with "st", and
  // accepting one keeps the `{{`. A prefix that ends in such a character (`{{`, `{%`) is left
  // alone: the rows that bring their own delimiter match it and replace it.
  if ((lang === 'jinja' || lang === 'js') && prefix) {
    let cut = Math.max(prefix.lastIndexOf('{'), prefix.lastIndexOf('}'), prefix.lastIndexOf('%'), prefix.lastIndexOf('$'));
    // `{{-` and `{%-`: the dash is the template's trim marker.
    if (cut >= 0 && prefix[cut + 1] === '-' && (prefix[cut] === '{' || prefix[cut] === '%')) cut += 1;
    if (cut >= 0 && cut < prefix.length - 1) prefix = prefix.slice(cut + 1);
  }
  let completionFrom = safePos - prefix.length;

  const triggerChar = info.beforeCursor.slice(-1);
  const triggerChars = [':', '.', '{', '%', '<', '-', '_', '#', '$', '/'];
  let isTriggerChar = triggerChars.includes(triggerChar);

  const lineTrim = info.line.trim();
  const isBlankLine = lineTrim === '';
  const afterKeyColon = /:\s*$/.test(info.beforeCursor);
  const yamlColonSpaceTrigger = lang === 'yaml' && afterKeyColon;
  const jinjaOpenTrigger = lang === 'jinja' && /(?:\{\{|\{%)\s*$/.test(info.beforeCursor);
  const cssCustomPropertyTrigger = lang === 'css' && /--$/.test(info.beforeCursor);

  let yamlRole = lang === 'yaml' ? yamlCursorRole(info) : 'code';
  const yamlKey = lang === 'yaml' ? yamlCurrentKey(info) : '';
  const branchState = lang === 'yaml' ? dashboardActionBranchState(text, safePos) : null;
  let valueKind = lang === 'yaml' && (yamlRole === 'value' || yamlRole === 'list-key') ? yamlValueKind({ yamlKey, yamlPath, yamlRole, registryLaneEnabled: registryLaneOption }) : '';
  // A type: with no kind may be the type of a card whose list item starts with another key
  // (`- features: ...`, then `type:` at the same column): the path then looks like the path of
  // a feature's own type. Without the item's first key the path says whether it is a card.
  if (lang === 'yaml' && yamlRole === 'value' && !valueKind && String(yamlKey || '').toLowerCase() === 'type') {
    const siblingPath = pathWithoutItemFirstKey(recentLinesBeforeCursor(text, safePos), yamlPath);
    if (siblingPath !== yamlPath && yamlValueKind({ yamlKey, yamlPath: siblingPath, yamlRole, registryLaneEnabled: registryLaneOption }) === 'card-type') {
      valueKind = 'card-type';
    }
  }
  if (lang === 'yaml' && yamlRole === 'value' && !valueKind) {
    const valuePrefix = yamlValueLinePrefix(info);
    if (yamlValuePrefixLooksLikeEntityId(valuePrefix, runtimeData)) valueKind = 'entity';
  }
  // A list item being typed (`- sensor.hu|`) has no colon, so yamlCursorRole reads it as a key
  // and no value kind is found above. Under an entities list, or when the typed text looks like
  // an entity id of a known domain, it is a list value: the list-key role and the entity kind.
  if (lang === 'yaml' && yamlRole === 'key' && !stripYamlComment(info.line).includes(':') && /^\s*-\s+\S/.test(info.beforeCursor)) {
    const itemToken = info.beforeCursor.replace(/^\s*-\s+/, '');
    if (yamlValueKind({ yamlKey: '', yamlPath, yamlRole: 'list-key' }) === 'entity'
      || yamlValuePrefixLooksLikeEntityId(itemToken, runtimeData)) {
      yamlRole = 'list-key';
      valueKind = 'entity';
    }
  }
  // The opening quote of a value right after its key (`icon: '`) asks for the value list, as the
  // space after the colon does. The value is completed inside the quotes.
  if (lang === 'yaml' && yamlRole === 'value' && valueKind && /:\s+['"]$/.test(info.beforeCursor)) isTriggerChar = true;
  // An icon name in a template string (`icon: "{{ 'm3o:light' if is_state(...) else ... }}"`): a
  // string that starts with the prefix of mdi or of an installed icon set and a colon gets the
  // icon suggestions, as the value of an icon: key does.
  if (lang === 'jinja' && looksLikeIconName(templateStringBeforeCursor(recent), runtimeData)) valueKind = 'icon';

  const scalarValueContext = lang === 'yaml' && yamlRole === 'value' && !!yamlKey && isScalarValueKind(valueKind || yamlScalarValueKind({ yamlKey, yamlPath, yamlRole }));
  // A key with a value kind of its own (icon:, name:, label:, state:) takes its value on the same
  // line; the block shape is only for keys that have no value kind.
  const blockValueKind = lang === 'yaml' && yamlRole === 'value' && afterKeyColon && !valueKind ? yamlBlockValueKeyKind({ yamlKey }) : '';
  const pathText = lang === 'yaml' ? yamlPath.join('.').toLowerCase() : '';
  const focusKind = lang === 'yaml' ? yamlFocusKind({ yamlKey, yamlPath, yamlRole, valueKind }) : '';
  const inComment = isCommentContext(lang, info, recent);
  const catalogCardContext = lang === 'yaml' ? resolveCatalogCardContext(text, safePos, yamlPath) : { cardType: '', surfaceId: '', nested: false };
  let wordTo = safePos;

  if (blockValueKind && !valueKind) {
    yamlRole = 'blank';
    prefix = '';
    completionFrom = safePos;
  }

  if (lang === 'yaml' && yamlRole === 'value') {
    const colon = info.line.indexOf(':');
    if (colon >= 0) {
      const valueStartInLine = colon + 1;
      const rawValueBefore = info.line.slice(valueStartInLine, info.col);
      const leading = rawValueBefore.match(/^\s*/)?.[0]?.length || 0;
      const valueBefore = rawValueBefore.slice(leading);
      const vm = valueBefore.match(/[A-Za-z0-9_.:\-/]+$/);
      prefix = vm ? vm[0] : '';
      completionFrom = info.lineStart + valueStartInLine + leading + valueBefore.length - prefix.length;
    }
  }

  // A list item that is a value (`- light.ki|tchen` under entities:) ends where a value ends.
  // The key pattern stops at the dot and would leave the old tail behind on accept.
  wordTo = completionWordTo(text, safePos, { lang, yamlRole: yamlRole === 'list-key' && valueKind && !yamlKey ? 'value' : yamlRole });

  let shouldSuggest = false;
  let idleReason = '';
  const explicit = triggerKind === 'explicit';
  const aggressive = settings.triggerMode === 'aggressive';
  const minChars = aggressive ? Math.max(0, Number(settings.minChars || 0) - 1) : Number(settings.minChars || 0);
  const meaningfulPrefix = prefix.length >= minChars;

  if (lang === 'yaml') {
    const keyContext = yamlRole === 'key' || yamlRole === 'blank' || yamlRole === 'list-key';

    if (keyContext) {
      const currentKeyLooksComplete = !!yamlKey && /:\s*/.test(info.line) && !prefix;
      // An explicit trigger (Ctrl+Space) always offers suggestions, so it comes first: the
      // existing-key-context guard below reads the whole line, text after the caret included,
      // and a caret at a key on a `key: value` line would otherwise look complete.
      if (explicit) shouldSuggest = true;
      else if (currentKeyLooksComplete && !['entities', 'triggers', 'conditions', 'actions', 'sequence', 'tap_action', 'hold_action', 'double_tap_action', 'card_mod', 'styles'].includes(String(yamlKey || '').toLowerCase())) {
        shouldSuggest = false;
        idleReason = 'existing-key-context';
      } else if (meaningfulPrefix) shouldSuggest = true;
      else if ((isTriggerChar || yamlColonSpaceTrigger) && !isBlankLine) shouldSuggest = true;
      else {
        shouldSuggest = false;
        idleReason = '...';
      }
    } else if (yamlRole === 'value' && valueKind) {
      if (explicit) shouldSuggest = true;
      else if (meaningfulPrefix) shouldSuggest = true;
      else if ((isTriggerChar || yamlColonSpaceTrigger) && !isBlankLine) shouldSuggest = true;
      else {
        shouldSuggest = false;
        idleReason = '...';
      }
    } else if (yamlRole === 'value' && explicit) {
      // A value without a kind (an unknown key, no entity shape yet: `humidity: sens`) stays
      // quiet while typing, but Ctrl+Space always asks; the word and static rows can answer.
      shouldSuggest = true;
    } else {
      shouldSuggest = false;
      idleReason = '...';
    }
  } else if (explicit) shouldSuggest = true;
  else if (meaningfulPrefix) shouldSuggest = true;
  else if ((isTriggerChar || jinjaOpenTrigger || cssCustomPropertyTrigger) && !isBlankLine) shouldSuggest = true;
  else {
    shouldSuggest = false;
    idleReason = '...';
  }

  const suppressPopup = inComment && !settings.suggestInComments;
  if (suppressPopup) {
    shouldSuggest = false;
    idleReason = '...';
    if (lang === 'yaml') yamlRole = 'comment';
  }

  return {
    lang,
    scope,
    confidence,
    prefix,
    from: completionFrom,
    to: safePos,
    wordTo,
    pos: safePos,
    line: info.line,
    col: info.col,
    lineNumber: info.lineNumber,
    beforeCursor: info.beforeCursor,
    afterCursor: info.afterCursor,
    yamlPath,
    yamlRole,
    yamlKey,
    branchState,
    valueKind,
    scalarValueContext,
    blockValueKind,
    pathText,
    focusKind,
    catalogCardType: catalogCardContext.cardType,
    catalogSurfaceId: catalogCardContext.surfaceId,
    // The cursor is inside one of that card's blocks, not at one of the card's own keys.
    catalogCardNested: catalogCardContext.nested === true,
    triggerKind,
    triggerChar,
    isTriggerChar,
    isBlankLine,
    afterKeyColon,
    isComment: inComment,
    suppressPopup,
    shouldSuggest,
    idleReason,
    // Present only when a surface is supplied (engineV2 on), so with engineV2 off the descriptor
    // has no extra fields. jinjaArg tells the live-entity provider which argument the cursor is in.
    ...(surface ? { surface } : {}),
    ...(surface && lang === 'jinja' ? { jinjaArg: classifyJinjaCallArg(recent) } : {}),
    // CSS text only: the cursor is between the `{` and the `}` of a rule.
    ...(lang === 'css' ? { cssInsideRule: insideOpenBrace(recent) } : {}),
  };
}

// Whether the text ends inside an open `{ ... }`: walking back from the end, the first `{` that
// no later `}` closes. Template braces (`{{ }}`, `{% %}`) come in closed pairs and cancel out.
// It reads the recent text the language checks read (the last 1,600 characters), so a rule that
// opened earlier than that is not seen and the answer is no.
function insideOpenBrace(recent) {
  let closed = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const code = recent.charCodeAt(i);
    if (code === 125) closed += 1;
    else if (code === 123) {
      if (closed === 0) return true;
      closed -= 1;
    }
  }
  return false;
}

export function detectRuntimeContextFallback(doc, pos, options = {}) {
  const triggerKind = options.triggerKind || 'typing';
  try {
    return detectRuntimeContext(doc, pos, options);
  } catch {
    const text = String(doc || '');
    const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(text.length, Math.floor(Number(pos)))) : text.length;
    const info = lineInfo(text, safePos);
    const prefixMatch = info.beforeCursor.match(/[A-Za-z0-9_:\-.$#{}%/]+$/);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const completionFrom = safePos - prefix.length;
    const triggerChar = info.beforeCursor.slice(-1);
    const triggerChars = [':', '.', '{', '%', '<', '-', '_', '#', '$', '/'];
    const isTriggerChar = triggerChars.includes(triggerChar);
    const isBlankLine = info.line.trim() === '';
    const wordTo = completionWordTo(text, safePos, { lang: 'yaml', yamlRole: isBlankLine ? 'blank' : 'key' });
    const explicit = triggerKind === 'explicit';
    const settings = normalizedSettings(options.settings);
    const minChars = settings.triggerMode === 'aggressive' ? Math.max(0, Number(settings.minChars || 0) - 1) : Number(settings.minChars || 0);
    const shouldSuggest = explicit || prefix.length >= minChars || (isTriggerChar && !isBlankLine);
    return {
      lang: 'yaml',
      scope: 'yaml-root',
      confidence: 0.1,
      prefix,
      from: completionFrom,
      to: safePos,
      wordTo,
      pos: safePos,
      line: info.line,
      col: info.col,
      lineNumber: info.lineNumber,
      beforeCursor: info.beforeCursor,
      afterCursor: info.afterCursor,
      yamlPath: [],
      yamlRole: isBlankLine ? 'blank' : 'key',
      yamlKey: '',
      branchState: null,
      valueKind: '',
      scalarValueContext: false,
      blockValueKind: '',
      pathText: '',
      focusKind: '',
      catalogCardType: '',
      catalogSurfaceId: '',
      catalogCardNested: false,
      triggerKind,
      triggerChar,
      isTriggerChar,
      isBlankLine,
      afterKeyColon: /:\s*$/.test(info.beforeCursor),
      isComment: false,
      suppressPopup: false,
      shouldSuggest,
      idleReason: shouldSuggest ? '' : '...',
    };
  }
}
