#!/usr/bin/env python3
"""Validate Nostrodomus snippet data.

This validator is intentionally dependency-free so it can run inside Home
Assistant's shell and GitHub CI without installing PyYAML.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "data" / "snippets.json"

ALLOWED_FAMILIES = {
    "dashboard-action",
    "dashboard-card",
    "automation-trigger",
    "automation-condition",
    "automation-action",
    "target",
    "card-mod-css",
    "button-card-style",
}

ALLOWED_CONTEXT_KINDS = {
    "lovelace-action-block",
    "lovelace-action-value",
    "dashboard-root",
    "trigger-block",
    "condition-block",
    "automation-action",
    "target-block",
    "style-block",
}

ID_RE = re.compile(r"^[a-z0-9][a-z0-9._:-]*$")
TRIGGER_RE = re.compile(r"^[a-z0-9][a-z0-9._:-]*$")
PLACEHOLDER_RE = re.compile(r"\$\{(\d+)(?::([^}]*))?\}|\$(\d+)")


def load_catalog(path: Path) -> list[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - shown to shell
        raise SystemExit(f"Snippet catalog JSON failed to parse: {exc}")
    if not isinstance(data, list):
        raise SystemExit("Snippet catalog must be a JSON list")
    return data


def placeholder_errors(insert: str, idx: int) -> list[str]:
    errors: list[str] = []
    open_count = insert.count("${")
    match_count = len(PLACEHOLDER_RE.findall(insert))
    if open_count > match_count:
        errors.append(f"snippet[{idx}] has an unbalanced placeholder")
    for match in PLACEHOLDER_RE.finditer(insert):
        raw = match.group(1) or match.group(3)
        try:
            value = int(raw)
        except Exception:
            errors.append(f"snippet[{idx}] has a non-numeric placeholder index")
            continue
        if value <= 0:
            errors.append(f"snippet[{idx}] has a non-positive placeholder index")
    return errors


def validate_yaml_fragment_shape(insert: str, idx: int) -> list[str]:
    errors: list[str] = []
    if not insert.strip():
        errors.append(f"snippet[{idx}] insert must not be blank")
    if "\r" in insert:
        errors.append(f"snippet[{idx}] insert must use LF newlines, not CRLF")
    for line_no, line in enumerate(insert.split("\n"), start=1):
        if line.startswith("\t"):
            errors.append(f"snippet[{idx}] insert line {line_no} uses tab indentation")
        if line.rstrip(" ") != line:
            errors.append(f"snippet[{idx}] insert line {line_no} has trailing spaces")
    return errors


def validate_catalog(catalog: list[dict]) -> list[str]:
    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_triggers: dict[str, str] = {}

    for idx, snippet in enumerate(catalog):
        if not isinstance(snippet, dict):
            errors.append(f"snippet[{idx}] must be an object")
            continue

        required = ["id", "family", "contextKind", "triggers", "label", "insert", "documentation"]
        for field in required:
            if field not in snippet:
                errors.append(f"snippet[{idx}] missing required field: {field}")

        sid = snippet.get("id")
        if not isinstance(sid, str) or not sid.strip():
            errors.append(f"snippet[{idx}] id must be a non-empty string")
            sid = f"<snippet[{idx}]>"
        elif not ID_RE.fullmatch(sid):
            errors.append(f"snippet[{idx}] id has unsafe characters: {sid}")
        elif sid in seen_ids:
            errors.append(f"duplicate snippet id: {sid}")
        else:
            seen_ids.add(sid)

        family = snippet.get("family")
        if family not in ALLOWED_FAMILIES:
            errors.append(f"{sid} family is not allowed: {family}")

        context_kind = snippet.get("contextKind")
        if context_kind not in ALLOWED_CONTEXT_KINDS:
            errors.append(f"{sid} contextKind is not allowed: {context_kind}")

        triggers = snippet.get("triggers")
        if not isinstance(triggers, list) or not triggers:
            errors.append(f"{sid} triggers must be a non-empty list")
        else:
            local: set[str] = set()
            for trigger in triggers:
                if not isinstance(trigger, str) or not trigger.strip():
                    errors.append(f"{sid} trigger must be a non-empty string")
                    continue
                if not TRIGGER_RE.fullmatch(trigger):
                    errors.append(f"{sid} trigger has unsafe characters: {trigger}")
                if trigger in local:
                    errors.append(f"{sid} duplicate trigger inside snippet: {trigger}")
                local.add(trigger)
                owner = seen_triggers.get(trigger)
                if owner and owner != sid:
                    errors.append(f"duplicate trigger across snippets: {trigger} ({owner}, {sid})")
                seen_triggers[trigger] = sid

        for field in ["label", "insert", "documentation"]:
            if not isinstance(snippet.get(field), str) or not snippet.get(field, "").strip():
                errors.append(f"{sid} {field} must be a non-empty string")

        aliases = snippet.get("aliases", [])
        if aliases is not None:
            if not isinstance(aliases, list):
                errors.append(f"{sid} aliases must be a list when present")
            else:
                for alias in aliases:
                    if not isinstance(alias, str) or not alias.strip():
                        errors.append(f"{sid} aliases entries must be non-empty strings")

        if "priority" in snippet:
            priority = snippet.get("priority")
            if not isinstance(priority, (int, float)):
                errors.append(f"{sid} priority must be numeric")

        insert = snippet.get("insert")
        if isinstance(insert, str):
            errors.extend(placeholder_errors(insert, idx))
            errors.extend(validate_yaml_fragment_shape(insert, idx))

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Nostrodomus snippet data.")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args(argv)

    catalog = load_catalog(args.catalog)
    errors = validate_catalog(catalog)
    if errors:
        print("SNIPPET VALIDATION FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"SNIPPET VALIDATION OK ({len(catalog)} snippets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
