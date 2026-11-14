#!/usr/bin/env python3
"""Read-only runtime contract scanner for Nostrodomus.

This complements tools/verify.py by keeping historical no-touch regressions in one
small, fast check. It does not mutate files and it does not contact Home Assistant.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_FILES = [
    ROOT / "src" / "main.legacy.js",
    ROOT / "dist" / "nostrodomus.js",
]
# The codebox visual layer (host ::before/::after frame + frosted surface + surface-blur token
# + backdrop-filters + isolation + transparency) was extracted out of main.legacy.js into
# src/ui/codeboxStyle.js, and hostSurfaceSelector + the `isolation: isolate ${bangPriority};`
# template form into src/ui/codebox/codeboxPreflight.js, during the module decomposition.
VISUAL_LAYER_SOURCE_OWNER_FILES = [
    ROOT / "src" / "ui" / "codeboxStyle.js",
    ROOT / "src" / "ui" / "codebox" / "codeboxPreflight.js",
]
RUNTIME_TOKEN_SOURCE_OWNER_FILES = [
    ROOT / "src" / "main.legacy.js",
    ROOT / "src" / "ui" / "settingsInteractionRuntime.js",
    ROOT / "src" / "ui" / "styleDomRuntime.js",
    ROOT / "src" / "syntax" / "syntaxRuntime.js",
    # applySmartSyntaxRangeHighlights moved here during the syntax-runtime decomposition.
    ROOT / "src" / "syntax" / "smartSyntaxLifecycle.js",
]
COMPANION_FILES = [
    ROOT / "reference/companions" / "nostrodomus_editor_v17_2_learned_reapply.js",
]
VERSION_MODULE = ROOT / "src" / "core" / "version.js"
SETTINGS_KEYS_MODULE = ROOT / "src" / "core" / "settingsStorageKeys.js"
RUNTIME_CONSTANTS_MODULE = ROOT / "src" / "core" / "runtimeConstants.js"
DOC_FILES = [
    ROOT / "docs" / "contracts" / "RUNTIME_SCOPE_CONTRACT.md",
    ROOT / "docs" / "contracts" / "RUNTIME_IDENTITY_MODULE_CONTRACT.md",
    ROOT / "docs" / "contracts" / "SETTINGS_STORAGE_KEYS_MODULE_CONTRACT.md",
    ROOT / "docs" / "contracts" / "RUNTIME_CONSTANTS_MODULE_CONTRACT.md",
    ROOT / "docs" / "contracts" / "STYLE_OWNERSHIP_CONTRACT.md",
    ROOT / "docs" / "contracts" / "VISUAL_LAYER_BASELINE_CONTRACT.md",
    ROOT / "docs" / "VISUAL_REGRESSION_WORKFLOW.md",
    ROOT / "docs" / "contracts" / "SETTINGS_PORTAL_CONTRACT.md",
    ROOT / "docs" / "contracts" / "FILE_OWNERSHIP_MAP.md",
    ROOT / "docs" / "contracts" / "NO_TOUCH_REGRESSION_LIST.md",
]

FORBIDDEN_PATTERNS = [
    ("eval-call", r"\beval\s*\("),
    ("new-function", r"\bnew\s+Function\b"),
    ("sendbeacon", r"\bsendBeacon\b"),
    ("fetch-call", r"\bfetch\s*\("),
    ("preview-capture-replay-marker", r"__nostrodomusPreviewDebouncedReplay|captureQueueHandler|installPreviewUpdateDebounce"),
    ("failed-style-node-churn-filter", r"mutationRecordsAreOnlyNostrodomusOwnedStyleChurn|Preserve cascade position without DOM churn"),
    ("raw-body-settings-portal-marker", r"document\.body\.appendChild\(settings|document\.body\.append\(settings"),
]

REQUIRED_RUNTIME_TOKENS = [
    "window.__nostrodomus",
    "function ensureSettingsPortalHost",
    "function applySettingChangePreservingInteraction",
    "function scheduleStyleRangeLivePreview",
    "STABLE_CODEBOX_STYLE_NODE_IDS",
    "function ensureStableStyleElement(root, id)",
    "function applySmartSyntaxRangeHighlights",
]


REQUIRED_VISUAL_LAYER_TOKENS = [
    "hostSurfaceSelector",
    'ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::before',
    'ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after',
    ':host([data-nostrodomus-codebox-frame-host="1"])::before',
    ':host([data-nostrodomus-codebox-frame-host="1"])::after',
    "--nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);",
    "backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;",
    "-webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;",
    "isolation: isolate !important;",
    "background: transparent !important;",
]

REQUIRED_COMPANION_TOKENS = [
    "nostrodomus-editor-v17.2.59-preview-mutation-guard-native-events",
    "function mutationsAreOnlyPreviewContent",
    "preservesNativePreviewEvents: true",
]

REQUIRED_DOC_TOKENS = {
    "docs/contracts/FILE_OWNERSHIP_MAP.md": ["Source-of-truth rule", "Runtime files", "Tooling ownership"],
    "docs/contracts/NO_TOUCH_REGRESSION_LIST.md": ["Do not reintroduce capture-phase preview", "Do not use the failed v31.6.61", "Do not package accidental nested repo copies", "Do not remove the host-owned frosted codebox surface"],
    "docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md": ["::before = border and glow owner", "::after  = frosted blurry surface/backdrop owner", "runtime modularization remains paused"],
    "docs/VISUAL_REGRESSION_WORKFLOW.md": ["visual_layer_doctor.py", "Do not combine visual CSS changes with runtime extraction", "afterBackdrop"],
    # "first wired extraction" was deliberately reworded out of this contract in af6d7e2 (the
    # "shipshape" doc cleanup); the contract now opens with "single source of truth". Track the
    # current wording so the guard verifies the live contract, not a retired phrase.
    "docs/contracts/RUNTIME_IDENTITY_MODULE_CONTRACT.md": ["src/core/version.js", "single source of truth", "No window/document access", "esbuild"],
    "docs/contracts/SETTINGS_STORAGE_KEYS_MODULE_CONTRACT.md": ["src/core/settingsStorageKeys.js", "SETTINGS_MIGRATION_LEGACY_KEYS", "deletes a legacy key only after the write key holds the merged payload", "No window/document access"],
    "docs/contracts/RUNTIME_CONSTANTS_MODULE_CONTRACT.md": ["src/core/runtimeConstants.js", "third wired low-risk extraction", "SECURITY_LIMITS", "No window/document access"],
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


def scan_file(path: Path, forbidden: list[tuple[str, str]], errors: list[str]) -> None:
    text = read(path)
    if not text:
        errors.append(f"missing or empty file: {path.relative_to(ROOT)}")
        return
    for name, pattern in forbidden:
        if re.search(pattern, text):
            errors.append(f"{path.relative_to(ROOT)} contains forbidden pattern {name}: {pattern}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan Nostrodomus runtime contracts and known-bad patterns.")
    parser.add_argument("--json", action="store_true", help="Print JSON result.")
    args = parser.parse_args(argv)

    errors: list[str] = []
    warnings: list[str] = []
    project = {}
    try:
        project = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
    except Exception:
        project = {}
    runtime_layer_rollback = "runtime-layer-rollback" in str(project.get("internal_version") or "")

    source_visual_owner_text = "\n".join(read(path) for path in VISUAL_LAYER_SOURCE_OWNER_FILES)
    source_visual_owner_text = source_visual_owner_text.replace("isolation: isolate ${bangPriority};", "isolation: isolate !important;")
    source_runtime_owner_text = "\n".join(read(path) for path in RUNTIME_TOKEN_SOURCE_OWNER_FILES)
    for path in RUNTIME_FILES:
        scan_file(path, FORBIDDEN_PATTERNS, errors)
        text = read(path)
        for token in REQUIRED_RUNTIME_TOKENS:
            token_present = token in text
            if token == "function ensureStableStyleElement(root, id)":
                token_present = token_present or "function ensureStableStyleElement(root,id)" in text
            if token == "function ensureSettingsPortalHost":
                token_present = token_present or "ensureSettingsPortalHost" in text
            if token == "window.__nostrodomus":
                token_present = token_present or "W.__nostrodomus" in text
            if path.name == "main.legacy.js" and not token_present:
                token_present = token in source_runtime_owner_text
            if not token_present:
                errors.append(f"{path.relative_to(ROOT)} missing required runtime token: {token}")
        visual_text = text if path.name == "nostrodomus.js" else source_visual_owner_text
        visual_label = path.relative_to(ROOT).as_posix() if path.name == "nostrodomus.js" else "source visual owner modules"
        for token in REQUIRED_VISUAL_LAYER_TOKENS:
            if token not in visual_text:
                errors.append(f"{visual_label} missing required visual layer token: {token}")

    # CSS.highlights range-highlight ownership moved from syntaxRuntime.js into the smart-syntax
    # lifecycle/styles modules during the syntax decomposition; check it at its current owner + dist.
    syntax_runtime_text = read(ROOT / "src" / "syntax" / "smartSyntaxLifecycle.js") + "\n" + read(ROOT / "src" / "syntax" / "smartSyntaxStyles.js")
    dist_text = read(ROOT / "dist" / "nostrodomus.js")
    if "CSS.highlights" not in syntax_runtime_text or ("CSS.highlights" not in dist_text and "CSS?.highlights" not in dist_text):
        errors.append("CSS.highlights range-highlight ownership must remain in the smart-syntax modules and dist")

    for path in COMPANION_FILES:
        scan_file(path, [(n, p) for n, p in FORBIDDEN_PATTERNS if "preview" in n], errors)
        text = read(path)
        for token in REQUIRED_COMPANION_TOKENS:
            if token not in text:
                errors.append(f"{path.relative_to(ROOT)} missing required companion token: {token}")

    version_text = read(VERSION_MODULE)
    if not version_text:
        errors.append("missing runtime identity module: src/core/version.js")
    else:
        for token in ["export const VERSION", "export const PROJECT_VERSION", "export const SETTINGS_WRITE_KEY"]:
            if token not in version_text:
                errors.append(f"src/core/version.js missing token: {token}")
        for forbidden in ["window", "document", "localStorage", "setTimeout", "addEventListener", "querySelector"]:
            if forbidden in version_text:
                errors.append(f"src/core/version.js must stay pure; found {forbidden}")


    settings_keys_text = read(SETTINGS_KEYS_MODULE)
    if not settings_keys_text:
        errors.append("missing settings storage keys module: src/core/settingsStorageKeys.js")
    else:
        for token in ["export const SETTINGS_MIGRATION_LEGACY_KEYS"]:
            if token not in settings_keys_text:
                errors.append(f"src/core/settingsStorageKeys.js missing token: {token}")
        for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "addEventListener", "querySelector"]:
            if forbidden in settings_keys_text:
                errors.append(f"src/core/settingsStorageKeys.js must stay pure; found {forbidden}")

    legacy_text = read(ROOT / "src" / "main.legacy.js")
    settings_keys_wired = "from './core/settingsStorageKeys.js'" in legacy_text
    runtime_constants_wired = "from './core/runtimeConstants.js'" in legacy_text
    if settings_keys_wired:
        if "const SETTINGS_LEGACY_KEYS =" in legacy_text[:1200] or "const SETTINGS_READ_KEYS =" in legacy_text[:1200]:
            errors.append("src/main.legacy.js must not redeclare settings storage key arrays after extraction")
    elif runtime_layer_rollback:
        if "const SETTINGS_LEGACY_KEYS =" not in legacy_text:
            errors.append("rollback runtime must preserve monolithic SETTINGS_LEGACY_KEYS")
    else:
        errors.append("src/main.legacy.js must import src/core/settingsStorageKeys.js")

    runtime_constants_text = read(RUNTIME_CONSTANTS_MODULE)
    if not runtime_constants_text:
        errors.append("missing runtime constants module: src/core/runtimeConstants.js")
    else:
        for token in ["export const SECURITY_LIMITS", "STATIC_PROVIDER_ID", "HA_VALUE_PROVIDER_ID", "LOVELACE_CONTEXT_PROVIDER_ID", "SNIPPET_PROVIDER_ID"]:
            if token not in runtime_constants_text:
                errors.append(f"src/core/runtimeConstants.js missing token: {token}")
        for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "addEventListener", "querySelector", "fetch("]:
            if forbidden in runtime_constants_text:
                errors.append(f"src/core/runtimeConstants.js must stay pure; found {forbidden}")
    if runtime_constants_wired:
        if "const SECURITY_LIMITS =" in legacy_text[:1800] or "const STATIC_PROVIDER_ID =" in legacy_text[:1800]:
            errors.append("src/main.legacy.js must not redeclare runtime constants after extraction")
    elif runtime_layer_rollback:
        if "const SECURITY_LIMITS =" not in legacy_text:
            errors.append("rollback runtime must preserve monolithic SECURITY_LIMITS")
    else:
        errors.append("src/main.legacy.js must import src/core/runtimeConstants.js")

    for path in DOC_FILES:
        if not path.exists():
            errors.append(f"missing contract doc: {path.relative_to(ROOT)}")
    for rel, tokens in REQUIRED_DOC_TOKENS.items():
        path = ROOT / rel
        text = read(path)
        for token in tokens:
            if token not in text:
                errors.append(f"{rel} missing token: {token}")

    nested = ROOT / "nostrodomus"
    if nested.exists():
        errors.append("accidental nested repo copy present: nostrodomus/")

    result = {"ok": not errors, "errors": errors, "warnings": warnings}
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Runtime contracts: {'OK' if not errors else 'FAILED'}")
        for warning in warnings:
            print(f"Warning: {warning}")
        for error in errors:
            print(f"Error: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
