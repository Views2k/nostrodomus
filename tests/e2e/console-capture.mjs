// The console-capture utility every spec session uses. It catches the bugs
// that pass every unit test and still break in the browser.
//
// Failure policy (tools/e2e/README.md):
// - pageerror                → fails UNLESS allowlisted with `appliesTo:
//                              'pageerror'` AND a `source` regex the stack
//                              matches (a bare message match is not enough —
//                              a pageerror exception is loud by default);
// - console.error            → fails unless allowlisted;
// - console.warn             → collected and attached to the report; fails
//                              ONLY for Nostrodomus-origin warnings that are not
//                              allowlisted (HA and third-party cards are
//                              noisy — their warnings are information).

const NOSTRODOMUS_ORIGIN_MARKERS = ['[Nostrodomus]', 'NOSTRODOMUS', 'nostrodomus'];

export function attachConsoleCapture(page) {
  const capture = { pageErrors: [], messages: [] };
  page.on('pageerror', (error) => {
    capture.pageErrors.push({
      message: String(error?.message || error),
      stack: String(error?.stack || error?.message || error),
    });
  });
  page.on('console', (message) => {
    capture.messages.push({ type: message.type(), text: message.text() });
  });
  return capture;
}

export function isNostrodomusOrigin(text) {
  return NOSTRODOMUS_ORIGIN_MARKERS.some((marker) => text.includes(marker));
}

function matchesPattern(pattern, text) {
  return pattern instanceof RegExp ? pattern.test(text) : pattern === text;
}

function isAllowlisted(text, allowlist) {
  return allowlist.some(
    (entry) => entry.appliesTo !== 'pageerror' && matchesPattern(entry.pattern, text),
  );
}

// A pageerror is suppressed only by an entry explicitly scoped to pageerrors
// AND a `source` regex matched against the stack — so a message-only entry
// can never silently swallow an uncaught exception from our own code.
function isPageErrorAllowlisted(pageError, allowlist) {
  return allowlist.some(
    (entry) =>
      entry.appliesTo === 'pageerror' &&
      matchesPattern(entry.pattern, pageError.message) &&
      entry.source instanceof RegExp &&
      entry.source.test(pageError.stack),
  );
}

/** Returns the list of policy violations (empty = clean session). */
export function consoleFailures(capture, allowlist) {
  const failures = [];
  for (const pageError of capture.pageErrors) {
    if (!isPageErrorAllowlisted(pageError, allowlist)) {
      failures.push(`pageerror: ${pageError.stack}`);
    }
  }
  for (const message of capture.messages) {
    if (message.type === 'error' && !isAllowlisted(message.text, allowlist)) {
      failures.push(`console.error: ${message.text}`);
    } else if (message.type === 'warning' && isNostrodomusOrigin(message.text) && !isAllowlisted(message.text, allowlist)) {
      failures.push(`nostrodomus-origin console.warn: ${message.text}`);
    }
  }
  return failures;
}
