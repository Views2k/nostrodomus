# Nostrodomus E2E harness — the contract (HARNESS P0 design lock)

Real-HA, real-browser end-to-end testing. This file is the binding design; the
implementation (P1) must match it or this file must change first.

## Execution split

- The **build container** is where everything here is written. It has no Docker, no
  general network and no browser binaries, so E2E never runs there.
- The **host** executes every run at the work order's
  **[RUN CHECKPOINT]** lines and pastes output back. A POSIX shell (WSL/bash)
  is assumed for the npm aliases; checkpoint 0 verifies this.
- No E2E result exists until a checkpoint output says so.

## Test instance

- Image: `homeassistant/home-assistant:${HA_TAG:-stable}` (the `e2e:beta`
  canary sets `HA_TAG=beta`).
- Isolated compose network; **port 8124 → container 8123**. Never 8123 on the
  host — the real instance owns that port and must never be touched.
- Config dir bind-mounted from `tools/e2e/.ha-state/config/` (gitignored).
  The beta canary uses a separate `tools/e2e/.ha-state-beta/` so a beta HA
  never migrates the stable state dir forward.
- One instance at a time (same host port); `npm run e2e:down` before
  switching tags.
- Disposable by contract: `rm -rf tools/e2e/.ha-state` + `npm run e2e:up`
  must reach ready from nothing, unattended.
- `e2e:up`/`e2e:beta` begin with `tools/e2e/ensure_state.mjs`, which
  pre-creates the state dir (including `config/www/`) HOST-owned before
  compose runs. Two reasons: Docker would otherwise create a missing bind
  source as root (breaking host-side seeding and `rm -rf` disposability), and
  HA only registers the `/local/` static path if `config/www` exists at first
  boot.

## Bootstrap — fully automated onboarding (tools/e2e/bootstrap.mjs)

Sequence (HA's documented onboarding HTTP API; no UI, no interaction):

1. Poll `GET http://localhost:8124/api/onboarding` until it answers 200
   (container ready). If onboarding is already complete (step list says so or
   401 with an existing `.ha-state/token`), bootstrap is a **no-op** —
   idempotency contract.
2. `POST /api/onboarding/users` — create the test owner
   (`client_id: http://localhost:8124/`, name/username `e2e_owner`, a random
   per-bootstrap password, language `en`) → returns `auth_code`.
3. `POST /auth/token` (`grant_type=authorization_code`, the code, same
   `client_id`) → access + refresh tokens.
4. `POST /api/onboarding/core_config` (Bearer) → done.
5. `POST /api/onboarding/analytics` (Bearer) → done.
6. `POST /api/onboarding/integration` (Bearer, `client_id` + `redirect_uri`)
   → finalizes onboarding.
7. Open `ws://localhost:8124/api/websocket`, authenticate with the access
   token, send `auth/long_lived_access_token` (`client_name: nostrodomus-e2e`,
   `lifespan: 3650`) → the long-lived token (LLAT) used by all API tooling.
8. Write gitignored state:
   - `.ha-state/token` — the LLAT (file mode 0600),
   - `.ha-state/hass-tokens.json` — `{hassUrl, clientId, access_token,
     refresh_token, expires, expires_in}` for frontend auth seeding,
   - `.ha-state/owner-credentials.json` — the random owner password
     (debug-only convenience).

**HARD boundary (zero attempts):** if HA has changed the onboarding flow such
that this documented API sequence fails, STOP and park with
`reports/HARNESS_BLOCKED.md`. No manual-click fallbacks, no committed tokens,
no auth-model weakening.

**Redaction rule:** no script ever prints a token/password value — only
`<first 6 chars>…(<length>)`. Checkpoint paste-backs must contain no secrets.

## Resource seeding (tools/e2e/seed.mjs)

1. Copy the repo's current `dist/nostrodomus.js` into the bind mount
   at `config/www/nostrodomus.js`.
2. Register it in storage-mode Lovelace resources (WS
   `lovelace/resources/list` → `update` the existing nostrodomus entry or
   `create`; the host deploy script's bump logic is the prior art) as
   `type: module`.
3. **Stale-resource guard stamp (non-optional):** the registered URL is
   `/local/nostrodomus.js?v=<internal_version>-<nonce>` with a fresh
   nonce per seed run. Seed writes `.ha-state/resource-stamp.json`
   (`{internalVersion, nonce, url, distSha256, dashboardPath}`). Every spec session asserts,
   before anything else, that (a) the nostrodomus.js request the
   page actually made carries exactly this stamp, and (b) the registered
   resource URL equals the stamp. Any mismatch (old version, old nonce) fails
   the suite immediately with a distinct `STALE RESOURCE` message. A
   real-browser test silently exercising old JS is worse than no test.
4. Demo entities: two `input_boolean` helpers via WS (`input_boolean/create`,
   list-first idempotent).
5. One **owned** storage-mode dashboard: `lovelace/dashboards/create`
   (`url_path: e2e-test` — HA requires a hyphen — `mode: storage`,
   `show_in_sidebar: true`; list-first idempotent), then
   `lovelace/config/save` targeted at that `url_path`
   (overwrite-idempotent) with an `entities` card (the demo booleans), a
   `markdown` card, and a `button` card. **Never the legacy default-Lovelace
   slot:** HA 2026.6 removed it — an untargeted `config/save` lands in a
   dashboard that no longer exists and `/lovelace/*` is not routed
   (docs/COMPAT.md). The dashboard path (`/e2e-test/home`) rides in the
   stamp as `dashboardPath`.

## Runner + frontend auth

- Playwright `@playwright/test`, **chromium only** (until launch), runs on the
  host against `http://localhost:8124`.
- Frontend auth: **localStorage `hassTokens` seeding** (an init script writes
  the bootstrap's `{access_token, refresh_token, clientId, hassUrl, …}` before
  first navigation). Why this and not the `?auth_callback` token flow: token
  seeding is deterministic and headless-safe and skips the auth UI entirely,
  so specs never depend on the login form's DOM; the callback flow exercises
  HA's auth redirect machinery we don't own and adds a navigation roundtrip
  per session. (If HA changes the storage shape, that is a canary signal, not
  something to paper over.)
- Specs navigate to the seeded dashboard by its **explicit URL**, read from
  the stamp's `dashboardPath` (`/e2e-test/home` — the owned dashboard, seed
  view path `home`). Never `/` (HA 2026.6 made the separate `/home` built-in
  overview the default landing panel, so the root target is HA's choice, not
  ours) and never the legacy default-Lovelace slot (removed in 2026.6).
  Built-in dashboards also do not load custom Lovelace resources — pinned by
  the compat canary test in `ha-boots.spec.mjs` (docs/COMPAT.md).
- `retries: 0` — flaky-by-design is forbidden; stability comes from explicit
  waits on HA-ready signals (e.g. `hass` connection state, dialog visibility),
  not retries. Trace on first failure; `video: 'on'` for every run.
- **Service workers are blocked** (`serviceWorkers: 'block'`): HA's SW
  installs on first visit in every fresh test profile and **reloads the page
  on activation** (~4s after registration), killing open dialogs mid-spec
  (RUN CHECKPOINT 2 round 5, proven from both traces). Humans never see it —
  settled profiles. Blocking also removes an SW-cache stale-asset vector.
- Every session attaches `navigation-log.json` (test-side `framenavigated`
  listener — survives reloads): a navigation entry between commanded
  `goto()` calls is a spontaneous-reload smoking gun.
- Console capture is the harness's core value (the detector for the
  green-gates/broken-browser class). Per session, collected for the whole run:
  - `pageerror` → **always fail**;
  - `console.error` → **fail unless allowlisted**;
  - `console.warn` → collected and attached to the report; fails **only** for
    Nostrodomus-origin warnings or allowlist violations (HA and third-party cards
    are noisy; their warnings are recorded, not failed on).
  - Allowlist: `tests/e2e/console-allowlist.mjs` — exact-match or anchored
    regex per entry, each with an owner comment justifying it. A pageerror
    is suppressed ONLY by an entry with `appliesTo: 'pageerror'` AND a
    `source` RegExp matched against the error stack — a message alone can
    never swallow an uncaught exception from our own code. (Standing entry:
    HA's `frontend_latest/app.*.js` `addEventListener`-on-undefined throw,
    the known `serviceWorkers: 'block'` side effect.)

## Host prerequisites (one-time)

1. Docker Engine with the compose plugin (`docker compose`), able to pull
   `homeassistant/home-assistant`.
2. Node >= 22 for the e2e tooling — bootstrap/seed use Node's global
   WebSocket client, stable since 22 (checkpoint 0 verified v22.22.3; the
   repo's runtime floor stays Node >= 20 and the scripts preflight with a
   clear message).
3. `npm ci` then `npx playwright install chromium` — **host-side only**;
   never run `playwright install` in the build container.
4. Host port 8124 free.

## Commands (host cheat-sheet)

```bash
npm run e2e:up     # compose up (stable) + bootstrap + seed → ready instance
npm run e2e        # run the spec suite against it
npm run e2e:beta   # the monthly canary: same cycle against :beta (own state dir)
npm run e2e:down   # stop the instance (state dir persists; rm -rf to reset)
```

## File map (P1)

| File | Role |
| --- | --- |
| `tools/e2e/docker-compose.yml` | the disposable HA instance (HA_TAG/HA_STATE-parameterized) |
| `tools/e2e/ensure_state.mjs` | host-owned state-dir preflight (runs before compose) |
| `tools/e2e/ha_api.mjs` | shared host-side plumbing: paths, redaction, HTTP, WS client |
| `tools/e2e/bootstrap.mjs` | automated onboarding → tokens → LLAT → state files |
| `tools/e2e/seed.mjs` | dist copy + stamped resource + helpers + dashboard + stamp file |
| `tests/e2e/playwright.config.mjs` | runner config (chromium, retries 0, trace on failure) |
| `tests/e2e/session.mjs` | per-spec session: auth seeding, console fixture, stale-resource guard |
| `tests/e2e/console-capture.mjs` | the console failure-policy detector |
| `tests/e2e/console-allowlist.mjs` | justified exceptions only (owner + reason per entry) |
| `tests/e2e/selectors.mjs` | named selectors for specs (interim home — HARNESS P3 re-homes the HA-internal block into `src/editor/haSelectors.js`, this file then re-exports) |
| `tests/e2e/editor-helpers.mjs` | shared choreography: edit mode, card edit dialog → YAML editor, popup helpers |
| `tests/e2e/ha-boots.spec.mjs` | the P1 smoke spec + 2026.6 built-in-overview compat canary (RUN CHECKPOINT 1) |
| `tests/e2e/startup-clean.spec.mjs` | P2.1 — clean boot: API handle installed, runtimeErrors surface clean |
| `tests/e2e/editor-completion.spec.mjs` | P2.2 — real-CodeMirror completion: type → suggest, Ctrl+Space, Escape, accept |
| `tests/e2e/settings-panel.spec.mjs` | P2.3 — settings via the popup gear: tabs, drag, value persistence |
| `tests/e2e/editor-styling.spec.mjs` | P2.4 — host-owned codebox chrome + 3s scrollHeight stability |
| `tests/e2e/live-data.spec.mjs` | P2.5 — seeded `window.customCards` + real service fields reach completion |

## Boundaries

- Nothing in `src/` may import from `tools/e2e/` or `tests/e2e/`.
- `tools/e2e/.ha-state*/` is gitignored; no secrets are ever committed.
- The suite stays SMALL and high-signal (five named specs — see HARNESS P2);
  E2E breadth is a tax, E2E depth on boot paths is the value.
