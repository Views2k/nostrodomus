# Context Descriptor Contract

Nostrodomus uses a context descriptor to describe the user cursor position before providers and scoring run.

This document records the context descriptor contract for `src/yaml/` context detection, which is wired into the browser bundle.

## Descriptor version

Current descriptor version: `1`.

Changing the shape or meaning of existing fields is a breaking change. Additive fields can be minor changes if existing consumers keep working.

## Pure function entry point

```js
import { describeYamlCompletionContext } from './src/yaml/yamlCompletionContext.js';

const ctx = describeYamlCompletionContext(sourceText, cursorPosition, options);
```

The function is pure. It must not access browser globals, Home Assistant runtime objects, network APIs, storage APIs, timers, or runtime state.

## Current descriptor shape

```js
{
  descriptorVersion: 1,
  lang: 'yaml' | 'css' | 'jinja',
  prefix: string,
  pathText: string,
  yamlPath: string[],
  yamlKey: string,
  yamlRole: 'blank' | 'comment' | 'list-key' | 'key' | 'value',
  valueKind: '' | 'entity' | 'service' | 'card-type' | 'icon' | 'action' | 'trigger-type' | 'condition-type' | 'automation-mode' | 'boolean' | 'number' | 'duration' | 'string' | 'scalar' | 'theme',
  focusKind: '' | 'action-block' | 'automation-action' | 'entity-list' | 'style-block' | 'trigger-block' | 'condition-block',
  branchState: null | object,
  scope: string,
  shouldSuggest: boolean,
  triggerKind: string,
  isTriggerChar: boolean,
  afterKeyColon: boolean
}
```

## branchState

`branchState` is the adapter-parsed view of the enclosing action/service block.
The dashboard shape (from `dashboardActionBranchState`) carries `kind`
(`action-block`/`target-block`), `siblings` (child key → `{value, indent,
lineIndex}` including `service`/`perform_action` scalars), `actionValue`,
`usedKeys`, and `missingKeys`. The automation fallback shape (from
`yamlBranchState`) carries `parentKey`, `parentIndent`, `parentValue` (the
parent line's own already-parsed scalar value — e.g. the service id on a
modern `- action: light.turn_on` step; added v0.1.81), `currentIndent`,
`siblings`, and `action`.

Service-aware consumers (e.g. service field-key completion) must read the
service id through these parsed fields — `serviceIdFromContext(ctx)` in the HA
runtime provider is the canonical reader — and must not reparse YAML.

## Consumers

Providers should use `yamlRole`, `yamlKey`, `valueKind`, `focusKind`, and `scope` rather than reparsing YAML themselves.

Scoring should treat `valueKind` and `focusKind` as hints, not absolute truth. Malformed or partial YAML is expected while the user types.

## Fixture policy

Context fixtures live under `tests/fixtures/context/`. Each fixture contains source text, cursor marker, expected descriptor fields, and a rationale. Fixtures should include real Home Assistant shapes: automations, scripts, Lovelace cards, card_mod CSS, Jinja templates, malformed partial YAML, embedded block scalars, multi-document YAML, tab-indented pasted YAML, EOF prefixes, and edge cases such as quoted `#` characters.


## Cursor marker convention

New fixtures should use `__CURSOR__` instead of `|` because Home Assistant YAML commonly uses `|` and `>` as block-scalar indicators. The legacy `|` marker remains supported only for older fixtures.

## Block scalar context

`blockScalarContextAt(sourceText, cursorPosition)` detects whether the cursor is inside a YAML literal or folded scalar. When active, `describeYamlCompletionContext` keeps the owning YAML key/path while allowing `lang` to switch to embedded CSS or Jinja when the surrounding content indicates it.


## v31.6.104 schema/value-kind parity hardening

The context module now exports `CONTEXT_DESCRIPTOR_FIELD_NAMES`, `YAML_CONTEXT_ROLES`, `YAML_VALUE_KINDS`, `contextDescriptorValidationErrors(ctx)`, and `isValidContextDescriptor(ctx)`. These helpers keep fixture outputs and provider-facing descriptors honest.

The value-kind helper covers the common Home Assistant contexts: dashboard `tap_action.action` values stay `action`, automation/script `action:` / `service:` / `service_name:` / `perform_action:` values resolve to `service`, trigger/condition type keys resolve to `trigger-type` / `condition-type`, and scalar keys such as `timeout`, `name`, and `theme` resolve to `duration`, `string`, and `theme`.
