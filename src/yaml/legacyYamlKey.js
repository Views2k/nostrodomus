// Nostrodomus legacy-compatible YAML key parsing helpers.
//
// These helpers preserve the legacy comment-stripping semantics on purpose; do not replace
// them with the quote-aware scanner helpers without a deliberate behavior-change patch and
// fixtures. Keep this file pure: no DOM, browser storage, runtime state, timers, network,
// Settings, or Home Assistant host access.

export function stripYamlComment(value) {
  return String(value || "").replace(/\s+#.*$/, "").trim();
}

export function directYamlKey(raw) {
  const m = String(raw || "").match(/^(\s*)(?:-\s*)?([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
  if (!m) return null;
  return { indent: m[1].length, key: m[2], value: stripYamlComment(m[3] || "") };
}

export function yamlCurrentKey(info) {
  const m = String(info?.line || "").match(/^\s*-?\s*([A-Za-z0-9_-]+)\s*:/);
  return m ? m[1] : "";
}
