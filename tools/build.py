#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "src" / "main.js"
LEGACY = ROOT / "src" / "main.legacy.js"
VERSION_MODULE = ROOT / "src" / "core" / "version.js"
SETTINGS_KEYS_MODULE = ROOT / "src" / "core" / "settingsStorageKeys.js"
RUNTIME_CONSTANTS_MODULE = ROOT / "src" / "core" / "runtimeConstants.js"
DIST_DIR = ROOT / "dist"
OUT = DIST_DIR / "nostrodomus.js"
REPORT = ROOT / "reports" / "BUILD_LAST.txt"

OLD_DIST = [
    DIST_DIR / "nostrodomus-engine-v30g.js",
    DIST_DIR / "nostrodomus-engine-v30o-working.js",
]

EXPECTED_ENTRY = "import './main.legacy.js';"
EXTERNAL_RUNTIME_IMPORTS = ["--external:/local/*"]


def fail(message: str) -> None:
    raise SystemExit(f"BUILD ERROR: {message}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else "missing"


def source_requires_bundle() -> bool:
    if not LEGACY.exists():
        return False
    head = LEGACY.read_text(encoding="utf-8", errors="replace")[:2000]
    return " from './" in head or ' from "./' in head or head.lstrip().startswith("import ")


def command_exists(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def esbuild_candidates() -> list[list[str]]:
    candidates: list[list[str]] = []

    # Prefer the project-local devDependency. This is the reproducible path for
    # local development and future CI/HACS release builds.
    local_bin = ROOT / "node_modules" / ".bin"
    if os.name == "nt":
        local_esbuild = local_bin / "esbuild.cmd"
        local_npx = "npx.cmd"
    else:
        local_esbuild = local_bin / "esbuild"
        local_npx = "npx"

    if local_esbuild.exists():
        candidates.append([str(local_esbuild)])

    # Then fall back to PATH-discovered shims. Keep Windows .cmd support explicit;
    # PowerShell may block .ps1 shims, but .cmd works without changing policy.
    for name in (["esbuild.cmd", "esbuild"] if os.name == "nt" else ["esbuild"]):
        if command_exists(name):
            candidates.append([name])

    for name in ([local_npx, "npx.cmd", "npx"] if os.name == "nt" else ["npx"]):
        if command_exists(name):
            candidates.append([name, "--no-install", "esbuild"])

    # Deduplicate while preserving order.
    seen: set[tuple[str, ...]] = set()
    unique: list[list[str]] = []
    for candidate in candidates:
        key = tuple(candidate)
        if key not in seen:
            unique.append(candidate)
            seen.add(key)
    return unique


def validate_inputs() -> None:
    if not ENTRY.exists():
        fail(f"Missing source entry: {ENTRY}")
    if not LEGACY.exists():
        fail(f"Missing legacy runtime: {LEGACY}")

    entry_text = ENTRY.read_text(encoding="utf-8").strip()
    if entry_text != EXPECTED_ENTRY:
        fail(f"Unexpected src/main.js content. Expected exactly: {EXPECTED_ENTRY}")


def write_report(mode: str, command_used: str, stdout: str, stderr: str) -> None:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    project = {}
    package = {}
    try:
        project = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))
    except Exception:
        project = {}
    try:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    except Exception:
        package = {}

    size = OUT.stat().st_size if OUT.exists() else 0
    project_version = str(project.get("version") or "unknown")
    package_version = str(package.get("version") or "unknown")
    internal_version = str(project.get("internal_version") or "unknown")
    source_sha = sha256(LEGACY)
    version_module_sha = sha256(VERSION_MODULE)
    settings_keys_module_sha = sha256(SETTINGS_KEYS_MODULE)
    runtime_constants_module_sha = sha256(RUNTIME_CONSTANTS_MODULE)
    entry_sha = sha256(ENTRY)
    dist_sha = sha256(OUT)
    node_version = "unknown"
    esbuild_version = "unknown"
    try:
        proc = subprocess.run(["node", "--version"], cwd=str(ROOT), capture_output=True, text=True, timeout=10)
        if proc.returncode == 0:
            node_version = (proc.stdout or "").strip() or "unknown"
    except Exception:
        pass
    try:
        for base_cmd in esbuild_candidates():
            proc = subprocess.run(base_cmd + ["--version"], cwd=str(ROOT), capture_output=True, text=True, timeout=10)
            if proc.returncode == 0:
                esbuild_version = (proc.stdout or "").strip() or "unknown"
                break
    except Exception:
        pass

    REPORT.write_text(
        "Build completed\n"
        f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"Project version: {project_version}\n"
        f"Package version: {package_version}\n"
        f"Internal version: {internal_version}\n"
        f"Entry: {ENTRY}\n"
        f"Entry SHA256: {entry_sha}\n"
        f"Legacy runtime: {LEGACY}\n"
        f"Source SHA256: {source_sha}\n"
        f"Version module: {VERSION_MODULE}\n"
        f"Version module SHA256: {version_module_sha}\n"
        f"Settings keys module: {SETTINGS_KEYS_MODULE}\n"
        f"Settings keys module SHA256: {settings_keys_module_sha}\n"
        f"Runtime constants module: {RUNTIME_CONSTANTS_MODULE}\n"
        f"Runtime constants module SHA256: {runtime_constants_module_sha}\n"
        f"Dist: {OUT}\n"
        f"Dist filename: {OUT.relative_to(ROOT).as_posix()}\n"
        f"Dist SHA256: {dist_sha}\n"
        f"Mode: {mode}\n"
        f"Fallback mode: {'yes' if mode == 'python-fallback-legacy-copy' else 'no'}\n"
        f"Command: {command_used}\n"
        f"External runtime imports: {' '.join(EXTERNAL_RUNTIME_IMPORTS)}\n"
        "Format: esm\n"
        "Target: es2020\n"
        "Minify syntax: yes\n"
        "Minify whitespace: yes\n"
        f"SHA256: {dist_sha}\n"
        f"Bytes: {size}\n"
        f"Node version: {node_version}\n"
        f"esbuild version: {esbuild_version}\n"
        "Live target writes: none\n"
        f"stdout:\n{stdout}\n"
        f"stderr:\n{stderr}\n",
        encoding="utf-8",
    )

def main() -> int:
    parser = argparse.ArgumentParser(description="Build Nostrodomus frontend bundle.")
    parser.add_argument(
        "--allow-legacy-fallback",
        action="store_true",
        help="Copy src/main.legacy.js to the canonical dist path when esbuild is unavailable. Intended only for emergency HA-shell diagnostics, not release builds.",
    )
    args = parser.parse_args()

    validate_inputs()
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    # v31 has one canonical built artifact. Remove stale generated v30 filenames
    # from dist only; archived copies live under /config/nostrodomus_archive.
    for old in OLD_DIST:
        if old.exists():
            old.unlink()

    stdout = ""
    stderr = ""
    command_used = "none"

    for base_cmd in esbuild_candidates():
        cmd = base_cmd + [
            str(ENTRY),
            "--bundle",
            "--format=esm",
            "--target=es2020",
            f"--outfile={OUT}",
            "--minify-syntax",
            "--minify-whitespace",
            "--log-level=warning",
            "--legal-comments=none",
            *EXTERNAL_RUNTIME_IMPORTS,
        ]
        try:
            proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=60)
        except Exception as exc:
            stderr += f"\nCommand error for {' '.join(base_cmd)}: {exc}"
            continue

        stdout += proc.stdout or ""
        stderr += proc.stderr or ""
        if proc.returncode == 0 and OUT.exists():
            command_used = " ".join(base_cmd)
            write_report("esbuild", command_used, stdout, stderr)
            print(f"Built: {OUT}")
            print("Mode: esbuild")
            print(f"SHA256: {sha256(OUT)}")
            return 0

    if args.allow_legacy_fallback:
        if source_requires_bundle():
            write_report("failed-esbuild-required-for-modules", command_used, stdout, stderr)
            fail(
                "Legacy-copy fallback is disabled because src/main.legacy.js now imports extracted modules. "
                "Install/use esbuild so dist/nostrodomus.js is a bundled artifact."
            )
        shutil.copy2(LEGACY, OUT)
        write_report("python-fallback-legacy-copy", command_used, stdout, stderr)
        print(f"Built: {OUT}")
        print("Mode: python-fallback-legacy-copy")
        print(f"SHA256: {sha256(OUT)}")
        print("WARNING: legacy fallback was explicitly allowed. Do not publish this artifact as v31.0.")
        return 0

    write_report("failed-esbuild-unavailable", command_used, stdout, stderr)
    fail(
        "esbuild unavailable or failed. Run npm.cmd install / npm install first, "
        "or use --allow-legacy-fallback only for local HA diagnostics."
    )


if __name__ == "__main__":
    raise SystemExit(main())
