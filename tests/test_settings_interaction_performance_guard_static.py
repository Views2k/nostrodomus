#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

def read_if_exists(rel):
    path = ROOT / rel
    return path.read_text(encoding='utf-8', errors='replace') if path.exists() else ''

app = (ROOT / 'src' / 'app.js').read_text(encoding='utf-8', errors='replace')
changelog_module = read_if_exists('src/core/changelogSummary.js')
settings_interaction_runtime = read_if_exists('src/ui/settingsInteractionRuntime.js')
delegate_bridge = read_if_exists('src/composition/runtimeDelegateBridge.js')
dist = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8', errors='replace')
# Moving a slider updates a cheap live preview and defers the save; the full reapply and the
# save commit happen on the change event. The slider handlers are in settingsPanelShell.js, the
# deferred commit reapply in codeboxStyleSettle.js.
settings_panel_shell = read_if_exists('src/ui/settings/settingsPanelShell.js')
codebox_style_settle = read_if_exists('src/ui/codebox/codeboxStyleSettle.js')
errors = []

source_owners = '\n'.join([
    app, changelog_module, settings_interaction_runtime,
    delegate_bridge, settings_panel_shell, codebox_style_settle,
])

for label, text in [('source delegate/runtime owners', source_owners), ('dist/nostrodomus.js', dist)]:
    required = [
        # Deferred save and live preview functions; dist has no spaces around default "=".
        ('function scheduleSettingsSave(reason = \'settings-deferred-save\'', 'function scheduleSettingsSave(reason="settings-deferred-save"'),
        ('function flushSettingsSave(reason = \'settings-save-commit\'', 'function flushSettingsSave(reason="settings-save-commit")'),
        ('function scheduleStyleRangeLivePreview(group = \'style-range-live\')', 'function scheduleStyleRangeLivePreview(group="style-range-live")'),
        ('function applyCodeboxStyleLivePreview(reason = \'settings-style-live-preview\'', 'function applyCodeboxStyleLivePreview(reason="settings-style-live-preview"'),
        # Slider input: the save is debounced through scheduleStyleRangeLiveSave, which ends in
        # a deferred scheduleSettingsSave(reason, 900).
        'scheduleStyleRangeLiveSave("style-range-live")',
        # Slider input: a cheap live preview, not a full reapply.
        ('scheduleStyleRangeLivePreview(group)', 'scheduleStyleRangeLivePreview(group);'),
        # Slider change: the save is committed under the "style-range-commit" reason.
        ('scheduleSettingsSave("style-range-commit", 260)', 'scheduleSettingsSave("style-range-commit",260)'),
        # Slider change: the full codebox reapply, through scheduleStyleRangeCommitReapply.
        'scheduleStyleRangeCommitReapply(group)',
        'scheduleCodeboxStyleReapply("style-range-commit")',
    ]
    for token in required:
        if isinstance(token, tuple):
            if not any(option in text for option in token):
                errors.append(f'{label} missing settings interaction performance token: {token}')
        elif token not in text:
            errors.append(f'{label} missing settings interaction performance token: {token}')

    full_update_on_input = 'applySettingChangePreservingInteraction("style-range", () => {'
    if full_update_on_input in text:
        errors.append(f'{label} saves and fully updates on every style range input')

if errors:
    print('SETTINGS INTERACTION PERFORMANCE GUARD STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('SETTINGS INTERACTION PERFORMANCE GUARD STATIC TEST OK')
