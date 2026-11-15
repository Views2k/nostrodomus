// CodeMirror-native syntax highlight bridge for Nostrodomus.
//
// It builds and installs a CodeMirror HighlightStyle extension from Home Assistant's
// already-loaded CodeMirror bundle when that API is available, and holds the pure decisions
// about when the source-class path stands in for it. It does not inspect or repaint rendered
// token spans. The source-class path is the fallback for Home Assistant builds that do not
// expose the required CodeMirror 6 APIs.

const NATIVE_HIGHLIGHT_COMPARTMENT_KEY = '__nostrodomusNativeHighlightCompartment';
const NATIVE_HIGHLIGHT_SIGNATURE_KEY = '__nostrodomusNativeHighlightSignature';
const NATIVE_HIGHLIGHT_INSTALLED_KEY = '__nostrodomusNativeHighlightInstalled';

// CodeMirror highlight tags by label, with the Nostrodomus kind that colors each and any extra
// style. The source-class stylesheet builds its rules from the same list.
/** @type {ReadonlyArray<[string, string, Record<string, string>?]>} */
export const CODEMIRROR_NATIVE_HIGHLIGHT_KIND_MAP = Object.freeze([
  ['comment', 'comment', { fontStyle: 'italic' }],
  ['lineComment', 'comment', { fontStyle: 'italic' }],
  ['blockComment', 'comment', { fontStyle: 'italic' }],
  ['docComment', 'comment', { fontStyle: 'italic' }],
  ['keyword', 'keyword'],
  ['controlKeyword', 'keyword'],
  ['definitionKeyword', 'keyword'],
  ['operatorKeyword', 'op'],
  ['string', 'string'],
  ['specialString', 'string'],
  ['number', 'number'],
  ['integer', 'number'],
  ['float', 'number'],
  ['bool', 'bool'],
  ['null', 'bool'],
  ['atom', 'keyword'],
  ['variableName', 'string'],
  ['localVariable', 'string'],
  ['definitionVariable', 'key'],
  ['propertyName', 'key'],
  ['attributeName', 'key'],
  ['typeName', 'cssValue'],
  ['className', 'cssValue'],
  ['functionVariable', 'jinja'],
  ['functionProperty', 'jinja'],
  ['operator', 'op'],
  ['punctuation', 'punct'],
  ['separator', 'punct'],
  ['bracket', 'punct'],
  ['invalid', 'cssGlow'],
]);

export function codeMirrorNativeHighlightApiStatus(parts = {}) {
  const cm = parts.cm || null;
  const view = parts.view || null;
  const tags = parts.tags || cm?.tags || null;
  const status = {
    hasCm: !!cm,
    hasView: !!view,
    hasState: !!view?.state,
    hasTags: !!tags,
    hasHighlightStyle: typeof cm?.HighlightStyle?.define === 'function',
    hasSyntaxHighlighting: typeof cm?.syntaxHighlighting === 'function',
    hasCompartment: typeof cm?.Compartment === 'function',
    hasAppendConfig: typeof cm?.StateEffect?.appendConfig?.of === 'function',
    hasDispatch: typeof view?.dispatch === 'function' && !!view?.state,
  };
  status.missing = Object.entries(status)
    .filter(([key, value]) => key !== 'missing' && value !== true)
    .map(([key]) => key);
  status.available = status.missing.length === 0;
  return status;
}

export function codeMirrorNativeHighlightAvailable(parts = {}) {
  return codeMirrorNativeHighlightApiStatus(parts).available === true;
}

function codeMirrorSpecialTag(tags, helperName, baseTag) {
  try {
    const helper = tags?.[helperName];
    return typeof helper === 'function' && baseTag ? helper(baseTag) : null;
  } catch {
    return null;
  }
}

// The tag for a label of CODEMIRROR_NATIVE_HIGHLIGHT_KIND_MAP, or null when this CodeMirror
// build does not have it.
export function codeMirrorTagForLabel(tags, label) {
  if (!tags) return null;
  if (label === 'specialString') return codeMirrorSpecialTag(tags, 'special', tags.string);
  if (label === 'localVariable') return codeMirrorSpecialTag(tags, 'local', tags.variableName);
  if (label === 'definitionVariable') return codeMirrorSpecialTag(tags, 'definition', tags.variableName);
  if (label === 'functionVariable') return codeMirrorSpecialTag(tags, 'function', tags.variableName);
  if (label === 'functionProperty') return codeMirrorSpecialTag(tags, 'function', tags.propertyName);
  return tags[label] || null;
}

/**
 * @param {Record<string, any>} [parts]
 * @param {(kind: string) => string} [colorForKind]
 */
export function buildCodeMirrorNativeHighlightSpec(parts = {}, colorForKind = () => '') {
  const tags = parts.tags || parts.cm?.tags || null;
  if (!tags) return { entries: [], labels: [], kinds: [], reason: 'missing-tags' };

  const entries = [];
  const labels = [];
  const kinds = [];
  const seenTags = new Set();

  for (const [label, kind, extra] of CODEMIRROR_NATIVE_HIGHLIGHT_KIND_MAP) {
    const tag = codeMirrorTagForLabel(tags, label);
    const color = colorForKind(kind);
    if (!tag || !color) continue;
    if (seenTags.has(tag)) continue;
    seenTags.add(tag);
    labels.push(label);
    kinds.push(kind);
    entries.push({ tag, color, ...(extra || {}) });
  }

  return { entries, labels, kinds: Array.from(new Set(kinds)), reason: entries.length ? 'ok' : 'no-highlight-tags' };
}

/** @param {Record<string, any>} [options] */
function nativeHighlightSignature({ version = '', syntax = {}, spec = {} } = {}) {
  return JSON.stringify({
    version: String(version || ''),
    preset: String(syntax?.presetKey || ''),
    themeOpacity: Number(syntax?.themeOpacity ?? 1),
    themeSaturation: Number(syntax?.themeSaturation ?? 1),
    active: syntax?.active !== false,
    entries: (spec.entries || []).map((entry) => ({
      color: entry.color,
      fontStyle: entry.fontStyle || '',
      fontWeight: entry.fontWeight || '',
    })),
  });
}

// Whether the recorded source-class fallback ownership is the one for this editor and for the
// same reason the native path is unavailable (reason and missing API list).
function previousFallbackOwnershipMatches(previous, editorKey, nativeReason, missingNativeApi) {
  return !!previous &&
    previous.promoted === true &&
    previous.sourceClass === true &&
    String(previous.editorKey || '') === editorKey &&
    String(previous.nativeReason || '') === nativeReason &&
    Array.isArray(previous.missingNativeApi) &&
    previous.missingNativeApi.join('|') === missingNativeApi.join('|');
}

// A native reason of the 'missing-...' family, or a list of missing APIs, means the native path
// cannot be installed.
function nativeApiMissing(nativeReason, missingNativeApi) {
  return nativeReason.startsWith('missing-') || missingNativeApi.length > 0;
}

export function shouldSkipNativeUnavailableActiveEditorInstall(options = {}) {
  const hasEditor = options.hasEditor === true;
  const pending = options.pending === true;
  const editorKey = String(options.editorKey || '');
  const nativeAvailable = options.nativeAvailable === true;
  const nativeReason = String(options.nativeReason || '');
  const missingNativeApi = Array.isArray(options.missingNativeApi) ? options.missingNativeApi : [];
  const sourceClassActive = options.sourceClassActive === true;
  const previous = options.previousOwnership || null;
  const previousMatches = previousFallbackOwnershipMatches(previous, editorKey, nativeReason, missingNativeApi);
  const unavailable = !nativeAvailable && nativeApiMissing(nativeReason, missingNativeApi);
  const skip = hasEditor && !pending && unavailable && sourceClassActive && previousMatches;
  return {
    skip,
    hasEditor,
    pending,
    editorKey,
    nativeAvailable,
    nativeReason,
    missingNativeApi,
    sourceClassActive,
    previousMatches,
    reason: String(options.reason || 'active-editor-native-highlight'),
    path: skip ? 'native-unavailable-active-editor-deduped' : 'active-editor-native-highlight-check',
  };
}

export function shouldSkipSourceClassNativeProbeForNativeFallback(options = {}) {
  const hasEditor = options.hasEditor === true;
  const editorKey = String(options.editorKey || '');
  const nativeAvailable = options.nativeAvailable === true;
  const nativeReason = String(options.nativeReason || '');
  const missingNativeApi = Array.isArray(options.missingNativeApi) ? options.missingNativeApi : [];
  const sourceClassActive = options.sourceClassActive === true;
  const previous = options.previousOwnership || null;
  const previousMatches = previousFallbackOwnershipMatches(previous, editorKey, nativeReason, missingNativeApi);
  const unavailable = !nativeAvailable && nativeApiMissing(nativeReason, missingNativeApi);
  const skip = hasEditor && unavailable && sourceClassActive && previousMatches;
  return {
    skip,
    hasEditor,
    editorKey,
    nativeAvailable,
    nativeUnavailable: unavailable,
    nativeReason,
    missingNativeApi,
    sourceClassActive,
    previousMatches,
    reason: String(options.reason || 'source-class-native-probe'),
    path: skip ? 'native-unavailable-source-class-native-probe-deduped' : 'source-class-native-probe-check',
  };
}

export function shouldSkipRememberActiveEditorNativeHighlightInstall(options = {}) {
  const hasEditor = options.hasEditor === true;
  const editorKey = String(options.editorKey || '');
  const sourceClassActive = options.sourceClassActive === true;
  const previous = options.previousOwnership || null;
  const nativeReason = String(previous?.nativeReason || options.nativeReason || '');
  const missingNativeApi = Array.isArray(previous?.missingNativeApi)
    ? previous.missingNativeApi
    : (Array.isArray(options.missingNativeApi) ? options.missingNativeApi : []);
  const previousMatches = previousFallbackOwnershipMatches(previous, editorKey, nativeReason, missingNativeApi);
  const nativeUnavailable = nativeApiMissing(nativeReason, missingNativeApi);
  const skip = hasEditor && nativeUnavailable && sourceClassActive && previousMatches;
  return {
    skip,
    hasEditor,
    editorKey,
    sourceClassActive,
    nativeUnavailable,
    nativeReason,
    missingNativeApi,
    previousMatches,
    reason: String(options.reason || 'remember-active-editor'),
    path: skip ? 'native-unavailable-remember-active-editor-deduped' : 'remember-active-editor-native-highlight-check',
  };
}

export function shouldSkipSyntaxOwnerSourceClassInstallForNativeFallback(options = {}) {
  const hasEditor = options.hasEditor === true;
  const editorKey = String(options.editorKey || '');
  const nativeAvailable = options.nativeAvailable === true;
  const nativeReason = String(options.nativeReason || '');
  const missingNativeApi = Array.isArray(options.missingNativeApi) ? options.missingNativeApi : [];
  const sourceClassActive = options.sourceClassActive === true;
  const sourceClassObserverReady = options.sourceClassObserverReady === true;
  const previous = options.previousOwnership || null;
  const previousMatches = previousFallbackOwnershipMatches(previous, editorKey, nativeReason, missingNativeApi);
  const unavailable = !nativeAvailable && nativeApiMissing(nativeReason, missingNativeApi);
  const skip = hasEditor && unavailable && sourceClassActive && sourceClassObserverReady && previousMatches;
  return {
    skip,
    hasEditor,
    editorKey,
    nativeAvailable,
    nativeReason,
    missingNativeApi,
    sourceClassActive,
    sourceClassObserverReady,
    previousMatches,
    reason: String(options.reason || 'syntax-owner'),
    path: skip ? 'native-unavailable-syntax-owner-source-class-deduped' : 'syntax-owner-source-class-check',
  };
}

export function shouldSkipStableEditorLifecycleForNativeFallback(options = {}) {
  const hasEditor = options.hasEditor === true;
  const editorKey = String(options.editorKey || '');
  const nativeReason = String(options.nativeReason || options.previousOwnership?.nativeReason || '');
  const missingNativeApi = Array.isArray(options.missingNativeApi)
    ? options.missingNativeApi
    : (Array.isArray(options.previousOwnership?.missingNativeApi) ? options.previousOwnership.missingNativeApi : []);
  const sourceClassActive = options.sourceClassActive === true;
  const sourceClassObserverReady = options.sourceClassObserverReady === true;
  const previous = options.previousOwnership || null;
  const reason = String(options.reason || 'stable-editor-lifecycle');
  const lowerReason = reason.toLowerCase();
  const previousMatches = previousFallbackOwnershipMatches(previous, editorKey, nativeReason, missingNativeApi);
  const nativeUnavailable = nativeApiMissing(nativeReason, missingNativeApi);
  const stableReason = /stable|mutation|settle|focus|click|raf|ms|companion-editor-ready/.test(lowerReason) &&
    !/new-editor|editor-sentinel-new|settings|option-change|range-change|toggle|reset|restore/.test(lowerReason);
  const skip = hasEditor && nativeUnavailable && sourceClassActive && sourceClassObserverReady && previousMatches && stableReason;
  return {
    skip,
    hasEditor,
    editorKey,
    sourceClassActive,
    sourceClassObserverReady,
    nativeUnavailable,
    nativeReason,
    missingNativeApi,
    previousMatches,
    stableReason,
    reason,
    path: skip ? 'native-unavailable-stable-editor-lifecycle-deduped' : 'stable-editor-lifecycle-check',
  };
}

export function shouldAttemptNativeHighlightForActiveEditor(options = {}) {
  const hasEditor = options.hasEditor === true;
  const nativeHighlightActive = options.nativeHighlightActive === true;
  const pending = options.pending === true;
  const reason = String(options.reason || 'active-editor-native-highlight');
  if (!hasEditor) {
    return { attempt: false, hasEditor, nativeHighlightActive, pending, reason, path: 'no-editor' };
  }
  if (nativeHighlightActive) {
    return { attempt: false, hasEditor, nativeHighlightActive, pending, reason, path: 'native-highlight-already-active' };
  }
  if (pending) {
    return { attempt: false, hasEditor, nativeHighlightActive, pending, reason, path: 'native-highlight-install-pending' };
  }
  return { attempt: true, hasEditor, nativeHighlightActive, pending, reason, path: 'active-editor-native-highlight-trigger' };
}

export function shouldSuppressLegacySmartSyntaxForNativeHighlight(options = {}) {
  const nativeHighlightActive = options.nativeHighlightActive === true;
  return {
    suppressed: nativeHighlightActive,
    nativeHighlightActive,
    reason: String(options.reason || 'smart-source-syntax'),
    path: nativeHighlightActive ? 'native-highlight-owner' : 'legacy-fallback',
  };
}

export function shouldSuppressLegacySmartSyntaxObserverForNativeHighlight(options = {}) {
  const nativeHighlightActive = options.nativeHighlightActive === true;
  return {
    suppressed: nativeHighlightActive,
    nativeHighlightActive,
    reason: String(options.reason || 'smart-source-syntax-observer'),
    path: nativeHighlightActive ? 'native-highlight-observer-owner' : 'legacy-observer-fallback',
  };
}

export function shouldSuppressLegacyInlineSyntaxOwnerForNativeHighlight(options = {}) {
  const nativeHighlightActive = options.nativeHighlightActive === true;
  return {
    suppressed: nativeHighlightActive,
    nativeHighlightActive,
    reason: String(options.reason || 'syntax-owner'),
    path: nativeHighlightActive ? 'native-highlight-inline-owner' : 'legacy-inline-owner-fallback',
  };
}

export function shouldSuppressLegacySourceClassRefreshForNativeHighlight(options = {}) {
  const nativeHighlightActive = options.nativeHighlightActive === true;
  return {
    suppressed: nativeHighlightActive,
    nativeHighlightActive,
    reason: String(options.reason || 'source-class-refresh'),
    path: nativeHighlightActive ? 'native-highlight-source-class-refresh-owner' : 'legacy-source-class-refresh-fallback',
  };
}

export function shouldPromoteSourceClassFallbackForNativeHighlight(options = {}) {
  const nativeInstalled = options.nativeInstalled === true;
  const sourceClassInstalled = options.sourceClassInstalled === true;
  const nativeReason = String(options.nativeReason || '');
  const nativeUnavailable = nativeApiMissing(nativeReason, []);
  const promoted = !nativeInstalled && sourceClassInstalled && nativeUnavailable;
  return {
    promoted,
    nativeInstalled,
    sourceClassInstalled,
    nativeReason,
    reason: String(options.reason || 'source-class-fallback-owner'),
    path: promoted ? 'source-class-fallback-owner' : 'fallback-not-promoted',
  };
}

export function sourceClassFallbackOwnershipSignature(options = {}) {
  return JSON.stringify({
    editorKey: String(options.editorKey || ''),
    nativeReason: String(options.nativeReason || ''),
    mapped: Number(options.mapped || 0),
    sourceClass: options.sourceClassInstalled === true || options.sourceClass === true,
    path: 'source-class-fallback-owner',
  });
}

export function shouldRecordSourceClassFallbackOwnership(options = {}) {
  const promoted = options.promoted === true;
  const sourceClassInstalled = options.sourceClassInstalled === true || options.sourceClass === true;
  const existingSourceClassActive = options.existingSourceClassActive === true;
  const nextSignature = sourceClassFallbackOwnershipSignature(options);
  const previousSignature = String(options.previousSignature || '');
  const duplicate = promoted && sourceClassInstalled && existingSourceClassActive && !!previousSignature && previousSignature === nextSignature;
  return {
    record: promoted && !duplicate,
    duplicate,
    promoted,
    sourceClassInstalled,
    existingSourceClassActive,
    previousSignature,
    nextSignature,
    reason: String(options.reason || 'source-class-fallback-owner'),
    path: duplicate ? 'source-class-fallback-owner-deduped' : 'source-class-fallback-owner',
  };
}

/**
 * @param {Record<string, any>} [parts]
 * @param {Record<string, any>} [syntax]
 * @param {(kind: string) => string} [colorForKind]
 * @param {Record<string, any>} [options]
 * @returns {Record<string, any>} install outcome envelope (shape varies by branch)
 */
export function installCodeMirrorNativeHighlightExtension(parts = {}, syntax = {}, colorForKind = () => '', options = {}) {
  const cm = parts.cm || null;
  const view = parts.view || null;
  const host = parts.host || parts.editor || null;
  const apiStatus = codeMirrorNativeHighlightApiStatus(parts);
  if (!apiStatus.available) {
    return {
      installed: false,
      nativeHighlight: false,
      reason: 'missing-native-codemirror-api',
      apiStatus,
      missing: apiStatus.missing,
    };
  }

  const spec = buildCodeMirrorNativeHighlightSpec(parts, colorForKind);
  if (!spec.entries.length) {
    return { installed: false, nativeHighlight: false, reason: spec.reason || 'no-highlight-spec' };
  }

  let highlightStyle;
  let extension;
  try {
    highlightStyle = cm.HighlightStyle.define(spec.entries);
    extension = cm.syntaxHighlighting(highlightStyle, { fallback: true });
  } catch (error) {
    return {
      installed: false,
      nativeHighlight: false,
      reason: 'highlight-style-create-failed',
      error: String(error?.message || error || ''),
    };
  }

  const signature = nativeHighlightSignature({ version: options.version, syntax, spec });
  const compartmentOwner = host || view;
  let compartment = compartmentOwner?.[NATIVE_HIGHLIGHT_COMPARTMENT_KEY] || null;
  if (!compartment) {
    try {
      compartment = new cm.Compartment();
      if (compartmentOwner) compartmentOwner[NATIVE_HIGHLIGHT_COMPARTMENT_KEY] = compartment;
    } catch (error) {
      return {
        installed: false,
        nativeHighlight: false,
        reason: 'compartment-create-failed',
        error: String(error?.message || error || ''),
      };
    }
  }

  let installedInState = false;
  try {
    installedInState = typeof compartment.get === 'function' && compartment.get(view.state) !== undefined;
  } catch {
    installedInState = !!compartmentOwner?.[NATIVE_HIGHLIGHT_INSTALLED_KEY];
  }

  if (installedInState && compartmentOwner?.[NATIVE_HIGHLIGHT_SIGNATURE_KEY] === signature) {
    return {
      installed: true,
      nativeHighlight: true,
      skipped: true,
      reason: 'unchanged-native-highlight',
      specCount: spec.entries.length,
      labels: spec.labels,
      kinds: spec.kinds,
    };
  }

  let effect;
  try {
    effect = installedInState
      ? compartment.reconfigure(extension)
      : cm.StateEffect.appendConfig.of(compartment.of(extension));
  } catch (error) {
    return {
      installed: false,
      nativeHighlight: false,
      reason: 'compartment-effect-create-failed',
      error: String(error?.message || error || ''),
    };
  }

  try {
    view.dispatch({ effects: effect });
  } catch (error) {
    return {
      installed: false,
      nativeHighlight: false,
      reason: 'native-highlight-dispatch-failed',
      error: String(error?.message || error || ''),
    };
  }

  if (compartmentOwner) {
    compartmentOwner[NATIVE_HIGHLIGHT_SIGNATURE_KEY] = signature;
    compartmentOwner[NATIVE_HIGHLIGHT_INSTALLED_KEY] = true;
  }

  return {
    installed: true,
    nativeHighlight: true,
    skipped: false,
    reason: installedInState ? 'reconfigured-native-highlight' : 'installed-native-highlight',
    specCount: spec.entries.length,
    labels: spec.labels,
    kinds: spec.kinds,
    dispatch: installedInState ? 'reconfigure' : 'appendConfig',
  };
}
