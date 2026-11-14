// Nostrodomus Settings label formatting seams.
//
// Keep these helpers pure: no DOM access, no browser storage, no events, no
// timers, no styling, and no Home Assistant runtime reads.

import { clampNumber } from '../core/string.js';

const LANGUAGE_LABELS = Object.freeze({
  yaml: "YAML / Lovelace",
  css: "CSS / card_mod",
  js: "JavaScript",
  jinja: "Jinja Templates",
  html: "HTML",
  python: "Python",
});

export function languageLabel(lang) {
  return LANGUAGE_LABELS[lang] || String(lang).replace(/^\w/, (c) => c.toUpperCase());
}


export function glowSizeLabel(value) {
  const n = Math.round(clampNumber(value, -100, 100, 0));
  if (n === 0) return "0 · off";
  return `${n > 0 ? "+" : ""}${n} · ${n < 0 ? "inside" : "outside"}`;
}
