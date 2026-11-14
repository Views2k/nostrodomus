// Nostrodomus snippet catalog module.
// Snippet definitions live as validated data in data/snippets.json.

import snippetCatalogData from '../../data/snippets.json' with { type: 'json' };

export const NOSTRODOMUS_SNIPPET_FAMILIES = Object.freeze([
  "dashboard-action",
  "dashboard-card",
  "automation-trigger",
  "automation-condition",
  "automation-action",
  "target",
  "card-mod-css",
  "button-card-style",
]);

const NOSTRODOMUS_SNIPPET_CONTEXTS = Object.freeze({
  dashboardAction: ["lovelace-action-block", "lovelace-action-value"],
  dashboardRoot: ["dashboard-root"],
  automationSequence: ["automation-action"],
  triggers: ["trigger-block"],
  conditions: ["condition-block"],
  target: ["target-block"],
  style: ["style-block"],
});

export const NOSTRODOMUS_SNIPPET_CONTEXT_KIND_SET = Object.freeze(
  Array.from(new Set(Object.values(NOSTRODOMUS_SNIPPET_CONTEXTS).flat())).sort()
);

export const NOSTRODOMUS_SNIPPET_CATALOG = Object.freeze(
  snippetCatalogData.map(snippet => Object.freeze({
    ...snippet,
    triggers: Object.freeze([...(snippet.triggers || [])]),
    aliases: Object.freeze([...(snippet.aliases || [])]),
  }))
);

export function snippetCatalog() {
  return NOSTRODOMUS_SNIPPET_CATALOG;
}
