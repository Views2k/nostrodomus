// Text helpers: indentation of inserted lines and the inline documentation text of a suggestion.
// Pure: no DOM, no browser storage, no events, no network.

import { safeString } from "./string.js";

export function leadingWhitespace(line) {
  return String(line || "").match(/^\s*/)?.[0] || "";
}

export function indentLinesAfterFirst(text, indent) {
  return String(text || "").replace(/\n/g, "\n" + indent);
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
