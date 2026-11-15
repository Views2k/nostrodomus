#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "src" / "app.js").read_text(encoding="utf-8", errors="replace")
static_provider = (ROOT / "src" / "providers" / "staticLibraryProvider.js").read_text(encoding="utf-8", errors="replace")
provider_runtime = (ROOT / "src" / "providers" / "providerRuntime.js").read_text(encoding="utf-8", errors="replace")
docs = (ROOT / "docs" / "COMPANION_RESOURCES.md").read_text(encoding="utf-8", errors="replace") if (ROOT / "docs" / "COMPANION_RESOURCES.md").exists() else ""
errors = []
for bad in [
    "import(`/local/nostrodomus-library-core-v1.js",
    "import(`/local/nostrodomus-library-webdev-v1.js",
    "[nostrodomus-library-core-v1] loaded",
    "[nostrodomus-library-webdev-v1] loaded",
]:
    if bad in app:
        errors.append(f"app.js must not load or log the external library files: {bad}")
for required in [
    "BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1",
    "BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1",
    "nostrodomus-library-bundled",
]:
    if required not in static_provider:
        errors.append(f"Missing bundled library token in static provider owner module: {required}")

for required in [
    "staticLibrary.loadLibrary({ state, buildIndex })",
    "staticLibrary.buildIndex({",
]:
    if required not in provider_runtime:
        errors.append(f"Provider runtime missing static library owner delegate token: {required}")
for required in [
    "createProviderRuntimeDelegates(() => providerRuntime)",
    "loadLibrary, sanitizeLibraryRow",
    "snippetRowsForContext, snippetProvider, buildIndex",
]:
    if required not in app:
        errors.append(f"app.js is missing provider runtime delegate token: {required}")
for path in [
    "reference/companions/nostrodomus_editor_v17_2_learned_reapply.js",
    "reference/companions/nostrodomus-picker-safe.js",
]:
    if not (ROOT / path).exists():
        errors.append(f"Missing managed companion resource: {path}")
for required in [
    "nostrodomus-library-core-v1",
    "nostrodomus-library-webdev-v1",
    "nostrodomus_editor_v17_2_learned_reapply.js",
    "nostrodomus-picker-safe.js",
]:
    if required not in docs:
        errors.append(f"Companion resource docs missing token: {required}")
if errors:
    print("RESOURCE CONSOLIDATION STATIC TEST FAILED")
    for e in errors: print("-", e)
    sys.exit(1)
print("RESOURCE CONSOLIDATION STATIC TEST OK")
