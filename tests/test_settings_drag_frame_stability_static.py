#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Dragging the settings panel moves it with transform frames and commits the position once, in
# portal coordinates, at the end. The position helpers are in src/ui/settings/settingsGeometry.js,
# the drag handling in src/ui/settings/settingsPanelShell.js.
geometry = (ROOT / "src/ui/settings/settingsGeometry.js").read_text(encoding="utf-8")
shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
dist = (ROOT / "dist/nostrodomus.js").read_text(encoding="utf-8")

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
assert "saveSettingsPosition(finalPos.x, finalPos.y);" in shell, "shell source saved settings position is viewport-based"
# The live-drag block (applyDragFrame, onDragMove, onDragEnd) ends at the next function
# declaration. It must not set left/top on every frame.
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
assert "saveSettingsPosition(finalPos.x,finalPos.y)" in dist, "dist saved settings position is viewport-based (minified)"
dist_drag_block = dist[dist.find("function applyDragFrame()"):dist.find("function attachSettingControlBehavior", dist.find("function applyDragFrame()"))]
assert dist_drag_block, "dist must contain the applyDragFrame drag block"
assert "panel.style.left" not in dist_drag_block, "dist live drag must not repeatedly mutate left"
assert "panel.style.top" not in dist_drag_block, "dist live drag must not repeatedly mutate top"
print("SETTINGS DRAG FRAME STABILITY STATIC TEST OK")
