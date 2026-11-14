// Nostrodomus sanitize/helpers module
// Keep this module pure: no DOM, no browser storage, no events, no network.
export function safeString(value, maxLen = 512) {
    const s = String(value ?? "");
    if (s.length <= maxLen) return s;
    // A cap landing between a surrogate pair would emit a lone surrogate (ill-formed
    // text → renders as U+FFFD); step back one unit so truncation ends on a whole code point.
    const lastCode = s.charCodeAt(maxLen - 1);
    return s.slice(0, lastCode >= 0xd800 && lastCode <= 0xdbff ? maxLen - 1 : maxLen);
  }

export function stripYamlComment(value) {
    return String(value || "").replace(/\s+#.*$/, "").trim();
  }

export function directYamlKey(raw) {
    const m = String(raw || "").match(/^(\s*)(?:-\s*)?([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) return null;
    return { indent: m[1].length, key: m[2], value: stripYamlComment(m[3] || "") };
  }

export function leadingWhitespace(line) {
    return String(line || "").match(/^\s*/)?.[0] || "";
  }

export function indentLinesAfterFirst(text, indent) {
    return String(text || "").replace(/\n/g, "\n" + indent);
  }

export function camelMatch(label, query) {
    if (!query || query.length < 2) return false;
    const caps = String(label).replace(/[^A-Z0-9]/g, "").toLowerCase();
    return caps.includes(query.toLowerCase());
  }

export function sanitizeInlineDocumentation(value, maxLen = 320) {
    return safeString(value, maxLen)
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "")
      .split("")
      .map(ch => {
        const code = ch.charCodeAt(0);
        return code < 32 || code === 127 ? " " : ch;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }
