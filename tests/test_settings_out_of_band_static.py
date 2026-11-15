from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
# The panel shell mounts Settings through the portal root; app.js only delegates to it.
shell = (ROOT / "src" / "ui" / "settings" / "settingsPanelShell.js").read_text(encoding="utf-8")
dist = (ROOT / "dist" / "nostrodomus.js").read_text(encoding="utf-8")

# Settings must not mount through a separate overlay host on the document element
# (docs/contracts/SETTINGS_PORTAL_CONTRACT.md lists it under "Ruled out").
for forbidden in [
    "function settingsDocumentOverlayRoot()",
    "nostrodomus-settings-document-host",
    "settings-document-shadow-overlay",
    "document.documentElement.appendChild(host)",
    "return host.shadowRoot",
    "function removeLegacySettingsMounts()",
]:
    assert forbidden not in text, f"document-level settings overlay token in source: {forbidden}"
    assert forbidden not in dist, f"document-level settings overlay token in dist: {forbidden}"

required = [
    "function openSettings()",
    "function ensureSettingsPortalHost()",
    "const root = settingsPortalRoot();",
]

settings_block = text[text.find("function openSettings()"):text.find("function tabButton", text.find("function openSettings()"))]
assert "overlayRoot()" not in settings_block, "openSettings must not use the completion overlay root"
for token in required:
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

print("SETTINGS OUT-OF-BAND OVERLAY STATIC TEST OK")
