// Nostrodomus smart syntax scheduler helpers.
//
// Keep these helpers pure and deterministic. No DOM access, no browser storage,
// no events, no observers, no timers, no logging, and no Home Assistant runtime reads.

export const SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS = Object.freeze([
  "settings",
  "option-change",
  "range-change",
  "toggle",
  "reset",
  "restore",
  "open",
  "install",
  "syntax-theme",
]);

export function sourceClassSmartSyntaxReasonIsUrgent(
  reason = "",
  urgentTokens = SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS,
) {
  // "preset" contains "reset". The routine reason "apply-text-color-preset" was therefore
  // treated as urgent, so every syntax repaint skipped the throttle. The word is removed before
  // the substring match; the other tokens keep matching as before.
  const text = String(reason || "").toLowerCase().replace(/preset/g, "");
  const tokens = Array.isArray(urgentTokens)
    ? urgentTokens
    : SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS;
  return tokens.some((token) => text.includes(String(token || "").toLowerCase()));
}

export function sourceClassSmartSyntaxMinInterval(
  reason = "",
  defaultInterval = 90,
  urgentInterval = 0,
  urgentTokens = SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS,
) {
  return sourceClassSmartSyntaxReasonIsUrgent(reason, urgentTokens)
    ? urgentInterval
    : defaultInterval;
}

export function sourceClassSyntaxInstallReasonForcesRefresh(
  reason = "",
  urgentTokens = SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS,
) {
  return sourceClassSmartSyntaxReasonIsUrgent(reason, urgentTokens);
}

export function sourceClassSyntaxInstallForceRefresh(
  styleChanged = false,
  sourceAlreadyActive = false,
  reason = "",
  urgentTokens = SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS,
) {
  return !!(
    styleChanged ||
    !sourceAlreadyActive ||
    sourceClassSyntaxInstallReasonForcesRefresh(reason, urgentTokens)
  );
}

export function sourceClassSmartSyntaxWaitMs(
  reason = "",
  now = 0,
  lastRunAt = 0,
  defaultInterval = 90,
  urgentInterval = 0,
  urgentTokens = SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS,
) {
  const current = Number(now) || 0;
  const previous = Number(lastRunAt) || 0;
  const minInterval = sourceClassSmartSyntaxMinInterval(
    reason,
    defaultInterval,
    urgentInterval,
    urgentTokens,
  );
  const elapsed = current - previous;
  return Math.max(0, minInterval - elapsed);
}

export function sourceClassSmartSyntaxPendingReasonUpdate(
  existingReason = "",
  reason = "smart-source-syntax",
  fallbackReason = "smart-source-syntax",
) {
  const clean = String(reason || fallbackReason);
  const parts = String(existingReason || "")
    .split("+")
    .filter(Boolean);
  const duplicate = parts.includes(clean);
  if (!duplicate) parts.push(clean);
  return {
    clean,
    duplicate,
    parts,
    pendingReason: parts.join("+"),
    count: parts.length,
  };
}

export function sourceClassSyntaxRefreshReasonUpdate(
  existingReason = "",
  reason = "source-class-refresh",
  fallbackReason = "source-class-refresh",
) {
  const clean = String(reason || fallbackReason);
  const parts = String(existingReason || "")
    .split("+")
    .filter(Boolean);
  const duplicate = parts.includes(clean);
  if (!duplicate) parts.push(clean);
  return {
    clean,
    duplicate,
    parts,
    pendingReason: parts.join("+"),
    count: parts.length,
  };
}

export function sourceClassSmartSyntaxObserverReady(
  observer = null,
  observerEditorKey = "",
  observerContent = null,
  expectedEditorKey = "",
  expectedContent = null,
  syntaxContentMode = "",
  syntaxContentEditorKey = "",
  syntaxContent = null,
  requireSourceClassContent = false,
) {
  const baseReady = !!(
    observer &&
    observerEditorKey === expectedEditorKey &&
    observerContent === expectedContent
  );
  if (!baseReady) return false;
  if (!requireSourceClassContent) return true;
  return !!(
    syntaxContentMode === "source-class" &&
    syntaxContentEditorKey === expectedEditorKey &&
    syntaxContent === expectedContent
  );
}
