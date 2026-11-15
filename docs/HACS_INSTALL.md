# Nostrodomus HACS/plugin layout

How the repository is packaged as a dashboard plugin (a frontend resource) for HACS and for the Marketplace built into Home Assistant 2026.11 and later. The installation steps for users are in [README.md](../README.md#installation).

## Bundle file

```text
dist/nostrodomus.js
```

This single file is the browser resource. It is built from `src/main.js` and committed. Each GitHub release carries the same file as the asset `nostrodomus.js`, and that asset is what HACS and the Marketplace download. If a release has no such asset, they take `dist/nostrodomus.js` from the tagged tree.

They write it to `www/community/nostrodomus/nostrodomus.js` in the Home Assistant configuration folder. The Marketplace serves it as `/local/community/nostrodomus/nostrodomus.js`, HACS 2.0 as `/hacsfiles/nostrodomus/nostrodomus.js`, and on dashboards managed in the UI the resource is registered with a version query that changes with each update.

## HACS metadata

`hacs.json` in the repository root:

```json
{
  "name": "Nostrodomus",
  "render_readme": true,
  "filename": "nostrodomus.js",
  "homeassistant": "2026.6.0",
  "hacs": "2.0.0"
}
```

`filename` is a file name, not a path, and `content_in_root` is not set. With `content_in_root` the installers look only in the repository root, and with a path in `filename` they download nothing. `tools/verify.py` checks both rules.

HACS and the Marketplace read `hacs.json` from the release tag they install, so a change to it reaches users with the next release.

There is no `version` field in `hacs.json`. The version offered is the tag of the latest GitHub release (`v` followed by the version, for example `v0.1.280`), or the default branch commit when no release exists.

## Release

A release is a full GitHub release, not only a tag, with `dist/nostrodomus.js` attached under the name `nostrodomus.js`. The workflow `.github/workflows/validate.yml` runs HACS's own repository validation on every push, on pull requests and once a day; it has to pass before a release is published.

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
