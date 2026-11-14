// Nostrodomus runtime identity constants.
//
// This is the first wired extraction from src/main.legacy.js. Keep it pure:
// no DOM access, no browser storage, no events, no timers, and no Home Assistant
// runtime reads. Update this file, PROJECT.json, package.json, package-lock.json,
// src/core/changelogSummary.js, src/main.legacy.js import usage, and dist together for every patch.

export const VERSION = "nostrodomus-v0.1.279-glass-dialog";
export const PROJECT_VERSION = "0.1.279";
export const PROJECT_RELEASE_STATE = "beta";
export const LIVE_COMPANION_EDITOR_VERSION = "nostrodomus-editor-v17.2.65-runtime-coordinator";
export const PRODUCT_NAME = "Nostrodomus";
export const LOG_PREFIX = `[${PRODUCT_NAME}]`;
export const SETTINGS_WRITE_KEY = "nostrodomus.settings";
// Separate key for the persisted frecency store (most-accepted-completions history), so it never bloats
// the settings payload or trips settings dedupe. Read-once at boot, debounced write on accept, fail-dark.
export const FRECENCY_WRITE_KEY = "nostrodomus.frecency";
