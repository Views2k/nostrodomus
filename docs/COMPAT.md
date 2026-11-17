# Compatibility

## Requirements

| | |
|---|---|
| Home Assistant | 2026.6.0 or newer (`homeassistant` in `hacs.json`) |
| Installer | The Marketplace built into Home Assistant 2026.11 and later, HACS 2.0.0 or newer on earlier versions (`hacs` in `hacs.json`), or manual resource registration |

Nostrodomus is a frontend resource. It has no backend component and needs no Home Assistant restart.

## What the automated browser tests cover

The browser test suite (`npm run e2e`, described in `tools/e2e/README.md`) loads the built plugin in Chromium against a disposable Home Assistant container. It exercises the dashboard card editor, the automation and script YAML editors, and the template editor of Developer Tools.

| Home Assistant | Nostrodomus | Browser | Result |
|---|---|---|---|
| 2026.11.1 | 0.1.282 | Chromium | 104 passed, 2 skipped |
| 2026.6.4 | 0.1.282 | Chromium | 104 passed, 2 skipped |
| 2026.11.1 | 0.1.278 | Firefox 159 | 40 passed, 15 failed, 2 skipped |

The two skipped tests are one syntax coloring case, once for the automation editor and once for the script editor, that the test setup cannot reproduce yet.

Chromium-based browsers are supported. Firefox is not supported yet. The plugin loads and suggests there, but while you type in the editor Firefox delivers some key presses to the page instead of the editor, and Home Assistant's single-letter shortcuts (for example `e` for the entity search) can open in the middle of a word. Use a Chromium-based browser. The Firefox run (`npm run e2e:firefox`) fails in the tests that type longer text, for that reason. Safari is not tested.

2026.6.0 is the minimum version declared in `hacs.json`. The suite is run against that Home Assistant line (2026.6.4 for this release) and against the current stable image.

## Home Assistant behavior to know

### Custom resources are loaded by the dashboards you created

Home Assistant loads custom Lovelace resources when a dashboard that you created is opened. Its built-in Overview at `/home` does not load them, even when the resource is registered, and the browser tests check this on every run (`tests/e2e/ha-boots.spec.mjs`). The other built-in dashboards (Lights, Security, Climate, Energy, Maintenance) may not load them either; the tests do not cover them.

Nostrodomus is therefore active once a dashboard you created has been opened in the browser tab. From then on it also works in the other editors listed in [DOCUMENTATION.md](../DOCUMENTATION.md#supported-editors-and-surfaces) (automation, script, Developer Tools) in that tab. After a page reload on one of those pages, open a dashboard you created once and go back.

### Developer Tools moved in 2026.11

Home Assistant 2026.11 moved Developer Tools from the sidebar into Settings, where it is named Tools. Nostrodomus supports the template editor in both places.

### There is no default Lovelace dashboard slot

Since Home Assistant 2026.6 a dashboard configuration saved without a target dashboard is not shown anywhere, and `/lovelace/*` URLs lead to the built-in Overview. Tooling that needs a dashboard has to create one and save the configuration to that dashboard's URL path. The browser tests create their own dashboard for this reason (`tools/e2e/seed.mjs`).
