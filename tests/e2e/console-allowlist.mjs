// Console allowlist for the E2E console-capture policy (tools/e2e/README.md):
// console.error fails unless allowlisted here; console.warn fails only when
// Nostrodomus-origin and not allowlisted; a pageerror fails unless an entry is
// `appliesTo: 'pageerror'` AND its `source` regex matches the error stack.
//
// Entry rules (binding):
// - `pattern` is an EXACT string match or an ANCHORED RegExp (starts with ^).
// - `appliesTo: 'pageerror'` entries MUST also carry a `source` RegExp; the
//   message alone can never suppress an uncaught exception (a stray match
//   must not swallow a real crash from our own code).
// - Every entry carries `owner` and `reason` — an allowlist entry without a
//   justification is a policy violation, not a convenience.
// - HA / third-party noise is recorded in the report, never failed on, so it
//   does NOT belong here; this list is for known, justified exceptions only.

export const CONSOLE_ALLOWLIST = [
  {
    // Known side effect of `serviceWorkers: 'block'` (playwright.config.mjs):
    // HA's app bundle expects the service worker it registers to exist and
    // dereferences it unguarded on a code path the blocked SW would have
    // satisfied. The throw is entirely inside HA's own frontend_latest bundle
    // — never our /local/ resource — and harmless to the features under test
    // (round 6 proved the dialog, keystrokes, and styling all work with it
    // present). Scoped to the exact message AND a frontend_latest source so
    // it can never mask a Nostrodomus-origin crash. Remove if HA stops throwing
    // or the harness stops blocking SWs.
    appliesTo: 'pageerror',
    pattern: "Cannot read properties of undefined (reading 'addEventListener')",
    source: /frontend_latest\/app\.[^/]*\.js/,
    owner: 'harness (RUN CHECKPOINT 2 round 6)',
    reason: 'HA frontend_latest/app.js dereferences the blocked service worker; SW block is the deterministic-session fix for the round-5 reload vanish.',
  },
];
