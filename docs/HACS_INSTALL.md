# Nostrodomus HACS/plugin layout

How the repository is packaged as a HACS dashboard plugin (a frontend resource). The installation steps for users are in [README.md](../README.md#installation).

## Bundle file

```text
dist/nostrodomus.js
```

This single file is the browser resource. It is built from `src/main.js` and committed, so HACS can serve it from the repository without a build step.

## HACS metadata

`hacs.json` in the repository root:

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

There is no `version` field in `hacs.json`. HACS takes the version from GitHub releases and tags, or from the default branch commit when no release exists.

## Build and release verification

```bash
npm ci
python3 tools/build.py
python3 tools/verify.py
python3 tools/verify.py --release
```

Release verification requires `reports/BUILD_LAST.txt`, written by `tools/build.py`, to match the current source, the dist file, the project version, the package version, and the internal runtime version.

## What build and verify do not touch

Build and verify do not write to:

```text
/config/www
/config/custom_components
/config/.storage/lovelace_resources
```

To test a build on a Home Assistant instance by hand, copy the verified `dist/nostrodomus.js` to the `www` folder of that instance and change the cache string of the resource URL (for example `/local/nostrodomus.js?v=2`).

## Runtime API

The runtime exposes one public namespace, with no aliases:

```js
window.__nostrodomus
```
