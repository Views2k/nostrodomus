#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "src" / "yaml" / "yamlCompletionContext.js"
DOC = ROOT / "docs" / "CONTEXT_DESCRIPTOR.md"
TEST = ROOT / "tests" / "context" / "yaml_completion_context.test.mjs"
FIXTURES = ROOT / "tests" / "fixtures" / "context"

errors = []
text = MODULE.read_text(encoding="utf-8", errors="replace") if MODULE.exists() else ""
doc = DOC.read_text(encoding="utf-8", errors="replace") if DOC.exists() else ""
test = TEST.read_text(encoding="utf-8", errors="replace") if TEST.exists() else ""

for path, label in [(MODULE, "context module"), (DOC, "context descriptor doc"), (TEST, "context executed test")]:
    if not path.exists():
        errors.append(f"Missing {label}: {path.relative_to(ROOT)}")

for token in [
    "export const CONTEXT_DESCRIPTOR_VERSION = 1",
    "export function describeYamlCompletionContext",
    "export function currentYamlPath",
    "export function blockScalarContextAt",
    "export function inferYamlValueKind",
    "export function inferYamlScalarValueKind",
    "export function inferFocusKind",
    "export const CONTEXT_DESCRIPTOR_FIELD_NAMES",
    "export function contextDescriptorValidationErrors",
    "descriptorVersion",
    "valueKind",
    "focusKind",
    "shouldSuggest",
]:
    if token not in text:
        errors.append(f"src/yaml/yamlCompletionContext.js missing token: {token}")

for forbidden in ["window", "localStorage", "sessionStorage", "querySelector", "addEventListener", "fetch(", "sendBeacon", "eval(", "new Function"]:
    if forbidden in text:
        errors.append(f"context module must stay pure; found {forbidden}")
for forbidden_word in ["document", "state"]:
    if re.search(rf"\b{forbidden_word}\b", text):
        errors.append(f"context module must not reference monolith/browser token: {forbidden_word}")

for token in ["Context Descriptor Contract", "Current descriptor version: `1`", "describeYamlCompletionContext", "Fixture policy"]:
    if token not in doc:
        errors.append(f"docs/CONTEXT_DESCRIPTOR.md missing token: {token}")

for token in ["describeYamlCompletionContext matches known context fixtures", "fixture corpus should cover real HA contexts", "stripYamlCommentRespectingQuotes", "descriptor version and field schema are explicit and stable"]:
    if token not in test:
        errors.append(f"tests/context/yaml_completion_context.test.mjs missing token: {token}")

fixture_files = sorted(FIXTURES.glob("*.json")) if FIXTURES.exists() else []
if len(fixture_files) < 25:
    errors.append("context fixture corpus must include at least 25 fixtures after Priority 5 value-kind parity expansion")

if errors:
    print("CONTEXT DESCRIPTOR STATIC TEST FAILED")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("CONTEXT DESCRIPTOR STATIC TEST OK")
print("Report: reports/CONTEXT_DESCRIPTOR_STATIC_TEST_REPORT.txt")
reports = ROOT / "reports"
reports.mkdir(exist_ok=True)
(reports / "CONTEXT_DESCRIPTOR_STATIC_TEST_REPORT.txt").write_text("CONTEXT DESCRIPTOR STATIC TEST OK\n", encoding="utf-8")
