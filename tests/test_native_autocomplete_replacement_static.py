from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
settings = (ROOT / 'src/core/settings.js').read_text(encoding='utf-8')
active_cache = (ROOT / 'src/editor/activeEditorCacheRuntime.js').read_text(encoding='utf-8')
public_api = (ROOT / 'src/core/publicApiRuntime.js').read_text(encoding='utf-8')
main = (ROOT / 'src/main.legacy.js').read_text(encoding='utf-8')
context = (ROOT / 'src/yaml/runtimeContextAdapter.js').read_text(encoding='utf-8')
settings_panel = (ROOT / 'src/ui/settings/settingsPanelShell.js').read_text(encoding='utf-8')

errors = []

def require(cond, msg):
    if not cond:
        errors.append(msg)

require('replaceNativeAutocomplete: true' in settings, 'replaceNativeAutocomplete default must be on')
require('Replace Home Assistant native autocomplete' in settings_panel, 'setting must be user-visible and reversible')
require('autocompleteEntities' in active_cache and 'autocompleteIcons' in active_cache, 'active editor runtime must touch HA autocomplete properties')
require('host.autocompleteEntities = false' in active_cache, 'native entity autocomplete must be disabled by property, not CSS')
require('host.autocompleteIcons = false' in active_cache, 'native icon autocomplete must be disabled by property, not CSS')
require('restoreNativeAutocomplete' in active_cache, 'native autocomplete restore path must exist')
require("lifecycle.restoreNativeAutocomplete?.('uninstall')" in public_api, 'public uninstall/disable must restore native autocomplete')
require('replaceNativeAutocompleteEnabled: () => state.settings?.replaceNativeAutocomplete !== false' in main, 'main must wire the setting into active editor runtime')
require('runtimeData,' in main and 'runtimeData,' in (ROOT / 'src/yaml/runtimeContextRuntime.js').read_text(encoding='utf-8'), 'runtime context must receive runtimeData for entity-domain parity')
require('yamlValuePrefixLooksLikeEntityId' in context, 'context adapter must include entity-id shape heuristic')
require('FALLBACK_ENTITY_DOMAINS' in context, 'context adapter must keep fallback HA domains for cold-start parity')
require('.cm-tooltip-autocomplete' not in active_cache, 'native popup must not be hidden with CSS')

if errors:
    raise SystemExit('NATIVE AUTOCOMPLETE REPLACEMENT STATIC TEST FAILED\n' + '\n'.join(f'- {e}' for e in errors))
print('NATIVE AUTOCOMPLETE REPLACEMENT STATIC TEST OK')
