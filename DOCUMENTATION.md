# Nostrodomus Documentation

Reference for Nostrodomus, a local-only autocomplete, snippets, and syntax-styling plugin for Home Assistant's code editors. Applies to v0.1.265 (beta).

- Product: Nostrodomus. Version: 0.1.265. Channel: beta. License: MIT.
- Requires: Home Assistant 2026.6.0+, HACS 2.0.0+ (or manual install).
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

Nostrodomus attaches to Home Assistant's built-in CodeMirror editors. As you type or move the cursor, a context engine reads the surrounding YAML to work out where you are: a card `type:`, an `action:` or `service:`, a service `data:` field, an `entity_id:`, a `card_mod` CSS block, a Jinja template, a trigger or condition, and so on. It then asks a set of providers for completions that fit that spot, ranks them, and shows them in a popup.

Two rules shape everything:

- Live from your instance, or bundled, never the network. Entities, services, service-field schemas, areas, devices, floors, labels, and your installed custom cards are read from the running `hass` object in your browser. Common community cards and Jinja and YAML vocabulary come from a catalog bundled inside the plugin. There are no network calls.
- Scoped to the active editor. All styling applies only to the editor you are working in, marked with internal data attributes. It never touches the rest of your dashboard or your Home Assistant theme.

## Supported editors and surfaces

| Surface | Status |
|---|---|
| Dashboard card-edit dialog (the visual editor's YAML) | Full: completion, snippets, styling, warning badge |
| `card_mod` style blocks (CSS in YAML) | Full: context-aware completion plus CSS styling |
| YAML configuration editors | Full completion |
| Automation and Script YAML | Completion, including modern `action:` steps. Warning-badge coverage is a follow-up |
| Developer Tools, Template and YAML | Completion. Warning-badge coverage is a follow-up |
| Composite cards with an embedded secondary editor | The main editor is sized. The embedded editor is left at native size |

Home Assistant's built-in dashboards (Overview at `/home`, Lights, Security, Climate, Energy, Maintenance) do not load custom Lovelace resources. Nostrodomus activates when you open an editor on a custom dashboard or a YAML or Developer Tools panel.

## The completion experience

### Triggering suggestions
- Press `Ctrl+Space` to open or close the list at the cursor. With the default settings this is how the list opens.
- With Keep Nostrodomus armed (`keepOpen`, Settings, General, off by default) the list also opens as you type, controlled by Trigger mode:
  - Smart (default): appears on a prefix plus meaningful trigger characters.
  - Manual only: nothing appears until you press `Ctrl+Space`.
  - Aggressive: shows sooner.
- Minimum typed characters before automatic suggestions: 0, 1 (default), 2, 3, or 4.
- Arm on focus (`autoOpenOnFocus`) arms the engine when an editor gets focus, without a visible popup in spots where it does not apply.
- While the list is open, `Ctrl+,` opens Settings.

### Accepting a suggestion
- `Enter` or `Tab` accepts the highlighted item. Each can be turned off on its own.
- Typing `:` after a prefix-matched YAML key commits the key and inserts the colon in one step.
- Accept mode decides what gets replaced:
  - Replace word tail (default): replaces the word up to its end.
  - Insert at cursor: inserts only at the caret.
- After you accept a block key such as `data:` or `target:`, Nostrodomus can re-open so you can keep filling the block (chained completion).

### Reading the popup
- Each row shows the suggestion, its kind (Entity, Service, Key, Snippet, and so on), and its source provider.
- An optional details pane (off by default) shows type and description inline. The same detail is always in the Diagnostics tab.
- Popup size (Compact, Comfort, Large) controls density. Suggestion count is the separate Max suggestions setting.

## Keyboard shortcuts

### Completion popup

| Key | When | Action |
|---|---|---|
| `Ctrl+Space` | popup closed | Open suggestions (manual trigger) |
| `Ctrl+Space` | popup open | Close it, or toggle the details pane if it is enabled and there are items |
| `Down` / `Up` | popup open | Move selection down or up (wraps around) |
| `Page Down` / `Page Up` | popup open | Jump 5 items down or up |
| `Home` / `End` | popup open | Jump to first or last item |
| `Enter` | popup open | Accept highlighted item (if Enter accepts is on) |
| `Tab` | popup open (no snippet session) | Accept highlighted item (if Tab accepts is on) |
| `:` | popup open, YAML key context, top match | Commit the key and type the colon |
| `Esc` | popup open | Close the popup (and suppress re-open until a word boundary) |

### Snippet placeholders (during a snippet session)

| Key | Action |
|---|---|
| `Tab` | Move to the next placeholder (repeated `${1}` mirrors are filled first) |
| `Shift+Tab` | Move to the previous placeholder (stops at the first, will not exit) |
| `Tab` (past the last) | Exit: caret lands at the explicit final stop `$0`, or just after the last placeholder |
| `Esc` | Abandon the snippet session (caret stays put) |
| type / `Enter` | For choice placeholders `${1|a,b,c|}`, a small chooser appears. Enter or Tab accepts |

### Settings panel (keyboard-operable)

| Key | Action |
|---|---|
| `Esc` | Close the settings panel (focus returns to where it was) |
| Focus the header, then arrow keys | Move the panel (10 px per step, 32 px with Shift) |
| Focus the resize handle, then arrow keys | Resize the panel (10 px per step, 32 px with Shift) |

The completion popup keeps DOM focus in the editor and announces the active option to screen readers through a polite live region, for example "light.turn_on, service, 2 of 20", wiring the ARIA combobox pattern onto the editor. Opening the settings panel currently uses the gear button. A keyboard shortcut to open it is a follow-up.

## Providers and the context engine

Nostrodomus routes each cursor position to the providers that make sense there, in priority order. Toggle providers on and off in Settings, General, Providers. The HACS card catalog is always available and has no separate toggle.

| Provider | Supplies | Source |
|---|---|---|
| Home Assistant runtime | Entity ids, services, service-field schemas, areas, devices, floors, labels, your installed custom cards | Live from your running `hass` |
| Static library | Built-in Lovelace card keys, YAML and Jinja vocabulary, action, trigger, and condition shapes, value hints | Bundled catalog |
| Lovelace context | Focused dashboard rows for the active YAML path, for example action or card child keys that belong where your cursor is | The card document you are editing |
| HACS catalog | Common community `custom:` card types and their usual keys | Bundled catalog |
| Snippets | Multi-line building blocks with tab-through placeholders | Bundled and validated |
| Document words | Words already present in the current buffer (a fallback when other providers are thin) | The document you are editing |

What the context engine recognizes includes: card `type:`, dashboard and card keys, action, `service:`, `perform_action:`, and modern `action:` steps, service `data:` fields, `target:` and `entity_id:` (matching-domain entities first), `card_mod` CSS selectors, properties, and values, Jinja `{{ }}` and `{% %}` templates, trigger and condition shapes, and value kinds (entity, service, trigger type, area, device, floor, label, boolean, number, and so on). You can watch it live in the Context Inspector (Context tab).

Live versus bundled versus never-network: entities, services, service-field schemas, and installed custom cards are live from your instance. Common community cards and language vocabulary are bundled static catalogs. Nothing is fetched over the network.

## Language support

Completion lanes can be toggled per language in Settings, General:

YAML, CSS, Jinja, JSON, HTML, JavaScript, Python.

Each lane activates from context. A `card_mod:` `style: |` block switches to CSS, `{{ }}` and `{% %}` switch to Jinja, and a `[[[ ]]]` button-card block switches to JavaScript. Syntax coloring spans mixed YAML, Jinja, CSS in `card_mod`, and embedded JSON in one document.

## Snippets

Snippets are multi-line templates with tab-through placeholders. Placeholder syntax:

- `${1:default}`: a numbered stop with default text (typing overwrites it).
- `$1`: a bare numbered stop.
- `${1|a,b,c|}`: a choice stop (a small chooser appears, pick with Enter or Tab).
- `$0` or `${0}`: the explicit final cursor position.
- Repeated indexes (for example two `${1}`) are mirrors: text you type in one fills all of them.

Navigate with `Tab` and `Shift+Tab`, and press `Esc` to leave the session. Categories cover dashboard cards, tap and hold actions, triggers, conditions, action sequences, targets, and `card_mod` styling. Set Completion mode to Snippets (or Both, the default) to prioritize them.

## Settings reference

Open the panel from the gear in any editor or completion popup. There are five tabs. Ordinary changes apply in place, and the panel keeps its tab, scroll, and position.

### General tab
- Keep Nostrodomus armed (`keepOpen`, default off): the list opens as you type, by the rules of Trigger mode, without forcing a popup in spots where it does not apply. With it off the list opens on `Ctrl+Space`.
- Arm when editor is focused (`autoOpenOnFocus`, default off).
- Trigger mode (`triggerMode`, default Smart): Smart, Manual only, Aggressive.
- Minimum typed characters (`minChars`, default 1): 0 to 4.
- Completion mode (`mode`, default Both): Keys, Snippets, Both.
- Max suggestions (`maxItems`, default 12): 6, 8, 12, 16, 20, 32, 40.
- Enter accepts suggestion (`enterCompletes`, default on).
- Tab accepts suggestion (`tabCompletes`, default on).
- Fuzzy and alias matching (`fuzzy`, default on).
- Search across all languages (`globalSearch`, default off).
- Replace native autocomplete (`replaceNativeAutocomplete`, default on): suppresses Home Assistant's built-in entity and icon dropdowns where Nostrodomus has parity. Restored automatically when off.
- Suggest inside comments (`suggestInComments`, default off).
- Per-provider toggles: HA runtime, static library, Lovelace context, snippets, and document-word providers on and off. The HACS card catalog is always on.

### Context tab
Live inspection, no settings:
- Context Inspector: YAML path, role and key, focus and value kind, provider route, detected language lane and confidence, suggestion gate, comment context, prefix length, cursor position, suggestion count, provider order, and selected suggestion source. Auto-refreshes. There is a Copy inspector button (redacted, local-only).
- Suggestion Quality Dashboard: visible suggestion count versus max, top and selected suggestion, provider mix, disabled providers, context route, and, if empty, why.

### Diagnostics tab
Local-only, redacted by default, never sent anywhere. Seven cards: System Status (versions, channel beta, editor detection, storage status, companion version), Performance Stats (local budget, timings, cache hit and miss, client CPU, RAM, GPU, browser), Runtime (health, enabled, popup state, last error), Editor, ContextSnapshot, Current Legacy Context, and Providers plus Runtime (per-provider calls, candidates, and ms, live HA entity and service counts, cache and index counts). Buttons: Refresh, Copy full report, Copy context, Log health, plus a Debug console messages toggle.

### Style tab
Local visual controls. Every color control is a real hue bar with its own enable switch, opacity, and, where useful, saturation. See [Styling and themes](#styling-and-themes).
- Codebox text size: Compact (12.5 px), Normal (13.5 px), Large (15 px), XL (16.5 px).
- Scrollbar: enable, color, opacity (default 0.78), saturation.
- Border and glow: enable, border color, opacity, and saturation, glow color, opacity, and saturation, and glow size (-100 fully inside to +100 fully outside, 0 is off, default -100).
- Frosted surface: enable, color, opacity (default 0.35), saturation. The surface takes the brightness the text needs: dark under the light-text themes, light under Parchment and Mist. Where that is the opposite of the Home Assistant theme (a light Home Assistant theme with a light-text syntax theme, or a dark one with Parchment or Mist) it is drawn at 0.92 opacity or more, so the page behind it does not wash the text out. In those two cases the surface is drawn even when it is switched off, because the text could not be read without it.
- Syntax theme: enable, theme dropdown (37 themes), opacity, saturation.
- Hide editor warnings (`style.hideEditorWarnings`, default off).
- Hide active-line highlight (`style.hideActiveLineHighlight`, default on).
- Ctrl+Space popup: size (Compact, Comfort, Large), Show details pane (default off), plus Commit keys on `:`, Offer buffer words, and Accept mode (Replace word tail, Insert at cursor).

### Help tab
Documentation pointers, a console-command reference (for example `window.__nostrodomus.exportDiagnostics({ redact: true })`), and a Reset settings action.

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
| `enabledLangs` | all on | yaml, css, jinja, json, html, js, python |
| `providers` | all on | per-provider `{ enabled }` |
| `style.*` | | see [Styling and themes](#styling-and-themes) |

Advanced `completions.*` smart-completion flags exist but default off with no visible control. Leave them unless you know you want them.

## Styling and themes

All styling is scoped to the active editor only. It sets internal data attributes on the editor nodes and its host, and never edits your Home Assistant theme or leaks to the wider dashboard.

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
| Syntax coloring enable | `style.syntaxTintEnabled` | on | |
| Syntax theme | `style.syntaxTintPreset` | `vscodeDarkPlus` (Classic) | one of 37 (below) |
| Syntax theme opacity | `style.syntaxThemeOpacity` | 1 | 0.35 to 1 |
| Syntax theme saturation | `style.syntaxThemeSaturation` | 1 | 0.35 to 1.85 |
| Hide editor warnings | `style.hideEditorWarnings` | off | boolean |
| Hide active-line highlight | `style.hideActiveLineHighlight` | on | boolean |

### The 37 syntax themes
Classic (`vscodeDarkPlus`) is the default, a hand-tuned VS Code Dark+ palette. Every other theme is a single hue family. Two are light themes: Parchment and Mist. They paint dark text, so the codebox surface is drawn light for them.

Classic, Crimson, Scarlet, Salmon, Coral, Mocha, Amber, Bronze, Goldenrod, Olive, Lime, Fern, Green, Forest, Emerald, Mint, Jade, Teal, Cyan, Sky, Azure, Cobalt, Navy, Indigo, Periwinkle, Amethyst, Violet, Plum, Magenta, Mauve, Orchid, Rose, Pink, Ruby, Maroon, Parchment (light), Mist (light).

Each theme gives a distinct color to 18 token kinds: foreground, dim, comments (italic), YAML keys, YAML list markers, strings, numbers, booleans, keywords, filters and providers, Jinja templates, CSS selectors, CSS properties, CSS values, CSS accent and glow, CSS dim, punctuation, and operators.

## Examples

### 1. Card type completion
```yaml
type: cus          # popup: custom:mushroom-template-card, custom:button-card, custom:mini-graph-card, ...
```
Your installed custom cards (from the live registry) appear with their readable names, next to common community cards from the bundled catalog.

### 2. Service and service-field completion
```yaml
action: light.turn_on
data:
                   # popup reads light.turn_on's real schema: brightness_pct, rgb_color, transition, color_name, flash, ...
```
Fields come straight from your instance's service schema, with type, description, and required and advanced flags. Press `Enter` after `data:` and Nostrodomus re-opens so you can keep filling the block.

### 3. Target with matching-domain entities first
```yaml
action: light.turn_on
target:
  entity_id:       # your light.* entities are offered first, then everything else
```

### 4. card_mod CSS
```yaml
card_mod:
  style: |
    ha-card {
      border-rad   # CSS lane: border-radius, and card_mod value hints
    }
```
Inside the `style: |` block the lane switches to CSS. Outside it, you are back to YAML. Completion follows the block boundary.

### 5. A snippet with tab-through placeholders
```yaml
tap_action:
  action: ${1|toggle,more-info,call-service,navigate|}   # choose
  entity: ${2:light.example}                             # Tab, then type to overwrite
$0                                                       # final caret
```

### 6. Jinja template
```jinja
{{ states('sensor.') }}   # Jinja lane, entity ids offered inside the call
```

## Diagnostics and the API

Everything below is local-only and reads live state in your browser. The stable namespace is `window.__nostrodomus`.

### Common console commands

```js
window.__nostrodomus.version                 // "nostrodomus-v0.1.265-quality-push"
window.__nostrodomus.health()                // { ok, status, warningCount, checks[], ... }
window.__nostrodomus.runtimeErrors()         // { ok:true, localOnly:true, stats, items[] }  (last 40)
window.__nostrodomus.exportDiagnostics()     // full, redacted diagnostics object (redact:true by default)
window.__nostrodomus.open() / .close() / .toggle() / .refresh()
window.__nostrodomus.settings()              // open the settings dialog
window.__nostrodomus.resetSettings()         // restore defaults
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
| `open` / `close` / `toggle` / `refresh` | control the completion popup |
| `settings()` / `resetSettings()` | open settings, reset to defaults |
| `registerProvider(...)` / `rebuildIndex()` | register a provider, rebuild the completion index |
| `uninstall()` / `disable()` | full teardown: removes listeners, observers, overlay, and styles, and deletes `window.__nostrodomus` |

The namespace also exposes lower-level diagnostic members (`contextDiagnostics`, `embeddedLanguageDiagnostics`, `runtimeCoordinator`, `observerLifecycle*`, `recordRuntimeError`, `resetPerformanceTelemetry`, `state`, and more) meant for debugging rather than everyday use.

### Enabling debug console output
Debug logging is off by default. Only a one-line ready or degraded banner prints. To turn on verbose output:
```js
localStorage.setItem("nostrodomusDebug", "1"); location.reload();
```
Or toggle Debug console messages in the Diagnostics tab.

### Filing a bug report
Use Diagnostics, Copy full report (or `exportDiagnostics()`), which produces a redacted, local-only JSON report: versions, health, provider stats, performance, capability snapshot, and a redacted context summary. It leaves out raw context and your selected item. Do not paste secrets, tokens, full Home Assistant YAML, or private URLs.

## Privacy, security, and storage

- Local-only, no network. The shipped bundle contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, telemetry, or remote-code path, verified by the build's gate in `src` and in the built `dist`.
- Safe rendering. No `innerHTML`, no `eval` or `new Function`. DOM is built with `textContent` and `createElement`.
- No arbitrary user CSS injection. Styling is scoped to the active editor.
- Diagnostics are redacted by default and never leave your browser. Capability snapshots are coarse (`privacyLevel: "coarse-browser-capability-snapshot"`).
- Storage keys (browser local storage). The two that persist your data are:
  - `nostrodomus.settings`: your settings.
  - `nostrodomus.frecency`: a small most-accepted-completions history used to rank suggestions (read once at boot, debounced write on accept, fail-dark).

  A few opt-in flags may also be set when you turn them on, for example `nostrodomusDebug` (verbose logging), `nostrodomusPerf` (perf logging), and `nostrodomusCompanion` (the companion-layer kill switch; a change made in the same tab takes up to a second to apply). None of these hold personal data.

Security policy and reporting: [SECURITY.md](SECURITY.md).

## Compatibility and versioning

- Home Assistant floor: 2026.6.0 (per `hacs.json`). Tested on 2026.6 stable. A beta-channel canary runs monthly ahead of each Home Assistant stable.
- HACS: 2.0.0+.
- Versioning: SemVer `0.1.x`, currently beta. There is no `version` field in `hacs.json`. HACS versioning uses GitHub releases and tags, or the default-branch commit.
- Changelog: shown in-app (Diagnostics) as a rolling five-release window. The running version is always visible in the Diagnostics tab and through `window.__nostrodomus.version`.
- Updates: hard-reload the browser (or bump the resource cache string). No Home Assistant restart is needed.

## Known issues

A short list (full text in [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)). None of these risks your Home Assistant data.

- Internationalization: the interface, labels, and docs are English only. There is no translation layer yet. Everything works on a non-English instance. The text Nostrodomus adds stays English.
- Accessibility: keyboard and screen-reader support is broad (announced suggestions, keyboard-operable panel). Opening the settings panel still needs the pointer (the gear button). A keyboard shortcut is a follow-up.
- Windows line endings (CRLF): the context engine reads YAML best with Unix (LF) endings. In a CRLF document a key line may lose an ancestor in its path, so a nested suggestion can be slightly less specific. Completion still works and never errors. Saving through the Home Assistant editor normalizes to LF.
- Composite card editors: the main dialog editor is sized correctly. An embedded secondary editor is left at native size.
- Warning-badge coverage: the "Visual editor is not supported" corner badge shows in the card-edit dialog. Coverage on standalone Automation, Script, and Developer Tools YAML panels is a follow-up.

## Troubleshooting

| Symptom | Try this |
|---|---|
| No suggestions | Make sure the editor has focus and press `Ctrl+Space`. Check Diagnostics, Providers and the Context tab. |
| Plugin does not seem loaded | You may be on a built-in dashboard, which does not load custom resources. Open an editor on a custom dashboard. Confirm the resource is registered. |
| Health check | `window.__nostrodomus.health()` returns `ok: true`. `window.__nostrodomus.runtimeErrors()` lists recorded errors. |
| Stale version after update | Hard-reload (clear cache) or bump the resource URL `?v=` query string. Running version is in Diagnostics, System Status. |
| Native HA dropdowns disappeared | That is Replace native autocomplete, on by default. Turn it off in General to restore them. |
| Styling wrong with a custom theme | Adjust or reset the frame controls in Style. Styling is scoped to the active editor only. |
| Suggestions less specific in a pasted block | The block may have CRLF endings. Save through the Home Assistant editor to normalize to LF. |
| Want verbose logs | `localStorage.setItem("nostrodomusDebug","1"); location.reload();` or the Debug toggle in Diagnostics. |

## Uninstalling

- Turn it off for the session: `window.__nostrodomus.disable()` runs a full teardown.
- Remove it: uninstall through HACS (or delete the resource under Settings, Dashboards, Resources and remove `dist/nostrodomus.js` from `www`), then hard-reload. Your settings stay in local storage under `nostrodomus.settings` and `nostrodomus.frecency` until you clear them.

## Building from source

Node 22 or newer is required for building and verifying. The plugin itself is a browser resource.

```bash
npm install
python3 tools/build.py              # bundle src into dist/nostrodomus.js
python3 tools/verify.py             # verify the build
python3 tools/verify.py --release   # release-grade verification
```

The build and verify tooling never writes to `/config/www`, `/config/custom_components`, or `/config/.storage/lovelace_resources`. See [CONTRIBUTING.md](CONTRIBUTING.md) and `docs/` for the full gate, architecture notes, and contracts.
