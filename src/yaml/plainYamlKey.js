// YAML key helpers for the runtime context adapter.
//
// stripYamlComment drops everything from the first "#" that follows whitespace, also inside
// quotes, and directYamlKey reads plain keys only (letters, digits, "_" and "-"). yamlScanner.js
// exports quote-aware versions under the same names; using them here would change what the
// adapter reads from a line with a quoted "#" or a key with "$" or ".".
//
// Pure: no DOM, editor, storage, network or timers.

export function stripYamlComment(value) {
  return String(value || "").replace(/\s+#.*$/, "").trim();
}

// A "#" right after the space that follows the colon starts a comment, so "action: # pick one"
// is a key without a value.
export function directYamlKey(raw) {
  const m = String(raw || "").match(/^(\s*)(?:-\s*)?([A-Za-z0-9_-]+)\s*:(\s*)(.*)$/);
  if (!m) return null;
  const rest = m[4] || "";
  const value = m[3] && rest.startsWith("#") ? "" : stripYamlComment(rest);
  return { indent: m[1].length, key: m[2], value };
}

export function yamlCurrentKey(info) {
  const m = String(info?.line || "").match(/^\s*-?\s*([A-Za-z0-9_-]+)\s*:/);
  return m ? m[1] : "";
}
