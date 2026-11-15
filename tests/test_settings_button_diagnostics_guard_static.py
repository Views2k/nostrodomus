from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_settings_open_guards_diagnostics_delegate_sections():
    sections = (ROOT / "src/ui/settings/settingsSections.js").read_text(encoding="utf-8")
    shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
    assert "function safeSettingsRuntimeNode" in sections
    assert "function safeSettingsRuntimeNodes" in sections
    assert "function safeSettingsRuntimeCall" in sections
    assert "Section temporarily unavailable" in sections
    assert 'safeSettingsRuntimeNode("provider-controls"' in shell
    assert 'safeSettingsRuntimeNodes("context-inspector"' in shell
    assert 'safeSettingsRuntimeNode("suggestion-quality"' in shell
    assert 'safeSettingsRuntimeNodes("diagnostics"' in shell


def test_provider_control_delegate_preserves_panel_argument():
    telemetry = (ROOT / "src/diagnostics/diagnosticsRuntime.js").read_text(encoding="utf-8")
    bridge = (ROOT / "src/composition/runtimeDelegateBridge.js").read_text(encoding="utf-8")
    shell = (ROOT / "src/ui/settings/settingsPanelShell.js").read_text(encoding="utf-8")
    assert "function updateProviderControlCard(panel, providerId)" in telemetry
    # The delegate bridge forwards every argument to the runtime method.
    assert '"updateProviderControlCard"' in bridge
    assert "return method.apply(runtime, args);" in bridge
    assert "updateProviderControlCard(panel, providerId);" in shell


if __name__ == "__main__":
    test_settings_open_guards_diagnostics_delegate_sections()
    test_provider_control_delegate_preserves_panel_argument()
    print("SETTINGS BUTTON DIAGNOSTICS GUARD STATIC TEST OK")
