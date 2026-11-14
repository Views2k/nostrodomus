// Nostrodomus default settings module.
//
// Keep this module free of DOM access, browser storage, event listeners, timers,
// and Home Assistant runtime reads. It may import only pure constants/modules.

import {
  HA_VALUE_PROVIDER_ID,
  LOVELACE_CONTEXT_PROVIDER_ID,
  SECURITY_LIMITS,
  SNIPPET_PROVIDER_ID,
  STATIC_PROVIDER_ID,
  WORD_FALLBACK_PROVIDER_ID,
} from './runtimeConstants.js';
import { DEFAULT_COMPLETION_SETTINGS } from './completionSettings.js';

export { SECURITY_LIMITS };

export const SETTINGS_WRITE_KEY = "nostrodomus.settings";

export const DEFAULT_SETTINGS = Object.freeze({
  keepOpen: false,
  autoOpenOnFocus: false,
  minChars: 1,
  mode: "both",
  enterCompletes: true,
  tabCompletes: true,
  maxItems: 12,
  fuzzy: true,
  globalSearch: false,
  idlePaneText: true,
  triggerMode: "smart",
  popupSize: "compact",
  showDetailsPane: false,
  acceptMode: 'replace',
  commitCharacters: true,
  wordFallback: true,
  replaceNativeAutocomplete: true,
  suggestInComments: false,
  debugMode: false,
  settingsPos: null,
  settingsSize: null,
  style: Object.freeze({
    codeTextSize: "normal",

    scrollbarStyleEnabled: true,
    scrollbarHue: 195,
    scrollbarSaturation: 1.05,
    scrollbarOpacity: 0.78,

    codeboxFrameEnabled: true,
    codeboxBorderHue: 198,
    codeboxBorderSaturation: 0.92,
    codeboxBorderOpacity: 0.42,
    codeboxGlowHue: 198,
    codeboxGlowSaturation: 1.15,
    codeboxGlowOpacity: 0.18,
    codeboxGlowSize: -100,

    codeboxSurfaceEnabled: true,
    codeboxSurfaceHue: 210,
    codeboxSurfaceSaturation: 0.72,
    codeboxSurfaceOpacity: 0.35,

    syntaxTintEnabled: true,
    syntaxTintPreset: "vscodeDarkPlus",
    syntaxThemeOpacity: 1,
    syntaxThemeSaturation: 1,
    syntaxTintHue: 325,
    syntaxTintSaturation: 1.18,
    syntaxTintOpacity: 0.22,

    // Opt-in: hide HA's in-editor warning/alert banners (e.g. "Visual editor is not
    // supported"). Default off so real config-validation errors stay visible; when on,
    // the companion hides the editor warning surfaces so they stop overlapping the
    // bottom-left "Show visual/code editor" buttons. Editor-scoped only.
    hideEditorWarnings: false,

    // Hide CodeMirror's active-line highlight: the faint wash on the row the cursor is on
    // (the current-row highlight and its gutter), which reads blue over the cyan frosted
    // surface. Default on (hidden); turn off to restore the wash. Drives the single
    // authoritative active-line rule in the codebox root style (codeboxStyle.js),
    // reapplied via scheduleCodeboxStyleReapply, with no separate competing sheet.
    hideActiveLineHighlight: true,

    // Default on: style/syntax every working HA codebox, not just the card-edit dialog.
    // When on, the targeted shadow walk also descends through the non-card-dialog editor
    // panel hosts (Dev Tools, dashboard raw config, automation / script YAML), so the
    // per-editor decorative chrome reaches them. Kill switch only: there is no visible
    // toggle yet (a settings control would change the frozen settings stylesheet bytes).
    // Flip false to restore the card-dialog-only reach.
    universalCodebox: true,

    // Default on: also activate autocomplete (Ctrl+Space / auto-open) on the universal panel
    // editors, not just the card-edit dialog. Granular kill switch layered on universalCodebox:
    // autocomplete is admitted only when both flags are on (so turning off universalCodebox
    // reverts styling and autocomplete; turning off only this keeps panel styling but disables
    // panel autocomplete, e.g. if a surface's suggestions need their context adapter first). The
    // completion scope gate still requires the keystroke/view to resolve to a real ha-code-editor
    // inside an allowlisted panel host, so this never leaks onto the dashboard.
    universalAutocomplete: true,
  }),
  enabledLangs: Object.freeze({
    yaml: true,
    css: true,
    js: true,
    jinja: true,
    html: true,
    json: true,
    python: true,
  }),
  providers: Object.freeze({
    [STATIC_PROVIDER_ID]: Object.freeze({ enabled: true }),
    [SNIPPET_PROVIDER_ID]: Object.freeze({ enabled: true }),
    [LOVELACE_CONTEXT_PROVIDER_ID]: Object.freeze({ enabled: true }),
    [HA_VALUE_PROVIDER_ID]: Object.freeze({ enabled: true }),
    [WORD_FALLBACK_PROVIDER_ID]: Object.freeze({ enabled: true }),
  }),

  // Universal-completions feature flags — a default-OFF namespace (see
  // src/core/completionSettings.js). Lives outside `style` so it never touches the frozen
  // settings stylesheet bytes; every flag ships false, so completion behavior is unchanged
  // until a flag is flipped. No visible control yet (a settings toggle would change the
  // frozen stylesheet).
  completions: DEFAULT_COMPLETION_SETTINGS,
});

export function cloneDefaultSettings() {
  if (typeof structuredClone === 'function') return structuredClone(DEFAULT_SETTINGS);
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

// Keys that walk the prototype chain. Stored settings are JSON.parsed straight into `patch`, and
// JSON.parse keeps a literal "__proto__" as an OWN key, so an assignment `out.__proto__ = value`
// would poison the prototype. Skip them entirely — settings never legitimately carry these names.
const UNSAFE_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// A stored value replaces a default only when it is the same kind of value. Keys whose default is
// null (settingsPos, settingsSize) and keys the defaults do not know are passed through.
function sameKindAsDefault(expected, value) {
  if (expected === null || expected === undefined) return true;
  if (typeof expected === 'object') {
    return !!value && typeof value === 'object' && Array.isArray(value) === Array.isArray(expected);
  }
  return typeof value === typeof expected;
}

export function deepMerge(base, patch) {
  const out = { ...base };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    if (UNSAFE_MERGE_KEYS.has(key)) continue;
    const expected = base?.[key];
    // Wrong-typed stored value (hand-edited storage, or a payload written by another build):
    // keep the default instead of handing null / a string / an array to code that expects an object.
    if (!sameKindAsDefault(expected, value)) continue;
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      out[key] = deepMerge(expected, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
