// Nostrodomus Dark+ syntax classifier helpers.
//
// Keep these helpers pure. No DOM access, no Settings/runtime state reads, no
// browser storage, no events, no observers, no timers, and no logging.

export function darkPlusCssDepthDelta(text) {
  const raw = String(text || '');
  let opens = 0;
  let closes = 0;
  for (const ch of raw) {
    if (ch === '{') opens += 1;
    if (ch === '}') closes += 1;
  }
  return opens - closes;
}

export function darkPlusLooksCssSelector(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[{]/.test(t) && /[.#$>~+,[:A-Za-z_-]/.test(t) && !/^[-]?[\w.-]+\s*:/.test(t)) return true;
  if (/^[.#][A-Za-z0-9_$:-]+/.test(t)) return true;
  if (/^[A-Za-z0-9_.$#:[\]=\-\s,>~+]+[,>]?$/.test(t) && /[.#$]/.test(t)) return true;
  if (/^[A-Za-z][A-Za-z0-9_-]+(\$|[.#:\s,>{]|$)/.test(t) && /[{,>$#.]/.test(t)) return true;
  return false;
}

export function darkPlusLooksCssDeclaration(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^--[A-Za-z0-9_-]+\s*:/.test(t)) return true;
  if (/^[A-Za-z-]+\s*:\s*[^/]/.test(t) && /(;|!important|var\(|rgb\(|rgba\(|hsl\(|hsla\(|calc\(|linear-gradient\(|url\(|#[0-9a-f]{3,8}\b)/i.test(t)) return true;
  return false;
}

export function darkPlusLooksCssContinuation(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^(!important|;|,|\}|\)|\]|")/.test(t)) return true;
  if (/(!important|;|\}|var\(|rgb\(|rgba\(|hsl\(|hsla\(|calc\(|linear-gradient\(|url\(|#[0-9a-f]{3,8}\b)/i.test(t)) return true;
  return false;
}

export function darkPlusIsJinjaLine(text) {
  const raw = String(text || '');
  return /\{[{%#]|[#%}]\}/.test(raw);
}

export function darkPlusIsJinjaKeyword(token) {
  return /^(if|else|elif|endif|for|endfor|set|setattr|with|endwith|macro|endmacro|call|endcall|filter|endfilter|include|import|from|as|in|not|and|or|is|defined|none|true|false)$/i.test(String(token || ''));
}
