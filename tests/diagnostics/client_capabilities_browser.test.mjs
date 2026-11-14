import test from 'node:test';
import assert from 'node:assert/strict';

import { createClientCapabilitiesRuntime } from '../../src/diagnostics/clientCapabilitiesRuntime.js';

// Behavior coverage for browserInfoSnapshot (previously only structurally grep-pinned). Writing these
// intended-behavior tests surfaced a real bug: the UA-fallback used one alternation regex that matched
// the leftmost token, so Edge/Opera — whose UA carries "Chrome/…" before "Edg/…"/"OPR/…" — were both
// misreported as Chrome. Detection now checks the most-specific token first.

const snap = (navigatorRef) => createClientCapabilitiesRuntime({ navigatorRef }).browserInfoSnapshot();
const UA = {
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
};

test('UA-fallback names Chromium derivatives correctly (Edge/Opera are not Chrome)', () => {
  assert.deepEqual(pick(snap({ userAgent: UA.edge })), { name: 'Microsoft Edge', version: '120.0.0.0' });
  assert.deepEqual(pick(snap({ userAgent: UA.opera })), { name: 'Opera', version: '105.0.0.0' });
});

test('UA-fallback names Chrome, Firefox, and Safari (Version token for Safari)', () => {
  assert.deepEqual(pick(snap({ userAgent: UA.chrome })), { name: 'Chrome', version: '120.0.0.0' });
  assert.deepEqual(pick(snap({ userAgent: UA.firefox })), { name: 'Firefox', version: '121.0' });
  // Safari's real version comes from Version/…, not its WebKit Safari/605 build.
  assert.deepEqual(pick(snap({ userAgent: UA.safari })), { name: 'Safari', version: '17.1' });
});

test('userAgentData brands take precedence over the UA string and drop "Not.A/Brand" noise', () => {
  const s = snap({
    userAgent: UA.edge,
    userAgentData: {
      brands: [
        { brand: 'Not.A/Brand', version: '99' },
        { brand: 'Chromium', version: '120' },
        { brand: 'Microsoft Edge', version: '120' },
      ],
      platform: 'Windows',
      mobile: false,
    },
  });
  assert.equal(s.name, 'Chromium 120 / Microsoft Edge 120');
  assert.equal(s.platform, 'Windows');
  assert.equal(s.mobile, false);
  assert.equal(s.userAgentBrands.length, 3);
});

test('an empty navigator fails dark to "unknown"', () => {
  const s = snap({});
  assert.equal(s.name, 'unknown');
  assert.equal(s.version, '');
  assert.equal(s.platform, 'unknown');
});

function pick(s) { return { name: s.name, version: s.version }; }
