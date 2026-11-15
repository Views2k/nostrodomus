# Nostrodomus Snippet Schema

Snippets are data. They live in `data/snippets.json`, which `src/snippets/catalog.js` imports and the snippet provider (`src/providers/snippetProvider.js`) serves. Provider code selects and ranks snippets; it does not contain snippet definitions.

## Schema

`data/snippets.json` is a JSON list of objects:

```json
{
  "id": "snip.dashboard.action.perform_action",
  "family": "dashboard-action",
  "contextKind": "lovelace-action-block",
  "triggers": ["dashboard.action.perform_action"],
  "label": "tap/hold action: perform action",
  "insert": "action: perform-action\nperform_action: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}\ndata:\n  ${3:brightness_pct}: ${4:100}",
  "aliases": ["tap_action", "hold_action", "perform-action", "target"],
  "priority": 120,
  "documentation": "Dashboard action template for service calls using modern perform-action syntax."
}
```

Required fields:

- `id`: unique id. Lower-case letters, digits, `.`, `_`, `:` and `-`, starting with a letter or digit.
- `family`: one of the families listed below.
- `contextKind`: the context in which the provider offers the snippet, one of the kinds listed below.
- `triggers`: non-empty list of keys with the same character set as `id`. A trigger may appear only once in the whole catalog.
- `label`: the text of the row in the suggestion list.
- `insert`: the inserted text.
- `documentation`: short help text shown in the details of the row.

Optional fields:

- `aliases`: list of words the row can also be found by.
- `priority`: number used for ranking. The default is `80`.

Families:

- `dashboard-action`
- `dashboard-card`
- `automation-trigger`
- `automation-condition`
- `automation-action`
- `target`
- `card-mod-css`
- `button-card-style`

Context kinds:

- `lovelace-action-block`
- `lovelace-action-value`
- `dashboard-root`
- `trigger-block`
- `condition-block`
- `automation-action`
- `target-block`
- `style-block`

The same two lists are in `tools/validate_snippets.py` (`ALLOWED_FAMILIES`, `ALLOWED_CONTEXT_KINDS`) and in `src/snippets/catalog.js`. A new family or context kind has to be added in both, and the provider has to offer it in `activeSnippetContextKinds`.

## Placeholders

`insert` may contain tab stops:

- `${1:default}`: tab stop 1 with a default text.
- `$1`: tab stop 1 without a default.

Tab stop numbers start at 1, and the same number may appear more than once. `parseSnippetTemplate` in `src/completion/snippets.js` parses the template when a row is accepted. The parser also understands choice lists (`${1|a,b|}`) and a final cursor position (`$0`); the catalog validator rejects both, so catalog snippets do not use them.

## Validation

`tools/validate_snippets.py` checks the catalog:

- The file parses as a JSON list of objects.
- Required fields exist and have the right type.
- `id` values are unique and use the allowed characters.
- `family` and `contextKind` are known.
- `triggers` is a non-empty list of strings, without duplicates in a snippet or across the catalog.
- `aliases` entries are non-empty strings when the field is present.
- `priority` is a number when the field is present.
- `insert` is not blank, uses LF line ends, has no line that starts with a tab and no trailing spaces.
- Every `${` belongs to a complete `${n}` or `${n:default}` placeholder, and placeholder numbers are greater than zero.

Run it with `python3 tools/validate_snippets.py` or `npm run validate:snippets`. It is part of `npm run gate` and of the CI workflow, so a bad snippet fails the build and is not dropped at runtime.

A new snippet normally changes only `data/snippets.json` and the tests under `tests/snippets/`.
