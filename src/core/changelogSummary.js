// Nostrodomus in-app changelog summary data.
//
// Keeps only the five most recent releases. Data-only: no DOM access, no browser
// storage, no events, no timers, no observers, no network, and no Home Assistant
// runtime reads.

export const CHANGELOG_SUMMARY = Object.freeze([
  {
    version: "0.1.277",
    title: "Insertion, list and syntax fixes; less work on idle pages",
    bullets: [
      "Accepting a suggestion: a row accepted after cards:, actions:, triggers: and similar keys becomes a list item, lines after a key on a list item are indented from the key, a typed colon no longer adds a second one, and a key row with a value renames the key and keeps the value already on the line. One undo removes the accepted text and keeps what you typed.",
      "The suggestion list follows scrolling around the editor and closes when the cursor leaves view. Escape in a snippet closes it, keys pressed while an input method composes text are left alone, the same text is listed once, and Ctrl+, opens Settings while the list is open.",
      "Suggestions by place: style: and class: inside card_mod, action choices for a tile card's icon actions, action snippets after action:, template rows without doubled braces, and no card types at type: keys that are not cards. On large instances, ids that start with what you typed come first and the fields of every service are found.",
      "Syntax colors: CSS under nested card_mod style keys, YAML aliases, comments after words with apostrophes or quoted parts, and steady colors with a folded block at the edge of the view. A pass rebuilds only the lines that changed, and very long CSS lines no longer slow the editor.",
      "Settings: the Context, General and Help tabs are built when first shown, Refresh and Copy context work, a failed save is shown, the panel fits small screens and its tabs answer the arrow keys. Pages without an editor do less background work, and uninstall leaves nothing behind.",
    ],
  },
  {
    version: "0.1.276",
    title: "Lighter suggestions while typing, faster settings panel",
    bullets: [
      "Each refresh of the suggestion list reads the text before the cursor once instead of seven or eight times, ranks the candidates in about half the time, and reuses the entity rows and the syntax tokens it already built. The suggestions and their order are unchanged.",
      "The settings panel opens without building the Diagnostics tab; that tab is built when you select it.",
      "On a light Home Assistant theme the dark codebox no longer flashes before the adjusted colors arrive, and the surface is drawn even when it is switched off if the text could not be read without it. Below 1000 pixels the editor, its code and the preview use the full width of the card dialog.",
    ],
  },
  {
    version: "0.1.275",
    title: "Readable on light themes, card dialog on narrow screens",
    bullets: [
      "On a light Home Assistant theme the code is readable: the codebox surface is drawn dark and nearly opaque under the light text. The Parchment and Mist themes now get a light surface, dark plain text and dark line numbers.",
      "When the browser is narrower than 1000 pixels the card dialog scrolls to the preview, the Save and Cancel row stays in view, and the codebox no longer covers the top of the preview.",
      "With a dark Home Assistant theme and any other syntax theme nothing changes. Your saved settings, themes and snippets are unchanged.",
    ],
  },
  {
    version: "0.1.274",
    title: "YAML colors, fewer checks per click, more completion fixes",
    bullets: [
      "Plain YAML lines are colored as YAML: comments at the end of a line, true and false, entity ids and card names no longer take CSS colors, and text inside a multi-line value is no longer colored as CSS.",
      "A click in the card dialog now triggers four style checks instead of thirteen, Settings and Developer Tools pages without an editor no longer start a four second search, and the visual editor tab stops searching for a code editor after a few seconds.",
      "Keys and clicks on the dialog's own buttons no longer act on the suggestion list, manual trigger mode keeps its list while you type, the list no longer covers the line you are typing in short editors, and the Copy and Log buttons work on plain HTTP installs.",
    ],
  },
  {
    version: "0.1.273",
    title: "Suggestions that follow the block you are in",
    bullets: [
      "Key suggestions now come from the block the cursor is in. Action and condition steps below a triggers block no longer get trigger keys, cards after a conditional card no longer get condition keys, and text inside a multi-line value gets no key suggestions.",
      "A colon typed inside a value (an mdi icon, a custom card type) keeps the list open, a colon after a fully typed key no longer swaps it for a longer one, keys pressed with Ctrl, Shift or Alt go to the editor, and a list snippet accepted right after triggers, actions or conditions keeps its dash.",
      "Typing in the visual editor and opening the card editor do less work: the card preview is no longer scanned for warnings, and the editor is no longer searched for again on every key on narrow screens.",
    ],
  },
]);

export function changelogEntries(release) {
  return Array.isArray(release?.entries)
    ? release.entries
    : Array.isArray(release?.bullets)
      ? release.bullets
      : [];
}

export function changelogSummaryTextFromSummary(summary = CHANGELOG_SUMMARY) {
  return (Array.isArray(summary) ? summary : [])
    .map((release) => {
      const lines = [
        `${release.version} — ${release.title}`,
        ...changelogEntries(release).map((entry) => `- ${entry}`),
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}
