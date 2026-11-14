# Nostrodomus UX Verification Checklist

Use this checklist before accepting settings or popup changes.

## Settings shell

- Open Nostrodomus settings from the console API and from normal UI paths.
- Confirm the panel title reads `Nostrodomus` and shows the loaded runtime version.
- Resize the panel and confirm the stored size remains usable after close/reopen.
- Move through General, Context, Diagnostics, Style, and Help without horizontal clipping.
- Confirm visible text can be selected and copied.
- Confirm focus outlines are visible when tabbing through buttons, toggles, command cards, and resize/close controls.

## Interaction stability

- Scroll down in Suggestions, change Maximum Suggestions, Popup size, Completion mode, and provider toggles.
- Confirm the settings panel does not jump to the top.
- Confirm diagnostics actions do not rebuild the settings panel.
- Confirm accepting a suggestion does not scroll the Home Assistant page to the top.

## Style controls

- Open Style and adjust codebox text size, scrollbar color, glow, surface opacity/color, and text-coloring preset.
- Confirm the active codebox updates without closing/reopening settings.
- Confirm Style changes preserve the active tab and settings scroll position.
- Confirm settings remain bounded to presets; do not accept arbitrary CSS.
