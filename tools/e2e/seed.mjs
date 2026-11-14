// Seed the E2E instance (see tools/e2e/README.md):
// 1. copy the repo's current dist into the bind mount at config/www/,
// 2. register it as a storage-mode Lovelace module resource with the
//    STALE-RESOURCE GUARD stamp `?v=<internal_version>-<nonce>`,
// 3. verify the instance actually serves the bytes we just wrote,
// 4. create two input_boolean demo helpers (list-first idempotent),
// 5. create the OWNED storage-mode dashboard (url_path 'e2e-test',
//    list-first idempotent) and save the seeded config to it — never the
//    legacy default-Lovelace slot, which HA 2026.6 removed (docs/COMPAT.md),
// 6. write .ha-state/resource-stamp.json (incl. dashboardPath) for the
//    spec-side guard.
//
// Idempotent by construction: re-running refreshes the file, the stamp, and
// the dashboard, and leaves existing helpers alone.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  BASE_URL,
  HaWebSocket,
  fail,
  httpJson,
  log,
  readToken,
  requireGlobalWebSocket,
  statePaths,
} from './ha_api.mjs';

requireGlobalWebSocket();
const paths = statePaths();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const RESOURCE_PATH = '/local/nostrodomus.js';
// HA requires a hyphen in custom dashboard url_paths; the specs navigate to
// `/${DASHBOARD_URL_PATH}/home` via the stamp's dashboardPath.
const DASHBOARD_URL_PATH = 'e2e-test';
const DEMO_HELPERS = [
  { name: 'e2e demo one', entityId: 'input_boolean.e2e_demo_one' },
  { name: 'e2e demo two', entityId: 'input_boolean.e2e_demo_two' },
];

// 1. Copy dist into the bind mount.
const distPath = join(repoRoot, 'dist', 'nostrodomus.js');
if (!existsSync(distPath)) fail('dist/nostrodomus.js missing — build first (python3 tools/build.py).');
const distBytes = readFileSync(distPath);
const distSha256 = createHash('sha256').update(distBytes).digest('hex');
mkdirSync(paths.www, { recursive: true });
copyFileSync(distPath, join(paths.www, 'nostrodomus.js'));

// 2. Stale-resource guard stamp: internal version + fresh nonce per seed run.
const project = JSON.parse(readFileSync(join(repoRoot, 'PROJECT.json'), 'utf8'));
const internalVersion = project.internal_version;
const nonce = randomBytes(8).toString('hex');
const url = `${RESOURCE_PATH}?v=${internalVersion}-${nonce}`;

// 3. Verify the instance serves exactly the bytes we wrote (closes the
// "registered path maps to the seeded file" leg of the guard).
const served = await fetch(`${BASE_URL}${url}`, { signal: AbortSignal.timeout(20000) });
if (!served.ok) {
  fail(`STALE RESOURCE: GET ${url} returned ${served.status} — /local/ is not serving the seeded file (was config/www present at first HA boot?).`);
}
const servedSha256 = createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex');
if (servedSha256 !== distSha256) {
  fail(`STALE RESOURCE: served bytes (${servedSha256.slice(0, 12)}…) != dist (${distSha256.slice(0, 12)}…) — the instance is serving a different file than seed wrote.`);
}

// 4. Register/refresh the Lovelace resource, helpers, and dashboard over WS.
const ws = new HaWebSocket();
await ws.connect(readToken());

const resources = await ws.call({ type: 'lovelace/resources' });
const existing = (resources || []).filter((r) => String(r.url).split('?')[0] === RESOURCE_PATH);
if (existing.length > 0) {
  await ws.call({ type: 'lovelace/resources/update', resource_id: existing[0].id, res_type: 'module', url });
  log(`resource updated → ${url}`);
  for (const duplicate of existing.slice(1)) {
    await ws.call({ type: 'lovelace/resources/delete', resource_id: duplicate.id });
    log(`duplicate nostrodomus resource removed (${duplicate.id})`);
  }
} else {
  await ws.call({ type: 'lovelace/resources/create', res_type: 'module', url });
  log(`resource created → ${url}`);
}

const helpers = await ws.call({ type: 'input_boolean/list' });
for (const helper of DEMO_HELPERS) {
  const slug = helper.entityId.split('.')[1];
  if ((helpers || []).some((h) => h.id === slug)) {
    log(`helper exists: ${helper.entityId}`);
  } else {
    await ws.call({ type: 'input_boolean/create', name: helper.name });
    log(`helper created: ${helper.entityId}`);
  }
}

// 4b. Bulk entities to exceed the maxRuntimeEntities=750 per-query cap, so the prefix-first sourcing
// fix (0.1.179) is testable: a late-alphabet id (input_boolean.zzz_marker) is reachable ONLY if the
// query prefix-filters BEFORE the 750 cap — a flat alphabetical top-750 would drop it behind the 800
// bulk_filler_* ids. Idempotent (the first reseed creates them, ~10-20s; later runs skip existing).
const BULK_COUNT = 800;
const existingBooleans = new Set((await ws.call({ type: 'input_boolean/list' }) || []).map((h) => h.id));
let bulkCreated = 0;
for (let i = 0; i < BULK_COUNT; i++) {
  const n = String(i).padStart(4, '0');
  if (existingBooleans.has(`bulk_filler_${n}`)) continue;
  await ws.call({ type: 'input_boolean/create', name: `bulk filler ${n}` });
  bulkCreated += 1;
}
if (!existingBooleans.has('zzz_marker')) { await ws.call({ type: 'input_boolean/create', name: 'zzz marker' }); bulkCreated += 1; }
log(`bulk entities: ${bulkCreated} created (>${BULK_COUNT} input_booleans total, exceeding the 750 cap; late-alphabet marker input_boolean.zzz_marker present)`);

// 4c. Areas for the registry value lane (area_id: completion, 0.1.180). Idempotent (list-first).
// Devices are integration-owned and NOT createable over WS, so device_id: is covered fail-dark
// (empty rows, no error) rather than by name; area_id: is covered by real seeded area names.
const DEMO_AREAS = ['E2E Living Room', 'E2E Kitchen'];
const existingAreas = new Set((await ws.call({ type: 'config/area_registry/list' }) || []).map((a) => a.name));
for (const name of DEMO_AREAS) {
  if (existingAreas.has(name)) { log(`area exists: ${name}`); continue; }
  await ws.call({ type: 'config/area_registry/create', name });
  log(`area created: ${name}`);
}

// 5. Owned dashboard. HA 2026.6 removed the legacy default-Lovelace slot:
// `lovelace/config/save` without a target saves into a dashboard that no
// longer exists, `/lovelace/*` is not routed, and `/home` plus the other
// built-ins do not load custom Lovelace resources (docs/COMPAT.md). The
// harness therefore owns its dashboard outright and never depends on HA's
// default.
const dashboards = await ws.call({ type: 'lovelace/dashboards/list' });
const dashboard = (dashboards || []).find((d) => d.url_path === DASHBOARD_URL_PATH);
if (dashboard) {
  log(`dashboard exists: /${DASHBOARD_URL_PATH}`);
} else {
  await ws.call({
    type: 'lovelace/dashboards/create',
    url_path: DASHBOARD_URL_PATH,
    mode: 'storage',
    title: 'Nostrodomus E2E',
    icon: 'mdi:test-tube',
    show_in_sidebar: true,
    require_admin: false,
  });
  log(`dashboard created: /${DASHBOARD_URL_PATH} (storage mode, in sidebar)`);
}

await ws.call({
  type: 'lovelace/config/save',
  url_path: DASHBOARD_URL_PATH,
  config: {
    title: 'Nostrodomus E2E',
    views: [
      {
        title: 'Home',
        path: 'home',
        cards: [
          {
            type: 'entities',
            title: 'E2E Demo Entities',
            entities: DEMO_HELPERS.map((h) => h.entityId),
          },
          // Multi-line content so the markdown VISUAL editor's template field (a CodeMirror
          // inside ha-selector-template / ha-form) renders tall enough (>=80px) to clear the
          // codebox size gate — the companion-form-field-guard spec then asserts it is STILL
          // not treated as the codebox (a form-field editor is not the dialog's main editor).
          { type: 'markdown', content: '## Nostrodomus E2E\n\nSeeded dashboard for the e2e harness.\n\n- line one\n- line two\n- line three\n- line four\n- line five\n- line six\n- line seven\n- line eight' },
          { type: 'button', entity: DEMO_HELPERS[0].entityId, name: 'E2E Button' },
        ],
      },
      // A Sections-layout view so the section-card preview-fill fix (0.1.138/9) is testable: editing a
      // card inside a grid section is the surface where the preview collapsed to near-zero width.
      {
        title: 'Sections',
        path: 'sections',
        type: 'sections',
        sections: [
          {
            type: 'grid',
            cards: [
              { type: 'entities', title: 'E2E Section Entities', entities: DEMO_HELPERS.map((h) => h.entityId) },
            ],
          },
        ],
      },
    ],
  },
});
log(`dashboard config saved (/${DASHBOARD_URL_PATH}/home, overwrite-idempotent)`);
ws.close();

// 5b. Seed a long script + automation so the PANEL editors have real, scroll-forcing content
// (a surface the card-dialog-only specs do not reach). Created over the REST config API (default_config
// provides the script/automation integrations). The long step list forces the CodeMirror scroller
// to overflow, so the bottom-corner-clearance / scroll assertions have teeth. Idempotent: POST to
// the same id overwrites.
const restToken = readToken();
const SCRIPT_OBJECT_ID = 'e2e_long_script';
const AUTOMATION_ID = 'e2e_long_automation';
const longSteps = Array.from({ length: 40 }, (_, i) => ({
  service: 'input_boolean.toggle',
  target: { entity_id: DEMO_HELPERS[i % DEMO_HELPERS.length].entityId },
}));
const scriptRes = await httpJson('POST', `/api/config/script/config/${SCRIPT_OBJECT_ID}`, {
  token: restToken,
  json: { alias: 'E2E Long Script', mode: 'single', sequence: longSteps },
});
if (!scriptRes.ok) fail(`script seed failed (${scriptRes.status}) for ${SCRIPT_OBJECT_ID}: ${String(scriptRes.text || '').slice(0, 200)}`);
log(`script seeded: /config/script/edit/${SCRIPT_OBJECT_ID} (${longSteps.length} steps)`);
const automationRes = await httpJson('POST', `/api/config/automation/config/${AUTOMATION_ID}`, {
  token: restToken,
  json: {
    alias: 'E2E Long Automation',
    mode: 'single',
    trigger: [{ platform: 'state', entity_id: DEMO_HELPERS[0].entityId }],
    condition: [],
    action: longSteps,
  },
});
if (!automationRes.ok) fail(`automation seed failed (${automationRes.status}) for ${AUTOMATION_ID}: ${String(automationRes.text || '').slice(0, 200)}`);
log(`automation seeded: /config/automation/edit/${AUTOMATION_ID} (${longSteps.length} actions)`);

// 6. Write the stamp the spec-side guard asserts against.
writeFileSync(
  paths.resourceStamp,
  JSON.stringify(
    {
      internalVersion,
      nonce,
      url,
      distSha256,
      dashboardPath: `/${DASHBOARD_URL_PATH}/home`,
      scriptEditPath: `/config/script/edit/${SCRIPT_OBJECT_ID}`,
      automationEditPath: `/config/automation/edit/${AUTOMATION_ID}`,
      seededAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
log(`stamp written: ${paths.resourceStamp} (v=${internalVersion}-${nonce})`);
log('seed complete.');
