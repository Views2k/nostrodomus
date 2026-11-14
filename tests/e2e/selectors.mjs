// Named selectors for the E2E specs, in one place. The runtime's own
// HA-internal selectors live in src/editor/haSelectors.js; the specs keep
// this separate list so the browser-side code never imports src.
//
// Each entry says what it finds and which spec/feature degrades if it breaks.

// --- HA internals (treadmill-coupled; breakage here means HA changed DOM) ---

/** The HA app shell; `.hass` on it is the spec-side WS/API handle. */
export const HOME_ASSISTANT = 'home-assistant';
/** Lovelace dashboard root; "the dashboard rendered" readiness signal. */
export const HUI_ROOT = 'hui-root';
/** Onboarding screen; only ever asserted ABSENT (instance must be onboarded). */
export const HA_ONBOARDING = 'ha-onboarding';
/** The card edit dialog (real hui dialog) — editor-completion/styling/live-data. */
export const HUI_DIALOG_EDIT_CARD = 'hui-dialog-edit-card';
/** The entities card on the seeded dashboard (its Edit button opens the editor). */
export const HUI_ENTITIES_CARD = 'hui-entities-card';
/**
 * The seeded button card — a SIMPLE (no option-tab row) editor. The canonical case
 * for the small editor; companion-discovery-path.spec opens THIS
 * (not the taller entities card) to cover the small/simple-editor failure mode.
 */
export const HUI_BUTTON_CARD = 'hui-button-card';
/**
 * Per-card wrapper candidates in 2026.6 edit mode (each card renders its own
 * visible "Edit" button inside a wrapper).
 * Ordered most-specific-first, with a layout-based fallback in editor-helpers.mjs.
 */
export const EDIT_MODE_CARD_WRAPPERS = ['hui-card-edit-mode', 'hui-card-options', 'hui-card'];
/** The seeded markdown card — its VISUAL editor embeds a CodeMirror template field (inside
 * ha-selector-template / ha-form), the canonical "form-field editor that is NOT the codebox". */
export const HUI_MARKDOWN_CARD = 'hui-markdown-card';
/** HA's CodeMirror host element — the codebox the product styles and completes in. */
export const HA_CODE_EDITOR = 'ha-code-editor';
/** CodeMirror editable document (typing target). */
export const CM_CONTENT = '.cm-content';
/** CodeMirror scroll container (scroll-stability assertions). */
export const CM_SCROLLER = '.cm-scroller';

// --- Nostrodomus-owned surfaces (ours; breakage here means WE changed DOM) ---

/** Completion popup box (src/completion/popupRuntime.js). */
export const NOSTRODOMUS_POPUP = '#nostrodomus-completions-root';
/** Suggestion rows inside the popup listbox. */
export const NOSTRODOMUS_POPUP_ROW = '.nostrodomus-intelli-row';
/** Popup header gear button — the real user entry point to settings. */
export const NOSTRODOMUS_SETTINGS_BUTTON = '[data-nostrodomus-settings="1"]';
/** Settings panel root (src/ui/settings/settingsPanelShell.js). */
export const NOSTRODOMUS_SETTINGS_PANEL = '#nostrodomus-settings-root';
/** Settings drag handle (the panel header). */
export const NOSTRODOMUS_SETTINGS_DRAG_HANDLE = '[data-drag-handle]';
/** Settings close button (aria-label pinned in settingsPanelShell). */
export const NOSTRODOMUS_SETTINGS_CLOSE = '[aria-label="Close Nostrodomus settings"]';
