// Nostrodomus safe DOM helpers.
//
// This module is intentionally narrow. It is not a rendering framework. It exists
// so rendering happens through explicit DOM construction and text-node rendering
// rather than innerHTML.

const SAFE_TAG_NAMES = new Set([
  "button",
  "code",
  "div",
  "input",
  "label",
  "option",
  "select",
  "span",
  "style",
]);

const URL_ATTR_NAMES = new Set([
  "href",
  "src",
  "xlink:href",
]);

function normalizeTagName(tagName) {
  const value = String(tagName || "").trim().toLowerCase();
  if (!SAFE_TAG_NAMES.has(value)) {
    throw new Error(`Unsafe DOM tag rejected: ${value || "(empty)"}`);
  }
  return value;
}

function normalizeAttributeName(name) {
  const value = String(name || "").trim();
  if (!value) throw new Error("Empty DOM attribute rejected");
  if (/^on/i.test(value)) throw new Error(`Event-handler DOM attribute rejected: ${value}`);
  return value;
}

function assertSafeAttributeValue(name, value) {
  const lowerName = String(name || "").trim().toLowerCase();
  const text = String(value ?? "").trim();

  if (URL_ATTR_NAMES.has(lowerName) && /^javascript:/i.test(text)) {
    throw new Error(`javascript: URL rejected for DOM attribute: ${name}`);
  }

  if (lowerName === "srcdoc") {
    throw new Error("srcdoc DOM attribute rejected");
  }
}

export function createElement(tagName, options = {}) {
  const el = document.createElement(normalizeTagName(tagName));

  if (options.className) {
    el.className = String(options.className);
  }

  if (options.text !== undefined) {
    setText(el, options.text);
  }

  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      setAttr(el, name, value);
    }
  }

  if (options.style) {
    setStyle(el, options.style);
  }

  if (options.children) {
    appendChildren(el, options.children);
  }

  return el;
}

export function setText(el, value) {
  el.textContent = value == null ? "" : String(value);
  return el;
}

export function setAttr(el, name, value) {
  const safeName = normalizeAttributeName(name);
  assertSafeAttributeValue(safeName, value);

  if (value === false || value == null) {
    el.removeAttribute(safeName);
    return el;
  }

  if (value === true) {
    el.setAttribute(safeName, "");
    return el;
  }

  el.setAttribute(safeName, String(value));
  return el;
}

export function setStyle(el, styles) {
  if (!styles || typeof styles !== "object") return el;

  for (const [name, value] of Object.entries(styles)) {
    if (value == null) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
      throw new Error(`Unsafe style property rejected: ${name}`);
    }
    el.style.setProperty(name, String(value));
  }

  return el;
}

export function appendChildren(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
  return el;
}

export function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
  return el;
}

export function replaceChildrenSafe(el, children = []) {
  clearElement(el);
  appendChildren(el, children);
  return el;
}
