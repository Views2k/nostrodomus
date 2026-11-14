# Changelog

Versions before 0.1.266 are not listed.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Nostrodomus is in beta, with versions numbered `0.1.x`.

## [0.1.278] - 2026-11-14

No change in behavior.

### Changed

- The documents were checked against the code and brought up to date, and those that only recorded past work were removed. This changelog is new.
- Comments in the source, the tests and the tools describe the code. Comments inside the stylesheet that the plugin ships changed as well, so the built file differs from 0.1.277.
- The browser tests also run against Home Assistant 2026.6, and can run on Firefox with `npm run e2e:firefox`.

### Known issues

- Firefox is not supported yet: while you type in the editor, Home Assistant's single-letter shortcuts can open in the middle of a word. See [Known issues](docs/KNOWN_ISSUES.md).

## [0.1.277] - 2026-11-13

### Added

- `Ctrl+,` opens Settings while the suggestion list is open. The gear in the list header answers `Enter` and `Space`.
- The tab row of the settings panel answers the arrow keys, `Home` and `End`, and the Close button shows a focus ring.
- The HACS card catalog has a working Enabled toggle in Settings, and so do providers added through `window.__nostrodomus.registerProvider()`.
- A failed settings save is shown in the header of the settings panel.

### Changed

- A suggestion accepted right after `cards:`, `triggers:`, `conditions:`, `actions:`, `sequence:`, `choose:` and similar keys becomes a list item. Lines after a key on a list item are indented from the key.
- One undo removes an accepted suggestion and keeps the text you typed.
- The suggestion list follows scrolling around the editor and closes when the cursor leaves the visible editor.
- Entity and service ids that start with the typed text come before ids that only contain it, and the fields of every service are found on instances with many services.
- Inside `card_mod:` the keys `style:` and `class:` come first. Inside a nested block of a catalog card the keys of that block come first. Action snippets are offered right after `action:`.
- The Context, General and Help tabs of the settings panel are built when first shown.
- A recorded error fails the health check for five minutes and is a warning after that.
- Pages without an editor do less background work.

### Fixed

- A colon typed over a suggestion that already carries its colon no longer adds a second one, and a key suggestion with a value, accepted on a line that already has a value, renames the key and keeps the value.
- `Esc` in a snippet closes the suggestion list too. Keys pressed while an input method composes text are left to the input method. Suggestions that insert the same text are listed once.
- `{{st` offers template functions and keeps the braces, and `{% if %}` and `{% set %}` suggestions no longer double the delimiter.
- A tile card's icon actions get dashboard actions instead of services. A `type:` key inside tile features, chart series, chips, a header or footer, a view or an automation step no longer gets card types.
- Syntax colors: CSS under nested `card_mod` style keys, YAML aliases, comments after words with apostrophes or quoted parts, and steady colors with a folded block at the edge of the view. Very long CSS lines no longer slow the editor.
- Settings: Refresh rebuilds the Diagnostics cards, Copy context copies the readout, and the panel fits screens narrower than 396 pixels. Stored values for minimum characters and maximum suggestions outside their range are brought into range. A browser that blocks site data no longer stops the plugin from starting. `resetSettings()` restyles the editor.
- With two full-size editors on a page, the one in use is styled. An embedded editor in the card dialog no longer gets the dialog sizing.
- `uninstall()` leaves nothing behind: pending timers, the list layer, panel editor sizing and unclipped wrappers are restored or removed.
- The redacted diagnostics report no longer carries suggestion labels in error records.

## [0.1.276] - 2026-11-13

### Changed

- Each refresh of the suggestion list does less work while you type: it reads the text before the cursor once, ranks the candidates in about half the time, and reuses the entity rows and syntax tokens it already built. The suggestions and their order are unchanged.
- The settings panel opens without building the Diagnostics tab. That tab is built when you select it.

### Fixed

- On a light Home Assistant theme the dark codebox no longer flashes before the adjusted colors arrive.
- The codebox surface is drawn even when it is switched off, if the text could not be read without it.
- In a window narrower than 1000 pixels the editor, its code and the preview use the full width of the card dialog.

## [0.1.275] - 2026-11-13

### Fixed

- On a light Home Assistant theme the code is readable: the codebox surface is drawn dark and nearly opaque under the light text.
- The Parchment and Mist syntax themes get a light surface, dark plain text and dark line numbers.
- In a window narrower than 1000 pixels the card dialog scrolls to the preview, the Save and Cancel row stays in view, and the codebox no longer covers the top of the preview.

With a dark Home Assistant theme and any other syntax theme nothing changes.

## [0.1.274] - 2026-11-13

### Changed

- A click in the card dialog triggers four style checks instead of thirteen.
- Settings and Developer Tools pages without an editor no longer start a four second search for one, and the visual editor tab stops searching for a code editor after a few seconds.

### Fixed

- Plain YAML lines are colored as YAML: comments at the end of a line, `true` and `false`, entity ids and card names no longer take CSS colors, and text inside a multi-line value is no longer colored as CSS.
- Keys and clicks on the dialog's own buttons no longer act on the suggestion list.
- Manual trigger mode keeps its list while you type.
- The list no longer covers the line you are typing in short editors.
- The Copy and Log buttons work on plain HTTP installs.
- Settings saved in one browser tab reach the other open tabs.
- Hiding Home Assistant's native autocomplete follows the "Replace Home Assistant native autocomplete" setting.
- Small YAML editors of single rows in the visual automation editor no longer get the full-panel margins.

## [0.1.273] - 2026-11-13

### Changed

- Typing in the visual editor and opening the card editor do less work: the card preview is no longer scanned for warnings, and the editor is no longer searched for again on every key on narrow screens.

### Fixed

- Key suggestions come from the block the cursor is in. Action and condition steps below a `triggers:` block no longer get trigger keys, cards after a conditional card no longer get condition keys, and text inside a multi-line value gets no key suggestions.
- A colon typed inside a value (an `mdi:` icon, a `custom:` card type) keeps the list open, and a colon after a fully typed key no longer swaps it for a longer one.
- Keys pressed with `Ctrl`, `Shift` or `Alt` go to the editor.
- A list snippet accepted right after `triggers:`, `actions:` or `conditions:` keeps its dash.
- The template editor of Developer Tools gets completion and styling on Home Assistant 2026.11, which moved Developer Tools under Settings.

## [0.1.272] - 2026-11-11

### Changed

- An arrow key in the suggestion list repaints two rows instead of rebuilding the list.
- A syntax coloring pass is skipped when nothing it painted has changed, for example on an arrow key in the list or a click in the dialog.
- Moving to a page without an editor no longer starts a search for one.

### Fixed

- In a document with repeated lines, lines could take the colors of other lines while the cursor line was scrolled out of view.

## [0.1.271] - 2026-11-11

### Fixed

- A value accepted after `key: ` no longer gets a second space, and for `icon:`, `name:`, `label:` and `state:` it no longer moves to a new line.
- A multi-line snippet accepted after a typed prefix keeps its indentation, and on a list item it no longer doubles the space or the dash.
- A key accepted on a line that already has its colon no longer leaves a second colon.
- An entity id on a list item is replaced as a whole, not only up to the dot.
- Accepting a value inside a snippet placeholder no longer ends the snippet, and a snippet ends when the cursor leaves it.
- The details pane of the suggestion list is no longer cut off.
- Keys pressed inside the settings panel no longer act on a suggestion list that is open behind it.
- The "Debug console messages" checkbox turns debug logging on.
- A stored setting of the wrong type no longer stops the settings panel from opening, and a slider change is no longer lost on a quick reload.
- The redacted diagnostics report carries only the lengths of the line under the cursor, the typed prefix, entity ids and their names.
- Coloring one editor no longer removes the colors of the other editors on the page.
- A list item without a key no longer takes the list color for the whole line, and an apostrophe in a plain value no longer hides the comment after it.

## [0.1.270] - 2026-11-11

### Changed

- Typing and scrolling in long documents are much lighter. Where the browser supports it, syntax colors are applied through highlight ranges and nothing is written to the editor's line elements on each keystroke.
- Comment lines are no longer italic, because a highlight range can set a color but not a font style.

## [0.1.269] - 2026-11-11

### Fixed

- Inside a CSS block, a line starting with `#` (an id selector) or `*` is no longer colored as a comment.
- Text in other multi-line values, such as `content: |`, is colored as text. A markdown heading or list item there is no longer a comment.
- A list item such as `- https://example.com/a` is no longer read as a key followed by a comment.
- A `#` inside a quoted string does not start a comment, and a quoted value with spaces is colored as one string.

## [0.1.268] - 2026-11-11

### Fixed

- Suggestions from a provider that took longer than its time budget are kept. Before, they were dropped and the list could come up without them.
- After an empty result the list no longer stays empty for the rest of the word.
- `Enter`, `Tab` or a typed colon right after fast typing no longer leaves stray characters.
- Entities are matched by their friendly name as well as by their id.

## [0.1.267] - 2026-11-11

### Changed

- A click in the card dialog starts one round of style checks instead of three.
- On a dashboard without an open card editor, clicks and focus changes no longer start style work. A card dialog that was closed no longer counts as open for the rest of the session.
- A reopened card editor is styled and fitted without an extra click.

## [0.1.266] - 2026-11-11

### Fixed

- With a card editor open and no input, the plugin no longer re-applies its styles continuously.
- The code editor in the card dialog is fitted to the space above the dialog buttons. Before, in some dialogs (for example the editor of a card inside a stack) it ended below the dialog and the window.
- The editor is fitted again when a tab row or an alert appears above it and when the window is resized.
