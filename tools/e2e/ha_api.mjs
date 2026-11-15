// Shared code of the e2e harness scripts (see tools/e2e/README.md). Runs on the host and is never
// imported from src/. Needs Node 22 or newer for the global WebSocket client.

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

export const BASE_URL = 'http://localhost:8124';
export const WS_URL = 'ws://localhost:8124/api/websocket';
// HA's IndieAuth client_id: must be a URL on the same host as the redirect.
export const CLIENT_ID = 'http://localhost:8124/';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Resolve the gitignored state dir (.ha-state or .ha-state-beta via HA_STATE). */
export function stateDir() {
  const name = process.env.HA_STATE || '.ha-state';
  if (!/^\.ha-state(-[a-z0-9-]+)?$/.test(name)) {
    fail(`HA_STATE must look like .ha-state or .ha-state-beta, got: ${name}`);
  }
  return join(HERE, name);
}

export function statePaths() {
  const dir = stateDir();
  return {
    dir,
    config: join(dir, 'config'),
    www: join(dir, 'config', 'www'),
    token: join(dir, 'token'),
    hassTokens: join(dir, 'hass-tokens.json'),
    ownerCredentials: join(dir, 'owner-credentials.json'),
    resourceStamp: join(dir, 'resource-stamp.json'),
  };
}

/** A secret as it may be logged: its first six characters and its length. */
export function redact(secret) {
  const s = String(secret ?? '');
  return s ? `${s.slice(0, 6)}…(${s.length})` : '(empty)';
}

export function fail(message) {
  console.error(`[nostrodomus-e2e] FAIL: ${message}`);
  process.exit(1);
}

export function log(message) {
  console.log(`[nostrodomus-e2e] ${message}`);
}

export function requireGlobalWebSocket() {
  if (typeof WebSocket === 'undefined') {
    fail('global WebSocket missing: the e2e scripts need Node 22 or newer.');
  }
}

export function readToken() {
  const { token } = statePaths();
  if (!existsSync(token)) {
    fail(`no token at ${token} — run \`npm run e2e:up\` (bootstrap) first.`);
  }
  return readFileSync(token, 'utf8').trim();
}

/** Write a file containing a secret with 0600 perms (chmod covers overwrite). */
export function writeSecretFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** JSON fetch helper with timeout and a one-line error surface. */
export async function httpJson(method, path, { token, json, form } = {}) {
  const headers = {};
  let body;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body: leave data null, keep text for errors */
  }
  return { status: response.status, ok: response.ok, data, text };
}

/**
 * Minimal HA WebSocket session over the Node >= 22 global WebSocket.
 * Authenticates, then runs commands sequentially with incrementing ids.
 */
export class HaWebSocket {
  constructor() {
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  connect(accessToken) {
    requireGlobalWebSocket();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('websocket auth timed out (15s)')), 15000);
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`websocket connection to ${WS_URL} failed`));
      });
      ws.addEventListener('message', (event) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === 'auth_required') {
          ws.send(JSON.stringify({ type: 'auth', access_token: accessToken }));
        } else if (message.type === 'auth_ok') {
          clearTimeout(timer);
          resolve(message.ha_version);
        } else if (message.type === 'auth_invalid') {
          clearTimeout(timer);
          reject(new Error(`websocket auth rejected: ${message.message || 'auth_invalid'}`));
        } else if (message.type === 'result' && this.pending.has(message.id)) {
          const { resolve: ok, reject: nope } = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.success) ok(message.result);
          else nope(new Error(`ws command failed: ${message.error?.code || '?'} ${message.error?.message || ''}`));
        }
      });
    });
  }

  call(command) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, ...command }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`ws command timed out (20s): ${command.type}`));
        }
      }, 20000);
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }
}
