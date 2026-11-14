// Nostrodomus CodeMirror bridge module
// Critical invariant: this layer adapts pure CodeMirror view/doc/position helper behavior only.
// It must not own popup placement, provider logic, network calls, visual styling, or browser top-layer behavior.

export function hookDispatch(view, bridge = {}) {
  const state = bridge?.state;
  const looksLikeView = typeof bridge?.looksLikeView === "function" ? bridge.looksLikeView : () => false;
  if (!state || !looksLikeView(view)) return false;
  if (state.hookedView === view) return false;

  if (typeof bridge.unhookDispatch === "function") bridge.unhookDispatch();

  state.hookedView = view;
  state.originalDispatch = view.dispatch.bind(view);

  view.dispatch = (...args) => {
    const oldDocLength = view.state?.doc?.length ?? getDocLength(view);
    const oldSel = view.state?.selection?.main
      ? {
          from: Math.min(view.state.selection.main.anchor, view.state.selection.main.head),
          to: Math.max(view.state.selection.main.anchor, view.state.selection.main.head),
          head: view.state.selection.main.head,
        }
      : null;

    const result = state.originalDispatch(...args);

    if (typeof bridge.afterDispatch === "function") {
      bridge.afterDispatch(view, oldDocLength, oldSel);
    }

    return result;
  };

  return true;
}

export function unhookDispatch(bridge = {}) {
  const state = bridge?.state;
  if (!state) return false;
  if (state.hookedView && state.originalDispatch) {
    state.hookedView.dispatch = state.originalDispatch;
  }
  state.hookedView = null;
  state.originalDispatch = null;
  return true;
}

// The text of a CodeMirror document. A document object never changes (every edit makes a new
// one), so its text is built once and kept for as long as the object lives. One completion
// refresh asked for it three or four times and built a fresh copy of the whole text each time.
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

export function lineInfo(doc, pos) {
  const safeDoc = String(doc ?? "");
  const safePosRaw = Number(pos);
  const safePos = Number.isFinite(safePosRaw)
    ? Math.max(0, Math.min(safeDoc.length, Math.trunc(safePosRaw)))
    : 0;
  const before = safeDoc.slice(0, safePos);
  const after = safeDoc.slice(safePos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEndRaw = safeDoc.indexOf("\n", safePos);
  const lineEnd = lineEndRaw === -1 ? safeDoc.length : lineEndRaw;
  const line = safeDoc.slice(lineStart, lineEnd);
  const beforeCursor = line.slice(0, safePos - lineStart);
  const afterCursor = line.slice(safePos - lineStart);
  const col = safePos - lineStart;
  const lineNumber = before.split("\n").length;
  return { before, after, line, beforeCursor, afterCursor, lineStart, lineEnd, col, lineNumber };
}

export function getDocLength(view) {
  try {
    return view?.state?.doc?.length ?? view?.state?.doc?.toString?.().length ?? 0;
  } catch {
    return 0;
  }
}
