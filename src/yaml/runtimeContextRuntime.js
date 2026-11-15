// Nostrodomus runtime context owner.
// Owns guarded runtime context detection wrappers that need live settings/error
// injection, while src/yaml/runtimeContextAdapter.js remains DOM-free and pure.

import {
  detectRuntimeContext,
  detectRuntimeContextFallback,
} from './runtimeContextAdapter.js';
import { resolveContext } from '../context/contextResolver.js';
import { engineV2Enabled, completionSettings } from '../core/completionSettings.js';

function safeFallbackContext(doc, pos, triggerKind = 'typing') {
  const safeDoc = String(doc || '');
  const safePos = Number.isFinite(Number(pos)) ? Math.max(0, Math.min(safeDoc.length, Math.floor(Number(pos)))) : safeDoc.length;
  return {
    lang: 'yaml',
    scope: 'yaml-root',
    confidence: 0.1,
    prefix: '',
    from: safePos,
    to: safePos,
    pos: safePos,
    line: '',
    col: 0,
    lineNumber: 1,
    beforeCursor: '',
    afterCursor: '',
    yamlPath: [],
    yamlRole: 'blank',
    yamlKey: '',
    branchState: null,
    valueKind: '',
    scalarValueContext: false,
    blockValueKind: '',
    pathText: '',
    focusKind: '',
    triggerKind,
    triggerChar: '',
    isTriggerChar: false,
    isBlankLine: true,
    afterKeyColon: false,
    isComment: false,
    suppressPopup: false,
    shouldSuggest: triggerKind === 'explicit',
    idleReason: triggerKind === 'explicit' ? '' : '...',
  };
}

export function createRuntimeContextRuntime(options = {}) {
  const state = options?.state || {};
  const recordRuntimeErrorOnce = typeof options?.recordRuntimeErrorOnce === 'function' ? options.recordRuntimeErrorOnce : () => {};
  const runtimeData = typeof options?.runtimeData === 'function' ? options.runtimeData : null;
  const detectRuntimeContextImpl = typeof options?.detectRuntimeContext === 'function' ? options.detectRuntimeContext : detectRuntimeContext;
  const detectRuntimeContextFallbackImpl = typeof options?.detectRuntimeContextFallback === 'function' ? options.detectRuntimeContextFallback : detectRuntimeContextFallback;

  function detectContextFallback(doc, pos, triggerKind = 'typing') {
    try {
      return detectRuntimeContextFallbackImpl(doc, pos, {
        triggerKind,
        settings: state.settings,
        runtimeData,
      });
    } catch (fallbackErr) {
      recordRuntimeErrorOnce('context:runtime-module-fallback', fallbackErr, { phase: 'detectContextFallback', triggerKind });
      return safeFallbackContext(doc, pos, triggerKind);
    }
  }

  function detectContext(doc, pos, triggerKind = 'typing') {
    try {
      // engineV2 passes the editor surface to the detector; jinjaLane, registryLane, schemaValues
      // and surfaceScope need engineV2. With engineV2 off, surface is undefined and every option
      // is false, the detector adds nothing, and resolveContext returns the base descriptor itself.
      const engineOn = engineV2Enabled(state.settings);
      const jinjaLane = engineOn && completionSettings(state.settings).jinjaLane === true;
      const registryLane = engineOn && completionSettings(state.settings).registryLane === true;
      const schemaValues = engineOn && completionSettings(state.settings).schemaValues === true;
      const surfaceScope = engineOn && completionSettings(state.settings).surfaceScope === true;
      const surface = engineOn && typeof state.activeSurface === 'string' ? state.activeSurface : undefined;
      const baseDescriptor = detectRuntimeContextImpl(doc, pos, {
        triggerKind,
        settings: state.settings,
        runtimeData,
        surface,
        jinjaLane,
        registryLane,
      });
      const resolved = resolveContext({ baseDescriptor, surface, engineEnabled: engineOn });
      // The providers have no settings of their own, so the settings they read ride on the
      // descriptor: jinjaLane for the live-entity provider, registryLane for the classifier's
      // yamlValueKind, schemaValues for the service-field values in haRuntimeValueProvider and
      // surfaceScope for the Lovelace and Home Assistant runtime providers. They are set only with
      // engineV2 on; with it off the descriptor is the base one and is not changed.
      if (engineOn) {
        resolved.jinjaLaneEnabled = jinjaLane;
        resolved.registryLaneEnabled = registryLane;
        resolved.schemaValuesEnabled = schemaValues;
        resolved.surfaceScopeEnabled = surfaceScope;
      }
      return resolved;
    } catch (err) {
      recordRuntimeErrorOnce('context:runtime-module', err, { phase: 'detectContext', triggerKind });
      return detectContextFallback(doc, pos, triggerKind);
    }
  }

  return {
    detectContext,
    detectContextFallback,
    safeFallbackContext,
  };
}

export { safeFallbackContext };
