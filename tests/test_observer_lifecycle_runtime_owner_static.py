#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "src/app.js").read_text(encoding="utf-8", errors="replace")
module = (ROOT / "src/diagnostics/observerLifecycleRuntime.js").read_text(encoding="utf-8", errors="replace")

errors = []
for token in [
    "export function createObserverLifecycleRuntime",
    "function observerLifecycleCloseBindingReadiness()",
    "function observerLifecycleCloseDryRunProbe(reason = \"manual-close-lifecycle-dry-run\")",
    "function observerLifecycleCloseDryRunListenerProbe(reason = \"editor-focusout-close-lifecycle-dry-run-listener\")",
    "function disconnectAllNostrodomusObservers(reason = \"manual-observer-lifecycle-disconnect\")",
    "disconnectCodeboxPreflightObserver(`${cleanReason}-central`)",
    "cleanupCodeboxSlotUnclip(`${cleanReason}-central`)",
    "disconnectSourceClassSmartSyntaxObserver(`${cleanReason}-central`)",
]:
    if token not in module:
        errors.append(f"observer lifecycle runtime missing token: {token}")

# app.js uses the lifecycle API through delegates from
# src/composition/runtimeDelegateBridge.js, not through local wrapper functions.
for token in [
    "import { createObserverLifecycleRuntime } from './diagnostics/observerLifecycleRuntime.js';",
    "observerLifecycleRuntime = createObserverLifecycleRuntime({",
    "const observerLifecycleDelegates = createObserverLifecycleRuntimeDelegates(() => observerLifecycleRuntime, reason => observerLifecycleDisconnectAll(reason));",
    "disconnectAllNostrodomusObservers } = observerLifecycleDelegates;",
]:
    if token not in main:
        errors.append(f"main missing observer lifecycle wiring token: {token}")

if errors:
    print("OBSERVER LIFECYCLE RUNTIME OWNER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("OBSERVER LIFECYCLE RUNTIME OWNER STATIC TEST OK")
