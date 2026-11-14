from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_settings_open_guards_diagnostics_delegate_sections():
    src = (ROOT / "src/ui/settingsPanelRuntime.js").read_text()
    assert "function safeSettingsRuntimeNode" in src
    assert "function safeSettingsRuntimeNodes" in src
    assert "function safeSettingsRuntimeCall" in src
    assert 'safeSettingsRuntimeNode("provider-controls"' in src
    assert 'safeSettingsRuntimeNodes("context-inspector"' in src
    assert 'safeSettingsRuntimeNode("suggestion-quality"' in src
    assert 'safeSettingsRuntimeNodes("diagnostics"' in src
    assert "Section temporarily unavailable" in src


def test_provider_control_delegate_preserves_panel_argument():
    src = (ROOT / "src/main.legacy.js").read_text()
    assert "function updateProviderControlCard(panel, providerId)" in src
    assert "diagnosticsRuntime.updateProviderControlCard(panel, providerId)" in src
