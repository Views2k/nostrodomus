#!/usr/bin/env python3
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP = PROJECT_ROOT / "src/app.js"
YAML = PROJECT_ROOT / "src/yaml/yamlScanner.js"
ADAPTER = PROJECT_ROOT / "src/yaml/runtimeContextAdapter.js"
SCORING = PROJECT_ROOT / "src/completion/scoring.js"
HA = PROJECT_ROOT / "src/providers/haRuntimeProvider.js"
CLASSIFIER = PROJECT_ROOT / "src/yaml/yamlContextClassifier.js"
PROVIDER_RUNTIME = PROJECT_ROOT / "src/providers/providerRuntime.js"
REPORT = PROJECT_ROOT / "reports/SCALAR_VALUE_CONTEXT_STATIC_TEST_REPORT.txt"

app = APP.read_text(errors="replace")
yaml = YAML.read_text(errors="replace")
adapter = ADAPTER.read_text(errors="replace")
scoring = SCORING.read_text(errors="replace")
ha = HA.read_text(errors="replace")
classifier = CLASSIFIER.read_text(errors="replace")
provider_runtime = PROVIDER_RUNTIME.read_text(errors="replace")
# The runtime context adapter builds the live descriptor, including its idle reasons.
source_context_owner = app + "\n" + yaml + "\n" + adapter + "\n" + scoring + "\n" + ha

errors = []
notes = []

def require(name, text, token):
    if token not in text:
        errors.append(f"Missing {token!r} in {name}")
    else:
        notes.append(f"PASS {name}: {token}")

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
    "entity-list",
]:
    require("scoring", scoring, token)

for token in [
    "yamlScalarValueKind",
    "isScalarValueKind",
    "number",
]:
    require("haRuntimeProvider", ha, token)

# haRuntimeProvider delegates value and focus kinds to the YAML context classifier.
for token in [
    "entity-list",
    "duration",
]:
    require("yamlContextClassifier", classifier, token)

# Scalar fields are not snippet or key positions: snippetRowsForContext in
# src/providers/providerRuntime.js returns no rows for them.
if "if (isScalarConfigContext(ctx)) return [];" not in provider_runtime:
    errors.append("snippetRowsForContext must short-circuit scalar config contexts")
else:
    notes.append("PASS scalar contexts do not emit generic snippets")

if "if (isScalarConfigContext(ctx)) return true;" in scoring:
    notes.append("PASS scalar contexts suppress generic static rows")
else:
    errors.append("shouldSuppressStaticForFocusedContext must suppress scalar generic rows")

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    "Scalar value context static test report\n\nResults:\n" + "\n".join(notes) +
    "\n\nErrors:\n" + "\n".join(errors) + "\n"
)

if errors:
    print("SCALAR VALUE CONTEXT STATIC TEST FAILED")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)

print("SCALAR VALUE CONTEXT STATIC TEST OK")
for n in notes:
    print(n)
print("Report:", REPORT)
