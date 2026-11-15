// The icon sets installed in Home Assistant, for icon suggestions. An icon set, such as Material
// Symbols (Google's icons, with the prefixes m3o, m3of, m3r, m3rf, m3s and m3sf) or a pack of
// brand icons, registers itself in window.customIcons under its prefix: getIcon draws one icon,
// and getIconList gives the names that Home Assistant's icon picker lists. A set registered in
// the older window.customIconsets has no list; its prefix is still known.
//
// getIconList is asynchronous. The catalog asks each set once, in the background, and the names
// are in the runtime data from the next read on. A set that fails or gives no names is asked again
// a minute later, three times at most.

import { SECURITY_LIMITS } from '../core/runtimeConstants.js';

const PREFIX_RX = /^[a-z0-9][a-z0-9_-]*$/i;
const NAME_RX = /^[a-z0-9][a-z0-9_.-]*$/i;
const MAX_NAME_LENGTH = 80;
const MAX_KEYWORDS = 6;
const MAX_KEYWORD_LENGTH = 40;
const RETRY_MS = 60000;
const MAX_ATTEMPTS = 3;
// A list that has not arrived after this long is asked for again.
const STALLED_MS = 15000;
// The runtime data is read several times for each typed character; the sets are read again at
// most once a second.
const SYNC_INTERVAL_MS = 1000;

// mdi is built into Home Assistant, and hass is its old name. Both are icon prefixes without an
// icon set.
export const BUILT_IN_ICON_PREFIXES = Object.freeze(['mdi', 'hass']);

const ICON_SET_LABELS = Object.freeze({
  mdi: 'Material Design Icons',
  hass: 'Material Design Icons',
  m3o: 'Material Symbols Outlined',
  m3of: 'Material Symbols Outlined, filled',
  m3r: 'Material Symbols Rounded',
  m3rf: 'Material Symbols Rounded, filled',
  m3s: 'Material Symbols Sharp',
  m3sf: 'Material Symbols Sharp, filled',
});

export function iconSetLabel(prefix) {
  const key = String(prefix || '').toLowerCase();
  return Object.hasOwn(ICON_SET_LABELS, key) ? ICON_SET_LABELS[key] : `Icon set ${key}`;
}

function guardedRead(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function registryKeys(registry) {
  if (!registry || typeof registry !== 'object') return [];
  return guardedRead(() => Object.keys(registry), []);
}

// The names of one getIconList result, checked: strings or objects with a name, letters, digits,
// "_", "." and "-" only, each name once, at most `max`. Keywords are kept for the names that have
// them.
export function iconListNames(list, max = SECURITY_LIMITS.maxIconsPerSet) {
  const names = [];
  const keywords = new Map();
  const seen = new Set();
  const length = guardedRead(() => (Array.isArray(list) ? list.length : 0), 0);
  for (let i = 0; i < length && names.length < max; i += 1) {
    const entry = guardedRead(() => list[i], null);
    const raw = typeof entry === 'string' ? entry : guardedRead(() => entry?.name, null);
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (!name || name.length > MAX_NAME_LENGTH || !NAME_RX.test(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    const words = typeof entry === 'object' ? guardedRead(() => entry.keywords, null) : null;
    if (Array.isArray(words)) {
      const kept = words
        .filter(word => typeof word === 'string' && word.trim() && word.length <= MAX_KEYWORD_LENGTH)
        .slice(0, MAX_KEYWORDS)
        .map(word => word.trim());
      if (kept.length) keywords.set(name, Object.freeze(kept));
    }
  }
  return { names, keywords };
}

export function createIconSetCatalog(options = {}) {
  const windowRef = options.windowRef || options.window || globalThis;
  const limits = options.limits || SECURITY_LIMITS;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const onChange = typeof options.onChange === 'function' ? options.onChange : null;
  const maxSets = limits.maxIconSets || SECURITY_LIMITS.maxIconSets;
  const maxPerSet = limits.maxIconsPerSet || SECURITY_LIMITS.maxIconsPerSet;
  const maxIcons = limits.maxIconSetIcons || SECURITY_LIMITS.maxIconSetIcons;

  // prefix -> { status: 'loading' | 'ready' | 'failed' | 'no-list', names, keywords, attempts, at }
  const sets = new Map();
  let version = 0;
  let view = null;
  let syncedAt = -Infinity;

  function changed() {
    version += 1;
    if (onChange) {
      try { onChange(); } catch { /* a failing listener must not stop the catalog */ }
    }
  }

  function fail(entry) {
    entry.status = 'failed';
    entry.at = now();
  }

  function accept(entry, list) {
    if (entry.status === 'ready') return;
    const { names, keywords } = iconListNames(list, maxPerSet);
    if (!names.length) {
      fail(entry);
      return;
    }
    entry.status = 'ready';
    entry.names = names;
    entry.keywords = keywords;
    changed();
  }

  function load(entry, getIconList) {
    entry.status = 'loading';
    entry.attempts += 1;
    entry.at = now();
    let pending;
    try {
      pending = getIconList();
    } catch {
      fail(entry);
      return;
    }
    Promise.resolve(pending).then(
      list => { try { accept(entry, list); } catch { fail(entry); } },
      () => fail(entry),
    );
  }

  // Reads the registered sets and asks the new ones (and the ones due again) for their names.
  // Cheap when nothing changed: the keys of window.customIcons and one check per set.
  function sync() {
    const at = now();
    if (at - syncedAt < SYNC_INTERVAL_MS) return;
    syncedAt = at;
    const registry = guardedRead(() => windowRef?.customIcons, null);
    const legacy = guardedRead(() => windowRef?.customIconsets, null);
    let added = false;
    for (const prefix of registryKeys(registry)) {
      if (!PREFIX_RX.test(prefix)) continue;
      let entry = sets.get(prefix);
      if (!entry) {
        if (sets.size >= maxSets) continue;
        entry = { status: 'new', names: [], keywords: null, attempts: 0, at: 0 };
        sets.set(prefix, entry);
        added = true;
      }
      if (entry.status === 'ready') continue;
      if (entry.status === 'loading' && at - entry.at < STALLED_MS) continue;
      if (entry.status === 'failed' && (entry.attempts >= MAX_ATTEMPTS || at - entry.at < RETRY_MS)) continue;
      const getIconList = guardedRead(() => registry[prefix]?.getIconList, null);
      if (typeof getIconList !== 'function') {
        entry.status = 'no-list';
        continue;
      }
      load(entry, () => getIconList.call(registry[prefix]));
    }
    for (const prefix of registryKeys(legacy)) {
      if (!PREFIX_RX.test(prefix) || sets.has(prefix) || sets.size >= maxSets) continue;
      sets.set(prefix, { status: 'no-list', names: [], keywords: null, attempts: 0, at });
      added = true;
    }
    if (added) changed();
  }

  // The icon ids of the sets that gave their names (`m3o:home`), in the order of the prefixes,
  // the known prefixes, and the keywords by id. The same frozen object until a set changes.
  function current() {
    if (view && view.version === version) return view;
    const ids = [];
    const keywords = new Map();
    const prefixes = [];
    for (const prefix of [...sets.keys()].sort()) {
      const entry = sets.get(prefix);
      prefixes.push(prefix);
      if (entry.status !== 'ready') continue;
      for (const name of entry.names) {
        if (ids.length >= maxIcons) break;
        const id = `${prefix}:${name}`;
        ids.push(id);
        const words = entry.keywords?.get(name);
        if (words) keywords.set(id, words);
      }
    }
    view = Object.freeze({
      version,
      ids: Object.freeze(ids),
      prefixes: Object.freeze(prefixes),
      keywords: keywords.size ? keywords : null,
    });
    return view;
  }

  function summary() {
    let ready = 0;
    for (const entry of sets.values()) if (entry.status === 'ready') ready += 1;
    return { sets: sets.size, setsWithNames: ready, icons: current().ids.length };
  }

  return { sync, current, summary };
}
