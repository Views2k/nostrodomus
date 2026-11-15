#!/usr/bin/env python3
"""Read-only check of the Nostrodomus codebox visual layers.

Fails when the source modules or the bundle lose a rule of the layer model in
docs/contracts/VISUAL_LAYER_BASELINE_CONTRACT.md, for example the frosted surface
behind the CodeMirror text.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "PROJECT.json"
RUNTIME_FILES = [
    ROOT / "src" / "app.js",
    ROOT / "dist" / "nostrodomus.js",
]
# The codebox visual layer (host ::before/::after frame, frosted surface, blur token, backdrop
# filters, `isolation: isolate`, the hidden external frame, the transparent CodeMirror panes) is
# built in src/ui/codeboxStyle.js. hostSurfaceSelector and the `isolation: isolate ${bangPriority};`
# template are in src/ui/codebox/codeboxPreflight.js.
SOURCE_VISUAL_OWNER_FILES = [
    ROOT / "src" / "ui" / "codeboxStyle.js",
    ROOT / "src" / "ui" / "codebox" / "codeboxPreflight.js",
]
DOCS = [
    ROOT / "docs" / "contracts" / "STYLE_OWNERSHIP_CONTRACT.md",
    ROOT / "docs" / "contracts" / "VISUAL_LAYER_BASELINE_CONTRACT.md",
]

REQUIRED_RUNTIME_TOKENS = [
    "hostSurfaceSelector",
    'ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::before',
    'ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after',
    ':host([data-nostrodomus-codebox-frame-host="1"])::before',
    ':host([data-nostrodomus-codebox-frame-host="1"])::after',
    "--nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);",
    "backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;",
    "-webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;",
    "isolation: isolate !important;",
    "pointer-events: none !important;",
    "z-index: 1 !important;",
    ".cm-editor",
    ".cm-scroller",
    ".cm-content",
    "background: transparent !important;",
    '[data-nostrodomus-codebox-external-frame="1"]',
    "display: none !important;",
]

REQUIRED_DOC_TOKENS = {
    "STYLE_OWNERSHIP_CONTRACT.md": [
        "::before",
        "::after",
        "CodeMirror panes stay transparent",
    ],
    "VISUAL_LAYER_BASELINE_CONTRACT.md": [
        "::before = border and glow owner",
        "::after  = frosted blurry surface/backdrop owner",
    ],
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit Nostrodomus codebox visual layer ownership.")
    parser.add_argument("--json", action="store_true", help="Print JSON result.")
    args = parser.parse_args(argv)

    errors: list[str] = []
    warnings: list[str] = []
    project = {}
    try:
        project = json.loads(PROJECT.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"PROJECT.json unreadable: {exc}")

    version = str(project.get("version") or "")
    internal = str(project.get("internal_version") or "")
    if version and not internal.startswith(f"nostrodomus-v{version}-"):
        errors.append("PROJECT.json internal_version does not match version")

    source_visual_owner_text = "\n".join(read(path) for path in SOURCE_VISUAL_OWNER_FILES)
    source_visual_owner_text = source_visual_owner_text.replace("isolation: isolate ${bangPriority};", "isolation: isolate !important;")
    for path in RUNTIME_FILES:
        text = read(path)
        label = path.relative_to(ROOT).as_posix()
        if not text:
            errors.append(f"missing runtime file: {label}")
            continue
        visual_text = text if path.name == "nostrodomus.js" else source_visual_owner_text
        visual_label = label if path.name == "nostrodomus.js" else "source visual owner modules"
        for token in REQUIRED_RUNTIME_TOKENS:
            if token not in visual_text:
                errors.append(f"{visual_label} missing visual layer token: {token}")

        after_index = visual_text.find('ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after')
        backdrop_index = visual_text.find("backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;")
        cm_transparent_index = visual_text.find("background: transparent !important;")
        if after_index >= 0 and backdrop_index >= 0 and backdrop_index < after_index:
            warnings.append(f"{visual_label}: backdrop token appears before host ::after selector; verify CSS order manually")
        if cm_transparent_index < 0:
            errors.append(f"{visual_label} does not keep CodeMirror panes transparent")

    for path in DOCS:
        if not path.exists():
            errors.append(f"missing visual doc: {path.relative_to(ROOT)}")
            continue
        text = read(path)
        for token in REQUIRED_DOC_TOKENS.get(path.name, []):
            if token not in text:
                errors.append(f"{path.relative_to(ROOT)} missing token: {token}")

    result = {"ok": not errors, "version": version, "internal_version": internal, "errors": errors, "warnings": warnings}
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Visual layer doctor: {'OK' if not errors else 'FAILED'}")
        print(f"Version: {version}")
        print(f"Internal version: {internal}")
        for warning in warnings:
            print(f"Warning: {warning}")
        for error in errors:
            print(f"Error: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
