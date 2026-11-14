import test from 'node:test';
import assert from 'node:assert/strict';

import { STYLE_CSS_MODULE_STATUS, styleCssModuleStatus } from '../../src/ui/styles.css.js';

test('styles css module is a metadata-only wiring sentinel', () => {
  const status = styleCssModuleStatus();
  assert.equal(status, STYLE_CSS_MODULE_STATUS);
  assert.equal(status.id, 'nostrodomus-styles-css-module');
  assert.equal(status.wired, true);
  assert.equal(status.ownsVisualCss, false);
  assert.equal(status.visualOwner, 'src/main.legacy.js');
  assert.equal(status.extractionPolicy, 'sentinel-only-no-style-ownership-transfer');
  assert.throws(() => { status.wired = false; }, TypeError);
});
