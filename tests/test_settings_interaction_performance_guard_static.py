#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

def read_if_exists(rel):
    path = ROOT / rel
    return path.read_text(encoding='utf-8', errors='replace') if path.exists() else ''

legacy = (ROOT / 'src' / 'main.legacy.js').read_text(encoding='utf-8', errors='replace')
changelog_module = read_if_exists('src/core/changelogSummary.js')
settings_interaction_runtime = read_if_exists('src/ui/settingsInteractionRuntime.js')
delegate_bridge = read_if_exists('src/composition/runtimeDelegateBridge.js')
dist = (ROOT / 'dist' / 'nostrodomus.js').read_text(encoding='utf-8', errors='replace')
version_module = read_if_exists('src/core/version.js')
# The settings-interaction-performance owners were decomposed out of the monolith: the
# style-range input/change handlers now live in src/ui/settings/settingsPanelShell.js and the
# deferred commit reapply in src/ui/codebox/codeboxStyleSettle.js. Same invariant, current homes.
settings_panel_shell = read_if_exists('src/ui/settings/settingsPanelShell.js')
codebox_style_settle = read_if_exists('src/ui/codebox/codeboxStyleSettle.js')
errors = []

source_owners = '\n'.join([
    legacy, changelog_module, version_module, settings_interaction_runtime,
    delegate_bridge, settings_panel_shell, codebox_style_settle,
])

for label, text in [('source delegate/runtime owners', source_owners), ('dist/nostrodomus.js', dist)]:
    required = [
        # Version lineage: the original tuple of v31.6.8x runtime-string literals (the
        # settings-interaction-performance-guard era + its follow-ons) was retired at the
        # 31.6.x -> 0.1.x SemVer reset and exists nowhere in src/dist. Un-pin to the current
        # SemVer-era runtime-string prefix, which the version/changelog surface still records.
        'nostrodomus-v0.1.',
        # Deferred-save / live-preview owner functions. The minified dist drops the spaces
        # around default-arg "=" (reason="..."), so accept both the source-spaced and the
        # minified forms of each definition.
        ('function scheduleSettingsSave(reason = \'settings-deferred-save\'', 'function scheduleSettingsSave(reason="settings-deferred-save"'),
        ('function flushSettingsSave(reason = \'settings-save-commit\'', 'function flushSettingsSave(reason="settings-save-commit")'),
        ('function scheduleStyleRangeLivePreview(group = \'style-range-live\')', 'function scheduleStyleRangeLivePreview(group="style-range-live")'),
        ('function applyCodeboxStyleLivePreview(reason = \'settings-style-live-preview\'', 'function applyCodeboxStyleLivePreview(reason="settings-style-live-preview"'),
        # INVARIANT (style-range INPUT): saving is DEFERRED/debounced on every input rather than
        # written immediately. The old direct `scheduleSettingsSave("style-range-live", 420)` call
        # is now routed through scheduleStyleRangeLiveSave("style-range-live"), which internally
        # coalesces into a deferred scheduleSettingsSave(reason, 900).
        'scheduleStyleRangeLiveSave("style-range-live")',
        # INVARIANT (style-range INPUT): input does a cheap LIVE PREVIEW, not a full reapply.
        ('scheduleStyleRangeLivePreview(group)', 'scheduleStyleRangeLivePreview(group);'),
        # INVARIANT (style-range COMMIT): on the change/commit event the save is committed under
        # the "style-range-commit" reason (the former flushSettingsSave("style-range-commit")).
        # Minified dist drops the space after the comma.
        ('scheduleSettingsSave("style-range-commit", 260)', 'scheduleSettingsSave("style-range-commit",260)'),
        # INVARIANT (style-range COMMIT): the heavy codebox reapply is scheduled only on commit
        # (the former scheduleCodeboxStyleReapply("style-range-change")). The handler now calls
        # scheduleStyleRangeCommitReapply(group), which defers scheduleCodeboxStyleReapply("style-range-commit").
        'scheduleStyleRangeCommitReapply(group)',
        'scheduleCodeboxStyleReapply("style-range-commit")',
    ]
    for token in required:
        if isinstance(token, tuple):
            if not any(option in text for option in token):
                errors.append(f'{label} missing settings interaction performance lineage token: {token}')
        elif token not in text:
            errors.append(f'{label} missing settings interaction performance token: {token}')

    old_input_path = 'applySettingChangePreservingInteraction("style-range", () => {'
    if old_input_path in text:
        errors.append(f'{label} still saves/live-updates on every style range input')

if errors:
    print('SETTINGS INTERACTION PERFORMANCE GUARD STATIC TEST FAILED')
    for error in errors:
        print('-', error)
    sys.exit(1)
print('SETTINGS INTERACTION PERFORMANCE GUARD STATIC TEST OK')
