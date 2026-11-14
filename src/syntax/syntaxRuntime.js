// Nostrodomus syntax runtime composer.
//
// createSyntaxRuntime wires the syntax lifecycle modules together and exposes their
// combined api. Each module receives the shared injected context plus the assembled
// `api` object for cross-module calls; modules only define functions at construction,
// so assembly order does not matter.

import { createTypingSessionLifecycle } from './typingSessionLifecycle.js';
import { createNativeHighlightLifecycle } from './nativeHighlightLifecycle.js';
import { createSourceClassCssBuilder } from './sourceClassCssBuilder.js';
import { createSmartSyntaxLifecycle } from './smartSyntaxLifecycle.js';
import { createSourceClassLifecycle } from './sourceClassLifecycle.js';
import { createDarkPlusBridge } from './darkPlusBridge.js';
import { createInitialSyntaxPaintGate } from './initialSyntaxPaintGate.js';
import { createSyntaxContentObservers } from './syntaxContentObservers.js';

export function createSyntaxRuntime(ctx) {
  const api = {};
  const deps = {
    ...ctx,
    scheduleDiagnosticsRefresh: ctx.scheduleDiagnosticsRefresh || (() => false),
    api,
  };
  Object.assign(
    api,
    createTypingSessionLifecycle(deps),
    createNativeHighlightLifecycle(deps),
    createSourceClassCssBuilder(deps),
    createSmartSyntaxLifecycle(deps),
    createSourceClassLifecycle(deps),
    createDarkPlusBridge(deps),
    createInitialSyntaxPaintGate(deps),
    createSyntaxContentObservers(deps),
  );
  return api;
}
