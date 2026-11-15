#!/usr/bin/env python3
"""Check that every src module is part of the bundle.

Computes the import graph from src/main.js and fails when a src/**/*.js file is
outside it and not listed in docs/contracts/MODULE_WIRING_ALLOWLIST.json. Also
fails when a module under src/core/ imports a src module outside src/core/.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
ENTRY = SRC / "main.js"
ALLOWLIST = ROOT / "docs" / "contracts" / "MODULE_WIRING_ALLOWLIST.json"
REPORT = ROOT / "reports" / "MODULE_WIRING_LAST.txt"
IMPORT_RE = re.compile(r"(?:import|export)\s+(?:[^'\"]*?from\s*)?[\"'](\.[^\"']+)[\"']")

# Layer rule: src/core/** is the pure-utility layer and imports only from src/core/.
# Code that wires features together lives in src/composition/.
CORE_LAYER = "core"


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def read_allowlist() -> dict[str, str]:
    try:
        data = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"MODULE WIRING ERROR: cannot read {rel(ALLOWLIST)}: {exc}")
    allowed = data.get("allowed_unwired_modules")
    if not isinstance(allowed, dict):
        raise SystemExit("MODULE WIRING ERROR: allowed_unwired_modules must be an object")
    return {str(k).replace("\\", "/"): str(v) for k, v in allowed.items()}


def resolve_import(base: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    raw = (base.parent / spec).resolve()
    candidates = [raw]
    if raw.suffix != ".js":
        candidates.append(raw.with_suffix(".js"))
        candidates.append(raw / "index.js")
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            try:
                candidate.relative_to(ROOT)
            except ValueError:
                continue
            return candidate
    return None


def walk_import_graph(path: Path, seen: set[str]) -> None:
    key = rel(path)
    if key in seen:
        return
    seen.add(key)
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        raise SystemExit(f"MODULE WIRING ERROR: cannot read {key}: {exc}")
    for match in IMPORT_RE.finditer(text):
        resolved = resolve_import(path, match.group(1))
        if resolved and rel(resolved).startswith("src/"):
            walk_import_graph(resolved, seen)


def check_core_layer_purity() -> list[str]:
    """Layer rule: a src/core/** file may import only other src/core/** files."""
    violations: list[str] = []
    for path in sorted((SRC / "core").rglob("*.js")):
        if not path.is_file():
            continue
        src_rel = rel(path)
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in IMPORT_RE.finditer(text):
            resolved = resolve_import(path, match.group(1))
            if not resolved:
                continue
            target = rel(resolved)
            parts = target.split("/")
            if len(parts) >= 2 and parts[0] == "src" and parts[1] != CORE_LAYER:
                violations.append(
                    f"core layer violation: {src_rel} imports {target} "
                    "(src/core/** imports only src/core/**; code that wires features together lives in src/composition/)"
                )
    return violations


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    if not ENTRY.exists():
        raise SystemExit(f"MODULE WIRING ERROR: missing {rel(ENTRY)}")
    allowed = read_allowlist()
    all_src = sorted(rel(p) for p in SRC.rglob("*.js") if p.is_file())
    wired: set[str] = set()
    walk_import_graph(ENTRY, wired)
    unwired = sorted(set(all_src) - wired)
    unexpected = [p for p in unwired if p not in allowed]
    stale_allowed = [p for p in allowed if p not in unwired]
    missing_allowed = [p for p in allowed if not (ROOT / p).exists()]

    for p in unexpected:
        errors.append(f"unwired src module is not allowlisted: {p}")
    for p in stale_allowed:
        warnings.append(f"allowlist entry is wired; remove it: {p}")
    for p in missing_allowed:
        errors.append(f"allowlist entry does not exist: {p}")
    for p, reason in allowed.items():
        if p in unwired and not reason.strip():
            errors.append(f"allowlist entry needs rationale: {p}")

    core_violations = check_core_layer_purity()
    errors.extend(core_violations)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        "Module wiring report\n"
        f"Entry: {rel(ENTRY)}\n"
        f"Total src JS: {len(all_src)}\n"
        f"Core-layer violations: {len(core_violations)}\n"
        f"Wired modules: {len(wired)}\n"
        f"Unwired modules: {len(unwired)}\n"
        f"Allowlisted unwired modules: {len([p for p in unwired if p in allowed])}\n"
        "\nWired:\n" + "\n".join(f"- {p}" for p in sorted(wired)) +
        "\n\nUnwired allowlisted:\n" + "\n".join(f"- {p}: {allowed.get(p, '')}" for p in unwired if p in allowed) +
        "\n\nUnexpected unwired:\n" + "\n".join(f"- {p}" for p in unexpected) +
        "\n\nWarnings:\n" + "\n".join(f"- {w}" for w in warnings) +
        "\n\nErrors:\n" + "\n".join(f"- {e}" for e in errors) + "\n",
        encoding="utf-8",
    )
    if errors:
        print("MODULE WIRING CHECK FAILED")
        for error in errors:
            print(f"ERROR: {error}")
        print(f"Report: {rel(REPORT)}")
        return 1
    print(
        f"MODULE WIRING CHECK OK (wired={len(wired)}, unwired_allowlisted={len([p for p in unwired if p in allowed])})"
    )
    if warnings:
        for warning in warnings:
            print(f"WARN: {warning}")
    print(f"Report: {rel(REPORT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
