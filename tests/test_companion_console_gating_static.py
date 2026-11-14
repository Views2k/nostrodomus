#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
errors=[]
for rel in ["reference/companions/nostrodomus_editor_v17_2_learned_reapply.js", "reference/companions/nostrodomus-picker-safe.js"]:
    text=(ROOT/rel).read_text(encoding="utf-8", errors="replace")
    if "nostrodomusDebug" not in text:
        errors.append(f"{rel} does not gate logs with nostrodomusDebug")
    for bad in ["console.log(", "console.warn(", "console.error("]:
        if bad in text:
            errors.append(f"{rel} contains ungated {bad}")
    for required in ["__nostrodomusCompanionLog", "__nostrodomusCompanionWarn", "__nostrodomusCompanionError"]:
        if required not in text:
            errors.append(f"{rel} missing {required}")
if errors:
    print("COMPANION CONSOLE GATING STATIC TEST FAILED")
    for e in errors: print("-", e)
    sys.exit(1)
print("COMPANION CONSOLE GATING STATIC TEST OK")
