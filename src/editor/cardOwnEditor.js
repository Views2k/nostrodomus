// A custom card's own visual editor is not Nostrodomus's to change.
//
// Home Assistant shows a card's configuration in an element editor (hui-card-element-editor,
// hui-row-element-editor and the like). Its shadow root holds either Home Assistant's YAML editor
// or, in the area with the class "gui-editor", the editor element the card supplies. Everything
// under a custom card's editor element belongs to that card: its fields, toggles, buttons, notes,
// and any code box it embeds, with the suggestions the card turned on for it. Many people set
// cards up there without writing YAML.
//
// The rule is about where an element sits, not about which card it is, so it holds for every
// custom card without a list of names: an element is inside a card's own editor when the nearest
// element editor above it holds it under the card editor area, inside an editor element that is
// not one of Home Assistant's (their names start with "hui-"; the tab row and the loading
// placeholder that Home Assistant puts in the same area are listed in the selector registry).
//
// Callers use it to leave such elements alone: no styling or sizing, no dialog resize, no
// completion, and Home Assistant's built-in suggestions stay as the card set them.
//
// The nearest element editor decides. A YAML editor that Home Assistant nests inside a visual
// editor (the card of a stack, a row of an entities card) is Home Assistant's own again. When
// the visual editor around it is a custom card's (a card that edits a sub-card that way),
// nestedInCardOwnEditor says so: Nostrodomus still works in that YAML editor, but does not size
// it to the dialog and writes nothing on the card's elements around it.

import { ELEMENT_EDITOR_CARD_AREA, ELEMENT_EDITOR_HOST, ELEMENT_EDITOR_OWN_CHILDREN, HUI_ELEMENT_PREFIX } from './haSelectors.js';

export const CARD_EDITOR_AREA_SELECTOR = ELEMENT_EDITOR_CARD_AREA;
const MAX_HOPS = 40;

export function isElementEditorHostName(name) {
  return ELEMENT_EDITOR_HOST.test(String(name || ''));
}

// The nearest element editor above `node`, and the element in that editor's own tree that leads
// to `node` (`node` itself, or the shadow host that contains it).
function nearestElementEditor(node) {
  let current = node;
  for (let hops = 0; current && hops < MAX_HOPS; hops += 1) {
    let root = null;
    try { root = current.getRootNode?.() || null; } catch { root = null; }
    const host = root?.host || null;
    if (!host) return null; // reached the document without passing an element editor
    if (isElementEditorHostName(host.localName)) return { host, inTree: current };
    current = host;
  }
  return null;
}

export function insideCardOwnEditor(node) {
  const found = nearestElementEditor(node);
  if (!found) return false;
  let area = null;
  try { area = found.inTree.closest?.(CARD_EDITOR_AREA_SELECTOR) || null; } catch { area = null; }
  // Outside the area: Home Assistant's own YAML editor, warnings and buttons. The area itself is
  // Home Assistant's too.
  if (!area || area === found.inTree) return false;
  // The editor element in the area that leads to `node`: the custom element nearest to the area.
  let supplied = null;
  let step = found.inTree;
  for (let hops = 0; step && step !== area && hops < MAX_HOPS; hops += 1) {
    if (String(step.localName || '').includes('-')) supplied = step;
    step = step.parentElement || null;
  }
  const name = String(supplied?.localName || '');
  if (!name) return false;
  return !name.startsWith(HUI_ELEMENT_PREFIX) && !ELEMENT_EDITOR_OWN_CHILDREN.includes(name);
}

// True for Home Assistant's YAML editor when the element editor that holds it sits inside a custom
// card's own editor.
export function nestedInCardOwnEditor(node) {
  const found = nearestElementEditor(node);
  return !!found && insideCardOwnEditor(found.host);
}
