// The same suite on Firefox: `npm run e2e:firefox`. Everything except the browser comes from
// playwright.config.mjs.

import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.mjs';

export default defineConfig({
  ...base,
  outputDir: '.playwright/output-firefox',
  reporter: [['list'], ['html', { outputFolder: '.playwright/report-firefox', open: 'never' }]],
  use: {
    ...base.use,
    ...devices['Desktop Firefox'],
  },
});
