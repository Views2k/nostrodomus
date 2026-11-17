# Nostrodomus Documentation

Reference for Nostrodomus, a local-only autocomplete, snippets, and syntax-styling plugin for Home Assistant's code editors. This reference describes version 0.1.282 (beta).

- Product: Nostrodomus. Channel: beta. License: MIT.
- Requires: Home Assistant 2026.6.0+. Installed through the Marketplace built into Home Assistant 2026.11 and later, HACS 2.0.0+ on earlier versions, or by hand.
- Changes per version: [CHANGELOG.md](CHANGELOG.md).
- Runtime API namespace: `window.__nostrodomus`.

## Table of contents

1. [How it works](#how-it-works)
2. [Supported editors and surfaces](#supported-editors-and-surfaces)
3. [The completion experience](#the-completion-experience)
4. [Keyboard shortcuts](#keyboard-shortcuts)
5. [Providers and the context engine](#providers-and-the-context-engine)
6. [Language support](#language-support)
7. [Snippets](#snippets)
8. [Settings reference](#settings-reference)
9. [Styling and themes](#styling-and-themes)
10. [Examples](#examples)
11. [Diagnostics and the API](#diagnostics-and-the-api)
12. [Privacy, security, and storage](#privacy-security-and-storage)
13. [Compatibility and versioning](#compatibility-and-versioning)
14. [Known issues](#known-issues)
15. [Troubleshooting](#troubleshooting)
16. [Uninstalling](#uninstalling)
17. [Building from source](#building-from-source)

## How it works

Nostrodomus attaches to Home Assistant's built-in CodeMirror editors. As you type or move the cursor, a context engine reads the surrounding YAML to work out where you are: a card `type:`, an `action:` or `service:`, a service `data:` field, an `entity_id:`, a `card_mod` CSS block, a Jinja template, a trigger or condition, and so on. It then asks a set of providers for completions that fit that spot, ranks them, and shows them in a suggestion list.

Two rules shape everything:

- Live from your instance, bundled, or from the open editor. Entities, services, service-field schemas, themes and your installed custom cards are read from the running `hass` object in your browser, and icon names from the icon sets installed in Home Assistant. Common community cards, the common Material Design icon names and Jinja and YAML vocabulary come from a catalog bundled inside the plugin, and words already in the open editor fill in when the other sources find few matches. Nostrodomus makes no network requests of its own.
- Scoped to the active editor. Styling applies to the editor you are working in, the containers around it that would clip its frame, and, in the card editor, its dialog, marked with internal data attributes. In Developer Tools the Result pane next to the template editor also gets the editor's frame. The styling never touches the rest of your dashboard or your Home Assistant theme.

## Supported editors and surfaces

| Surface | Status |
|---|---|
| Dashboard card-edit dialog (the code editor of a card) | Completion, snippets, styling, enlarged dialog and editor, warning badge |
| `card_mod` style blocks (CSS in YAML) | Context-aware completion plus CSS coloring |
| Dashboard raw configuration editor | Completion and styling |
| Automation and script editors in YAML mode | Completion, including modern `action:` steps, and styling. Editor warnings stay as Home Assistant draws them |
| Developer Tools: the Template editor | Completion and styling. Editor warnings stay as Home Assistant draws them |
| Composite cards with an embedded secondary editor | The main editor is sized. The embedded editor is left at native size |
| A custom card's own visual editor | Not changed: controls, notes and layout stay as the card built them, a codebox the card puts in its editor keeps its size, its look and its own suggestions, and the dialog is not enlarged or restyled on its account. A Home Assistant YAML editor that the card's editor shows for a card inside it is completed and styled, and showing it enlarges the dialog |

The YAML editors of the Actions and Events tools in Developer Tools are admitted by the same rule as the Template editor. The automated browser tests cover the card-edit dialog, the automation and script editors and the Template editor.

In the card-edit dialog Nostrodomus also enlarges the dialog to most of the window and fits the code editor to the space above the dialog buttons, and with the Glass editor dialog setting it makes the dialog translucent. The dialog takes this size and look once one of Home Assistant's code editors in it has been shown: the card's code editor, or the YAML editor of a card inside it, such as a card in a stack. A dialog that has shown neither keeps Home Assistant's own. In a window narrower than 1000 pixels, where Home Assistant stacks the preview under the editor, the dialog scrolls instead.

Before Home Assistant 2026.11 Developer Tools is in the sidebar. Since 2026.11 it is under Settings, named Tools. Both are supported.

Home Assistant loads custom dashboard resources when a dashboard that you created is opened. Its built-in Overview at `/home` does not load them, and the other built-in dashboards (Lights, Security, Climate, Energy, Maintenance) may not either. Nostrodomus is therefore active once a dashboard you created has been opened in the browser tab. From then on it also works in the automation, script and Developer Tools editors of that tab, until the page is reloaded. See [docs/COMPAT.md](docs/COMPAT.md).

## The completion experience

### Triggering suggestions
- Press `Ctrl+Space` to open the list at the cursor and `Esc` to close it. With the default settings this is how the list opens.
- With Keep Nostrodomus armed (`keepOpen`, Settings, General, off by default) the list also opens as you type, controlled by Trigger behavior:
  - Smart (default): after the minimum number of typed characters, or after a trigger character.
  - Manual only: nothing appears until you press `Ctrl+Space`.
  - Aggressive: one typed character sooner than Smart.
- Minimum typed characters before automatic suggestions: 0, 1 (default), 2, 3, or 4.
- Arm when editor is focused (`autoOpenOnFocus`, off by default) opens the list when you click into the editor, if there are suggestions at the cursor.
- When you press `Ctrl+Space` and nothing fits, the list shows "No suggestions". This can be turned off (`idlePaneText`).
- While the list is open, `Ctrl+,` opens Settings.

### Accepting a suggestion
- `Enter` or `Tab` accepts the highlighted item. Each can be turned off on its own.
- Typing `:` after a prefix-matched YAML key commits the key and inserts the colon in one step.
- Accept mode decides what gets replaced:
  - Replace word tail (default): replaces the word up to its end.
  - Insert at cursor: inserts only at the caret.
- After you accept a block key such as `data:` or `target:`, Nostrodomus can re-open so you can keep filling the block (chained completion).

### Reading the suggestion list
- Each row shows the suggestion and its kind (Entity, Service, Key, Snippet, and so on). The header shows the language the list was built for and the gear that opens Settings.
- An optional details pane (off by default) shows the highlighted suggestion with its source and, where there is one, its description. The Context tab of the settings panel always shows the selected suggestion and its source.
- The size buttons under Ctrl+Space popup in the Style tab (Compact, Comfort, Large) control density. Suggestion count is the separate Maximum suggestions setting.

### Icons
- `icon:` values and keys that end in `_icon` complete with 39 common Material Design icons and the icons of every icon set installed in Home Assistant that lists its icons for Home Assistant's icon picker, such as Material Symbols (`m3o:`, `m3of:`, `m3r:`, `m3rf:`, `m3s:`, `m3sf:`). A set installed while the page is open is read the next time icons are suggested.
- The typed text matches the whole name (`m3o:li`) or the part after the prefix (`light`). Names that start with it come first, then names with a word that starts with it (`add-home` for `home`). Among equal matches the common Material Design icons come first.
- Each row shows the icon, drawn by Home Assistant's own icon element.
- A value can be bare, in single quotes or in double quotes. After an opening quote the list stays open, and the accepted icon goes inside the quotes. An existing value is replaced up to its closing quote.
- In a template, a string that starts with `mdi:` or with the prefix of an installed icon set gets the icon list, for example `{{ 'm3o:light' if is_state('light.desk', 'on') else 'm3o:light-off' }}`.
- In a snippet, pressing Tab to reach a placeholder that holds an icon (`icon: ${2:mdi:home}`) opens the icon list.
- The Diagnostics tab shows the number of icon sets and their icons.

## Keyboard shortcuts

### Suggestion list

| Key | When | Action |
|---|---|---|
| `Ctrl+Space` | list closed | Open suggestions (manual trigger) |
| `Ctrl+Space` | list open | Close it, or toggle the details pane if it is enabled and there are items |
| `Down` / `Up` | list open | Move selection down or up (wraps around) |
| `Page Down` / `Page Up` | list open | Jump 5 items down or up |
| `Home` / `End` | list open | Jump to first or last item |
| `Enter` | list open | Accept highlighted item (if Enter accepts suggestion is on) |
| `Tab` | list open (no snippet session) | Accept highlighted item (if Tab accepts suggestion is on) |
| `:` | list open, YAML key context, highlighted key starts with the typed text | Commit the key and type the colon |
| `Esc` | list open | Close the list (and suppress re-open until a word boundary) |
| `Ctrl+,` | list open | Open Settings |

Keys pressed together with `Ctrl`, `Shift`, `Alt` or `Meta` (other than the shortcuts above) go to the editor. Keys pressed while an input method is composing text are left to the input method.

### Snippet placeholders (during a snippet session)

| Key | Action |
|---|---|
| `Tab` | Move to the next placeholder (repeated `${1}` mirrors are filled first) |
| `Shift+Tab` | Move to the previous placeholder (stops at the first, will not exit) |
| `Tab` (past the last) | Exit: caret lands at the explicit final stop `$0`, or just after the last placeholder |
| `Esc` | Abandon the snippet session (caret stays put) and close the list if it is open |
| type / `Enter` | For choice placeholders `${1|a,b,c|}`, a small chooser appears. Enter or Tab accepts |

### Settings panel (keyboard-operable)

| Key | Action |
|---|---|
| `Ctrl+,` (suggestion list open) | Open the settings panel |
| `Enter` or `Space` on the gear in the list header | Open the settings panel |
| `Esc` | Close the settings panel (focus returns to where it was) |
| Focus a tab, then `Left` / `Right` / `Home` / `End` | Move along the tab row. `Enter` or `Space` selects the focused tab |
| Focus the header, then arrow keys | Move the panel (10 px per step, 32 px with Shift) |
| Focus the resize handle, then arrow keys | Resize the panel (10 px per step, 32 px with Shift) |

The suggestion list keeps DOM focus in the editor and announces the active option to screen readers through a polite live region, for example "light.turn_on, service, 2 of 20", wiring the ARIA combobox pattern onto the editor. `Ctrl+,` opens Settings only while the suggestion list is open, so from a closed list press `Ctrl+Space` first.

## Providers and the context engine

Nostrodomus asks each provider that can handle the cursor position for candidates, in the order of the table, and then ranks the combined list. Each provider has an Enabled toggle in Settings, General, Providers, including the HACS card catalog. A disabled provider is skipped.

| Provider (name in Settings) | Supplies | Source |
|---|---|---|
| Static library (Static YAML/library keys) | Built-in Lovelace card keys, YAML, CSS, Jinja, JavaScript, HTML and Python vocabulary, value hints | Bundled catalog |
| Snippets (Context snippets) | Multi-line building blocks with tab-through placeholders | Bundled and validated |
| Lovelace context (Lovelace context rows) | Focused rows for the active YAML path, for example action, trigger, condition or card child keys that belong where your cursor is | The document you are editing |
| HACS catalog (HACS catalog provider) | Common community `custom:` card types and their usual keys | Bundled catalog |
| Home Assistant runtime (Home Assistant runtime values) | Entity ids, services, service-field schemas, themes, icons (common Material Design icons and the icons of installed icon sets such as Material Symbols), your installed custom cards. Area, device, floor and label ids with the experimental option for them | Live from your running `hass`. The common icons are bundled, and icon-set names come from the icon sets installed in Home Assistant |
| Document words (Word fallback) | Words already present in the current buffer (a fallback when other providers are thin) | The document you are editing |

Providers added through `window.__nostrodomus.registerProvider()` are asked after the built-in ones and get their own toggle.

What the context engine recognizes includes: card `type:`, dashboard and card keys, action, `service:`, `perform_action:`, and modern `action:` steps, service `data:` fields, `target:` and `entity_id:`, `card_mod` CSS selectors, properties, and values, Jinja `{{ }}` and `{% %}` templates, trigger and condition shapes, and value kinds (entity, service, trigger type, boolean, number, and so on). You can watch it live in the Context Inspector (Context tab).

Live versus bundled: entities, services, service-field schemas, themes, installed custom cards and the icons of installed icon sets are live from your instance. Common community cards, snippets and language vocabulary are bundled static catalogs. Nostrodomus makes no network requests of its own.

## Language support

Completion can be turned off per language in Settings, General, Language packs:

YAML, CSS, Jinja, JSON, HTML, JavaScript, Python.

The language at the cursor is detected from context. A `card_mod:` `style: |` block switches to CSS, `{{ }}` and `{% %}` switch to Jinja, and a `[[[ ]]]` button-card block switches to JavaScript. Syntax coloring covers YAML, Jinja, and CSS inside `card_mod` in the same document.

## Snippets

Snippets are multi-line templates with tab-through placeholders. Placeholder syntax:

- `${1:default}`: a numbered stop with default text (typing overwrites it).
- `$1`: a bare numbered stop.
- `${1|a,b,c|}`: a choice stop (a small chooser appears, pick with Enter or Tab).
- `$0` or `${0}`: the explicit final cursor position.
- Repeated indexes (for example two `${1}`) are mirrors: text you type in one fills all of them.

Navigate with `Tab` and `Shift+Tab`, and press `Esc` to leave the session. When `Tab` reaches a stop that holds an icon (`icon: ${2:mdi:home}`), the icon list opens; accepting an icon replaces the text of the stop and keeps it selected. Categories cover dashboard cards, tap and hold actions, triggers, conditions, action sequences, targets, and `card_mod` styling. Completion mode (General tab) decides how snippets are mixed in: Both (the default) lists keys and snippets, Snippets lists only snippets, and Keys leaves out the snippet rows of the static library while the context snippets stay in the list.

## Settings reference

Open the panel from the gear in the header of the suggestion list, with `Ctrl+,` while the list is open, or with `window.__nostrodomus.settings()` in the browser console. There are five tabs. Ordinary changes apply in place, and the panel keeps its tab, scroll, and position.

### General tab
- Keep Nostrodomus armed (`keepOpen`, default off): the list opens as you type, by the rules of Trigger behavior, and stays closed in spots where suggestions do not apply. With it off the list opens on `Ctrl+Space`.
- Arm when editor is focused (`autoOpenOnFocus`, default off): the list opens when you click into the editor, if there are suggestions at the cursor.
- Show "No suggestions" for explicit Ctrl+Space (`idlePaneText`, default on).
- Trigger behavior (`triggerMode`, default Smart): Smart, Manual only, Aggressive. It applies when one of the two arming options above is on. With both off the list opens only on `Ctrl+Space`.
- Minimum typed characters (`minChars`, default 1): 0 to 4.
- Completion mode (`mode`, default Both): Keys, Snippets, Both. See [Snippets](#snippets).
- Maximum suggestions (`maxItems`, default 12): 6, 8, 12, 16, 20, 32, 40.
- Enter accepts suggestion (`enterCompletes`, default on).
- Tab accepts suggestion (`tabCompletes`, default on).
- Fuzzy / alias matching (`fuzzy`, default on).
- Search all enabled language packs (`globalSearch`, default off).
- Replace Home Assistant native autocomplete (`replaceNativeAutocomplete`, default on): turns off Home Assistant's own entity and icon suggestions in the code editor, so only one suggestion list responds to Enter and Tab. Turning the setting off brings them back.
- Enable suggestions inside comments (`suggestInComments`, default off).
- Language packs (`enabledLangs`, all on): YAML, CSS, JavaScript, Jinja, HTML, JSON, Python.
- Providers: an Enabled toggle for each registered provider, with its status. See [Providers and the context engine](#providers-and-the-context-engine).
- Smart completion (experimental): nine options, all off by default, stored under `completions.*`:
  - Smart completion engine (`engineV2`): surface awareness across Developer Tools, automations, scripts and dashboards. The next four options need it.
  - Live entities inside templates (`jinjaLane`): entity ids inside `states('...')` and `is_state(...)` in a template.
  - Pick from a field's allowed values (`schemaValues`): the allowed options of a service field at its value.
  - Scope suggestions to the editor you're in (`surfaceScope`): no dashboard suggestions in automations and the other way round.
  - Complete area, device & floor IDs (`registryLane`): area, device, floor and label ids at keys such as `area_id:`.
  - Smarter match ranking (`dpRanking`).
  - Remember your favorites (`frecency`): the suggestions you accept most often move up, and the history is kept across reloads.
  - Detailed docs on the highlighted item (`lazyResolve`).
  - Service argument hints (`signatureHelp`).

### Context tab
Live inspection, no settings:
- Context Inspector: YAML path, role and key, focus and value kind, provider route, detected language lane and confidence, suggestion gate, comment context, prefix length, cursor position, suggestion count, provider order, and selected suggestion source. Auto-refreshes. There is a Copy inspector button (redacted, local-only).
- Suggestion Quality Dashboard: visible suggestion count versus max, top and selected suggestion, provider mix, disabled providers, context route, and, if empty, why. There is a Copy quality report button.

### Diagnostics tab
Local-only, redacted by default, never sent anywhere. Seven cards: System Status (versions, channel beta, editor detection, storage status, companion layer state), Performance Stats (local budget, timings, cache hit and miss, client CPU, RAM, GPU, browser), Runtime (health, enabled, popup state, last error), Editor, ContextSnapshot, Current Context, and Providers plus Runtime (per-provider calls, candidates, and ms, live HA entity and service counts, cache and index counts). Buttons: Refresh, Copy full report, Copy context, Log health, plus a Debug console messages toggle.

### Style tab
Local visual controls for the codebox, the card editor dialog and the suggestion list. The scrollbar, border and glow, surface, and syntax theme each have their own on/off switch, opacity, and saturation. See [Styling and themes](#styling-and-themes).
- Codebox text size: Compact (12.5 px), Normal (13.5 px), Large (15 px), XL (16.5 px).
- Codebox scrollbar: enable, color, opacity (default 0.78), saturation.
- Codebox border + glow: enable, border color, opacity, and saturation, glow color, opacity, and saturation, and glow size (-100 fully inside to +100 fully outside, 0 is off, default -100).
- Codebox surface: enable, color, opacity (default 0.35), saturation. The surface takes the brightness the text needs: dark under the light-text themes, light under Parchment and Mist. Where that is the opposite of the Home Assistant theme (a light Home Assistant theme with a light-text syntax theme, or a dark one with Parchment or Mist) it is drawn at 0.92 opacity or more, so the page behind it does not wash the text out. In those two cases the surface is drawn even when it is switched off, because the text could not be read without it.
- Glass editor dialog (`style.glassDialog`, default on). The card editor dialog is translucent and blurs the dashboard behind it, and the card preview has no background of its own, so the dashboard shows through, softened. A Home Assistant theme that sets its own dialog surface or dialog blur keeps it. The blur costs graphics work while the dialog is open; turn the setting off on slow computers. A change applies at once.
- Syntax theme: enable, theme dropdown (37 themes), opacity, saturation.
- Hide editor warnings (`style.hideEditorWarnings`, default off). In the card-edit dialog an editor warning from Home Assistant (for example "Visual editor is not supported") is drawn as a small badge that shows the message on hover. With this setting on, those warnings are hidden. A note that a card shows in its own visual editor, and any message a card shows in the preview, is not an editor warning: it stays as the card draws it, with the setting on or off.
- Hide active line highlight (`style.hideActiveLineHighlight`, default on).
- Ctrl+Space popup: the size of the suggestion list (Compact, Comfort, Large), Show details pane in suggestion popup (default off), Commit prefix-matched YAML keys when typing `:` (default on), Offer buffer words when real providers have few matches (default on), and Completion accept mode (Replace word tail, Insert at cursor).

### Help tab
Four console commands that are copied when you click them (open settings, health check, redacted diagnostics export, active editor readout), and a Reset to default button that restores every setting, the provider toggles and the panel size and position after a confirmation.

### Full settings key table
Stored under the browser local-storage key `nostrodomus.settings`.

| Key | Default | Values or range |
|---|---|---|
| `keepOpen` | `false` | boolean |
| `autoOpenOnFocus` | `false` | boolean |
| `triggerMode` | `"smart"` | `smart`, `manual`, `aggressive` |
| `minChars` | `1` | 0 to 4 |
| `mode` | `"both"` | `keys`, `snippets`, `both` |
| `maxItems` | `12` | 6, 8, 12, 16, 20, 32, 40 |
| `enterCompletes` | `true` | boolean |
| `tabCompletes` | `true` | boolean |
| `fuzzy` | `true` | boolean |
| `globalSearch` | `false` | boolean |
| `idlePaneText` | `true` | boolean |
| `popupSize` | `"compact"` | `compact`, `comfortable`, `large` |
| `showDetailsPane` | `false` | boolean |
| `acceptMode` | `"replace"` | `replace`, `insert` |
| `commitCharacters` | `true` | boolean |
| `wordFallback` | `true` | boolean |
| `replaceNativeAutocomplete` | `true` | boolean |
| `suggestInComments` | `false` | boolean |
| `debugMode` | `false` | boolean (Debug console messages, Diagnostics tab) |
| `settingsPos`, `settingsSize` | `null` | position and size of the settings panel, set by moving and resizing it |
| `enabledLangs` | all on | yaml, css, jinja, json, html, js, python |
| `providers` | all on | per-provider `{ enabled }` |
| `completions.*` | all `false` | `engineV2`, `lazyResolve`, `jinjaLane`, `registryLane`, `schemaValues`, `surfaceScope`, `dpRanking`, `frecency`, `signatureHelp` |
| `style.*` | | see [Styling and themes](#styling-and-themes) |

Stored `minChars` and `maxItems` values outside their range are brought into range when the settings are loaded. A stored value of the wrong type is ignored and the default is used.

Two keys have no control in the panel: `style.universalCodebox` (default `true`) styles the editors outside the card dialog, and `style.universalAutocomplete` (default `true`) enables completion in them. Three more keys, `style.syntaxTintHue`, `style.syntaxTintSaturation` and `style.syntaxTintOpacity`, are stored with the settings but have no control in the panel either; the syntax colors come from the selected theme.

## Styling and themes

All styling is scoped to the active editor, the containers around it that would clip its frame, and, in the card editor, its dialog. Nostrodomus sets internal data attributes on the editor nodes and their host, and never edits your Home Assistant theme or leaks to the wider dashboard. In Developer Tools, the Result pane next to the template editor also gets the editor's frame.

### Codebox frame model
One integrated frame. It does not stack a second glow.

| Control | Setting | Default | Range |
|---|---|---|---|
| Text size | `style.codeTextSize` | `normal` (13.5 px) | compact, normal, large, xlarge |
| Scrollbar enable | `style.scrollbarStyleEnabled` | on | |
| Scrollbar color | `style.scrollbarHue` | 195 | 0 to 360 |
| Scrollbar opacity | `style.scrollbarOpacity` | 0.78 | 0 to 1 |
| Scrollbar saturation | `style.scrollbarSaturation` | 1.05 | 0 to 2.5 |
| Border enable | `style.codeboxFrameEnabled` | on | |
| Border color | `style.codeboxBorderHue` | 198 | 0 to 360 |
| Border opacity | `style.codeboxBorderOpacity` | 0.42 | 0 to 1 |
| Border saturation | `style.codeboxBorderSaturation` | 0.92 | 0 to 2.5 |
| Glow color | `style.codeboxGlowHue` | 198 | 0 to 360 |
| Glow opacity | `style.codeboxGlowOpacity` | 0.18 | 0 to 0.65 |
| Glow size | `style.codeboxGlowSize` | -100 | -100 (inside) to +100 (outside), 0 is off |
| Glow saturation | `style.codeboxGlowSaturation` | 1.15 | 0 to 2.5 |
| Surface enable | `style.codeboxSurfaceEnabled` | on | |
| Surface color | `style.codeboxSurfaceHue` | 210 | 0 to 360 |
| Surface opacity | `style.codeboxSurfaceOpacity` | 0.35 | 0 to 0.85 |
| Surface saturation | `style.codeboxSurfaceSaturation` | 0.72 | 0 to 2.5 |
| Glass editor dialog | `style.glassDialog` | on | boolean |
| Syntax coloring enable | `style.syntaxTintEnabled` | on | |
| Syntax theme | `style.syntaxTintPreset` | `vscodeDarkPlus` (Classic) | one of 37 (below) |
| Syntax theme opacity | `style.syntaxThemeOpacity` | 1 | 0.35 to 1 |
| Syntax theme saturation | `style.syntaxThemeSaturation` | 1 | 0.35 to 1.85 |
| Hide editor warnings | `style.hideEditorWarnings` | off | boolean |
| Hide active line highlight | `style.hideActiveLineHighlight` | on | boolean |

### The 37 syntax themes
Classic (`vscodeDarkPlus`) is the default, a hand-tuned VS Code Dark+ palette. Every other theme is a single hue family. Two are light themes: Parchment and Mist. They paint dark text, so the codebox surface is drawn light for them.

Classic, Crimson, Scarlet, Salmon, Coral, Mocha, Amber, Bronze, Goldenrod, Olive, Lime, Fern, Green, Forest, Emerald, Mint, Jade, Teal, Cyan, Sky, Azure, Cobalt, Navy, Indigo, Periwinkle, Amethyst, Violet, Plum, Magenta, Mauve, Orchid, Rose, Pink, Ruby, Maroon, Parchment (light), Mist (light).

Each theme gives a distinct color to 18 token kinds: foreground, dim, comments, YAML keys, YAML list markers, strings, numbers, booleans, keywords, filters and providers, Jinja templates, CSS selectors, CSS properties, CSS values, CSS accent and glow, CSS dim, punctuation, and operators.

## Examples

### 1. Card type completion
```yaml
type: cus          # suggests custom:mushroom-template-card, custom:button-card, custom:mini-graph-card, ...
```
Your installed custom cards (from the live registry) appear next to common community cards from the bundled catalog.

### 2. Service and service-field completion
```yaml
action: light.turn_on
data:
                   # suggests the fields of light.turn_on's real schema: brightness_pct, rgb_color, transition, color_name, flash, ...
```
Fields come straight from your instance's service schema. Required fields are listed before optional ones that match equally well. With Show details pane in suggestion popup turned on in the Style tab, the details pane under the list shows the description Home Assistant gives the highlighted field. Press `Enter` after `data:` and Nostrodomus re-opens so you can keep filling the block.

### 3. Target entities
```yaml
action: light.turn_on
target:
  entity_id: li    # suggests your entities that match, such as light.kitchen and light.living_room
```

### 4. card_mod CSS
```yaml
card_mod:
  style: |
    ha-card {
      border-rad   # CSS: border-radius, and card_mod value hints
    }
```
Inside the `style: |` block the suggestions switch to CSS. Outside it, you are back to YAML. Completion follows the block boundary.

### 5. A snippet with tab-through placeholders
```yaml
tap_action:
  action: ${1|toggle,more-info,perform-action,navigate|} # choose
  entity: ${2:light.example}                             # Tab, then type to overwrite
$0                                                       # final caret
```

### 6. Jinja template
```jinja
{{ states('sensor.') }}   # Jinja: template functions and filters
```
Inside `{{ }}` and `{% %}` the list offers Jinja functions, filters and keywords. Entity ids inside a call such as `states('...')` are offered when the experimental options Smart completion engine and Live entities inside templates are on (General tab).

## Diagnostics and the API

Everything below is local-only and reads live state in your browser. The stable namespace is `window.__nostrodomus`.

### Common console commands

```js
window.__nostrodomus.version                 // for example "nostrodomus-v0.1.283-preview-alerts"
window.__nostrodomus.health()                // { ok, status, warningCount, checks[], ... }
window.__nostrodomus.runtimeErrors()         // { ok:true, localOnly:true, stats, items[] }  (last 40)
window.__nostrodomus.exportDiagnostics()     // full, redacted diagnostics object (redact:true by default)
window.__nostrodomus.open() / .close() / .toggle() / .refresh()
window.__nostrodomus.settings()              // open the settings panel
window.__nostrodomus.resetSettings()         // restore defaults and remove the stored settings
window.__nostrodomus.uninstall()             // full teardown (alias: .disable())
```

### API surface (selected)

| Member | Returns or does |
|---|---|
| `installed` | `true` when the runtime is registered |
| `version` | the running runtime version string |
| `health()` | self-check `{ ok, status, requiredOk, warningCount, checks[], ... }` (checks include `api-installed`, `editor-detected`, `providers-ready`, `runtime-hass`, `cache-bounded`, and more) |
| `runtimeErrors(debug?)` | local-only recorded errors `{ ok, localOnly:true, stats, items }` (FIFO-capped at 40) |
| `clearRuntimeErrors()` | clears the error buffer |
| `exportDiagnostics({ redact = true })` | full diagnostics snapshot (redacted by default, `redact:false` adds raw context for local debugging only) |
| `debug()` / `debugSnapshot()` | large or compact point-in-time diagnostics payloads |
| `performanceTelemetry()` / `performanceStats()` | local performance telemetry and budget (`localOnly:true, networkReporting:false`) |
| `clientCapabilities()` | coarse, local-only browser, CPU, RAM, and GPU snapshot |
| `copyDiagnosticsToClipboard()` | the Copy full report flow (redacted), returns `Promise<boolean>` |
| `open` / `close` / `toggle` / `refresh` | control the suggestion list |
| `settings()` / `resetSettings()` | open settings, reset to defaults (removes `nostrodomus.settings` from local storage and restyles the editor) |
| `registerProvider(provider)` / `rebuildIndex()` | register a provider (an object with an `id` and a `provide(ctx)` function, see [docs/PROVIDER_CONTRACT.md](docs/PROVIDER_CONTRACT.md)), rebuild the completion index |
| `contextDiagnostics.readActiveEditor()` | read-only snapshot of the active editor context |
| `uninstall()` / `disable()` | full teardown: removes listeners, observers, overlay, and styles, and deletes `window.__nostrodomus` |

The namespace also exposes lower-level diagnostic members (`embeddedLanguageDiagnostics`, `runtimeCoordinator`, `observerLifecycle*`, `recordRuntimeError`, `resetPerformanceTelemetry`, `state`, and more) meant for debugging rather than everyday use.

The completion library is loaded when the first editor is used. On a page where no editor was opened yet, `open()` loads it.

### Enabling debug console output
Debug logging is off by default. Only a one-line ready or degraded banner prints. To turn on verbose output:
```js
localStorage.setItem("nostrodomusDebug", "1"); location.reload();
```
Or toggle Debug console messages in the Diagnostics tab.

### Filing a bug report
Use Diagnostics, Copy full report (or `exportDiagnostics()`), which produces a redacted, local-only JSON report: versions, health, provider stats, performance, capability snapshot, and a redacted context summary. The redacted report keeps structure and lengths, not your text: it leaves out the raw context, the line under the cursor, the typed prefix and the selected item. Do not paste secrets, tokens, full Home Assistant YAML, or private URLs.

## Privacy, security, and storage

- Local-only, no network requests of its own. The shipped bundle contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon` call, no telemetry upload, and no way to load or run remote code. The release verification (`tools/verify.py --release`, run by CI on every push and pull request) fails if the built bundle contains the text `fetch(`, `XMLHttpRequest`, `WebSocket(`, `EventSource(`, `sendBeacon`, `eval(`, `new Function`, `import(`, `document.write`, `srcdoc` or `javascript:`, or any `innerHTML`. The performance counters in Diagnostics stay in the browser.
- Icon previews in the suggestion list are drawn by Home Assistant's `ha-icon` element, which gets each icon the same way Home Assistant's icon picker does: Material Design Icons from Home Assistant, and the icons of an installed icon set from that icon set. The names of the common Material Design icons are bundled with the plugin, and the other icon names come from the icon sets installed in Home Assistant, read in the browser.
- Safe rendering. No `innerHTML`, no `eval` or `new Function`. DOM is built with `textContent` and `createElement`.
- No arbitrary user CSS injection. Styling is scoped to the active editor, the containers around it that would clip its frame, its dialog in the card editor, and the Result pane next to the template editor of Developer Tools.
- Diagnostics are redacted by default and never leave your browser. Capability snapshots are coarse (`privacyLevel: "coarse-browser-capability-snapshot"`).
- Storage keys (browser local storage). Nostrodomus writes three:
  - `nostrodomus.settings`: your settings, including the position and size of the settings panel. Settings saved in one browser tab reach the other open tabs.
  - `nostrodomus.settings.activeCategory`: the settings tab that was open last.
  - `nostrodomus.frecency`: a small history of the suggestions you accepted most, used to rank suggestions. It is written only while Remember your favorites (General tab, experimental, off by default) is on.

  Nostrodomus also reads keys that exist only if you set them yourself in the browser console, for debugging: `nostrodomusDebug` (`"1"` turns on verbose logging), `nostrodomusPerf` (`"legacy"` records performance telemetry all the time instead of only while it is shown, and makes the page scans walk every element instead of only the Home Assistant elements they look for, which is slower), `nostrodomusProviderTimeoutMs` (the default time budget of a provider in milliseconds, see [docs/PROVIDER_CONTRACT.md](docs/PROVIDER_CONTRACT.md)), and `nostrodomusCompanion` (`"dormant"` switches off the dialog sizing, glass editor dialog, scrollbar styling and warning badge layer; a change made in the same tab takes up to a second to apply). None of these hold personal data.

  If the browser blocks site data, Nostrodomus still starts and runs with the default settings. Changes cannot be saved then, and the header of the settings panel says so.

Security policy and reporting: [SECURITY.md](SECURITY.md).

## Compatibility and versioning

- Minimum Home Assistant version: 2026.6.0 (per `hacs.json`).
- Tested Home Assistant versions (automated browser tests, Chromium):
  - 2026.11.1 with Nostrodomus 0.1.283.
  - 2026.6.4 with Nostrodomus 0.1.283.
- Browsers: Chromium-based browsers are supported. Firefox is not supported yet (see [Known issues](docs/KNOWN_ISSUES.md)).
- Installers: the Marketplace built into Home Assistant 2026.11 and later, or HACS 2.0.0+ on earlier versions. Both download the file `nostrodomus.js` attached to the GitHub release (see [docs/HACS_INSTALL.md](docs/HACS_INSTALL.md)).
- Details and the Home Assistant behaviors to know are in [docs/COMPAT.md](docs/COMPAT.md).
- Versioning: SemVer `0.1.x`, currently beta. There is no `version` field in `hacs.json`. The version that the Marketplace and HACS offer is the tag of the latest GitHub release.
- Changelog: [CHANGELOG.md](CHANGELOG.md). The running version is always visible in the Diagnostics tab and through `window.__nostrodomus.version`.
- Updates: hard-reload the browser (or bump the resource cache string). No Home Assistant restart is needed.

## Known issues

A short list. The full list is in [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md). None of these affects your Home Assistant data.

- Language: the interface, labels, and docs are English only. There is no translation layer. Everything works on a non-English instance. The text Nostrodomus adds stays English.
- Keyboard: `Ctrl+,` opens Settings only while the suggestion list is open. Screen reader behavior is not covered by the automated tests.
- Browsers: only Chromium-based browsers are covered by the automated browser tests.
- Syntax coloring: comments are not italic, because colors are applied through highlight ranges, which cannot set a font style. Lines that come into view during fast scrolling can show Home Assistant's colors for a few frames.
- Composite card editors: the main dialog editor is sized. An embedded secondary editor is left at native size.
- Custom card visual editors: Nostrodomus does not complete, color or style a codebox inside a custom card's own visual editor; that codebox works the way the card set it up. Switch to the dialog's code editor for Nostrodomus. The rule goes by position (anything inside the editor element a custom card supplies), so it needs no list of cards. The browser tests check it with two test editors built from Home Assistant's own elements (a note, fields, a button, an expandable section and an embedded codebox with entity and icon suggestions); third-party cards are not downloaded for the tests.
- Editor warnings: the warning badge and the Hide editor warnings setting work in the card-edit dialog. In the automation, script, and Developer Tools editors the warnings stay as Home Assistant draws them.
- Scrollbar: current Chromium-based browsers show their standard thin scrollbar in the color you set, not the custom thumb shape.
- Settings are per browser. There is no sync between browsers or devices.

## Troubleshooting

| Symptom | Try this |
|---|---|
| No suggestions | Make sure the editor has focus and press `Ctrl+Space`. Check Diagnostics, Providers and the Context tab. |
| Plugin does not seem loaded | You may be on a built-in dashboard such as Overview, which does not load custom resources. Open an editor on a dashboard you created. In an automation, script or Developer Tools editor after a page reload, open a dashboard you created once and go back. Confirm the resource is registered under Settings, Dashboards, Resources. |
| Health check | `window.__nostrodomus.health()` returns `ok: true`. `window.__nostrodomus.runtimeErrors()` lists recorded errors. |
| Stale version after update | Hard-reload (clear cache) or bump the resource URL `?v=` query string. Running version is in Diagnostics, System Status. |
| Native HA dropdowns disappeared | That is Replace Home Assistant native autocomplete, on by default. Turn it off in General to restore them. |
| Styling wrong with a custom theme | Adjust the frame controls in Style, or use Reset to default in Help. Nothing on the dashboard itself is styled. |
| Settings are not kept | The header of the settings panel shows when a save failed. Check that the browser allows site data for your Home Assistant address. |
| Want verbose logs | `localStorage.setItem("nostrodomusDebug","1"); location.reload();` or the Debug toggle in Diagnostics. |

## Uninstalling

- Turn it off until the next page load: `window.__nostrodomus.disable()` in the browser console removes the listeners, observers, the suggestion list, the settings panel and the styles, restores the editor and dialog sizing, and deletes `window.__nostrodomus`. Reloading the page loads the plugin again.
- Remove it: uninstall through the Marketplace or HACS, or delete the resource under Settings, Dashboards, Resources and remove the `nostrodomus.js` file you copied into `www`. If your resources are defined in YAML, also delete the Nostrodomus entry there. Then hard-reload.
- Stored data: removing the plugin does not clear the browser's local storage. The keys `nostrodomus.settings`, `nostrodomus.settings.activeCategory` and, if you used Remember your favorites, `nostrodomus.frecency` stay until you clear them. To remove them, run this in the browser console on your Home Assistant address, in each browser you used:

```js
["nostrodomus.settings", "nostrodomus.settings.activeCategory", "nostrodomus.frecency"].forEach((key) => localStorage.removeItem(key));
```

## Building from source

Node 22 or newer is required for building and verifying. The plugin itself is a browser resource.

```bash
npm ci
python3 tools/build.py              # bundle src into dist/nostrodomus.js
python3 tools/verify.py             # verify the build
python3 tools/verify.py --release   # release-grade verification
```

The build and verify tooling never writes to `/config/www`, `/config/custom_components`, or `/config/.storage/lovelace_resources`. See [CONTRIBUTING.md](CONTRIBUTING.md) and `docs/` for the full gate, architecture notes, and contracts.
