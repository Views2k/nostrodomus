#!/usr/bin/env python3
"""Build Nostrodomus to a temporary file and compare it with committed dist."""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "src" / "main.js"
DIST = ROOT / "dist" / "nostrodomus.js"
REPORT = ROOT / "reports" / "REPRODUCIBLE_BUILD_LAST.txt"
EXTERNAL_RUNTIME_IMPORTS = ["--external:/local/*"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else "missing"


def command_exists(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def esbuild_candidates() -> list[list[str]]:
    candidates: list[list[str]] = []
    local_bin = ROOT / "node_modules" / ".bin"
    if os.name == "nt":
        local_esbuild = local_bin / "esbuild.cmd"
        local_npx = "npx.cmd"
        names = ["esbuild.cmd", "esbuild"]
        npx_names = [local_npx, "npx.cmd", "npx"]
    else:
        local_esbuild = local_bin / "esbuild"
        names = ["esbuild"]
        npx_names = ["npx"]
    if local_esbuild.exists():
        candidates.append([str(local_esbuild)])
    for name in names:
        if command_exists(name):
            candidates.append([name])
    for name in npx_names:
        if command_exists(name):
            candidates.append([name, "--no-install", "esbuild"])
    unique: list[list[str]] = []
    seen: set[tuple[str, ...]] = set()
    for candidate in candidates:
        key = tuple(candidate)
        if key not in seen:
            unique.append(candidate)
            seen.add(key)
    return unique


def build_esbuild_failure_hint(stderr: str) -> str:
    text = str(stderr or "")
    lowered = text.lower()
    if "npx canceled due to missing packages" in lowered or "no yes option" in lowered:
        return "local esbuild is missing; run npm ci"
    if "invalid: esbuild@" in lowered or "elsproblems" in lowered:
        return "local esbuild install is invalid; run npm ci, which replaces node_modules"
    if "permission denied" in lowered or "eacces" in lowered:
        return "esbuild exists but is not executable; run npm ci or fix the permissions of node_modules/.bin/esbuild"
    return "inspect reports/REPRODUCIBLE_BUILD_LAST.txt stderr and reinstall local esbuild if needed"


def safe_write_report_text(text: str) -> bool:
    """Write REPORT, replacing a report file that cannot be overwritten. Returns False on failure."""
    try:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        print(f"REPRODUCIBLE BUILD WARN: could not create report directory: {exc}", file=sys.stderr)
        return False

    tmp = REPORT.with_name(REPORT.name + ".tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(REPORT)
        return True
    except PermissionError:
        try:
            if REPORT.exists():
                REPORT.unlink()
            tmp.write_text(text, encoding="utf-8")
            tmp.replace(REPORT)
            return True
        except Exception as exc:
            print(f"REPRODUCIBLE BUILD WARN: could not write report after permission recovery: {exc}", file=sys.stderr)
            return False
    except Exception as exc:
        print(f"REPRODUCIBLE BUILD WARN: could not write report: {exc}", file=sys.stderr)
        return False


def write_report(status: str, command: str, temp_sha: str, dist_sha: str, stdout: str, stderr: str) -> None:
    report_text = (
        "Reproducible build verification\n"
        f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"Status: {status}\n"
        f"Entry: {ENTRY.relative_to(ROOT).as_posix()}\n"
        f"Dist: {DIST.relative_to(ROOT).as_posix()}\n"
        f"Command: {command}\n"
        "Format: esm\n"
        "Target: es2020\n"
        "Minify syntax: yes\n"
        "Minify whitespace: yes\n"
        f"External runtime imports: {' '.join(EXTERNAL_RUNTIME_IMPORTS)}\n"
        f"Temp build SHA256: {temp_sha}\n"
        f"Committed dist SHA256: {dist_sha}\n"
        f"stdout:\n{stdout}\n"
        f"stderr:\n{stderr}\n"
    )
    safe_write_report_text(report_text)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify that committed dist is reproducible from src/main.js.")
    parser.add_argument("--require-esbuild", action="store_true", help="Fail instead of skipping when esbuild is unavailable.")
    args = parser.parse_args()

    if not ENTRY.exists() or not DIST.exists():
        write_report("failed-missing-input", "none", "missing", sha256(DIST), "", "missing entry or dist")
        raise SystemExit("REPRODUCIBLE BUILD ERROR: missing src/main.js or dist/nostrodomus.js")

    stdout_all = ""
    stderr_all = ""
    candidates = esbuild_candidates()
    if not candidates:
        message = "esbuild unavailable; run npm ci or npm install first"
        write_report("skipped-esbuild-unavailable", "none", "missing", sha256(DIST), "", message)
        if args.require_esbuild:
            raise SystemExit("REPRODUCIBLE BUILD ERROR: " + message)
        print("REPRODUCIBLE BUILD SKIPPED: " + message)
        print(f"Report: {REPORT.relative_to(ROOT).as_posix()}")
        return 0

    attempted_commands: list[str] = []
    with tempfile.TemporaryDirectory(prefix="nostrodomus_repro_build_") as tmp:
        out = Path(tmp) / "nostrodomus.js"
        for base_cmd in candidates:
            cmd = base_cmd + [
                str(ENTRY),
                "--bundle",
                "--format=esm",
                "--target=es2020",
                f"--outfile={out}",
                "--minify-syntax",
                "--minify-whitespace",
                "--log-level=warning",
                "--legal-comments=none",
                *EXTERNAL_RUNTIME_IMPORTS,
            ]
            attempted_commands.append(" ".join(base_cmd))
            try:
                proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=60)
            except Exception as exc:
                stderr_all += f"\nCommand error for {' '.join(base_cmd)}: {exc}"
                continue
            stdout_all += proc.stdout or ""
            stderr_all += proc.stderr or ""
            if proc.returncode != 0 or not out.exists():
                continue
            temp_sha = sha256(out)
            dist_sha = sha256(DIST)
            command = " ".join(base_cmd)
            if out.read_bytes() != DIST.read_bytes():
                write_report("failed-dist-mismatch", command, temp_sha, dist_sha, stdout_all, stderr_all)
                print("REPRODUCIBLE BUILD FAILED")
                print(f"Temp build SHA256: {temp_sha}")
                print(f"Committed dist SHA256: {dist_sha}")
                print(f"Report: {REPORT.relative_to(ROOT).as_posix()}")
                return 1
            write_report("ok", command, temp_sha, dist_sha, stdout_all, stderr_all)
            print(f"REPRODUCIBLE BUILD OK ({dist_sha})")
            print(f"Report: {REPORT.relative_to(ROOT).as_posix()}")
            return 0

    command = " / ".join(attempted_commands or ["none"])
    hint = build_esbuild_failure_hint(stderr_all)
    write_report("failed-esbuild", command, "missing", sha256(DIST), stdout_all, stderr_all + (f"\nHint: {hint}" if hint else ""))
    print("REPRODUCIBLE BUILD ERROR: esbuild command failed")
    print(f"Attempted: {command}")
    if hint:
        print(f"Hint: {hint}")
    print(f"Report: {REPORT.relative_to(ROOT).as_posix()}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
