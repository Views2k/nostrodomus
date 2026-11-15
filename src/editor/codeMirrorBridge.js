// CodeMirror view helpers: the document text, the cursor position and the document length.
// This module does not place popups, run providers, style anything or use the network.

// The text of a CodeMirror document. A document object never changes (every edit makes a new
// one), so its text is built once and kept for as long as the object lives; one completion
// refresh asks for it several times.
const docTextByDoc = new WeakMap();
export function getDoc(runtimeState) {
  const doc = runtimeState?.view?.state?.doc;
  if (!doc || typeof doc.toString !== "function") return "";
  if (typeof doc !== "object") return String(doc) || "";
  const known = docTextByDoc.get(doc);
  if (known !== undefined) return known;
  const text = doc.toString() || "";
  docTextByDoc.set(doc, text);
  return text;
}

export function getPos(runtimeState) {
  return runtimeState?.view?.state?.selection?.main?.head ?? 0;
}

export function getDocLength(view) {
  try {
    return view?.state?.doc?.length ?? view?.state?.doc?.toString?.().length ?? 0;
  } catch {
    return 0;
  }
}
