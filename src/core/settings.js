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

    // Hides Home Assistant's warning banners in the editor (such as "Visual editor is not
    // supported"), which can cover the "Show visual editor" and "Show code editor" buttons. Off by
    // default so configuration errors stay visible. Only the editor's own warnings are affected.
    hideEditorWarnings: false,

    // Hides CodeMirror's active-line highlight (the faint wash on the cursor's row and its gutter),
    // which looks blue on the frosted cyan surface. On by default. Applied by the active-line rule
    // of the codebox root style (codeboxStyle.js).
    hideActiveLineHighlight: true,

    // Glass editor dialog, on by default: while the card editor dialog is open its surface is
    // translucent and blurs what is behind it, and the preview pane has no background of its
    // own, so the dashboard shows through. Values a theme defines for its dialogs are kept.
    // Turning it off saves the graphics work of the blur. The companion layer adds the sheet
    // (companionStyleRuntime.js); a change re-applies that layer at once.
    glassDialog: true,

    // On by default: style and color the panel editors as well as the card dialog's (Developer
    // Tools, the dashboard raw configuration editor, automation and script YAML); the shadow walk
    // then also enters their hosts. Set it to false for the card dialog only. The settings panel
    // has no control for it.
    universalCodebox: true,

    // On by default: completion (Ctrl+Space and automatic opening) in the panel editors as well.
    // It needs universalCodebox too: turning universalCodebox off removes panel styling and panel
    // completion, turning only this off keeps the styling. The scope check still requires a real
    // ha-code-editor inside one of the panel hosts, so a dashboard is never in scope. The settings
    // panel has no control for it.
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

  // The experimental completion options, all off by default; see src/core/completionSettings.js.
  // They are under "Smart completion (experimental)" in the General tab of the settings panel.
  completions: DEFAULT_COMPLETION_SETTINGS,
});

export function cloneDefaultSettings() {
  if (typeof structuredClone === 'function') return structuredClone(DEFAULT_SETTINGS);
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

// Keys that reach the prototype chain. Stored settings are parsed straight into `patch`, and
// JSON.parse keeps a literal "__proto__" as an own key, so `out.__proto__ = value` would replace
// the prototype. Settings never use these names, so they are skipped.
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
    // A stored value of the wrong type (hand-edited storage, or a payload written by another
    // build) keeps the default, so code that expects an object never gets null, a string or an array.
    if (!sameKindAsDefault(expected, value)) continue;
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      out[key] = deepMerge(expected, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
