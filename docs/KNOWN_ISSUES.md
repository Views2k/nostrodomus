# Known issues & limitations

An honest list of what Nostrodomus does not yet do, or does with caveats. Nothing here
risks your Home Assistant data or configuration — the plugin is local-only and makes no
network calls. These are usability and coverage gaps, tracked for future releases.

## Internationalization

The interface, suggestion labels, snippet descriptions, and documentation are
**English-only**. There is no translation layer yet. Everything functions on a
non-English Home Assistant, but the text Nostrodomus adds stays in English.

## Accessibility

Keyboard and screen-reader support has been broadened; cross-screen-reader verification
is still ongoing:

- The completion popup announces its active suggestion through a polite live region
  ("label, kind, N of M") and wires the ARIA combobox pattern (`aria-activedescendant`)
  onto the focused editor, so assistive technology follows the selection as you cycle.
- The settings dialog manages focus: opening moves focus into the panel, <kbd>Esc</kbd>
  closes it, and closing returns focus to where it was. The panel can be moved and
  resized from the keyboard — focus the header or the resize handle and use the arrow
  keys (hold <kbd>Shift</kbd> for a larger step).
- Opening the settings panel still uses the pointer (the gear button); a keyboard
  shortcut to open it is a tracked follow-up.

The editor and completion themselves work with the keyboard (typing, <kbd>Ctrl</kbd>+<kbd>Space</kbd>,
arrow keys, Tab/Enter to accept).

## Combo / composite card editors

Some composite cards (for example universal-remote-card, stack-in-card) embed a small
secondary code editor inside their configuration form. Nostrodomus now sizes only the
dialog's **main** code editor with its enlarged height and leaves an embedded secondary
editor at its native size, so the embedded box no longer grows off-screen. If you edit an
unusual composite card and see a mis-sized embedded editor, please file it with the card
type — the discriminator keys on the standard Home Assistant editor structure.

## Windows-style line endings (CRLF)

The context engine reads YAML best with Unix (LF) line endings, which is what the Home
Assistant editors produce and store. In a document that contains Windows-style CRLF line
endings (for example pasted from an external editor mid-edit), a key line ending in a
carriage return may not be fully parsed, so completion in that block can lose an ancestor
in its path — completion still works and never errors, but a nested suggestion may be
slightly less specific. Saving through the Home Assistant editor normalizes the file to
LF and clears this. A full CRLF-tolerant parse is a tracked follow-up.

## Warning-badge coverage on some surfaces

The small corner badge that marks Home Assistant's "Visual editor is not supported"
notices is shown in the dashboard card-edit dialog. Coverage of the same badge on the
standalone Automation/Script/Developer-Tools YAML panels is a tracked follow-up; the
warnings themselves are unaffected, and the "Hide editor warnings" setting works
wherever the badge does.

## Deployment

Nostrodomus is a JavaScript-only frontend resource. Updates take effect after a browser
hard-reload (or a resource cache-string bump); no Home Assistant restart is required. The
running version is shown in the settings **Diagnostics** tab.
