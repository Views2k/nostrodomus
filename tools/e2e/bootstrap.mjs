// Fully automated HA onboarding (see tools/e2e/README.md).
//
// Sequence: poll /api/onboarding → create owner → exchange auth code →
// core_config → analytics → integration → long-lived token via WebSocket →
// write gitignored state files. No UI, no interaction, no committed secrets.
//
// If HA has changed the onboarding flow such that this documented API
// sequence fails, the script exits with the failing step. There is no
// manual-click fallback and no auth weakening.
//
// Idempotency: onboarding already complete + token on disk → no-op.
// Onboarding complete but no token → the state is unusable; instruct reset.

import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  BASE_URL,
  CLIENT_ID,
  HaWebSocket,
  fail,
  httpJson,
  log,
  redact,
  requireGlobalWebSocket,
  statePaths,
  writeSecretFile,
} from './ha_api.mjs';

requireGlobalWebSocket();
const paths = statePaths();

// 1. Wait for the onboarding API (container may still be starting).
log(`waiting for ${BASE_URL}/api/onboarding …`);
let steps = null;
const deadline = Date.now() + 300000;
while (Date.now() < deadline) {
  try {
    const res = await httpJson('GET', '/api/onboarding');
    if (res.status === 200 && Array.isArray(res.data)) {
      steps = res.data;
      break;
    }
    // Onboarding API can 401/404 once onboarding is done on some versions.
    if (res.status === 401 || res.status === 404) {
      steps = [];
      break;
    }
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 2000));
}
if (!steps) fail('HA never answered /api/onboarding within 5 minutes — check `docker compose ps`/logs.');

const pendingSteps = steps.filter((s) => !s.done).map((s) => s.step);
if (steps.length === 0 || pendingSteps.length === 0) {
  if (existsSync(paths.token)) {
    log('onboarding already complete and token present — bootstrap is a no-op.');
    process.exit(0);
  }
  fail(
    `onboarding is already complete but ${paths.token} is missing — this state dir is unusable. ` +
      `Reset with: rm -rf ${paths.dir} && npm run e2e:up`,
  );
}
if (!pendingSteps.includes('user')) {
  fail(
    `onboarding is partially complete (pending: ${pendingSteps.join(', ')}) — a previous bootstrap was interrupted. ` +
      `Reset with: rm -rf ${paths.dir} && npm run e2e:up`,
  );
}
log(`onboarding pending steps: ${pendingSteps.join(', ')}`);

// 2. Create the test owner. Save the credentials BEFORE the call so an
// interruption never strands a user whose password we lost.
const password = randomBytes(24).toString('base64url');
writeSecretFile(
  paths.ownerCredentials,
  JSON.stringify({ username: 'e2e_owner', password, note: 'debug-only convenience; gitignored' }, null, 2),
);
const userRes = await httpJson('POST', '/api/onboarding/users', {
  json: { client_id: CLIENT_ID, name: 'e2e_owner', username: 'e2e_owner', password, language: 'en' },
});
if (!userRes.ok || !userRes.data?.auth_code) {
  fail(`POST /api/onboarding/users failed (${userRes.status}): ${userRes.text.slice(0, 300)}`);
}
log(`owner created (auth_code ${redact(userRes.data.auth_code)})`);

// 3. Exchange the auth code for access + refresh tokens.
const tokenRes = await httpJson('POST', '/auth/token', {
  form: { grant_type: 'authorization_code', code: userRes.data.auth_code, client_id: CLIENT_ID },
});
if (!tokenRes.ok || !tokenRes.data?.access_token) {
  fail(`POST /auth/token failed (${tokenRes.status}): ${tokenRes.text.slice(0, 300)}`);
}
const { access_token, refresh_token, expires_in } = tokenRes.data;
log(`token exchange ok (access ${redact(access_token)}, refresh ${redact(refresh_token)})`);

// 4–6. Finish the remaining onboarding steps.
for (const [step, body] of [
  ['core_config', {}],
  ['analytics', {}],
  ['integration', { client_id: CLIENT_ID, redirect_uri: `${CLIENT_ID}?auth_callback=1` }],
]) {
  const res = await httpJson('POST', `/api/onboarding/${step}`, { token: access_token, json: body });
  if (!res.ok) {
    fail(`POST /api/onboarding/${step} failed (${res.status}): ${res.text.slice(0, 300)}`);
  }
  log(`onboarding step done: ${step}`);
}

// 7. Long-lived access token over the WebSocket API.
const ws = new HaWebSocket();
const haVersion = await ws.connect(access_token);
const llat = await ws.call({ type: 'auth/long_lived_access_token', client_name: 'nostrodomus-e2e', lifespan: 3650 });
ws.close();
if (typeof llat !== 'string' || !llat) fail('auth/long_lived_access_token returned no token');
log(`long-lived token issued (${redact(llat)}) — HA ${haVersion}`);

// 8. Write gitignored state.
writeSecretFile(paths.token, `${llat}\n`);
writeSecretFile(
  paths.hassTokens,
  JSON.stringify(
    {
      hassUrl: BASE_URL,
      clientId: CLIENT_ID,
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in,
      expires: Date.now() + expires_in * 1000,
    },
    null,
    2,
  ),
);
log(`bootstrap complete: token + hass-tokens.json written under ${paths.dir} (mode 0600, gitignored).`);
