// Nostrodomus completion snippet-template helpers.
// Parses snippet templates for live insertion.
// Keep this module pure: no browser globals, DOM work, runtime state, storage,
// timers, network, editor dispatch, popup rendering, or Settings ownership.

function pushPlaceholder(all, firstByIndex, placeholder) {
  if (placeholder.index === 0) return;
  all.push(placeholder);
  if (!firstByIndex.has(placeholder.index)) firstByIndex.set(placeholder.index, placeholder);
}

export function parseSnippetTemplate(template) {
  const source = String(template || '');
  const allPlaceholders = [];
  const firstByIndex = new Map();
  const choices = [];
  let finalCursor = null;
  let text = '';
  let last = 0;
  // The placeholder default allows balanced braces up to two levels deep so card_mod CSS blocks
  // (`${1:.card { }}`) and Jinja expressions (`${1:{{ states('x') }}}`) aren't truncated at the first
  // inner `}`. A plain `[^}]*` stopped at that brace, leaking the rest as literal text.
  const rx = /\$\{(\d+)\|([^}]*)\|\}|\$\{(\d+)(?::((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*))?\}|\$(\d+)/g;
  let match;
  while ((match = rx.exec(source))) {
    text += source.slice(last, match.index);
    const index = Number(match[1] || match[3] || match[5] || 0);
    const choiceRaw = match[2];
    const isChoice = choiceRaw != null;
    const options = isChoice ? String(choiceRaw).split(',') : [];
    const value = isChoice ? (options[0] || '') : (match[4] || '');
    const start = text.length;
    text += value;
    const end = text.length;
    const placeholder = isChoice
      ? { index, start, end, choices: options.slice() }
      : { index, start, end };
    if (index === 0) finalCursor = { index, start, end };
    else {
      pushPlaceholder(allPlaceholders, firstByIndex, placeholder);
      if (isChoice) choices.push({ index, start, end, choices: options.slice() });
    }
    last = rx.lastIndex;
  }
  text += source.slice(last);
  const placeholders = Array.from(firstByIndex.values()).sort((a, b) => a.index - b.index || a.start - b.start);
  allPlaceholders.sort((a, b) => a.index - b.index || a.start - b.start);
  return { text, placeholders, allPlaceholders, finalCursor, choices };
}

export function hasSnippetPlaceholders(value) {
  return /\$\{\d+\|[^}]*\|\}|\$\{\d+(?::[^}]*)?\}|\$\d+/.test(String(value || ''));
}
