// Element builders and the position and size limits of the settings panel. The panel itself is
// built in src/ui/settings/settingsPanelShell.js.

function documentFor(doc) {
  const candidate = doc || globalThis.document;
  if (!candidate || typeof candidate.createElement !== "function") {
    throw new Error("settings panel helper requires a document-like object");
  }
  return candidate;
}

export function appendSettingsChildren(parent, children = [], doc = globalThis.document) {
  const documentRef = documentFor(doc);
  for (const child of children || []) {
    if (child == null || child === false) continue;
    parent.appendChild(typeof child === "string" ? documentRef.createTextNode(child) : child);
  }
  return parent;
}

export function createSettingsElement(tag, options = {}, children = [], doc = globalThis.document) {
  const documentRef = documentFor(doc);
  const node = documentRef.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.id) node.id = options.id;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.htmlFor) node.htmlFor = options.htmlFor;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value === false || value == null) continue;
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }
  if (options.dataset) {
    for (const [name, value] of Object.entries(options.dataset)) {
      if (value == null) continue;
      node.dataset[name] = String(value);
    }
  }
  if (options.style) node.style.cssText = options.style;
  return appendSettingsChildren(node, children, documentRef);
}

export function settingsTitle(text, doc = globalThis.document) {
  return createSettingsElement("h3", { className: "nostrodomus-section-title", text }, [], doc);
}

/** @param {{ innerWidth?: number, innerHeight?: number } | null} [viewport] */
function viewportFor(viewport = globalThis.window) {
  const candidate = viewport || {};
  const innerWidth = Number.isFinite(candidate.innerWidth) ? candidate.innerWidth : 1024;
  const innerHeight = Number.isFinite(candidate.innerHeight) ? candidate.innerHeight : 768;
  return { innerWidth, innerHeight };
}

export function clampSettingsPosition(pos, viewport = globalThis.window, panelWidth = 440, panelHeight = NaN) {
  const { innerWidth, innerHeight } = viewportFor(viewport);
  // Keep the whole panel width inside the window (the Close button and the resize handle sit at
  // its right edge). 440 is the default width from clampSettingsSize.
  const width = Number.isFinite(panelWidth) && panelWidth > 0 ? panelWidth : 440;
  // The default position is 72px from the top, or higher when a short viewport leaves no room
  // for the panel below that. It needs the panel height for that; without one it stays at 72.
  const height = Number.isFinite(panelHeight) && panelHeight > 0 ? panelHeight : 0;
  const fallback = {
    x: Math.max(16, Math.min(innerWidth - width - 10, Math.round(innerWidth * 0.58))),
    y: height ? Math.max(8, Math.min(72, innerHeight - height - 8)) : 72,
  };

  const p = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? pos : fallback;

  return {
    x: Math.max(8, Math.min(Math.round(p.x), Math.max(8, innerWidth - width - 8))),
    y: Math.max(8, Math.min(Math.round(p.y), Math.max(8, innerHeight - 160))),
  };
}

export function clampSettingsSize(size, viewport = globalThis.window) {
  const { innerWidth, innerHeight } = viewportFor(viewport);
  const fallback = { w: 440, h: Math.round(Math.min(innerHeight * 0.76, 720)) };
  const raw = size && Number.isFinite(size.w) && Number.isFinite(size.h) ? size : fallback;
  // The usual minimum is 380 by 360. In a viewport smaller than that plus the 8px margins (a
  // phone narrower than 396px, or on its side) the minimum is the room there is, so the panel
  // stays inside it; 200 is the floor for a viewport too small to be of use.
  const minW = Math.min(380, Math.max(200, innerWidth - 16));
  const minH = Math.min(360, Math.max(200, innerHeight - 16));
  const maxW = Math.max(minW, innerWidth - 16);
  const maxH = Math.max(minH, innerHeight - 16);
  return {
    w: Math.max(minW, Math.min(Math.round(raw.w), maxW)),
    h: Math.max(minH, Math.min(Math.round(raw.h), maxH)),
  };
}
