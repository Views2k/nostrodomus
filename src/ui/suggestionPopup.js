// The text, icon and colors of each row of the suggestion popup. No DOM: building, events,
// placement and the popup's lifecycle are in src/completion/popupRuntime.js.

import { sanitizeInlineDocumentation } from '../core/sanitize.js';
import {
  HA_VALUE_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  SNIPPET_PROVIDER_ID,
  STATIC_PROVIDER_ID,
} from '../core/runtimeConstants.js';

export function itemKindLabel(item) {
  const map = {
    key: 'Key',
    property: 'Property',
    function: 'Function',
    filter: 'Filter',
    tag: 'Tag',
    snippet: 'Snippet',
    entity: 'Entity',
    service: 'Service',
    card: 'Card',
    action: 'Action',
    trigger: 'Trigger',
    condition: 'Condition',
    mode: 'Mode',
    boolean: 'Boolean',
    area: 'Area',
    device: 'Device',
    floor: 'Floor',
    label: 'Label',
    icon: 'Icon',
  };
  return map[item?.type] || String(item?.type || 'Item');
}

export function itemSourceLabel(item) {
  if (item?.source === HA_VALUE_PROVIDER_ID) return 'HA runtime';
  if (item?.source === SNIPPET_PROVIDER_ID) return 'Snippet';
  if (item?.source === LOVELACE_CONTEXT_PROVIDER_ID) return 'HA context';
  if (item?.source === STATIC_PROVIDER_ID || item?.source === 'library') return 'Library';
  return String(item?.source || 'Library');
}

export function shortItemMeta(item) {
  if (!item) return '';
  if (item.type === 'snippet' || item.source === SNIPPET_PROVIDER_ID) {
    return item?.meta?.family ? `Snippet / ${item.meta.family}` : 'Snippet';
  }
  if (item.source === HA_VALUE_PROVIDER_ID) {
    const domain = item?.meta?.domain || String(item.label || '').split('.')[0] || item.type;
    if (item.type === 'entity') return `entity / ${domain}`;
    if (item.type === 'service') return `service / ${domain}`;
    if (item.type === 'card') return 'card type';
    if (item.type === 'icon') return item?.meta?.sourceDetail || 'icon';
    if (item.type === 'action') return 'action value';
    if (item.type === 'theme') return 'theme';
  }
  if (item.lang === 'css') return 'CSS / card_mod';
  if (item.lang === 'yaml') return 'YAML / Lovelace';
  if (item.lang === 'js') return 'JavaScript';
  if (item.lang === 'jinja') return 'Jinja';
  if (item.lang === 'html') return 'HTML';
  if (item.lang === 'python') return 'Python';
  return itemKindLabel(item);
}

export function itemDetail(item) {
  if (!item) return '';
  if (item.source === HA_VALUE_PROVIDER_ID && item.type === 'entity') {
    return item?.meta?.friendly || shortItemMeta(item);
  }
  return shortItemMeta(item);
}

export function itemDocumentation(item) {
  if (!item) return '';

  const explicitDocs = item?.documentation || item?.meta?.documentation;
  if (explicitDocs) return sanitizeInlineDocumentation(explicitDocs);

  if (item.source === HA_VALUE_PROVIDER_ID) {
    if (item.type === 'entity') {
      const friendly = item?.meta?.friendly ? `${item.meta.friendly} - ` : '';
      return sanitizeInlineDocumentation(`${friendly}${item.label}`);
    }
    if (item.type === 'service') return sanitizeInlineDocumentation(`Home Assistant service: ${item.label}`);
    if (item.type === 'card') return sanitizeInlineDocumentation(`Lovelace card type: ${item.label}`);
    if (item.type === 'icon') return sanitizeInlineDocumentation(`Material Design Icon value: ${item.label}`);
    if (item.type === 'action') return sanitizeInlineDocumentation(`Lovelace action value: ${item.label}`);
    if (item.type === 'theme') return sanitizeInlineDocumentation(`Home Assistant theme: ${item.label}`);
  }

  if (item.type === 'snippet') return 'Snippet completion. Accepting inserts a larger block of text.';
  if (item.type === 'property') return 'CSS property completion for card_mod and style blocks.';
  if (item.type === 'key') return 'YAML key or Lovelace configuration completion.';
  return sanitizeInlineDocumentation(`${itemKindLabel(item)} from ${itemSourceLabel(item)}.`);
}

export function completionDetailModel(item) {
  if (!item) return null;
  return {
    icon: iconFor(item),
    label: sanitizeInlineDocumentation(item.label || ''),
    kind: itemKindLabel(item),
    meta: shortItemMeta(item),
    source: itemSourceLabel(item),
    documentation: itemDocumentation(item),
  };
}

export function iconFor(item) {
  if (item.type === 'snippet') return 'Sn';
  if (item.type === 'entity') return 'E';
  if (item.type === 'service') return 'S';
  if (item.type === 'card') return 'C';
  if (item.type === 'icon') return 'Ic';
  if (item.type === 'action') return 'A';
  if (item.type === 'trigger') return 'T';
  if (item.type === 'condition') return '?';
  if (item.type === 'property') return 'Pr';
  if (item.type === 'function') return 'Fn';
  if (item.type === 'filter') return '|';
  if (item.type === 'tag') return '<>';
  return 'Key';
}

export function completionVisualKind(item) {
  if (!item) return 'item';
  if (item.type === 'snippet' || item.source === SNIPPET_PROVIDER_ID || item.meta?.quickSnippet) return 'snippet';
  if (item.source === HA_VALUE_PROVIDER_ID && item.type === 'entity') return 'entity';
  if (item.source === HA_VALUE_PROVIDER_ID && item.type === 'service') return 'service';
  if (['card', 'action', 'trigger', 'condition', 'mode', 'boolean'].includes(String(item.type || ''))) return String(item.type || '');
  if (item.lang === 'css' || item.type === 'property' || item.meta?.contextKind === 'css-yaml') return 'css';
  if (item.type === 'key') return 'key';
  return 'item';
}

export function completionPillLabel(item) {
  const kind = completionVisualKind(item);
  const map = { snippet: 'Snippet', entity: 'Entity', service: 'Service', card: 'Card', action: 'Action', trigger: 'Trigger', condition: 'Condition', css: 'Style', key: 'Key', boolean: 'Bool', mode: 'Mode' };
  return map[kind] || itemKindLabel(item);
}

export function completionAccent(item, _selected = false) {
  const kind = completionVisualKind(item);
  const palette = {
    snippet: { fg: 'rgba(214,190,255,.98)', bg: 'rgba(135,95,255,.18)', border: 'rgba(170,135,255,.55)', left: 'rgba(170,135,255,.90)' },
    entity: { fg: 'rgba(170,238,255,.96)', bg: 'rgba(0,190,255,.13)', border: 'rgba(95,220,255,.42)', left: 'rgba(95,220,255,.80)' },
    service: { fg: 'rgba(255,220,150,.96)', bg: 'rgba(255,185,70,.13)', border: 'rgba(255,205,110,.42)', left: 'rgba(255,205,110,.82)' },
    action: { fg: 'rgba(170,210,255,.96)', bg: 'rgba(80,150,255,.13)', border: 'rgba(120,180,255,.42)', left: 'rgba(120,180,255,.82)' },
    trigger: { fg: 'rgba(180,245,210,.96)', bg: 'rgba(70,210,140,.12)', border: 'rgba(120,235,175,.42)', left: 'rgba(120,235,175,.82)' },
    condition: { fg: 'rgba(255,205,230,.96)', bg: 'rgba(255,90,170,.12)', border: 'rgba(255,140,200,.42)', left: 'rgba(255,140,200,.82)' },
    css: { fg: 'rgba(255,185,220,.96)', bg: 'rgba(255,90,175,.12)', border: 'rgba(255,145,205,.38)', left: 'rgba(255,145,205,.78)' },
    key: { fg: 'rgba(220,235,245,.90)', bg: 'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.12)', left: 'rgba(255,255,255,.18)' },
    item: { fg: 'rgba(220,235,245,.90)', bg: 'rgba(255,255,255,.05)', border: 'rgba(255,255,255,.10)', left: 'rgba(255,255,255,.14)' },
  };
  return palette[kind] || palette.item;
}
