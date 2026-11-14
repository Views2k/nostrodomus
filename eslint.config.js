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
      "coverage/**",
      "tools/e2e/.ha-state*/**",
      "tests/e2e/.playwright/**",
      "*.zip",
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
    // Composition root: its unused import/destructure bindings are pinned by the
    // static grep gates (tests/test_*_static.py); advisory here, error everywhere else.
    files: ["src/main.legacy.js"],
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
    // E2E specs run on Node but pass callbacks into the real browser via
    // page.evaluate / addInitScript — those bodies see browser globals.
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
