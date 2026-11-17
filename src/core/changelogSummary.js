// Nostrodomus in-app changelog summary data.
//
// Keeps only the five most recent releases. Data-only: no DOM access, no browser
// storage, no events, no timers, no observers, no network, and no Home Assistant
// runtime reads.

export const CHANGELOG_SUMMARY = Object.freeze([
  {
    version: "0.1.283",
    title: "Card preview messages stay visible",
    bullets: [
      "Messages a card shows in the preview of the card editor dialog, such as an alert, a warning or an error line, stay visible. The dialog styling hid them whatever the Hide editor warnings setting said.",
      "Hide editor warnings and the warning badge apply to Home Assistant's editor warnings only, not to what a card shows in its preview.",
    ],
  },
  {
    version: "0.1.282",
    title: "Icons from installed icon sets",
    bullets: [
      "Icon suggestions include the icon sets installed in Home Assistant, such as Material Symbols, and each row shows its icon.",
      "Icon values complete bare, in single or double quotes, and inside template strings.",
      "Pressing Tab to reach an icon placeholder of a snippet opens the icon list.",
    ],
  },
  {
    version: "0.1.281",
    title: "Fixes in coloring, snippets and settings",
    bullets: [
      "Syntax coloring handles doubled quotes in single-quoted strings, comments after several spaces, key lines whose value is a template, and card_mod selectors with a comment.",
      "Reset to default and settings synced from another tab apply the editor dialog settings at once, and a reset in another tab is no longer undone.",
      "Snippet choices stay open after Tab, the navigate snippets no longer point at the built-in Overview, and a later card no longer picks up the action of an earlier one.",
    ],
  },
  {
    version: "0.1.280",
    title: "Installs through HACS and the Marketplace",
    bullets: [
      "Installing through HACS or the Marketplace built into Home Assistant 2026.11 now downloads the plugin and registers a resource that loads it. Before, the install reported success with nothing written.",
      "The screenshots and badges of the README display on the repository page in HACS and the Marketplace.",
    ],
  },
  {
    version: "0.1.279",
    title: "Glass editor dialog",
    bullets: [
      "The card editor dialog is translucent and blurs the dashboard behind it, and the card preview has no background of its own, so the dashboard shows through, softened. A theme that defines its own dialog surface or blur keeps it.",
      "New setting in Settings, Style: Glass editor dialog, on by default. Turn it off on a slow computer: the blur costs graphics work while the dialog is open.",
      "The visual editor a custom card brings with it is left alone. Its notes are no longer turned into the small warning icon, and working in a code box inside it no longer resizes the dialog, frames that box or switches off the suggestions the card turned on.",
      "A visual editor taller than the dialog scrolls again after the code editor was shown, so its lower controls can be reached.",
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
