# Nostrodomus Snippet Schema

Status: active. `data/snippets.json` is the validated snippet catalog consumed by the bundled snippet provider.

Snippets are declarative data in `data/snippets.json`. JavaScript provider code may route and rank snippets, but snippet definitions must not be hardcoded into provider logic.

## Schema

```json
{
  "id": "snip.dashboard.action.perform_action",
  "family": "dashboard-action",
  "contextKind": "lovelace-action-block",
  "triggers": ["dashboard.action.perform_action"],
  "label": "tap/hold action: perform action",
  "insert": "action: perform-action\nperform_action: ${1:light.turn_on}",
  "aliases": ["tap_action", "perform-action"],
  "priority": 120,
  "documentation": "Dashboard action template for service calls."
}
```

Required fields:

- `id`: unique stable snippet id, lowercase dotted/kebab/underscore safe.
- `family`: one of the known Nostrodomus snippet families.
- `contextKind`: provider-facing context bucket.
- `triggers`: non-empty list of unique activation/intent keys. Triggers are unique across the catalog.
- `label`: visible row label.
- `insert`: inserted template text. Snippet placeholders use `${1:default}` or `$1`.
- `documentation`: short help text shown in completion details.

Optional fields:

- `aliases`: searchable synonyms.
- `priority`: numeric sort hint, default `80`.

Allowed families:

- `dashboard-action`
- `dashboard-card`
- `automation-trigger`
- `automation-condition`
- `automation-action`
- `target`
- `card-mod-css`
- `button-card-style`

Allowed context kinds in this foundation:

- `lovelace-action-block`
- `lovelace-action-value`
- `dashboard-root`
- `trigger-block`
- `condition-block`
- `automation-action`
- `target-block`
- `style-block`

## Validation contract

`tools/validate_snippets.py` must pass before a snippet catalog is accepted. It checks:

- JSON parses as a list of objects.
- Required fields exist and have the correct type.
- `id` values are unique and safe.
- `family` and `contextKind` are known.
- `triggers` are non-empty strings and unique across the catalog.
- `aliases` are strings when present.
- `priority` is numeric when present.
- `insert` is non-empty and does not contain tab-indented YAML.
- Snippet placeholders are balanced and use positive numeric indexes.

A bad snippet must fail validation in CI rather than being silently dropped at runtime.


## Catalog size checkpoint

As of the autocomplete closure snippet expansion the validated catalog contains 75 snippets. Future additions should change only `data/snippets.json` plus focused provider/fixture tests unless routing logic needs a deliberate contract update.
