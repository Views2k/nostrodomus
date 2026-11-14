#!/usr/bin/env python3
from pathlib import Path
import json
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LEGACY = PROJECT_ROOT / "src/main.legacy.js"
VERSION_MODULE = PROJECT_ROOT / "src/core/version.js"
YAML = PROJECT_ROOT / "src/yaml/yamlScanner.js"
SCORING = PROJECT_ROOT / "src/completion/scoring.js"
HA = PROJECT_ROOT / "src/providers/haRuntimeProvider.js"
PROVIDER_RUNTIME = PROJECT_ROOT / "src/providers/providerRuntime.js"
REPORT = PROJECT_ROOT / "reports/CONTEXT_POLISH_STATIC_TEST_REPORT.txt"
PROJECT = PROJECT_ROOT / "PROJECT.json"
project = json.loads(PROJECT.read_text(encoding="utf-8"))
expected_internal_version = str(project.get("internal_version") or "")

legacy = LEGACY.read_text(errors="replace")
version_module = VERSION_MODULE.read_text(errors="replace") if VERSION_MODULE.exists() else ""
yaml = YAML.read_text(errors="replace")
scoring = SCORING.read_text(errors="replace")
ha = HA.read_text(errors="replace")
provider_runtime = PROVIDER_RUNTIME.read_text(errors="replace")
source_context_owner = legacy + "\n" + yaml + "\n" + scoring + "\n" + ha

errors = []
notes = []

def require(name, text, token):
    if token not in text:
        errors.append(f"Missing {token!r} in {name}")
    else:
        notes.append(f"PASS {name}: {token}")

if expected_internal_version and expected_internal_version not in (legacy + version_module):
    errors.append(f"Missing current internal version token in legacy/version module: {expected_internal_version!r}")
else:
    notes.append("PASS current internal version token found in legacy/version module")

for token in [
    "yamlScalarValueKind",
    "isScalarValueKind",
    "isScalarConfigContext",
    "scalarValueContext",
    "lineNumber",
    "currentLine",
    "beforeCursor",
    "afterCursor",
    "selection",
    "existing-key-context",
]:
    require("context owner source", source_context_owner, token)

for token in [
    "blockScalarIndent",
    "directYamlKey(raw)",
    "yamlScalarValueKind",
    "isScalarConfigContext",
    "lineNumber",
]:
    require("yamlScanner", yaml, token)

for token in [
    "isScalarConfigContext",
    "scalarValueContext",
    "entity-list",
]:
    require("scoring", scoring, token)

for token in [
    "yamlScalarValueKind",
    "isScalarValueKind",
    "entity-list",
    "number",
    "duration",
]:
    require("haRuntimeProvider", ha, token)

# Guardrail: scalar fields must not be treated as regular snippet/key contexts.
# snippetRowsForContext was extracted out of src/main.legacy.js into
# src/providers/providerRuntime.js, where it still short-circuits scalar config
# contexts (the same invariant, current location).
if "if (isScalarConfigContext(ctx)) return [];" not in provider_runtime:
    errors.append("snippetRowsForContext must short-circuit scalar config contexts")
else:
    notes.append("PASS scalar contexts do not emit generic snippets")

if "if (isScalarConfigContext(ctx)) return true;" in legacy or "shouldSuppressStaticForFocusedContextFromScoringModule(ctx, candidates)" in legacy or "if (isScalarConfigContext(ctx)) return true;" in scoring:
    notes.append("PASS scalar contexts suppress generic static rows")
else:
    errors.append("shouldSuppressStaticForFocusedContext must suppress scalar generic rows")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Context polish static test report\n\nResults:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("CONTEXT POLISH STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("CONTEXT POLISH STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
