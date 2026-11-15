// Nostrodomus YAML context classifier.
// Pure YAML context classification for the Home Assistant runtime provider.
// Keep this module pure: no DOM, browser storage, runtime state, timers,
// network, Settings, popup, insertion, or Home Assistant host access.

const NUMERIC_KEYS = new Set([
  'height', 'width', 'line_width', 'line_size', 'stroke_width', 'columns', 'rows', 'min', 'max', 'step',
  'hours_to_show', 'points_per_hour', 'refresh_interval', 'font_size', 'size', 'border_width', 'padding', 'margin',
  'opacity', 'z_index', 'duration', 'delay', 'brightness', 'brightness_pct', 'volume_level',
]);

const DURATION_KEYS = new Set(['for', 'timeout', 'delay', 'scan_interval', 'transition', 'hold_secs', 'tap_time']);
const STRING_KEYS = new Set(['name', 'title', 'label', 'unit', 'unit_of_measurement', 'state', 'state_display', 'navigation_path', 'url_path']);
const ENTITY_KEYS = new Set(['entity', 'entity_id', 'entities']);
const BOOLEAN_KEYS = new Set(['enabled', 'show_state', 'show_name', 'show_icon', 'show_label', 'state_color', 'square', 'full_width']);
const DASHBOARD_ACTION_KEYS = new Set(['tap_action', 'hold_action', 'double_tap_action']);
const ICON_ACTION_KEYS = ['icon_tap_action', 'icon_hold_action', 'icon_double_tap_action'];
const AUTOMATION_SCRIPT_KEYS = new Set(['triggers', 'trigger', 'conditions', 'condition', 'actions', 'sequence', 'then', 'else', 'choose', 'repeat', 'parallel']);
const BLOCK_VALUE_KEYS = new Set([
  'tap_action', 'hold_action', 'double_tap_action',
  'target', 'data', 'service_data', 'confirmation',
  'browser_mod', 'content', 'styles', 'style', 'state',
  'custom_fields', 'variables', 'cards', 'card', 'grid', 'icon', 'name', 'label',
  'triggers', 'conditions', 'actions', 'sequence', 'then', 'else', 'choose', 'repeat', 'parallel', 'if', 'default',
]);

export function yamlPathParts(ctx) {
  return Array.isArray(ctx?.yamlPath) ? ctx.yamlPath.map(x => String(x || '').toLowerCase()) : [];
}

export function yamlPathIncludes(ctx, names) {
  const wanted = new Set(names);
  return yamlPathParts(ctx).some(part => wanted.has(part));
}

export function isDashboardActionContext(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  const pathText = yamlPathParts(ctx).join('.');
  return DASHBOARD_ACTION_KEYS.has(key) || /(^|\.)(tap_action|hold_action|double_tap_action)(\.|$)/.test(pathText);
}

export function isAutomationScriptContext(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  const pathText = yamlPathParts(ctx).join('.');
  if (AUTOMATION_SCRIPT_KEYS.has(key)) return true;
  return /(^|\.)(triggers|trigger|conditions|condition|actions|sequence|then|else|choose|repeat|parallel)(\.|$)/.test(pathText);
}

// Whether a `type:` key at this path names a card: the nearest known block around it decides
// (see the adapter copy, kept in sync by the parity test).
const CARD_TYPE_HOST_KEYS = new Set(['cards', 'card', 'content', 'sections', 'badges', 'elements', 'entities']);
const OTHER_TYPE_HOST_KEYS = new Set(['features', 'series', 'chips', 'header', 'footer', 'views', 'actions', 'sequence', 'parallel']);

function typeKeyHoldsCardType(path) {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (CARD_TYPE_HOST_KEYS.has(path[i])) return true;
    if (OTHER_TYPE_HOST_KEYS.has(path[i])) return false;
  }
  return true;
}

export function yamlScalarValueKind(ctx) {
  const key = String(ctx?.yamlKey || '').toLowerCase();
  if (!key) return '';

  if (NUMERIC_KEYS.has(key) || /(_width|_height|_size|_count|_minutes|_seconds|_hours|_pct|_percent)$/.test(key)) return 'number';
  if (DURATION_KEYS.has(key) || /(_duration|_timeout|_interval)$/.test(key)) return 'duration';
  if (STRING_KEYS.has(key)) return 'string';

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

  // Area, device, floor and label ids, when the registryLane setting is on (it needs engineV2);
  // otherwise these keys keep the kind they have without it. Bare `device`, `floor` and `label`
  // are display strings in some card configs, so only the *_id keys count, plus `area:` for the
  // area card.
  if (ctx?.registryLaneEnabled === true) {
    if (key === 'area_id' || key === 'area') return 'area';
    if (key === 'device_id') return 'device';
    if (key === 'floor_id') return 'floor';
    if (key === 'label_id') return 'label';
  }

  if (ENTITY_KEYS.has(key) || key.endsWith('entity') || key.endsWith('entity_id')) return 'entity';
  if (key === 'service' || key === 'service_name' || key === 'perform_action') return 'service';
  // A tile card's icon actions hold a dashboard action too (kept in sync with the adapter copy).
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
  // `mode:` is the automation or script run mode (single, restart, queued, parallel) at config
  // scope, but under a service `data:` block it is a service field (humidifier.set_mode's mode)
  // with values of its own.
  if (key === 'mode' && !yamlPathIncludes(ctx, ['data'])) return 'automation-mode';
  if (BOOLEAN_KEYS.has(key)) return 'boolean';

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
  if (BLOCK_VALUE_KEYS.has(key)) return 'block-key';
  return '';
}
