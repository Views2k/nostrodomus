from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / "src" / "main.legacy.js").read_text(encoding="utf-8")
# The panel shell mounts Settings through the portal root; main.legacy only delegates to it.
shell = (ROOT / "src" / "ui" / "settings" / "settingsPanelShell.js").read_text(encoding="utf-8")
dist = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8")
adr = (ROOT / "docs" / "adr" / "007-settings-panel-isolation.md").read_text(encoding="utf-8")

# Historical regression guard:
# The document-level settings overlay was a failed workaround for the codebox-height
# glitch. The accepted fix is in the v17 editor layout resource, not in Nostrodomus
# Assist settings overlay placement.
for forbidden in [
    "function settingsDocumentOverlayRoot()",
    "nostrodomus-settings-document-host",
    "settings-document-shadow-overlay",
    "document.documentElement.appendChild(host)",
    "return host.shadowRoot",
    "function removeLegacySettingsMounts()",
]:
    assert forbidden not in text, f"failed settings overlay workaround still in source: {forbidden}"
    assert forbidden not in dist, f"failed settings overlay workaround still in dist: {forbidden}"

required = [
    "function openSettings()",
    "function ensureSettingsPortalHost()",
    "const root = settingsPortalRoot();",
    "nostrodomus-editor-v17.2.46-sticky-simple-mode",
    "simple/tall mode sticky",
]

settings_block = text[text.find("function openSettings()"):text.find("function tabButton", text.find("function openSettings()"))]
assert "overlayRoot()" not in settings_block, "openSettings must not use the completion overlay root"
for token in required[:3]:
    source_ok = token in text
    if token == "const root = settingsPortalRoot();":
        source_ok = source_ok or token in shell
    if token == "function ensureSettingsPortalHost()":
        source_ok = source_ok or "ensureSettingsPortalHost" in text
    assert source_ok, f"missing source token: {token}"
    compact = token.replace(', ', ',').replace(' = ', '=')
    dist_ok = token in dist or compact in dist
    if token == "function ensureSettingsPortalHost()":
        dist_ok = dist_ok or "ensureSettingsPortalHost" in dist
    if token == "const root = settingsPortalRoot();":
        dist_ok = dist_ok or "settingsPortalRoot()" in dist
    assert dist_ok, f"missing dist token: {token}"

for token in required[3:]:
    assert token in adr, f"missing ADR token: {token}"

print("SETTINGS OVERLAY CLEANUP STATIC TEST OK")
