// Nostrodomus runtime identity constants.
//
// Pure: no DOM access, no browser storage, no events, no timers and no Home Assistant runtime
// reads. A release changes this file together with PROJECT.json, package.json, package-lock.json,
// src/core/changelogSummary.js and dist (tools/version_bump.py does the version fields).

export const VERSION = "nostrodomus-v0.1.282-icon-sets";
export const PROJECT_VERSION = "0.1.282";
export const PROJECT_RELEASE_STATE = "beta";
export const LIVE_COMPANION_EDITOR_VERSION = "nostrodomus-editor-v17.2.65-runtime-coordinator";
export const PRODUCT_NAME = "Nostrodomus";
export const LOG_PREFIX = `[${PRODUCT_NAME}]`;
export const SETTINGS_WRITE_KEY = "nostrodomus.settings";
// The frecency store (the history of accepted rows) has its own key, so it neither grows the settings
// payload nor changes it on every accept. Read once at boot; written 1.5 s after an accept.
export const FRECENCY_WRITE_KEY = "nostrodomus.frecency";
