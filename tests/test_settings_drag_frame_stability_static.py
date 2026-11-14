#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
# The monolith was decomposed: the settings drag-frame stability invariant moved out of
# src/main.legacy.js into two extracted owner modules — the portal/viewport position helpers
# live in src/ui/settings/settingsGeometry.js and the drag/click behavior + commit call sites
# live in src/ui/settings/settingsPanelShell.js. The bundled dist still carries every fact,
# minified. Same invariant, current location.
geometry = (ROOT / "src/ui/settings/settingsGeometry.js").read_text(encoding="utf-8")
shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8")
project = json.loads((ROOT / "PROJECT.json").read_text(encoding="utf-8"))

# --- Source: portal/viewport position helpers (settingsGeometry.js) ---
assert "function settingsPortalViewportRect()" in geometry, "geometry source must measure the active settings portal viewport"
assert "function settingsViewportToPortalPosition(pos)" in geometry, "geometry source must convert viewport settings positions into portal-local coordinates"
assert "function applySettingsPanelViewportPosition(panel, pos)" in geometry, "geometry source must have one position-commit helper"

# --- Source: initial render + drag behavior + commit call sites (settingsPanelShell.js) ---
assert "const localPos = settingsViewportToPortalPosition(pos);" in shell, "shell source initial render must use portal-local coordinates"
assert "applySettingsPanelViewportPosition(panel, pos);" in shell, "shell source must normalize position after attaching to portal host"
assert "let dragMoved = false;" in shell, "shell source drag must distinguish click from real movement"
assert "Math.hypot(nextX, nextY) < 4" in shell, "shell source must use a drag threshold so clicks do not nudge the panel"
assert "panel.style.transform = `translate3d(${dx}px, ${dy}px, 0)`" in shell, "shell source live drag must use transform frames instead of repeated left/top layout"
assert "applySettingsPanelViewportPosition(panel, finalPos);" in shell, "shell source drag end must commit through the portal coordinate helper"
assert "saveSettingsPosition(finalPos.x, finalPos.y);" in shell, "shell source saved settings position remains viewport-based"
# The live-drag block (applyDragFrame -> onDragMove -> onDragEnd) is bounded in the extracted
# module by the next function declaration. It must never repeatedly mutate left/top during a drag.
shell_drag_block = shell[shell.find("function applyDragFrame()"):shell.find("function attachSettingControlBehavior", shell.find("function applyDragFrame()"))]
assert shell_drag_block, "shell source must contain the applyDragFrame drag block"
assert "panel.style.left = `${livePos.x}px`" not in shell_drag_block, "shell source live drag must not repeatedly mutate left"
assert "panel.style.top = `${livePos.y}px`" not in shell_drag_block, "shell source live drag must not repeatedly mutate top"

# --- Dist: same facts in minified form (e.g. `(panel, pos)` -> `(panel,pos)`) ---
assert "function settingsPortalViewportRect()" in dist, "dist must measure the active settings portal viewport"
assert "function settingsViewportToPortalPosition(pos)" in dist, "dist must convert viewport settings positions into portal-local coordinates"
assert "function applySettingsPanelViewportPosition(panel,pos)" in dist, "dist must have one position-commit helper (minified)"
assert "localPos=settingsViewportToPortalPosition(pos)" in dist, "dist initial render must use portal-local coordinates (minified)"
assert "applySettingsPanelViewportPosition(panel,pos)" in dist, "dist must normalize position after attaching to portal host (minified)"
assert "dragMoved=!1" in dist, "dist drag must distinguish click from real movement (minified)"
assert "Math.hypot(nextX,nextY)<4" in dist, "dist must use a drag threshold so clicks do not nudge the panel (minified)"
assert "panel.style.transform=`translate3d(${dx}px, ${dy}px, 0)`" in dist, "dist live drag must use transform frames instead of repeated left/top layout (minified)"
assert "applySettingsPanelViewportPosition(panel,finalPos)" in dist, "dist drag end must commit through the portal coordinate helper (minified)"
assert "saveSettingsPosition(finalPos.x,finalPos.y)" in dist, "dist saved settings position remains viewport-based (minified)"
dist_drag_block = dist[dist.find("function applyDragFrame()"):dist.find("function attachSettingControlBehavior", dist.find("function applyDragFrame()"))]
assert dist_drag_block, "dist must contain the applyDragFrame drag block"
assert "panel.style.left" not in dist_drag_block, "dist live drag must not repeatedly mutate left"
assert "panel.style.top" not in dist_drag_block, "dist live drag must not repeatedly mutate top"

# The drag-frame stability invariant was originally pinned at v31.6.41 (pre-SemVer era). That
# baseline carried forward across the 31.6.x -> 0.1.x SemVer reset; the invariant is the
# transform-frame drag behavior above, not a frozen version literal, so floor at the start of
# the SemVer line and accept either the legacy id or any version advanced past the floor.
version = str(project.get("version") or "")
internal = str(project.get("internal_version") or "")
version_tuple = tuple(int(part) for part in version.split(".") if part.isdigit())
assert version_tuple >= (0, 1, 0), "PROJECT.json remains at or beyond the drag-frame stability baseline (SemVer line)"
assert "editor-blur-preview-prepaint" in internal or version_tuple > (0, 1, 0), "internal_version records the drag-frame stability owner (or version advanced past the baseline)"
print("SETTINGS DRAG FRAME STABILITY STATIC TEST OK")
