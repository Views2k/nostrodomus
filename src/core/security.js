// Nostrodomus security helpers module
// Owns pure output-escaping helpers that are safe to share across runtime seams.
// Keep this module pure: no DOM, no browser storage, no events, no timers, no network.

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
