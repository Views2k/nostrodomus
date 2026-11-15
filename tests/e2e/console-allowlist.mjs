// Console allowlist for the E2E console-capture policy (tools/e2e/README.md):
// console.error fails unless allowlisted here; console.warn fails only when
// Nostrodomus-origin and not allowlisted; a pageerror fails unless an entry is
// `appliesTo: 'pageerror'` and its `source` regex matches the error stack.
//
// Entry rules:
// - `pattern` is an exact string match or an anchored RegExp (starts with ^).
// - `appliesTo: 'pageerror'` entries must also carry a `source` RegExp; the
//   message alone can never suppress an uncaught exception (a stray match
//   must not swallow a real crash from our own code).
// - Every entry carries `owner` and `reason` — an allowlist entry without a
//   justification is a policy violation, not a convenience.
// - HA / third-party noise is recorded in the report, never failed on, so it
//   does not belong here; this list is for known, justified exceptions only.

export const CONSOLE_ALLOWLIST = [
  {
    // Known side effect of `serviceWorkers: 'block'` (playwright.config.mjs):
    // HA's app bundle expects the service worker it registers to exist and
    // dereferences it unguarded on a code path the blocked SW would have
    // satisfied. The throw is entirely inside HA's own frontend_latest bundle
    // — never our /local/ resource — and harmless to the features under test
    // (the dialog, keystrokes, and styling all work with it
    // present). Scoped to the exact message and a frontend_latest source so
    // it can never mask a Nostrodomus-origin crash. Remove if HA stops throwing
    // or the harness stops blocking SWs.
    appliesTo: 'pageerror',
    pattern: "Cannot read properties of undefined (reading 'addEventListener')",
    source: /frontend_latest\/app\.[^/]*\.js/,
    owner: 'harness',
    reason: 'HA frontend_latest/app.js dereferences the blocked service worker; the service worker is blocked to keep the session deterministic (no reload on activation).',
  },
  {
    // The same Home Assistant error as above, in Firefox's wording.
    appliesTo: 'pageerror',
    pattern: /^can't access property "addEventListener"/,
    source: /frontend_latest\/app\.[^/]*\.js/,
    owner: 'harness',
    reason: 'Firefox wording of the Home Assistant error about the blocked service worker.',
  },
  {
    // Firefox reports that rejection a second time as a console error.
    pattern: /^Failure writing unhandled promise rejection to system log/,
    owner: 'harness',
    reason: 'Firefox repeats the Home Assistant rejection about the blocked service worker.',
  },
  {
    // Headless Firefox has no graphics adapter. The diagnostics capability snapshot, which the
    // health check reads, asks for a WebGL context and Firefox logs that it cannot create one.
    pattern: /^\[JavaScript Warning: "Failed to create WebGL context/,
    owner: 'harness',
    reason: 'No WebGL in headless Firefox; the capability snapshot records it as unavailable.',
  },
];
