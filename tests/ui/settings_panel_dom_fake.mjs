// A small DOM stand-in for the settings panel tests. It covers what the panel shell and the
// diagnostics markup use: element trees, dataset, classList, attributes, compound selectors
// (tag, #id, .class, [attr], [attr="value"], comma lists), listeners with bubbling, focus and a
// MutationObserver that reports class changes in a microtask, as a browser does.

function datasetKeyFromAttribute(name) {
  return name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function parseCompound(selector) {
  const parts = { tag: '', id: '', classes: [], attrs: [] };
  let rest = selector.trim();
  const tag = /^[a-zA-Z][\w-]*/.exec(rest);
  if (tag) { parts.tag = tag[0].toLowerCase(); rest = rest.slice(tag[0].length); }
  while (rest) {
    let match;
    if ((match = /^#([\w-]+)/.exec(rest))) parts.id = match[1];
    else if ((match = /^\.([\w-]+)/.exec(rest))) parts.classes.push(match[1]);
    else if ((match = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(rest))) parts.attrs.push({ name: match[1], value: match[2] });
    else if ((match = /^:focus-visible/.exec(rest))) parts.focusVisible = true;
    else if ((match = /^:popover-open/.exec(rest))) parts.popoverOpen = true;
    else throw new Error(`settings panel DOM fake: unsupported selector "${selector}"`);
    rest = rest.slice(match[0].length);
  }
  return parts;
}

function attributeValue(node, name) {
  if (name.startsWith('data-')) {
    const value = node.dataset[datasetKeyFromAttribute(name)];
    return value === undefined ? null : String(value);
  }
  if (name === 'id') return node.id || null;
  if (name === 'class') return node.className || null;
  return Object.prototype.hasOwnProperty.call(node.attrs, name) ? node.attrs[name] : null;
}

function matchesCompound(node, parts) {
  if (parts.tag && node.localName !== parts.tag) return false;
  if (parts.id && node.id !== parts.id) return false;
  for (const cls of parts.classes) if (!node.classList.contains(cls)) return false;
  for (const attr of parts.attrs) {
    const value = attributeValue(node, attr.name);
    if (value === null) return false;
    if (attr.value !== undefined && value !== attr.value) return false;
  }
  if (parts.focusVisible && node.ownerDocument.focusVisibleElement !== node) return false;
  if (parts.popoverOpen && !node.popoverOpen) return false;
  return true;
}

function matchesSelector(node, selector) {
  return String(selector).split(',').some(part => matchesCompound(node, parseCompound(part)));
}

export function createFakeDom() {
  const observers = new Set();

  function notifyClassChange(node) {
    for (const observer of observers) {
      if (!observer.targets.has(node) || observer.pending) continue;
      observer.pending = true;
      Promise.resolve().then(() => {
        observer.pending = false;
        if (observer.targets.size) observer.callback([{ type: 'attributes', attributeName: 'class', target: node }], observer);
      });
    }
  }

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      this.pending = false;
      observers.add(this);
    }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); observers.delete(this); }
    takeRecords() { return []; }
  }

  function createNode(tag, document) {
    let className = '';
    const listeners = new Map();
    const node = {
      nodeType: 1,
      ownerDocument: document,
      tagName: String(tag).toUpperCase(),
      localName: String(tag).toLowerCase(),
      id: '',
      dataset: {},
      attrs: {},
      children: [],
      parentNode: null,
      checked: false,
      value: '',
      scrollTop: 0,
      scrollLeft: 0,
      style: {
        cssText: '',
        props: {},
        setProperty(name, value) { this.props[name] = String(value); },
        removeProperty(name) { delete this.props[name]; },
        getPropertyValue(name) { return this.props[name] || ''; },
      },
      get className() { return className; },
      set className(value) {
        const next = String(value);
        if (next === className) return;
        className = next;
        notifyClassChange(node);
      },
      classList: {
        contains(cls) { return className.split(/\s+/).includes(cls); },
        add(cls) { if (!this.contains(cls)) node.className = `${className} ${cls}`.trim(); },
        remove(cls) { if (this.contains(cls)) node.className = className.split(/\s+/).filter(item => item && item !== cls).join(' '); },
        toggle(cls, force) {
          const want = force === undefined ? !this.contains(cls) : !!force;
          if (want) this.add(cls); else this.remove(cls);
          return want;
        },
      },
      get textContent() {
        if (node.ownText !== undefined) return node.ownText;
        return node.children.map(child => child.textContent).join('');
      },
      set textContent(value) {
        for (const child of node.children) child.parentNode = null;
        node.children = [];
        node.ownText = String(value);
      },
      get parentElement() { return node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null; },
      get isConnected() {
        let current = node;
        while (current.parentNode) current = current.parentNode;
        return current === document.documentElement;
      },
      get childElementCount() { return node.children.filter(child => child.nodeType === 1).length; },
      get childNodes() { return node.children; },
      setAttribute(name, value) {
        if (name === 'class') { node.className = value; return; }
        if (name === 'id') { node.id = String(value); return; }
        if (name.startsWith('data-')) { node.dataset[datasetKeyFromAttribute(name)] = String(value); return; }
        node.attrs[name] = String(value);
      },
      getAttribute(name) { return attributeValue(node, name); },
      hasAttribute(name) { return attributeValue(node, name) !== null; },
      removeAttribute(name) {
        if (name.startsWith('data-')) delete node.dataset[datasetKeyFromAttribute(name)];
        else delete node.attrs[name];
      },
      appendChild(child) {
        if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(item => item !== child);
        if (node.ownText !== undefined) node.ownText = undefined;
        child.parentNode = node;
        node.children.push(child);
        return child;
      },
      append(...nodes) { for (const child of nodes) node.appendChild(child); },
      replaceChildren(...nodes) {
        for (const child of node.children) child.parentNode = null;
        node.children = [];
        node.ownText = undefined;
        for (const child of nodes) node.appendChild(child);
      },
      remove() {
        if (!node.parentNode) return;
        node.parentNode.children = node.parentNode.children.filter(item => item !== node);
        node.parentNode = null;
      },
      contains(other) {
        for (let current = other; current; current = current.parentNode) if (current === node) return true;
        return false;
      },
      matches(selector) { return matchesSelector(node, selector); },
      closest(selector) {
        for (let current = node; current && current.nodeType === 1; current = current.parentNode) {
          if (matchesSelector(current, selector)) return current;
        }
        return null;
      },
      querySelectorAll(selector) {
        const found = [];
        const visit = (parent) => {
          for (const child of parent.children) {
            if (child.nodeType !== 1) continue;
            if (matchesSelector(child, selector)) found.push(child);
            visit(child);
          }
        };
        visit(node);
        return found;
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        if (listeners.has(type)) listeners.set(type, listeners.get(type).filter(item => item !== handler));
      },
      listenerCount(type) { return (listeners.get(type) || []).length; },
      // Runs the listeners on this node and then on each ancestor, as a bubbling event does.
      // Returns the event, and the promises of async listeners so a test can wait for them.
      dispatch(type, init = {}) {
        const event = {
          type,
          target: node,
          defaultPrevented: false,
          propagationStopped: false,
          results: [],
          preventDefault() { event.defaultPrevented = true; },
          stopPropagation() { event.propagationStopped = true; },
          ...init,
        };
        for (let current = node; current && !event.propagationStopped; current = current.parentNode) {
          for (const handler of (current.listenerList?.(type) || [])) event.results.push(handler(event));
        }
        return event;
      },
      listenerList(type) { return [...(listeners.get(type) || [])]; },
      click() { return node.dispatch('click'); },
      focus() { document.activeElement = node; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 440, height: 600, right: 440, bottom: 600 }; },
      setPointerCapture() {},
      showPopover() { node.popoverOpen = true; },
      hidePopover() { node.popoverOpen = false; },
    };
    return node;
  }

  const document = {
    activeElement: null,
    focusVisibleElement: null,
    createElement(tag) { return createNode(tag, document); },
    createTextNode(text) { return { nodeType: 3, textContent: String(text), parentNode: null }; },
    addEventListener() {},
    removeEventListener() {},
    execCommand() { return false; },
  };
  document.documentElement = createNode('html', document);
  document.body = document.documentElement.appendChild(createNode('body', document));

  return { document, MutationObserver: FakeMutationObserver, observerCount: () => observers.size };
}

// Lets the microtasks queued by the fake MutationObserver run.
export function flushObservers() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
