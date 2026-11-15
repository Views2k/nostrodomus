import js from "@eslint/js";

const browserGlobals = {
  CSS: "readonly",
  CSSStyleSheet: "readonly",
  CustomEvent: "readonly",
  Element: "readonly",
  Event: "readonly",
  HTMLElement: "readonly",
  KeyboardEvent: "readonly",
  MutationObserver: "readonly",
  Node: "readonly",
  ResizeObserver: "readonly",
  structuredClone: "readonly",
  ShadowRoot: "readonly",
  cancelAnimationFrame: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  customElements: "readonly",
  document: "readonly",
  getComputedStyle: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  performance: "readonly",
  queueMicrotask: "readonly",
  requestAnimationFrame: "readonly",
  sessionStorage: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  AbortSignal: "readonly",
  Buffer: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  WebSocket: "readonly",
  global: "readonly",
};

const commonRules = {
  eqeqeq: ["error", "smart"],
  "no-empty": "off",
  "no-redeclare": "error",
  "no-throw-literal": "error",
  "no-useless-assignment": "off",
  "no-undef": "error",
  "no-unused-vars": [
    "error",
    {
      args: "after-used",
      argsIgnorePattern: "^_",
      caughtErrors: "none",
      varsIgnorePattern: "^_",
    },
  ],
  "no-var": "warn",
  "prefer-const": "warn",
};

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "reports/**",
      "data/**",
      "reference/companions/**",
      "tools/e2e/.ha-state*/**",
      "tests/e2e/.playwright/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: commonRules,
  },
  {
    // The static tests (tests/test_*_static.py) look for some imports and destructured names in
    // the composition root that it does not use, so an unused variable is a warning here and an
    // error everywhere else.
    files: ["src/app.js"],
    rules: {
      "no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["tools/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: commonRules,
  },
  {
    // The e2e specs run on Node but pass callbacks to the browser through page.evaluate and
    // addInitScript, and those callbacks use browser globals.
    files: ["tests/e2e/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    rules: commonRules,
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: commonRules,
  },
];
