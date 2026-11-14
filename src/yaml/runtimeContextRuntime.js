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
      // Universal-completions gating. engineV2 enables surface threading; jinjaLane (which
      // requires engineV2) enables the live-entity Jinja lane. When engineV2 is off, surface is
      // undefined and jinjaLane false, so the adapter adds no fields/bias and resolveContext
      // returns the base descriptor by reference: behavior is byte-identical.
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
      // Carry the live-entity-lane gate on the descriptor (the provider closure has no settings).
      // Assign only when the engine is on, so the by-reference base descriptor is never mutated off.
      if (engineOn) {
        resolved.jinjaLaneEnabled = jinjaLane;
        // The registry value lane is read inside the pure classifier (yamlValueKind), so the gate
        // must ride on ctx; absent, area_id:/device_id: keep their legacy (no-row) kind.
        resolved.registryLaneEnabled = registryLane;
        // The service-field value picker reads this gate in haRuntimeValueProvider (its closure
        // has no settings); absent, a service-field value position stays a no-row scalar.
        resolved.schemaValuesEnabled = schemaValues;
        // Surface-scoping reads this gate in the lovelace + ha-runtime providers (pure, ctx-only);
        // absent, no row is suppressed (byte-identical).
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
