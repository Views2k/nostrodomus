#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / "src/main.legacy.js").read_text(encoding="utf-8", errors="replace")
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

# Post-v0.1.44 truth: main.legacy consumes the lifecycle API through thin
# delegates from src/composition/runtimeDelegateBridge.js, not local wrapper functions.
for token in [
    "import { createObserverLifecycleRuntime } from './diagnostics/observerLifecycleRuntime.js';",
    "observerLifecycleRuntime = createObserverLifecycleRuntime({",
    "const observerLifecycleDelegates = createObserverLifecycleRuntimeDelegates(() => observerLifecycleRuntime, reason => observerLifecycleDisconnectAll(reason));",
    "disconnectAllNostrodomusObservers } = observerLifecycleDelegates;",
]:
    if token not in main:
        errors.append(f"main missing observer lifecycle wrapper/lineage token: {token}")

# The extraction is permanent current structure; the module/main token pins above
# are the real contract. (The old PROJECT.json lineage-string pin was archaeology.)

if errors:
    print("OBSERVER LIFECYCLE RUNTIME OWNER STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("OBSERVER LIFECYCLE RUNTIME OWNER STATIC TEST OK")
