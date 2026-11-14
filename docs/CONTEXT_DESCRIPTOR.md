# Context Descriptor Contract

Before providers and scoring run, Nostrodomus describes the cursor position as a plain object: the context descriptor. Providers and the scoring module read this object and do not parse the editor text themselves.

There are two producers:

- `describeYamlCompletionContext` in `src/yaml/yamlCompletionContext.js` builds the versioned base descriptor. It is covered by the fixture corpus and by a schema validator.
- `detectRuntimeContext` in `src/yaml/runtimeContextAdapter.js` builds the descriptor the live completion path uses. It carries the base fields plus cursor, line and trigger fields.

Both are pure functions of the text, the cursor position and the options passed in. They do not read browser globals, Home Assistant objects, storage, timers or runtime state.

## Descriptor version

Current descriptor version: `1` (`CONTEXT_DESCRIPTOR_VERSION`).

Changing the shape or meaning of an existing field is a breaking change. Adding a field is compatible as long as existing consumers keep working.

## Base descriptor

```js
import { describeYamlCompletionContext } from './src/yaml/yamlCompletionContext.js';

const ctx = describeYamlCompletionContext(sourceText, cursorPosition, options);
```

```js
{
  descriptorVersion: 1,
  lang: 'yaml' | 'css' | 'jinja',
  prefix: string,
  pathText: string,
  yamlPath: string[],
  yamlKey: string,
  yamlRole: 'blank' | 'comment' | 'key' | 'list-key' | 'value',
  valueKind: '' | 'action' | 'automation-mode' | 'boolean' | 'card-type' | 'condition-type' | 'duration' | 'entity' | 'icon' | 'number' | 'service' | 'string' | 'scalar' | 'theme' | 'trigger-type',
  focusKind: '' | 'style-block' | 'entity-list' | 'action-block' | 'trigger-block' | 'condition-block' | 'automation-action',
  branchState: null | object,
  scope: string,
  shouldSuggest: boolean,
  triggerKind: string,
  isTriggerChar: boolean,
  afterKeyColon: boolean
}
```

The module exports the schema helpers `CONTEXT_DESCRIPTOR_FIELD_NAMES`, `YAML_CONTEXT_ROLES`, `contextDescriptorValidationErrors(ctx)` and `isValidContextDescriptor(ctx)`. The validator checks that every field is present, that string and boolean fields have the right type, and that `lang`, `yamlRole` and `valueKind` hold one of the values listed above.

`blockScalarContextAt(sourceText, cursorPosition)` reports whether the cursor is inside a YAML literal or folded scalar (`|` or `>`). When it is, the descriptor keeps the key and path that own the block, and `lang` becomes `css` or `jinja` when the surrounding content indicates it.

`detectContext` in `src/yaml/yamlScanner.js` returns the base descriptor with line fields added. The scanner module also provides the path, comment and key helpers that the runtime adapter imports.

## Runtime descriptor

`createRuntimeContextRuntime` in `src/yaml/runtimeContextRuntime.js` calls `detectRuntimeContext(doc, pos, options)` on every completion request and passes the result to the providers and to `scoreItems`. If detection throws, `detectRuntimeContextFallback` and then a fixed safe descriptor are used, and the error is recorded once in the runtime error buffer.

The runtime descriptor has no `descriptorVersion` field. Its fields:

| Field | Meaning |
| --- | --- |
| `lang` | `yaml`, `css`, `jinja`, `js`, `html` or `python` |
| `scope` | The YAML path joined with dots, `yaml-root`, or a language scope such as `card-mod-css`, `jinja-template`, `button-card-js` |
| `confidence` | Number between 0 and 1 for the language decision |
| `prefix` | The typed text the suggestion replaces |
| `from`, `to`, `wordTo`, `pos` | Document offsets: start of the prefix, cursor, end of the word under the cursor, cursor |
| `line`, `col`, `lineNumber`, `beforeCursor`, `afterCursor` | The cursor line and its parts |
| `yamlPath`, `pathText` | The keys above the cursor as an array and as a lower-case dotted string |
| `yamlRole` | `blank`, `comment`, `key`, `list-key` or `value` for YAML; `code` for other languages |
| `yamlKey` | The key on the cursor line |
| `valueKind` | The base value kinds, plus `area`, `device`, `floor` and `label` when the registry lane is enabled |
| `focusKind` | `valueKind` when one is set, otherwise `target-block`, `action-block`, `style-block`, `trigger-block`, `condition-block`, `automation-action`, `entity-list` or empty |
| `branchState` | See below |
| `scalarValueContext` | True when the value position expects a number, duration or plain string |
| `blockValueKind` | `block-key` when the key takes a nested block instead of a value on the same line |
| `catalogCardType`, `catalogSurfaceId`, `catalogCardNested` | The card around the cursor when the card catalog knows it |
| `triggerKind`, `triggerChar`, `isTriggerChar` | How the request was started (`typing` or `explicit`) and the character before the cursor |
| `isBlankLine`, `afterKeyColon`, `isComment` | Line state flags |
| `suppressPopup`, `shouldSuggest`, `idleReason` | Whether rows are offered at this position, and why not |

Fields that appear only in some contexts:

- `cssInsideRule` when `lang` is `css`: the cursor is between the braces of a rule.
- `surface` and, in templates, `jinjaArg` when the surface-aware engine is enabled (`completions.engineV2`).
- With the engine enabled, `resolveContext` in `src/context/contextResolver.js` adds `expectedKind` (an alias of `valueKind`), `language` (an alias of `lang`), `replaceRange`, `region` and `signatureTarget`, and the context runtime sets the gate flags `jinjaLaneEnabled`, `registryLaneEnabled`, `schemaValuesEnabled` and `surfaceScopeEnabled`. With the engine off, `resolveContext` returns the descriptor unchanged.

`valueKind` is computed in two places that must agree: `yamlValueKind` in `src/yaml/runtimeContextAdapter.js` (detection) and `yamlValueKind` in `src/yaml/yamlContextClassifier.js` (used by the providers). `tests/context/yaml_value_kind_parity.test.mjs` keeps them equal. `inferYamlValueKind` in `src/yaml/yamlCompletionContext.js` feeds only the base descriptor and is not on the live path; a new value lane has to be added to the two live copies.

## branchState

`branchState` is the parsed view of the action or service block around the cursor.

The base descriptor uses `yamlBranchState` from `src/yaml/yamlBranchState.js`. It returns `null` outside an action block, otherwise:

```js
{
  parentKey,      // action, actions, sequence, then, else, choose, repeat or parallel
  parentIndent,
  parentValue,    // the scalar on the parent line, for example the service id in `- action: light.turn_on`
  currentIndent,
  siblings,       // child key -> { value, indent, lineIndex }
  action          // the value of the `action` or `service` sibling
}
```

The runtime descriptor uses `dashboardActionBranchState` from `src/yaml/runtimeContextAdapter.js`. Inside `tap_action`, `hold_action` or `double_tap_action` it returns:

```js
{
  kind,           // 'action-block' or 'target-block'
  parentKey, parentIndent, childIndent, currentIndent,
  activeChildKey,
  actionValue,    // the value of the `action` sibling
  branchName, branch,
  siblings,       // child key -> { value, indent, lineIndex }
  usedKeys, missingKeys,
  canContinue
}
```

Outside a dashboard action block it falls back to the `yamlBranchState` shape with `kind` added.

Code that needs the service id of the enclosing block reads it from these fields through `serviceIdFromContext(ctx)` in `src/providers/haRuntimeProvider.js`. It does not parse YAML again.

## Consumers

Providers use `yamlRole`, `yamlKey`, `yamlPath`, `valueKind`, `focusKind` and `branchState`.

Scoring treats `valueKind` and `focusKind` as hints. Malformed and partial YAML is the normal case while the user types, so a descriptor can be incomplete.

## Fixture policy

Context fixtures live under `tests/fixtures/context/`. Each fixture has a `name`, a `rationale`, the source text with a cursor marker in `sourceWithCursor`, and the `expected` descriptor fields. `tests/context/yaml_completion_context.test.mjs` runs `describeYamlCompletionContext` against every fixture.

The corpus covers Home Assistant shapes: automations, scripts, Lovelace cards, card_mod CSS, Jinja templates, malformed partial YAML, block scalars, multi-document YAML, tab-indented YAML, a prefix at the end of the file, and a quoted `#`.

New fixtures mark the cursor with `__CURSOR__`. Home Assistant YAML uses `|` and `>` as block scalar indicators, so the older `|` marker is accepted only for fixtures that do not contain `__CURSOR__`.
