#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8", errors="replace")
DIST = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8", errors="replace")
MODULE = (ROOT / "src" / "diagnostics" / "performanceMetrics.js").read_text(encoding="utf-8", errors="replace")
errors = []

def require(ok, msg):
    if not ok:
        errors.append(msg)

require("from './diagnostics/performanceMetrics.js'" in LEGACY, "main.legacy imports diagnostics/performanceMetrics.js")
for token in [
    "function roundPerformanceMetric(value, places = 3)",
    "function diagnosticEventMetric(events, name)",
    "function performanceBudgetRules()",
    "function evaluatePerformanceBudgets(snapshot = {})",
]:
    require(token in MODULE, f"performanceMetrics module includes {token}")

for removed in [
    "function diagnosticEventMetric(events, name)",
    "function roundPerformanceMetric(value, places = 3)",
    "function performanceBudgetRules()",
]:
    require(removed not in LEGACY, f"main.legacy no longer owns {removed}")

for forbidden in ["window", "document", "localStorage", "sessionStorage", "setTimeout", "setInterval", "addEventListener", "querySelector", "MutationObserver", "ResizeObserver", "fetch("]:
    require(forbidden not in MODULE, f"performanceMetrics module stays pure: no {forbidden}")

require("roundPerformanceMetric" in DIST and "evaluatePerformanceBudgets" in DIST, "dist bundles performanceMetrics module")
require("function roundPerformanceMetric" in DIST and "function evaluatePerformanceBudgets" in DIST, "dist includes bundled performance metrics helpers")

if errors:
    print("PERFORMANCE METRICS MODULE WIRING STATIC TEST FAILED")
    for error in errors:
        print("-", error)
    raise SystemExit(1)
print("PERFORMANCE METRICS MODULE WIRING STATIC TEST OK")
