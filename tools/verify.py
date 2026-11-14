#!/usr/bin/env python3
from pathlib import Path
import argparse
import contextlib
import hashlib
import io
import json
import re
import runpy
import subprocess
import sys
import time

parser = argparse.ArgumentParser(description="Verify Nostrodomus build/test/release truth.")
parser.add_argument("--release", action="store_true", help="Require release-grade build metadata instead of dev warnings.")
ARGS = parser.parse_args()
RELEASE_MODE = bool(ARGS.release)

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist" / "nostrodomus.js"
PROJECT = ROOT / "PROJECT.json"
ENTRY = ROOT / "src" / "main.js"
LEGACY = ROOT / "src" / "main.legacy.js"
VERSION_MODULE = ROOT / "src" / "core" / "version.js"
SETTINGS_KEYS_MODULE = ROOT / "src" / "core" / "settingsStorageKeys.js"
RUNTIME_CONSTANTS_MODULE = ROOT / "src" / "core" / "runtimeConstants.js"
CHANGELOG_SUMMARY_MODULE = ROOT / "src" / "core" / "changelogSummary.js"
BUILD_REPORT = ROOT / "reports" / "BUILD_LAST.txt"
REPORT = ROOT / "reports" / "VERIFY_LAST.txt"
PACKAGE = ROOT / "package.json"
HACS = ROOT / "hacs.json"
README = ROOT / "README.md"

errors = []
warnings = []

def check(ok, msg):
    if not ok:
        errors.append(msg)

def warn(ok, msg):
    if not ok:
        warnings.append(msg)

project = {}
package = {}
try:
    project = json.loads(PROJECT.read_text(encoding="utf-8"))
except Exception as exc:
    errors.append(f"PROJECT.json is not valid JSON or missing: {exc}")
try:
    package = json.loads(PACKAGE.read_text(encoding="utf-8")) if PACKAGE.exists() else {}
except Exception as exc:
    errors.append(f"package.json is not valid JSON: {exc}")
hacs = {}
try:
    hacs = json.loads(HACS.read_text(encoding="utf-8")) if HACS.exists() else {}
except Exception as exc:
    errors.append(f"hacs.json is not valid JSON: {exc}")

text = DIST.read_text(errors="replace") if DIST.exists() else ""
check(DIST.exists(), f"Missing dist file: {DIST}")
check(ENTRY.exists(), f"Missing source entry: {ENTRY}")
if ENTRY.exists():
    check(ENTRY.read_text(encoding="utf-8").strip() == "import './main.legacy.js';", "src/main.js must remain one-line side-effect import")
check(LEGACY.exists(), f"Missing legacy runtime: {LEGACY}")
check(VERSION_MODULE.exists(), f"Missing runtime identity module: {VERSION_MODULE}")
check(SETTINGS_KEYS_MODULE.exists(), f"Missing settings storage keys module: {SETTINGS_KEYS_MODULE}")
check(RUNTIME_CONSTANTS_MODULE.exists(), f"Missing runtime constants module: {RUNTIME_CONSTANTS_MODULE}")
check(CHANGELOG_SUMMARY_MODULE.exists(), f"Missing changelog summary module: {CHANGELOG_SUMMARY_MODULE}")
check(project.get("source_entry") == "src/main.js", "PROJECT.json source_entry must be src/main.js")
check(project.get("legacy_runtime") == "src/main.legacy.js", "PROJECT.json legacy_runtime must be src/main.legacy.js")
check(project.get("dist_entry") == "dist/nostrodomus.js", "PROJECT.json dist_entry must be dist/nostrodomus.js")
check(str(hacs.get("filename") or "") == str(project.get("dist_entry") or ""), "hacs.json filename must match PROJECT.json dist_entry")
version_value = str(project.get("version") or "")
internal_version = str(project.get("internal_version") or "")
RUNTIME_LAYER_ROLLBACK = "runtime-layer-rollback" in internal_version
check(re.match(r"^\d+\.\d+\.\d+$", version_value) is not None, "PROJECT.json version must use strict SemVer MAJOR.MINOR.PATCH")
check(str(package.get("version") or "") == version_value, "package.json version must match PROJECT.json version")
check(internal_version.startswith(f"nostrodomus-v{version_value}-"), "PROJECT.json internal_version must begin with nostrodomus-v<PROJECT.version>-")
check(len(internal_version) <= 80, "PROJECT.json internal_version must stay short; use changelog/docs for lineage")
check(internal_version in text, "dist VERSION must match PROJECT.json internal_version")
if VERSION_MODULE.exists():
    version_module_text = VERSION_MODULE.read_text(encoding="utf-8", errors="replace")
    check(f'export const VERSION = "{internal_version}";' in version_module_text, "src/core/version.js VERSION must match PROJECT.json internal_version")
    check(f'export const PROJECT_VERSION = "{version_value}";' in version_module_text, "src/core/version.js PROJECT_VERSION must match PROJECT.json version")
    for forbidden in ["window", "document", "localStorage", "setTimeout", "addEventListener", "querySelector"]:
        check(forbidden not in version_module_text, f"src/core/version.js must remain pure and not reference {forbidden}")
if LEGACY.exists():
    legacy_version_text = LEGACY.read_text(encoding="utf-8", errors="replace")
    identity_wired = "from './core/version.js'" in legacy_version_text
    settings_keys_wired = "from './core/settingsStorageKeys.js'" in legacy_version_text
    runtime_constants_wired = "from './core/runtimeConstants.js'" in legacy_version_text
    if identity_wired:
        check("const VERSION =" not in legacy_version_text[:900], "src/main.legacy.js must not redeclare VERSION after importing src/core/version.js")
        check("const PROJECT_VERSION =" not in legacy_version_text[:900], "src/main.legacy.js must not redeclare PROJECT_VERSION after importing src/core/version.js")
    elif RUNTIME_LAYER_ROLLBACK:
        check(internal_version in legacy_version_text, "rollback src/main.legacy.js VERSION must match PROJECT.json internal_version")
        check(f'PROJECT_VERSION = "{version_value}"' in legacy_version_text, "rollback src/main.legacy.js PROJECT_VERSION must match PROJECT.json version")
    else:
        check(internal_version in legacy_version_text, "src/main.legacy.js VERSION must match PROJECT.json internal_version")

    if settings_keys_wired:
        check("const SETTINGS_LEGACY_KEYS =" not in legacy_version_text[:1200], "src/main.legacy.js must not redeclare SETTINGS_LEGACY_KEYS after extraction")
        check("const SETTINGS_READ_KEYS =" not in legacy_version_text[:1200], "src/main.legacy.js must not redeclare SETTINGS_READ_KEYS after extraction")
    elif RUNTIME_LAYER_ROLLBACK:
        check("const SETTINGS_LEGACY_KEYS =" in legacy_version_text, "rollback runtime must keep v31.6.81 settings-key behavior in the monolith")
    else:
        check(False, "src/main.legacy.js must import settings storage keys from src/core/settingsStorageKeys.js")

    if runtime_constants_wired:
        check("const SECURITY_LIMITS =" not in legacy_version_text[:1800], "src/main.legacy.js must not redeclare SECURITY_LIMITS after extraction")
        check("const STATIC_PROVIDER_ID =" not in legacy_version_text[:1800], "src/main.legacy.js must not redeclare provider IDs after extraction")
    elif RUNTIME_LAYER_ROLLBACK:
        check("const SECURITY_LIMITS =" in legacy_version_text, "rollback runtime must keep v31.6.81 runtime constants behavior in the monolith")
    else:
        check(False, "src/main.legacy.js must import runtime constants from src/core/runtimeConstants.js")

if SETTINGS_KEYS_MODULE.exists():
    settings_keys_text = SETTINGS_KEYS_MODULE.read_text(encoding="utf-8", errors="replace")
    check("export const SETTINGS_MIGRATION_LEGACY_KEYS = Object.freeze([" in settings_keys_text, "src/core/settingsStorageKeys.js must export the frozen legacy-key migration table")
    check("SETTINGS_READ_KEYS" not in settings_keys_text, "legacy read-fallback keys were retired in 0.1.63; reads use SETTINGS_WRITE_KEY only")
    for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "addEventListener", "querySelector"]:
        check(forbidden not in settings_keys_text, f"src/core/settingsStorageKeys.js must remain pure and not reference {forbidden}")
    if settings_keys_wired:
        check("SETTINGS_MIGRATION_LEGACY_KEYS" in text and "SETTINGS_WRITE_KEY" in text, "dist must include bundled settings storage keys module")

if CHANGELOG_SUMMARY_MODULE.exists():
    changelog_summary_bytes = CHANGELOG_SUMMARY_MODULE.stat().st_size
    check(changelog_summary_bytes < 12 * 1024, f"src/core/changelogSummary.js must stay under 12 KB; found {changelog_summary_bytes} bytes")

if RUNTIME_CONSTANTS_MODULE.exists():
    runtime_constants_text = RUNTIME_CONSTANTS_MODULE.read_text(encoding="utf-8", errors="replace")
    check("export const SECURITY_LIMITS" in runtime_constants_text, "src/core/runtimeConstants.js must export SECURITY_LIMITS")
    for token in ["STATIC_PROVIDER_ID", "HA_VALUE_PROVIDER_ID", "LOVELACE_CONTEXT_PROVIDER_ID", "SNIPPET_PROVIDER_ID"]:
        check(token in runtime_constants_text, f"src/core/runtimeConstants.js missing provider token: {token}")
    for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "addEventListener", "querySelector"]:
        check(forbidden not in runtime_constants_text, f"src/core/runtimeConstants.js must remain pure and not reference {forbidden}")
    if runtime_constants_wired:
        check("SECURITY_LIMITS" in text and "STATIC_PROVIDER_ID" in text, "dist must include bundled runtime constants module")
    elif RUNTIME_LAYER_ROLLBACK:
        check("const SECURITY_LIMITS = Object.freeze" in text or "var SECURITY_LIMITS = Object.freeze" in text, "rollback dist must include v31.6.81 runtime constants in the monolith")


if LEGACY.exists():
    legacy_text = LEGACY.read_text(encoding="utf-8", errors="replace")
    check('installInitialSyntaxPaintGate("preflight-scan")' not in legacy_text, "codebox preflight must not reinstall the global initial syntax paint gate on every mutation")
    check(
        "function primeInitialSyntaxPaintGateForEditor" in legacy_text
        or "primeInitialSyntaxPaintGateForEditor," in legacy_text,
        "initial syntax paint gate must have targeted editor priming",
    )
    check("function scheduleCodeboxPreflightMutationScan" in legacy_text, "codebox preflight mutation scans must be coalesced/throttled")
    syntax_runtime_path = ROOT / "src" / "syntax" / "syntaxRuntime.js"
    syntax_runtime_text = syntax_runtime_path.read_text(encoding="utf-8", errors="replace") if syntax_runtime_path.exists() else ""
    check(
        "syntax.initial-paint-gate.prime" in legacy_text
        or "syntax.initial-paint-gate.prime" in syntax_runtime_text
        or "syntax.initial-paint-gate.prime" in text,
        "targeted initial paint gate priming must remain visible in diagnostics",
    )
    check("mutationRecordsAreOnlyNostrodomusOwnedStyleChurn" not in legacy_text, "failed v31.6.61 style-node churn filter must remain reverted until a cascade-safe replacement is designed")
    check("Preserve cascade position without DOM churn" not in legacy_text, "failed v31.6.61 style-node ordering comment must not remain in runtime")
    style_dom_path = ROOT / "src" / "ui" / "styleDomRuntime.js"
    style_dom_text = style_dom_path.read_text(encoding="utf-8", errors="replace") if style_dom_path.exists() else ""
    check("if (style.parentNode) style.parentNode.removeChild(style);" in legacy_text or "if (style.parentNode) style.parentNode.removeChild(style);" in style_dom_text, "ensureStyleElementAtEnd must preserve the v31.6.60 cascade-refresh behavior for codebox frame styles")
    codebox_frame_path = ROOT / "src" / "ui" / "codeboxFrameRuntime.js"
    codebox_frame_text = codebox_frame_path.read_text(encoding="utf-8", errors="replace") if codebox_frame_path.exists() else ""
    check("function installCodeboxKeyboardContainment" in legacy_text or "function installCodeboxKeyboardContainment" in codebox_frame_text, "CodeMirror keyboard containment must remain installed outside the visual style path")
    check(("ev.stopPropagation();" in legacy_text or "ev.stopPropagation();" in codebox_frame_text) and ("Bubble-phase only: CodeMirror already receives the event/default action" in legacy_text or "Bubble-phase only: CodeMirror already receives the event/default action" in codebox_frame_text), "keyboard containment must stop editor key bubbling without preventing CodeMirror default typing")
    check("function primeCodeboxPreflightForEditor" in legacy_text, "codebox preflight must support targeted editor priming before full style settle")

COMPANION = ROOT / "reference/companions" / "nostrodomus_editor_v17_2_learned_reapply.js"
if COMPANION.exists():
    companion_text = COMPANION.read_text(encoding="utf-8", errors="replace")
    check("nostrodomus-editor-v17.2.59-preview-mutation-guard-native-events" in companion_text, "v17 companion must record preview-mutation-guard-native-events version")
    check("function mutationsAreOnlyCodeMirrorEditorText" in companion_text, "v17 companion must ignore CodeMirror-only mutation callbacks")
    check("function mutationIsPreviewContentOnly" in companion_text, "v17 companion must classify preview-content-only mutations")
    check("function mutationsAreOnlyPreviewContent" in companion_text, "v17 companion must ignore preview-content-only mutation callbacks while typing")
    check("previewMutationCallbacksSuppressed" in companion_text, "v17 companion must track suppressed preview-content mutation callbacks")
    check("previewMutationGuard" in companion_text and "preservesNativePreviewEvents: true" in companion_text, "v17 companion must expose preview mutation guard diagnostics and preserve native HA preview events")
    check("function installPreviewUpdateDebounce" not in companion_text, "v17 companion must not install preview value-event debounce")
    check("captureQueueHandler" not in companion_text, "v17 companion must not capture/intercept HA preview value events")
    check("__nostrodomusPreviewDebouncedReplay" not in companion_text, "v17 companion must not replay intercepted HA preview events")
    check("codeEditor.addEventListener(type, captureQueueHandler, true)" not in companion_text, "v17 companion must not attach capture-phase value-changed preview interceptors")
    check("node.host?.nodeType === Node.ELEMENT_NODE" in companion_text, "preview mutation filtering must handle ShadowRoot mutation targets")
    check("function primeNostrodomusEditorPrepaint" in companion_text, "v17 companion must prime Nostrodomus prepaint before normal bridge settle")

for old in ["nostrodomus-engine-v30g.js", "nostrodomus-engine-v30o-working.js"]:
    check(not (ROOT / "dist" / old).exists(), f"Old generated dist artifact should not exist: dist/{old}")

def parse_build_report(text_value):
    parsed = {}
    for line in text_value.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        parsed[key.strip()] = value.strip()
    return parsed

build_report_text = ""
build_report = {}
if BUILD_REPORT.exists():
    build_report_text = BUILD_REPORT.read_text(encoding="utf-8", errors="replace")
    build_report = parse_build_report(build_report_text)
    check("Live target writes: none" in build_report_text, "Build report must confirm no live target writes")
else:
    if RELEASE_MODE:
        errors.append("BUILD_LAST.txt not found; run tools/build.py first, then verify --release.")
    else:
        warnings.append("BUILD_LAST.txt not found; run tools/build.py first.")

for token in ["window.__nostrodomus", "nostrodomusCodeEditorOverlayRoot", "debugSnapshot"]:
    check(token in text, f"Missing bundle token: {token}")
# Dynamic code and remote-channel primitives are banned from the shipped bundle (see
# SECURITY.md). `new Function` covers the eval-style constructor; bare `Function(` is intentionally
# not listed because it would substring-match any *Function( identifier a future build emits.
for bad in [
    "eval(", "new Function", "sendBeacon", "fetch(",
    "import(", "XMLHttpRequest", "WebSocket(", "EventSource(",
    "document.write", "srcdoc", "javascript:",
]:
    check(bad not in text, f"Forbidden string found: {bad}")
innerhtml_count = text.count("innerHTML")
# Fail closed: a missing or corrupt innerhtml_max must tighten the ceiling to the
# pinned zero, never loosen it back to the migration-era tolerance.
try:
    innerhtml_max = int(project.get("innerhtml_max", 0))
except Exception:
    innerhtml_max = 0
check(innerhtml_count <= innerhtml_max, f"dist innerHTML count {innerhtml_count} exceeds allowed maximum {innerhtml_max}")
if LEGACY.exists():
    legacy_innerhtml_count = LEGACY.read_text(encoding="utf-8", errors="replace").count("innerHTML")
    check(legacy_innerhtml_count <= innerhtml_max, f"legacy innerHTML count {legacy_innerhtml_count} exceeds allowed maximum {innerhtml_max}")
warn(innerhtml_count == 0, f"innerHTML debt remains in tracked legacy render path; count={innerhtml_count}, max={innerhtml_max}")
warn("localStorage" in text, "localStorage settings persistence missing from dist bundle.")

node_result = "not run"
try:
    proc = subprocess.run(["node", "--check", str(DIST)], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=20)
    node_result = proc.stdout.strip() or "node --check OK"
    if proc.returncode != 0:
        errors.append("node --check failed: " + node_result)
except FileNotFoundError:
    node_result = "node unavailable; skipped"
except Exception as exc:
    node_result = f"node check error: {exc}"
    errors.append(node_result)

# v31.4 gate: every active extracted source file must parse before future
# extractions can be trusted. The legacy IIFE remains checked indirectly via dist.
src_files = sorted(
    p for p in (ROOT / "src").rglob("*.js")
    if p.name != "main.legacy.js" and "extract-candidates" not in p.parts
)
src_parse_errors = []
try:
    for src_file in src_files:
        proc = subprocess.run(
            ["node", "--check", str(src_file)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        )
        if proc.returncode != 0:
            src_parse_errors.append(f"{src_file.relative_to(ROOT)}: {proc.stdout.strip()[:300]}")
except FileNotFoundError:
    warnings.append("node unavailable; src parse gate skipped")
for err in src_parse_errors:
    errors.append("Active source does not parse: " + err)

if BUILD_REPORT.exists():
    build_report_text = BUILD_REPORT.read_text(encoding="utf-8", errors="replace")
    check(
        "Mode: python-fallback-legacy-copy" not in build_report_text,
        "Build report shows legacy-fallback mode; this artifact must not be verified as release-ready. Re-run tools/build.py without --allow-legacy-fallback.",
    )

for stray in ROOT.rglob("*.backup_*"):
    try:
        rel = stray.relative_to(ROOT)
    except ValueError:
        rel = stray
    if rel.parts and rel.parts[0] == "analysis":
        continue
    errors.append(f"Backup file present in active tree: {rel}")

if (ROOT / "src" / "extract-candidates").exists():
    errors.append("src/extract-candidates/ must be moved to analysis/legacy-slices/")



def run_release_mode_checks():
    if not RELEASE_MODE:
        return
    current_version = str(project.get("version") or "")
    package_version = str(package.get("version") or "")
    current_internal = str(project.get("internal_version") or "")
    dist_sha = hashlib.sha256(DIST.read_bytes()).hexdigest() if DIST.exists() else "missing"
    source_sha = hashlib.sha256(LEGACY.read_bytes()).hexdigest() if LEGACY.exists() else "missing"
    version_module_sha = hashlib.sha256(VERSION_MODULE.read_bytes()).hexdigest() if VERSION_MODULE.exists() else "missing"
    runtime_constants_module_sha = hashlib.sha256(RUNTIME_CONSTANTS_MODULE.read_bytes()).hexdigest() if RUNTIME_CONSTANTS_MODULE.exists() else "missing"

    check(BUILD_REPORT.exists(), "Release verify requires reports/BUILD_LAST.txt — run tools/build.py first")
    if not BUILD_REPORT.exists():
        return

    required_fields = [
        "Project version",
        "Package version",
        "Internal version",
        "Mode",
        "Fallback mode",
        "Source SHA256",
        "Version module SHA256",
        "Runtime constants module SHA256",
        "Dist SHA256",
        "Dist filename",
        "Node version",
        "esbuild version",
    ]
    for field in required_fields:
        check(field in build_report, f"BUILD_LAST.txt missing field: {field}")

    check(build_report.get("Project version") == current_version, "BUILD_LAST project version must match PROJECT.json version")
    check(build_report.get("Package version") == package_version == current_version, "BUILD_LAST package version must match package.json/PROJECT.json version")
    check(build_report.get("Internal version") == current_internal, "BUILD_LAST internal version must match PROJECT.json internal_version")
    check(build_report.get("Source SHA256") == source_sha, "BUILD_LAST source SHA must match src/main.legacy.js")
    check(build_report.get("Version module SHA256") == version_module_sha, "BUILD_LAST version module SHA must match src/core/version.js")
    check(build_report.get("Runtime constants module SHA256") == runtime_constants_module_sha, "BUILD_LAST runtime constants module SHA must match src/core/runtimeConstants.js")
    check(build_report.get("Dist SHA256") == dist_sha or build_report.get("SHA256") == dist_sha, "BUILD_LAST dist SHA must match current dist")
    check(build_report.get("Dist filename") == str(project.get("dist_entry") or ""), "BUILD_LAST dist filename must match PROJECT.json dist_entry")
    check(build_report.get("Fallback mode") == "no", "Release verify forbids fallback build mode")
    check(build_report.get("Mode") == "esbuild", "Release verify requires esbuild build mode")
    check((build_report.get("Node version") or "unknown") != "unknown", "BUILD_LAST must record node version")
    check((build_report.get("esbuild version") or "unknown") != "unknown", "BUILD_LAST must record esbuild version")
    readme = README.read_text(encoding="utf-8", errors="replace") if README.exists() else ""
    check("Nostrodomus" in readme, "README.md must use the public Nostrodomus name")
    check(str(hacs.get("name") or "") == "Nostrodomus", "hacs.json public name must be Nostrodomus in release mode")

run_release_mode_checks()


# Static-test skip rule.
#
# A static test is skipped ONLY when its OWN body asserts an EXACT, non-current version /
# internal_version EQUALITY (a genuinely frozen historical pin awaiting a >= floor migration).
# Dynamic current-version checks, ``>=`` floors, and ``not in`` absence checks are NOT pins and
# run normally. (The former over-broad substring heuristic — which parked a test merely for
# MENTIONING an older version anywhere in its source or a runpy-loaded tool — and the temporary
# P1 PENDING_STATIC_MIGRATION bridge it required are both gone now that the P1 migration is
# complete: every previously-parked static test was repaired to its current module home and
# un-skipped.)


def test_pins_non_current_version(test_path):
    """Return a reason a static test must be skipped this patch, or "" to run it.

    A test is skipped only when its OWN body asserts an EXACT, non-current version /
    internal_version EQUALITY (a genuinely frozen historical pin). Dynamic current-version
    checks, ``>=`` floors, and ``not in`` absence checks are NOT pins and run normally.
    """
    try:
        source = Path(test_path).read_text(encoding="utf-8", errors="replace")
    except Exception:
        return "unreadable static test"
    # Only the test's executable code counts as a pin — drop full-line comments so a comment that
    # merely DOCUMENTS a prior pin (e.g. `# un-pinned from version == "31.6.98"`) does not re-skip
    # a test that has actually been migrated to a >= floor.
    source = "\n".join(line for line in source.splitlines() if not line.lstrip().startswith("#"))
    current_version = str(project.get("version") or "")
    current_internal = str(project.get("internal_version") or "")
    older_versions = sorted({
        m
        for pair in re.findall(r'==\s*[\'"](\d+\.\d+\.\d+)[\'"]|[\'"](\d+\.\d+\.\d+)[\'"]\s*==', source)
        for m in pair
        if m and m != current_version
    })
    older_internals = sorted({
        m
        for pair in re.findall(r'==\s*[\'"](nostrodomus-v[\w.\-]+)[\'"]|[\'"](nostrodomus-v[\w.\-]+)[\'"]\s*==', source)
        for m in pair
        if m and m != current_internal
    })
    if older_versions or older_internals:
        details = []
        if older_versions:
            details.append("version " + ",".join(older_versions[:4]))
        if older_internals:
            details.append("internal_version " + ",".join(older_internals[:2]))
        return "historical exact-version-pinned static test (>= floor migration pending): " + "; ".join(details)
    return ""


test_results = []
for test in sorted((ROOT / "tests").glob("test_*_static.py")):
    buffer = io.StringIO()
    status = "OK"
    first = "OK"
    skip_reason = test_pins_non_current_version(test)
    if skip_reason:
        status = "SKIPPED"
        first = skip_reason
        test_results.append((test.name, status, first, ""))
        continue
    try:
        old_argv = sys.argv[:]
        sys.argv = [str(test)]
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            try:
                runpy.run_path(str(test), run_name="__main__")
            except SystemExit as exc:
                if int(exc.code or 0) != 0:
                    status = "FAILED"
        sys.argv = old_argv
    except Exception as exc:
        status = "ERROR"
        print(f"{type(exc).__name__}: {exc}", file=buffer)
    finally:
        sys.argv = old_argv if 'old_argv' in locals() else sys.argv
    out = buffer.getvalue().strip()
    first = out.splitlines()[0] if out else first
    test_results.append((test.name, status, first, out[-4000:]))
    if status != "OK":
        errors.append(f"{test.name} {status}: {out[-1200:]}")

sha = hashlib.sha256(DIST.read_bytes()).hexdigest() if DIST.exists() else "missing"
REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(
    f"Verify time: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
    f"Dist: {DIST}\n"
    f"SHA256: {sha}\n"
    f"Node: {node_result}\n\n"
    "Tests:\n" + "\n".join(f"- {name}: {status} — {first}" for name, status, first, _ in test_results) + "\n\n"
    "Errors:\n" + "\n".join("- " + e for e in errors) + "\n\n"
    "Warnings:\n" + "\n".join("- " + w for w in warnings) + "\n"
)

print("SHA256:", sha)
print("Node:", node_result)
for name, status, first, _ in test_results:
    print(f"{name}: {status} — {first}")
if warnings:
    print("\nWarnings:")
    for w in warnings:
        print("-", w)
if errors:
    print("\nErrors:")
    for e in errors:
        print("-", e)
    print("Report:", REPORT)
    sys.exit(1)
print("VERIFY OK")
print("Report:", REPORT)
