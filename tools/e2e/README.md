# Nostrodomus browser test harness

The browser suite runs the built bundle in a real Home Assistant frontend. A Home Assistant container is started from nothing, onboarded and seeded by script, and Playwright drives Chromium against it. The specs are in `tests/e2e/`, the scripts that prepare the instance are in this directory.

The unit tests under `tests/` run without a browser. This suite covers what they cannot: the real editor DOM, the real CodeMirror, and the browser console.

## Requirements

- Docker with the compose plugin (`docker compose`), able to pull `homeassistant/home-assistant`.
- Node 22 or newer. The scripts use Node's built-in WebSocket client.
- The project's dev dependencies and a Chromium for Playwright:

  ```bash
  npm ci
  npx playwright install chromium
  ```

- Port 8124 free on the machine that runs the tests.
- A POSIX shell for `npm run e2e:beta`, which sets environment variables inline.

## Running the suite

```bash
python3 tools/build.py   # only if src/ changed: the suite tests dist/nostrodomus.js
npm run e2e:up           # start Home Assistant, onboard it, seed it
npm run e2e              # run the specs in Chromium
npm run e2e:firefox      # run the specs in Firefox (needs `npx playwright install firefox`)
npm run e2e:down         # stop the container
```

`npm run e2e:up` can be run again at any time. It leaves an onboarded instance as it is and seeds it again. Run it after every rebuild of the bundle; the specs refuse to run against an older copy (see "Stale-resource guard").

A single spec:

```bash
npx playwright test --config tests/e2e/playwright.config.mjs tests/e2e/ha-boots.spec.mjs
```

Playwright writes traces, screenshots, videos and an HTML report to `tests/e2e/.playwright/`.

The browser tests are not part of CI. They need Docker, a Playwright browser and the time for Home Assistant to start.

## The test instance

`docker-compose.yml` starts one container, `nostrodomus-e2e-ha`, from `homeassistant/home-assistant:${HA_TAG:-stable}` on its own compose network.

- Host port 8124 maps to the container's 8123. The harness does not use port 8123, so it cannot collide with a Home Assistant that already runs on the machine.
- The configuration directory is a bind mount of `tools/e2e/.ha-state/config/`.
- Only one instance can run at a time: the port and the container name are fixed.

### State directory

Everything the instance and the scripts keep is under `tools/e2e/.ha-state/`, which git ignores:

| Path | Content |
| --- | --- |
| `config/` | The Home Assistant configuration directory |
| `config/www/nostrodomus.js` | The seeded copy of the bundle |
| `token` | Long-lived access token for the scripts |
| `hass-tokens.json` | Access and refresh token for the frontend |
| `owner-credentials.json` | Name and random password of the test user |
| `resource-stamp.json` | What the last seed registered (see below) |

The files with secrets are written with mode 0600. The scripts never print a token or password; log lines show the first six characters and the length.

To start over, stop the container, delete the directory and run `npm run e2e:up`:

```bash
npm run e2e:down
rm -rf tools/e2e/.ha-state
npm run e2e:up
```

`ensure_state.mjs` runs first in `e2e:up` and creates the directory, including `config/www/`, before Docker starts. Without that, Docker would create the missing bind source as root, and Home Assistant serves `/local/` only if `config/www` exists when it boots. The script also writes a `configuration.yaml` that lists the default integrations without zeroconf, ssdp, dhcp, usb and bluetooth, which cannot start on the container's bridge network. An existing `configuration.yaml` is left alone.

### Onboarding (`bootstrap.mjs`)

The script uses Home Assistant's onboarding API. No browser and no manual step is involved.

1. Wait until `GET /api/onboarding` answers.
2. `POST /api/onboarding/users` creates the user `e2e_owner` with a random password and returns an auth code.
3. `POST /auth/token` exchanges the code for an access and a refresh token.
4. `POST /api/onboarding/core_config`, `/analytics` and `/integration` finish onboarding.
5. Over the WebSocket API, `auth/long_lived_access_token` issues the token the other scripts use.
6. The tokens are written to the state directory.

If onboarding is already complete and the token file exists, the script does nothing. If onboarding is complete and the token file is missing, or onboarding stopped halfway, it asks for the state directory to be deleted.

If Home Assistant changes the onboarding API so that this sequence fails, the script stops with the failing step and the response. The fix is to adapt the script; there is no fallback through the login form.

### Seeding (`seed.mjs`)

1. Copy `dist/nostrodomus.js` to `config/www/nostrodomus.js` and check that the instance serves the same bytes.
2. Register the file as a dashboard resource of type `module`, or update the existing entry, with the URL `/local/nostrodomus.js?v=<internal_version>-<nonce>`. The nonce is new on every run.
3. Create helpers: two `input_boolean` entities for the cards, 800 more plus `input_boolean.zzz_marker` to exceed the entity row limit, and two areas.
4. Create the dashboard `e2e-test` in storage mode and save its configuration: a view `home` with an entities card, a markdown card and a button card, and a view `sections` with a grid section.
5. Create a long script (`e2e_long_script`) and a long automation (`e2e_long_automation`) for the specs that test the editors outside the card dialog.
6. Write `resource-stamp.json` with the internal version, the nonce, the URL, the SHA-256 of the bundle and the paths of the dashboard, the script editor and the automation editor.

The script can run repeatedly: it creates what is missing and overwrites the resource entry, the dashboard configuration, the script and the automation.

The harness owns its dashboard and never uses Home Assistant's default one. Since Home Assistant 2026.6 the built-in overview does not load custom dashboard resources, and the old default dashboard no longer exists (`docs/COMPAT.md`). The specs open the dashboard by the path stored in the stamp, `/e2e-test/home`, and never by `/`.

## How the specs run

`tests/e2e/playwright.config.mjs`: Chromium, one worker, no retries, 60 seconds per test, `test.only` forbidden. A test that fails once fails the run; stability comes from waiting for explicit signals of the page, not from repetition. Every run records video; traces and screenshots are kept for failures. `tests/e2e/playwright.firefox.config.mjs` runs the same specs with the same settings in Firefox.

Service workers are blocked. In a fresh browser profile Home Assistant's service worker installs on the first visit and reloads the page a few seconds later, which closes an open edit dialog in the middle of a test. Blocking it also removes one way of serving an old file.

Specs import `test` and `expect` from `tests/e2e/session.mjs` and get three things automatically:

- Sign-in. An init script writes the tokens from `hass-tokens.json` into `localStorage` under `hassTokens` before the first page of the instance loads. The login form is never used.
- A navigation log. Every navigation of the main frame is recorded and attached to the report as `navigation-log.json`. An entry that no `goto()` asked for shows that the page reloaded by itself.
- Console capture, see below.

`openDashboard(page)` opens the seeded dashboard and runs the stale-resource guard. Every spec starts with it.

### Stale-resource guard

A browser test that silently runs an old bundle proves nothing. Before a spec does anything else, `openDashboard` checks against `resource-stamp.json`:

1. Every request the page made for `nostrodomus.js` ends with exactly `?v=<internal_version>-<nonce>` from the stamp.
2. Home Assistant has exactly one registered resource for `nostrodomus.js`, and its URL is the one in the stamp.

A mismatch fails the test with a message that starts with `STALE RESOURCE`. The seed script fails with the same prefix when the instance does not serve the bytes it just copied. In both cases run `npm run e2e:up` again.

### Console policy

The console of every test is collected for its whole duration by `tests/e2e/console-capture.mjs`, attached to the report as `console-capture.json` and judged when the test ends:

- An uncaught page error fails the test.
- A `console.error` fails the test.
- A `console.warn` fails the test only if its text contains a Nostrodomus marker. Warnings from Home Assistant and from other cards are recorded and not judged.

Exceptions are listed in `tests/e2e/console-allowlist.mjs`. An entry matches an exact string or an anchored regular expression and has an `owner` and a `reason` field. A page error can be excused only by an entry with `appliesTo: 'pageerror'` and a `source` pattern that matches the stack, so a message alone can never hide an exception from Nostrodomus code. The entries cover an error inside Home Assistant's own bundle that is a side effect of blocking service workers, in the wording of Chromium and of Firefox, Firefox's second report of it, and the missing WebGL of headless Firefox.

## Another Home Assistant version

Two environment variables select the image and the state directory:

- `HA_TAG`: the image tag. The default is `stable`.
- `HA_STATE`: the name of the state directory inside `tools/e2e/`. The default is `.ha-state`. Other names must have the form `.ha-state-<name>` with lower-case letters, digits and dashes.

Use a separate state directory per version. A newer Home Assistant migrates its configuration directory, and an older one may not start from it afterwards.

`npm run e2e:beta` runs the whole cycle against the `beta` tag with `.ha-state-beta`: prepare the directory, start the container, onboard, seed, run the specs.

For any other tag, stop the running instance and run the same steps with both variables set:

```bash
npm run e2e:down
export HA_TAG=2026.11.1
export HA_STATE=.ha-state-2026-11-1
node tools/e2e/ensure_state.mjs
docker compose -f tools/e2e/docker-compose.yml up -d --wait
node tools/e2e/bootstrap.mjs
node tools/e2e/seed.mjs
npx playwright test --config tests/e2e/playwright.config.mjs
npm run e2e:down
```

`.gitignore` covers every state directory (`tools/e2e/.ha-state*/`). They contain tokens and must not be committed.

## Files

| File | Role |
| --- | --- |
| `tools/e2e/docker-compose.yml` | The Home Assistant container |
| `tools/e2e/ensure_state.mjs` | Creates the state directory before Docker starts |
| `tools/e2e/ha_api.mjs` | Shared code of the scripts: paths, redaction, HTTP and WebSocket client |
| `tools/e2e/bootstrap.mjs` | Onboarding and tokens |
| `tools/e2e/seed.mjs` | Bundle copy, resource, helpers, dashboard, script, automation, stamp |
| `tests/e2e/playwright.config.mjs` | Runner configuration |
| `tests/e2e/playwright.firefox.config.mjs` | The same configuration for Firefox |
| `tests/e2e/session.mjs` | Sign-in, navigation log, console capture, stale-resource guard |
| `tests/e2e/console-capture.mjs` | Console collection and the failure policy |
| `tests/e2e/console-allowlist.mjs` | Justified console exceptions |
| `tests/e2e/selectors.mjs` | Named selectors for the specs |
| `tests/e2e/editor-helpers.mjs` | Shared steps: edit mode, card dialog, code editor, suggestion list |
| `tests/e2e/*.spec.mjs` | The specs, one file per area |

Nothing under `src/` imports from `tools/e2e/` or `tests/e2e/`.
