#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...items) { for (const item of items) if (item) this.values.add(String(item)); }
  remove(...items) { for (const item of items) this.values.delete(String(item)); }
  contains(item) { return this.values.has(String(item)); }
  toggle(item, force) {
    const key = String(item);
    if (force === true) { this.values.add(key); return true; }
    if (force === false) { this.values.delete(key); return false; }
    if (this.values.has(key)) { this.values.delete(key); return false; }
    this.values.add(key); return true;
  }
  toString() { return [...this.values].join(' '); }
}

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(String(name), String(value)); }
  removeProperty(name) { this.values.delete(String(name)); }
  getPropertyValue(name) { return this.values.get(String(name)) || ''; }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.nodeName = this.tagName;
    this.nodeType = 1;
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.parentElement = null;
    this.shadowRoot = null;
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.innerHTML = '';
    this.id = '';
  }
  appendChild(child) { if (child) { this.children.push(child); child.parentNode = this; child.parentElement = this; } return child; }
  append(...children) { for (const child of children) this.appendChild(child); }
  prepend(...children) { for (const child of children.reverse()) { if (child) { this.children.unshift(child); child.parentNode = this; child.parentElement = this; } } }
  remove() {
    const parent = this.parentNode;
    if (!parent?.children) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parentNode = null;
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes.get(String(name)) || null; }
  removeAttribute(name) { this.attributes.delete(String(name)); }
  hasAttribute(name) { return this.attributes.has(String(name)); }
  addEventListener() {}
  removeEventListener() {}
  attachShadow() { this.shadowRoot = new FakeRoot(); this.shadowRoot.host = this; return this.shadowRoot; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  matches() { return false; }
  contains(node) { return node === this || this.children.some(child => child?.contains?.(node)); }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

class FakeRoot extends FakeElement {
  constructor() { super('#document-fragment'); this.nodeType = 11; this.adoptedStyleSheets = []; }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document');
    this.nodeType = 9;
    this.documentElement = new FakeElement('html');
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.children = [this.documentElement];
    this.childNodes = this.children;
    this.activeElement = null;
    this.adoptedStyleSheets = [];
  }
  createElement(tag) { return new FakeElement(tag); }
  createTextNode(text) { const node = new FakeElement('#text'); node.nodeType = 3; node.textContent = String(text || ''); return node; }
  getElementById() { return null; }
}

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; this.targets = []; }
  observe(target, options) { this.targets.push({ target, options }); }
  disconnect() { this.targets = []; }
  takeRecords() { return []; }
}

class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

export async function runPublicRuntimeContract({ distPath = 'dist/nostrodomus.js' } = {}) {
  const absoluteDist = resolve(distPath);
  const document = new FakeDocument();
  const storage = new Map();
  const timers = new Set();
  let timerId = 1;

  defineGlobal('window', globalThis);
  defineGlobal('document', document);
  defineGlobal('HTMLElement', FakeElement);
  defineGlobal('Element', FakeElement);
  defineGlobal('Node', { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11 });
  defineGlobal('Document', FakeDocument);
  defineGlobal('ShadowRoot', FakeRoot);
  defineGlobal('MutationObserver', FakeMutationObserver);
  defineGlobal('ResizeObserver', FakeResizeObserver);
  defineGlobal('IntersectionObserver', FakeResizeObserver);
  defineGlobal('CSSStyleSheet', class { replaceSync(text) { this.text = String(text || ''); } });
  defineGlobal('CSS', { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'), highlights: { set() {}, delete() {}, clear() {} } });
  defineGlobal('Highlight', class { constructor(...ranges) { this.ranges = ranges; } });
  defineGlobal('Range', class { setStart() {} setEnd() {} });
  defineGlobal('localStorage', {
    getItem: key => storage.has(String(key)) ? storage.get(String(key)) : null,
    setItem: (key, value) => { storage.set(String(key), String(value)); },
    removeItem: key => { storage.delete(String(key)); },
  });
  defineGlobal('sessionStorage', globalThis.localStorage);
  defineGlobal('requestAnimationFrame', callback => { const id = timerId++; timers.add(id); Promise.resolve().then(() => { if (timers.has(id)) callback(Date.now()); }); return id; });
  defineGlobal('cancelAnimationFrame', id => { timers.delete(id); });
  defineGlobal('requestIdleCallback', callback => { const id = timerId++; timers.add(id); Promise.resolve().then(() => { if (timers.has(id)) callback({ didTimeout: false, timeRemaining: () => 10 }); }); return id; });
  defineGlobal('cancelIdleCallback', id => { timers.delete(id); });
  defineGlobal('performance', { now: () => 1, memory: { usedJSHeapSize: 1048576, totalJSHeapSize: 2097152, jsHeapSizeLimit: 4194304 } });
  defineGlobal('screen', { width: 1920, height: 1080, colorDepth: 24 });
  defineGlobal('navigator', {
    userAgent: 'NostrodomusContractRunner/1.0 Chrome/126.0',
    userAgentData: { brands: [{ brand: 'Chromium', version: '126' }], platform: 'Linux', mobile: false },
    platform: 'Linux x86_64',
    language: 'en-US',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    gpu: null,
  });
  defineGlobal('location', { href: 'http://localhost/lovelace', origin: 'http://localhost' });
  defineGlobal('customElements', { get: () => null, define: () => {} });
  defineGlobal('getComputedStyle', () => ({ getPropertyValue: () => '', color: 'rgb(255,255,255)' }));
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.devicePixelRatio = 1;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
  globalThis.hass = { states: {}, services: {}, themes: { themes: {} } };

  const before = new Set(Object.keys(globalThis));
  const runtimeLogs = [];
  const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const url = `${pathToFileURL(absoluteDist).href}?contract=${Date.now()}-${Math.random()}`;
  try {
    const capture = level => (...args) => { runtimeLogs.push({ level, message: args.map(arg => String(arg)).join(' ') }); };
    console.log = capture('log');
    console.info = capture('info');
    console.warn = capture('warn');
    console.error = capture('error');
    console.debug = capture('debug');
    await import(url);
    await new Promise(resolve => setTimeout(resolve, 0));
    // The completion library loads lazily on first editor use. This
    // runner verifies the COMPLETE public surface (library + index + providers),
    // so trigger the load explicitly via the public open() — it awaits
    // loadLibrary() then bails gracefully with no view, adding no console output
    // (the "exactly one ready banner" check still holds).
    try { await globalThis.__nostrodomus?.open?.(); } catch { /* no-view open is a no-op load trigger */ }
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
  }

  const api = globalThis.__nostrodomus;
  if (!api) throw new Error('window.__nostrodomus was not installed by built dist');
  const health = typeof api.health === 'function' ? api.health() : null;
  const debug = typeof api.debug === 'function' ? api.debug() : null;
  const stats = typeof api.performanceStats === 'function' ? api.performanceStats() : null;
  const runtimeErrors = typeof api.runtimeErrors === 'function' ? api.runtimeErrors() : null;
  const providerIds = Array.isArray(debug?.providers) ? debug.providers.map(provider => typeof provider === 'string' ? provider : provider?.id).filter(Boolean).sort() : [];
  const globals = Object.keys(globalThis).filter(key => key.startsWith('__nostrodomus')).sort();
  const after = new Set(Object.keys(globalThis));
  const addedGlobals = [...after].filter(key => !before.has(key) && key.startsWith('__nostrodomus')).sort();
  const contract = {
    version: String(api.version || debug?.version || ''),
    preferredApi: !!globalThis.__nostrodomus,
    methods: {
      debug: typeof api.debug === 'function',
      health: typeof api.health === 'function',
      performanceStats: typeof api.performanceStats === 'function',
      runtimeErrors: typeof api.runtimeErrors === 'function',
      clientCapabilities: typeof api.clientCapabilities === 'function',
      settings: typeof api.settings === 'function',
      resetSettings: typeof api.resetSettings === 'function',
      uninstall: typeof api.uninstall === 'function',
    },
    health: {
      status: health?.status || '',
      checkNames: Array.isArray(health?.checks) ? health.checks.map(check => check?.name).filter(Boolean).sort() : [],
    },
    diagnosticsGlobals: globals,
    addedDiagnosticsGlobals: addedGlobals,
    providers: providerIds,
    counts: {
      providerCount: providerIds.length,
      libraryPackCount: Object.keys(api.state?.library?.packs || {}).length,
      itemCount: Array.isArray(api.state?.items) ? api.state.items.length : 0,
      indexKeyCount: api.state?.index ? Object.keys(api.state.index).length : 0,
      runtimeErrorCount: runtimeErrors?.items?.length || 0,
    },
    statsKeys: stats && typeof stats === 'object' ? Object.keys(stats).sort() : [],
  };
  return {
    ok: contract.preferredApi
      && Object.values(contract.methods).every(Boolean)
      && !!globalThis.__nostrodomus?.contextDiagnostics
      && contract.providers.includes('static-library')
      && contract.providers.includes('snippet-templates')
      && contract.providers.includes('lovelace-context')
      && contract.providers.includes('ha-runtime-values'),
    contract,
    runtimeLogs,
    contractHash: createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
    distSha256: createHash('sha256').update(readFileSync(absoluteDist)).digest('hex'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const result = await runPublicRuntimeContract({ distPath: process.argv[2] || 'dist/nostrodomus.js' });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  }
}
