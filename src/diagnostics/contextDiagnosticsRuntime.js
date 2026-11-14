import * as contextSnapshotAdapter from '../context/contextSnapshotRuntimeAdapter.js';
import { contextAdapterYamlKey } from '../yaml/runtimeContextAdapter.js';
import {
  activeEditorReadoutTraversalScopedEnabled,
  createActiveEditorContextSnapshotReadout,
  recordActiveEditorReadoutTraversal,
} from '../editor/activeEditor.js';
import {
  runActiveEditorDiagnosticsReadoutWithCallbacks,
  missingActiveEditorReadoutPayload,
} from './diagnosticsFastLaneHelpers.js';
import { createEmbeddedLanguageDiagnostics } from '../languages/embeddedLanguageDiagnostics.js';


// All diagnostics debug APIs hang off the single public namespace. The namespace is
// created here only if boot has not installed the api object yet (crash-path safety).
function nostrodomusNamespace(W) {
  return W.__nostrodomus || (W.__nostrodomus = {});
}

export function installContextDiagnosticsRuntime(ctx = {}) {
  const window = ctx.window || globalThis.window;
  const document = ctx.document || globalThis.document;
  const installState = ctx.state || null;
  if (!window || !document) return null;
  const nostrodomusExternalRuntimeErrorOnceKeys = new Set();
  // FIFO-bound: the key embeds the (variable) error message, so distinct external errors could grow
  // this set without limit. Evicting the oldest keeps recent dedup within the cap.
  const MAX_ONCE_KEYS = 500;

  function nostrodomusRuntimeApi() {
    try {
      return window.__nostrodomus || null;
    } catch {
      return null;
    }
  }

  function nostrodomusExternalErrorKey(scope, err) {
    const message = String(err?.message || err || "unknown runtime error").slice(0, 220);
    const name = String(err?.name || "Error").slice(0, 80);
    return `${String(scope || "runtime").slice(0, 120)}:${name}:${message}`;
  }

  function nostrodomusRecordRuntimeError(scope, err, detail = null) {
    try {
      const recorder = nostrodomusRuntimeApi()?.recordRuntimeError;
      if (typeof recorder === "function") return recorder(scope, err, detail);
    } catch {
      // External diagnostics must never become a host-facing failure.
    }
    return null;
  }

  function nostrodomusRecordRuntimeErrorOnce(scope, err, detail = null) {
    const key = nostrodomusExternalErrorKey(scope, err);
    if (nostrodomusExternalRuntimeErrorOnceKeys.has(key)) return null;
    if (nostrodomusExternalRuntimeErrorOnceKeys.size >= MAX_ONCE_KEYS) nostrodomusExternalRuntimeErrorOnceKeys.delete(nostrodomusExternalRuntimeErrorOnceKeys.values().next().value);
    nostrodomusExternalRuntimeErrorOnceKeys.add(key);
    return nostrodomusRecordRuntimeError(scope, err, detail);
  }

  const collectContextSnapshotDryRun = (payload) => {
    const result = contextSnapshotAdapter.collectContextSnapshotDryRun(payload);
    const cursor = result?.snapshot?.cursor || {};
    if (result?.snapshot?.yaml) {
      result.snapshot.yaml.key = contextAdapterYamlKey(cursor.line);
    }
    return result;
  };
  const NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_READOUT_STAGE = "2C-active-editor-snapshot-readout";
  const NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_READOUT_VERSION = 1;
  const NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_MAX_NODE_VISITS = 1800;
  const NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_MAX_CANDIDATES = 80;


  (function installNostrodomusEmbeddedLanguageDetectorDiagnosticsStage10B() {
    const W = window;
    const API_KEY = "embeddedLanguageDetector";

    function embeddedLanguageDetectorDiagnosticsFallback(input = {}) {
      return createEmbeddedLanguageDiagnostics({
        legacyContext: input.legacyContext || null,
        activeEditorReadout: input.activeEditorReadout || null,
        detectorInput: input.detectorInput || null,
        activeDetectorInput: input.activeDetectorInput || null,
        liveItems: Array.isArray(input.liveItems) ? input.liveItems : [],
      });
    }

    function readEmbeddedLanguageDetectorDiagnostics(input) {
      const payload = input || {};
      const runtimeReader = W.__nostrodomus?.embeddedLanguageDiagnostics;
      if (typeof runtimeReader === "function") {
        return runtimeReader({ ...payload });
      }
      return embeddedLanguageDetectorDiagnosticsFallback(payload);
    }
    nostrodomusNamespace(W)[API_KEY] = Object.freeze({
      stage: "priority10-browser-visible-embedded-language-detector-diagnostics",
      version: 1,
      localOnly: true,
      redacted: true,
      diagnosticsOnly: true,
      observeOnly: true,
      shadowOnly: true,
      drivesAutocomplete: false,
      mutatesRuntime: false,
      rendersUi: false,
      writesDom: false,
      networkAccess: false,
      registersProviders: false,
      opensPopup: false,
      insertsText: false,
      mutatesScoring: false,
      read: readEmbeddedLanguageDetectorDiagnostics,
    });
  })();

  (function installNostrodomusContextDiagnosticsReadoutStage2B() {
    const W = window;
    const STORAGE_KEY = "nostrodomus.contextDiagnosticsReadout.enabled";
    const API_KEY = "contextDiagnostics";
    const NOSTRODOMUS_CONTEXT_DIAGNOSTICS_READOUT_API_STAGE = "2B-local-diagnostics-readout";
    const NOSTRODOMUS_CONTEXT_DIAGNOSTICS_READOUT_DEFAULT_ENABLED = false;

    function diagnosticsReadoutIsEnabled() {
      try {
        return localStorage.getItem(STORAGE_KEY) === "true";
      } catch (err) {
        nostrodomusRecordRuntimeErrorOnce("diagnostics:readout-storage-read", err, { phase: "diagnosticsReadoutIsEnabled" });
        return false;
      }
    }

    function diagnosticsReadoutReadEmbeddedLanguage(input) {
      const payload = input || {};
      const reader = W.__nostrodomus?.embeddedLanguageDetector?.read || W.__nostrodomus?.embeddedLanguageDiagnostics;
      if (typeof reader === "function") {
        return reader({ ...payload });
      }
      return createEmbeddedLanguageDiagnostics({
        legacyContext: payload.legacyContext || null,
        activeEditorReadout: payload.activeEditorReadout || null,
        detectorInput: payload.detectorInput || null,
        activeDetectorInput: payload.activeDetectorInput || null,
        liveItems: Array.isArray(payload.liveItems) ? payload.liveItems : [],
      });
    }

    nostrodomusNamespace(W)[API_KEY] = Object.freeze({
      stage: NOSTRODOMUS_CONTEXT_DIAGNOSTICS_READOUT_API_STAGE,
      storageKey: STORAGE_KEY,
      defaultEnabled: NOSTRODOMUS_CONTEXT_DIAGNOSTICS_READOUT_DEFAULT_ENABLED,
      localOnly: true,
      redacted: true,
      diagnosticsOnly: true,
      shadowOnly: true,
      drivesAutocomplete: false,
      mutatesRuntime: false,
      rendersUi: false,
      isEnabled: diagnosticsReadoutIsEnabled,
      readActiveEditor: () => runActiveEditorDiagnosticsReadoutWithCallbacks({
        enabled: diagnosticsReadoutIsEnabled(),
        defaultEnabled: NOSTRODOMUS_CONTEXT_DIAGNOSTICS_READOUT_DEFAULT_ENABLED,
        createReadout: () => {
          // main.legacy.js installs this runtime outside its boot closure, so no state is passed
          // in. The runtime state hangs off the public API object once boot has run; it is
          // looked up for each readout, and the traversal counters are recorded in it.
          const state = installState || nostrodomusRuntimeApi()?.state || null;
          return createActiveEditorContextSnapshotReadout({
            document,
            stage: NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_READOUT_STAGE,
            version: NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_READOUT_VERSION,
            maxCandidates: NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_MAX_CANDIDATES,
            maxNodeVisits: NOSTRODOMUS_CONTEXT_ACTIVE_EDITOR_MAX_NODE_VISITS,
            traversalScoped: () => activeEditorReadoutTraversalScopedEnabled(),
            onTraversal: summary => recordActiveEditorReadoutTraversal(state, summary),
            collectSnapshot: ({ doc, pos, scope }) => collectContextSnapshotDryRun({ doc, pos, scope }),
            onError: (key, err, detail) => nostrodomusRecordRuntimeErrorOnce(key, err, detail),
          });
        },
        missingReadout: () => missingActiveEditorReadoutPayload(),
      }),
      readEmbeddedLanguage: diagnosticsReadoutReadEmbeddedLanguage,
    });
  })();
  return {
    embeddedLanguageDetector: window.__nostrodomus?.embeddedLanguageDetector || null,
    diagnosticsReadout: window.__nostrodomus?.contextDiagnostics || null,
  };
}

