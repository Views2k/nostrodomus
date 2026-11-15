#!/usr/bin/env python3
"""Set the Nostrodomus version.

Writes the version to PROJECT.json, package.json, package-lock.json and
src/core/version.js. CHANGELOG.md and src/core/changelogSummary.js are written by
hand. With --build, tools/build.py then rebuilds dist/nostrodomus.js.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "PROJECT.json"
PACKAGE = ROOT / "package.json"
PACKAGE_LOCK = ROOT / "package-lock.json"
VERSION_MODULE = ROOT / "src" / "core" / "version.js"

SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
INTERNAL = re.compile(r"^nostrodomus-v\d+\.\d+\.\d+-[a-z0-9][a-z0-9.-]*$")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def replace_runtime_versions(path: Path, version: str, internal: str) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    text = re.sub(r'const VERSION = "nostrodomus-v\d+\.\d+\.\d+-[^"]+";', f'const VERSION = "{internal}";', text, count=1)
    text = re.sub(r'const PROJECT_VERSION = "\d+\.\d+\.\d+";', f'const PROJECT_VERSION = "{version}";', text, count=1)
    path.write_text(text, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Set the Nostrodomus version in the project metadata and src/core/version.js.")
    parser.add_argument("version", help="New strict SemVer, for example 0.1.0")
    parser.add_argument("slug", help="Short lowercase release slug, for example hacs-install")
    parser.add_argument("--build", action="store_true", help="Run tools/build.py after setting the version.")
    args = parser.parse_args(argv)

    if not SEMVER.fullmatch(args.version):
        raise SystemExit("version must be strict SemVer MAJOR.MINOR.PATCH")
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*", args.slug):
        raise SystemExit("slug must be lowercase letters/numbers/dot/dash only")
    if len(args.slug) > 32:
        raise SystemExit("slug must be at most 32 characters")
    internal = f"nostrodomus-v{args.version}-{args.slug}"
    if not INTERNAL.fullmatch(internal):
        raise SystemExit(f"invalid internal version: {internal}")
    if len(internal) > 80:
        raise SystemExit("internal version must be at most 80 characters")

    project = load_json(PROJECT)
    package = load_json(PACKAGE)
    lock = load_json(PACKAGE_LOCK)

    project["version"] = args.version
    project["internal_version"] = internal
    project["last_step"] = f"v{args.version}-{args.slug}"
    package["version"] = args.version
    lock["version"] = args.version
    lock.setdefault("packages", {}).setdefault("", {})["version"] = args.version

    save_json(PROJECT, project)
    save_json(PACKAGE, package)
    save_json(PACKAGE_LOCK, lock)

    if VERSION_MODULE.exists():
        replace_runtime_versions(VERSION_MODULE, args.version, internal)

    if args.build:
        subprocess.check_call([sys.executable, str(ROOT / "tools" / "build.py")], cwd=str(ROOT))

    print(f"Set the Nostrodomus version to {args.version} / {internal}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
