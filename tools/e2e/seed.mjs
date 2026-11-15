// Seed the e2e instance (see tools/e2e/README.md):
// 1. copy dist/nostrodomus.js to config/www/ and check that the instance serves the same bytes,
// 2. register it as a dashboard resource with the URL `?v=<internal_version>-<nonce>`,
// 3. create the helpers and areas the specs use,
// 4. create the dashboard e2e-test and save its configuration,
// 5. save a long script and a long automation,
// 6. write resource-stamp.json for the stale-resource guard of the specs.
//
// It can run repeatedly: it creates what is missing and overwrites the resource entry, the
// dashboard configuration, the script, the automation and the stamp.

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

// 1. Copy the bundle into the bind mount.
const distPath = join(repoRoot, 'dist', 'nostrodomus.js');
if (!existsSync(distPath)) fail('dist/nostrodomus.js missing — build first (python3 tools/build.py).');
const distBytes = readFileSync(distPath);
const distSha256 = createHash('sha256').update(distBytes).digest('hex');
mkdirSync(paths.www, { recursive: true });
copyFileSync(distPath, join(paths.www, 'nostrodomus.js'));

// The resource URL carries the internal version and a nonce that is new on every run.
const project = JSON.parse(readFileSync(join(repoRoot, 'PROJECT.json'), 'utf8'));
const internalVersion = project.internal_version;
const nonce = randomBytes(8).toString('hex');
const url = `${RESOURCE_PATH}?v=${internalVersion}-${nonce}`;

// The instance must serve exactly the bytes just copied, so that the registered URL is known to
// load this bundle.
const served = await fetch(`${BASE_URL}${url}`, { signal: AbortSignal.timeout(20000) });
if (!served.ok) {
  fail(`STALE RESOURCE: GET ${url} returned ${served.status} — /local/ is not serving the seeded file (was config/www present at first HA boot?).`);
}
const servedSha256 = createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex');
if (servedSha256 !== distSha256) {
  fail(`STALE RESOURCE: served bytes (${servedSha256.slice(0, 12)}…) != dist (${distSha256.slice(0, 12)}…) — the instance is serving a different file than seed wrote.`);
}

// 2. Register the resource, or update the existing entry and remove duplicates.
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

// 3. Helpers and areas.
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

// More input_booleans than the 750 entity rows a query returns (SECURITY_LIMITS.maxRuntimeEntities).
// input_boolean.zzz_marker sorts after the 800 bulk_filler_* ids, so a spec finds it only when the
// typed prefix is applied before the cap. The first run creates them in 10 to 20 seconds.
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

// Areas for the area_id: completion. Devices belong to integrations and cannot be created over
// the WebSocket API, so the device_id: spec checks for an empty list without an error.
const DEMO_AREAS = ['E2E Living Room', 'E2E Kitchen'];
const existingAreas = new Set((await ws.call({ type: 'config/area_registry/list' }) || []).map((a) => a.name));
for (const name of DEMO_AREAS) {
  if (existingAreas.has(name)) { log(`area exists: ${name}`); continue; }
  await ws.call({ type: 'config/area_registry/create', name });
  log(`area created: ${name}`);
}

// 4. The harness's own dashboard. Since Home Assistant 2026.6, `lovelace/config/save` without a
// url_path saves to a dashboard that is not shown, `/lovelace/*` is not routed, and `/home` and the
// other built-in dashboards do not load custom resources (docs/COMPAT.md).
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
          // Several lines, so that the template field of the markdown visual editor (a CodeMirror
          // inside ha-selector-template / ha-form) is at least 80 px tall, the minimum height of a
          // codebox. The companion-form-field-guard spec checks that it is still not treated as
          // the dialog's code editor.
          { type: 'markdown', content: '## Nostrodomus E2E\n\nSeeded dashboard for the e2e harness.\n\n- line one\n- line two\n- line three\n- line four\n- line five\n- line six\n- line seven\n- line eight' },
          { type: 'button', entity: DEMO_HELPERS[0].entityId, name: 'E2E Button' },
        ],
      },
      // A sections view, for the specs that edit a card inside a grid section.
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

// 5. A long script and a long automation for the specs of the editors outside the card dialog.
// The 40 steps make the CodeMirror content overflow, so the scroll checks have something to
// scroll. Saving to the same id overwrites the earlier version.
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

// 6. The stamp that the stale-resource guard of the specs checks.
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
