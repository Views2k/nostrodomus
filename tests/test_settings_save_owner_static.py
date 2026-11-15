#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
main = (root / 'src/app.js').read_text(encoding='utf-8')
runtime = (root / 'src/ui/settingsPanelRuntime.js').read_text(encoding='utf-8')

main_expected = 'function saveSettings(reason = "settings-save") {\n    return settingsPanelRuntime.saveSettings(reason);\n  }'
assert main_expected in main, 'main must keep only the saveSettings delegate to settingsPanelRuntime'

for token in [
    'function saveSettings(reason = "settings-save")',
    'settingsStorage.setItem(SETTINGS_WRITE_KEY, serialized)',
    'recordPerformanceEvent("settings-save-write", 0, stats.lastReason)',
    'recordPerformanceEvent("settings-save-skipped-unchanged", 0, stats.lastReason)',
    'clearCompletionCache();',
    'saveSettings,',
]:
    assert token in runtime, f'settings runtime missing saveSettings owner token: {token}'

for forbidden in [
    'localStorage.setItem(SETTINGS_WRITE_KEY, serialized)',
    'const serialized = JSON.stringify(state.settings);\n    const stats = state.settingsSaveStats',
]:
    assert forbidden not in main, f'main still owns saveSettings body token: {forbidden}'

print('SETTINGS SAVE OWNER STATIC TEST OK')
