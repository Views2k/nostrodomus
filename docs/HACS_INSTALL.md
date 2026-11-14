# Nostrodomus HACS/plugin layout

This repository is prepared as a HACS dashboard/plugin-style frontend resource for **Nostrodomus**.

## Active build artifact

```text
dist/nostrodomus.js
```

The artifact file name remains compatibility-oriented. The public project name is **Nostrodomus**.

## HACS metadata

```text
hacs.json
```

Current frontend plugin metadata:

```json
{
  "name": "Nostrodomus",
  "render_readme": true,
  "content_in_root": true,
  "filename": "dist/nostrodomus.js",
  "homeassistant": "2026.6.0",
  "hacs": "2.0.0"
}
```

There is no `version` field in `hacs.json`. HACS remote versioning is handled by GitHub releases/tags, or by the default branch commit when releases are not used.

## Build and release verification

```bash
npm install
python3 tools/build.py
python3 tools/verify.py
python3 tools/verify.py --release
```

Release verification requires `reports/BUILD_LAST.txt` to match the current source, dist, project version, package version, and internal runtime version.

## Deploy boundary

Build and verify do not write to:

```text
/config/www
/config/custom_components
/config/.storage/lovelace_resources
```

Manual Home Assistant testing should copy only the verified built dist file to the intended `/config/www/...` test resource path and then update the Lovelace resource URL cache string.

## Runtime API

Preferred public API:

```js
window.__nostrodomus
```

The runtime exposes exactly one global namespace (`window.__nostrodomus`) — there are
no compatibility aliases.
