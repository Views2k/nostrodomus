import test from 'node:test';
import assert from 'node:assert/strict';

import { UNIVERSAL_PANEL_HOSTS, surfaceFromHostTag } from '../../src/editor/haSelectors.js';

// Home Assistant 2026.11 moved Developer Tools under Settings as "Tools" and renamed its elements
// (measured on 2026.11.1: ha-code-editor < tools-template < tools-router < ha-panel-tools). With
// only the old names listed, the template editor there got no completion and no styling.
test('the 2026.11 Tools elements are allowed panel hosts with the developer-tools surfaces', () => {
  const hosts = UNIVERSAL_PANEL_HOSTS.split(',').map((tag) => tag.trim());
  for (const tag of ['ha-panel-tools', 'tools-template', 'tools-action', 'tools-event', 'ha-panel-developer-tools', 'developer-tools-template']) {
    assert.ok(hosts.includes(tag), `${tag} is an allowed panel host`);
  }
  assert.equal(surfaceFromHostTag('tools-template'), 'devtools-template');
  assert.equal(surfaceFromHostTag('ha-panel-tools'), 'devtools-template');
  assert.equal(surfaceFromHostTag('tools-action'), 'devtools-action');
});
