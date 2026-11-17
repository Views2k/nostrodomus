# Known issues and limitations

What Nostrodomus does not do yet, or does with restrictions. None of these affects your Home Assistant data or configuration: the plugin runs in the browser and makes no network requests of its own.

## Where it runs

- Home Assistant's built-in Overview dashboard does not load custom resources, so Nostrodomus is not active there, and the other built-in dashboards (Lights, Security, Climate, Energy, Maintenance) may not load them either. It becomes active once a dashboard you created has been opened in the browser tab. The other [supported editors](../DOCUMENTATION.md#supported-editors-and-surfaces) (automation, script, Developer Tools) work from then on, until the page is reloaded. See [COMPAT.md](COMPAT.md).
- Firefox is not supported yet. The plugin loads and suggests there, but while you type in the editor Firefox delivers some key presses to the page instead of the editor, and Home Assistant's single-letter shortcuts (for example `e` for the entity search) can open in the middle of a word. Use a Chromium-based browser. Safari is not tested.
- Settings are stored in the browser's local storage. Each browser and device has its own settings, and there is no sync between them.

## Language

The interface, the suggestion labels, the snippet descriptions and the documentation are in English only. There is no translation layer. Everything works on a Home Assistant instance set to another language, but the text Nostrodomus adds stays English.

## Keyboard and screen readers

What works:

- The suggestion list is operated from the keyboard (`Ctrl+Space`, arrow keys, `Enter` or `Tab` to accept, `Esc` to close). It announces the active suggestion through a polite live region ("label, kind, N of M") and sets the ARIA combobox attributes on the focused editor.
- `Ctrl+,` opens Settings while the suggestion list is open. The gear in the list header answers `Enter` and `Space`.
- Opening Settings moves focus into the panel, `Esc` closes it and returns focus to where it was. The tab row answers the arrow keys, `Home` and `End`. The panel can be moved and resized from the keyboard: focus the header or the resize handle and use the arrow keys (hold `Shift` for a larger step).

Limitations:

- There is no shortcut that opens Settings while the suggestion list is closed. Press `Ctrl+Space` first, then `Ctrl+,`.
- Screen reader behavior is not covered by the automated tests.

## Syntax coloring

- Comments are not italic. Where the browser supports the CSS Custom Highlight API, colors are applied through highlight ranges, and a highlight range can set a color but not a font style.
- In Firefox a highlight range cannot carry a text shadow either, so the text glow of a syntax theme is not shown there.
- Lines that come into view during fast scrolling can show Home Assistant's own colors for one to three frames before the theme colors are applied.
- When two code editors are visible, the one that does not have focus is repainted late after it is scrolled.

## Suggestions

- The action snippets (for example "perform-action + target") are offered directly after `action:`. Once you have typed part of a value there, they are no longer offered.
- Inside a nested block of a community card from the bundled catalog (for example `filter:` of auto-entities), the keys of that block are listed first, and the card's top-level keys follow in the same list.

## Card editor dialog

- Composite cards: some cards embed a small second code editor in their configuration form. Nostrodomus enlarges only the main code editor of the dialog and leaves the embedded one at its own size. If an embedded editor of a card is sized wrongly, report it with the card type.
- Editor warnings are drawn as a small badge that shows the message on hover, and "Hide editor warnings" removes them, in the card editor dialog only. This applies to Home Assistant's own editor warnings; a note that a card shows in its own visual editor stays as the card draws it. In the automation, script and Developer Tools editors the warnings stay as Home Assistant draws them and the setting has no effect.
- The glass editor dialog uses a backdrop blur, which costs graphics work while the dialog is open. On slow computers, turn off "Glass editor dialog" in Settings, Style.

## Scrollbar

In current Chromium-based browsers the codebox scrollbar is the browser's standard thin scrollbar in the color, opacity and saturation you set. The custom thumb shape in the plugin's scrollbar rules is not shown there.

## Updating

Nostrodomus is a JavaScript frontend resource. An update takes effect after a hard reload of the browser, or after the resource URL cache string changes. No Home Assistant restart is needed. The running version is shown in the Diagnostics tab of the settings panel.
