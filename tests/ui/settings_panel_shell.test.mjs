import test from 'node:test';
import assert from 'node:assert/strict';

import { createPanelHarness, flushObservers } from './settings_panel_harness.mjs';

test('the Diagnostics tab is built when it is first shown, and its controls are wired then', async () => {
  const h = createPanelHarness();
  h.open();
  assert.equal(h.builds.diagnostics, 0, 'not built while General is in front');
  assert.equal(h.section('diagnostics').childElementCount, 0);

  const section = await h.showTab('diagnostics');
  assert.equal(h.builds.diagnostics, 1);
  assert.ok(section.querySelector('[data-diag-refresh]'));

  const debug = section.querySelector('input[data-k="debugMode"]');
  debug.checked = true;
  debug.dispatch('change');
  assert.equal(h.state.settings.debugMode, true, 'the setting on the tab is wired');

  await h.showTab('general');
  await h.showTab('diagnostics');
  assert.equal(h.builds.diagnostics, 1, 'built once per panel');
});

test('the Context tab is built when it is first shown, with its buttons wired', async () => {
  const h = createPanelHarness();
  h.open();
  assert.equal(h.builds.context, 0, 'the context inspector is not built while General is in front');
  assert.equal(h.builds.quality, 0, 'nor is the suggestion quality card');
  assert.equal(h.section('context').childElementCount, 0);

  const section = await h.showTab('context');
  assert.equal(h.builds.context, 1);
  assert.equal(h.builds.quality, 1);
  assert.equal(section.querySelector('[data-context-inspector-live]').textContent, 'context build 1');
  assert.deepEqual(h.named('refreshContextInspectorPanel').at(-1), ['refreshContextInspectorPanel', 'tab-switch']);
  assert.deepEqual(h.named('startContextInspectorHeartbeat').at(-1), ['startContextInspectorHeartbeat', 'tab-switch-context']);

  await Promise.all(section.querySelector('[data-context-copy-inspector]').click().results);
  assert.equal(JSON.parse(h.clipboard.at(-1)).yamlPathText, 'root', 'Copy inspector is wired');
  await Promise.all(section.querySelector('[data-quality-copy]').click().results);
  assert.equal(JSON.parse(h.clipboard.at(-1)).suggestionCount, 0, 'Copy quality report is wired');

  await h.showTab('style');
  await h.showTab('context');
  assert.equal(h.builds.context, 1, 'built once per panel');
});

test('a tab that is the open one when the panel opens is built with the panel', () => {
  const context = createPanelHarness({ activeTab: 'context' });
  context.open();
  assert.equal(context.builds.context, 1);
  assert.equal(context.builds.diagnostics, 0);
  assert.equal(context.observerCount(), 3, 'the three other late tabs wait for their first show');

  const diagnostics = createPanelHarness({ activeTab: 'diagnostics' });
  diagnostics.open();
  assert.equal(diagnostics.builds.diagnostics, 1);
  assert.equal(diagnostics.builds.context, 0);
});

test('General is built on first show when another tab was open: saved values shown, every control wired', async () => {
  const h = createPanelHarness({
    activeTab: 'style',
    settings: { keepOpen: true, triggerMode: 'manual', minChars: 3, completions: { engineV2: true } },
  });
  h.open();
  assert.equal(h.section('general').childElementCount, 0, 'General is not built while Style is in front');
  assert.equal(h.builds.providers, 0);

  const general = await h.showTab('general');
  assert.equal(h.builds.providers, 1);

  // Saved values are shown.
  assert.equal(general.querySelector('input[data-k="keepOpen"]').checked, true);
  assert.equal(general.querySelector('input[data-k="autoOpenOnFocus"]').checked, false);
  const pressed = group => general.querySelectorAll(`button[data-option-group="${group}"]`)
    .filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.dataset.optionValue);
  assert.deepEqual(pressed('triggerMode'), ['manual']);
  assert.deepEqual(pressed('minChars'), ['3']);
  assert.equal(general.querySelector('input[data-nostrodomus-toggle="completions.engineV2"]').checked, true);
  assert.equal(general.querySelector('input[data-lang="yaml"]').checked, true);

  // Every kind of control changes its setting.
  const keepOpen = general.querySelector('input[data-k="keepOpen"]');
  keepOpen.checked = false;
  keepOpen.dispatch('change');
  assert.equal(h.state.settings.keepOpen, false);

  general.querySelectorAll('button[data-option-group="triggerMode"]').find(button => button.dataset.optionValue === 'smart').click();
  assert.equal(h.state.settings.triggerMode, 'smart');
  assert.deepEqual(pressed('triggerMode'), ['smart']);

  general.querySelectorAll('button[data-option-group="maxItems"]').find(button => button.dataset.optionValue === '20').click();
  assert.equal(h.state.settings.maxItems, 20, 'a numeric option is stored as a number');

  const yaml = general.querySelector('input[data-lang="yaml"]');
  yaml.checked = false;
  yaml.dispatch('change');
  assert.equal(h.state.settings.enabledLangs.yaml, false);

  const flag = general.querySelector('input[data-nostrodomus-toggle="completions.jinjaLane"]');
  flag.checked = true;
  flag.dispatch('change');
  assert.equal(h.state.settings.completions.jinjaLane, true);

  h.state.settings.providers.snippets = { enabled: true };
  const provider = general.querySelector('input[data-provider="snippets"]');
  provider.checked = false;
  provider.dispatch('change');
  assert.equal(h.state.settings.providers.snippets.enabled, false);
  assert.equal(h.named('updateProviderControlCard').length, 1);

  // Each handler is attached once.
  assert.equal(keepOpen.listenerCount('change'), 1);
  assert.equal(h.named('setting-change').length, 6);
});

test('Help is built on first show: the reset button and the copy cards work', async () => {
  const h = createPanelHarness({ settings: { keepOpen: true } });
  const panel = h.open();
  assert.equal(h.section('help').childElementCount, 0);
  assert.equal(panel.querySelector('[data-reset-defaults]'), null);

  const help = await h.showTab('help');
  const card = help.querySelector('[data-copy-command]');
  await Promise.all(card.click().results);
  assert.equal(h.clipboard.at(-1), 'window.__nostrodomus.settings()', 'a copy card is handled by the panel-wide click handler');

  help.querySelector('[data-reset-defaults]').click();
  assert.equal(h.state.settings.keepOpen, false, 'Reset to default restores the defaults');
  assert.equal(h.state.settingsPanel === panel, false, 'and reopens the panel');
  assert.equal(h.state.settingsPanel.isConnected, true);
});

// Two end-to-end specs change style.hideEditorWarnings through its checkbox without showing the
// Style tab, so Style is built with the panel.
test('the Style tab is built with the panel whichever tab is open', () => {
  const h = createPanelHarness();
  const panel = h.open();
  const toggle = panel.querySelector('input[data-style-toggle="style.hideEditorWarnings"]');
  assert.ok(toggle, 'the Style controls exist while General is in front');
  toggle.checked = true;
  toggle.dispatch('change');
  assert.equal(h.state.settings.style.hideEditorWarnings, true);
});

// The glass sheet of the card editor dialog belongs to the companion layer. The style reapply
// does not run that layer, so the checkbox runs it on the active editor when it changes.
test('the Glass editor dialog checkbox is in the Style tab, and a change re-applies the companion layer', () => {
  const applied = [];
  const editor = { id: 'active-editor' };
  const h = createPanelHarness({ overrides: { applyCompanionEditorLayer: (target) => { applied.push(target); } } });
  h.state.activeEditorCache.editor = editor;
  const panel = h.open();

  const selector = 'input[data-style-toggle="style.glassDialog"]';
  const toggle = h.section('style').querySelector(selector);
  assert.ok(toggle, 'the checkbox is in the Style tab');
  assert.equal(panel.querySelectorAll(selector).length, 1, 'and in no other tab');
  assert.equal(toggle.checked, true, 'checked with the default settings');
  assert.equal(toggle.parentElement.textContent, 'Glass editor dialog');
  const description = h.section('style').textContent;
  assert.match(description, /Makes the card editor dialog translucent and blurs the dashboard behind it/);
  assert.match(description, /On by default; turning it off saves graphics work on slow computers\./);

  toggle.checked = false;
  toggle.dispatch('change');
  assert.equal(h.state.settings.style.glassDialog, false);
  assert.deepEqual(h.named('setting-change').at(-1), ['setting-change', 'style-toggle']);
  assert.deepEqual(h.named('scheduleCodeboxStyleReapply').at(-1), ['scheduleCodeboxStyleReapply', 'style-toggle-change']);
  assert.equal(applied.length, 1, 'the companion layer is applied once, at the change');
  assert.equal(applied[0] === editor, true, 'on the active editor');

  // The choice is written with the other settings, and a panel opened later shows it.
  assert.equal(h.runtime.saveSettings('settings'), true);
  assert.equal(JSON.parse(h.stored.get('nostrodomus.settings')).style.glassDialog, false);
  assert.equal(h.open().querySelector(selector).checked, false);

  // A Style checkbox the companion layer has no part in does not run it.
  const frame = h.state.settingsPanel.querySelector('input[data-style-toggle="style.codeboxFrameEnabled"]');
  frame.checked = false;
  frame.dispatch('change');
  assert.equal(applied.length, 1);
});

test('without MutationObserver every tab is built with the panel', async () => {
  const h = createPanelHarness({ withObserver: false });
  const panel = h.open();
  assert.equal(h.builds.context, 1);
  assert.equal(h.builds.diagnostics, 1);
  assert.ok(panel.querySelector('[data-reset-defaults]'));
  assert.ok(panel.querySelector('input[data-k="keepOpen"]'));
  await flushObservers();
  assert.equal(panel.querySelector('input[data-k="keepOpen"]').listenerCount('change'), 1);
});

// Telemetry is only recorded while the Diagnostics or Context tab is shown. A telemetry call at
// each tab switch and at close lets the recorder see the moment the gate closes.
test('a tab switch and closing the panel each make one telemetry call', async () => {
  const h = createPanelHarness();
  h.open();
  const before = h.named('recordPerformanceEvent').length;
  await h.showTab('diagnostics');
  assert.deepEqual(h.named('recordPerformanceEvent').slice(before), [['recordPerformanceEvent', 'settings-tab-switch', 0, 'diagnostics']]);
  assert.equal(h.section('diagnostics').classList.contains('active'), true);

  await h.showTab('general');
  assert.deepEqual(h.named('recordPerformanceEvent').at(-1), ['recordPerformanceEvent', 'settings-tab-switch', 0, 'general']);

  let panelAtCall = 'unset';
  const closing = createPanelHarness({ overrides: { recordPerformanceEvent: (name) => { if (name === 'settings-panel-close') panelAtCall = closing.state.settingsPanel; } } });
  closing.open();
  closing.runtime.closeSettings(false);
  assert.equal(panelAtCall === null, true, 'the call at close comes after the panel is gone, so it sees the closed gate');
});

// A save that the browser refuses (storage full or blocked) is shown in the panel; otherwise the
// setting would look applied and be gone after a reload.
test('a failed settings save is shown in the panel header until a save succeeds', () => {
  let full = false;
  const stored = new Map();
  const h = createPanelHarness({
    overrides: {
      settingsStorage: {
        getItem: key => (stored.has(key) ? stored.get(key) : null),
        setItem: (key, value) => {
          if (full && key === 'nostrodomus.settings') throw new Error('The quota has been exceeded.');
          stored.set(key, String(value));
        },
        removeItem: key => { stored.delete(key); },
      },
    },
  });
  const panel = h.open();
  const line = panel.querySelector('[data-settings-save-status]');
  const normal = line.textContent;
  assert.match(normal, /settings, suggestions, diagnostics, and help$/);
  assert.equal(line.getAttribute('aria-live'), 'polite');

  full = true;
  h.state.settings.keepOpen = true;
  assert.equal(h.runtime.saveSettings('settings'), false);
  assert.match(line.textContent, /could not be saved/);
  assert.match(line.textContent, /until the page is reloaded/);

  // A panel opened while the failure stands shows it too.
  const reopened = h.open();
  assert.match(reopened.querySelector('[data-settings-save-status]').textContent, /could not be saved/);

  full = false;
  assert.equal(h.runtime.saveSettings('settings'), true);
  assert.equal(reopened.querySelector('[data-settings-save-status]').textContent, normal, 'the normal header line is back');
});

// The Refresh button of the Diagnostics tab rebuilds the Diagnostics cards, not only the Context
// tab, which is hidden while Diagnostics is shown.
for (const activeTab of ['general', 'diagnostics']) {
  test(`Refresh rebuilds the Diagnostics cards (panel opened on ${activeTab})`, async () => {
    const h = createPanelHarness({ activeTab });
    h.open();
    const section = await h.showTab('diagnostics');
    const cardText = () => section.querySelector('.nostrodomus-diagnostics-grid').textContent;
    assert.equal(cardText(), 'diagnostics build 1');

    const refresh = section.querySelector('[data-diag-refresh]');
    const debug = section.querySelector('input[data-k="debugMode"]');
    refresh.click();
    assert.equal(h.builds.diagnostics, 2, 'the cards are built again');
    assert.equal(cardText(), 'diagnostics build 2', 'and shown');
    assert.equal(section.querySelector('[data-diag-refresh]') === refresh, true, 'the button itself is not replaced, so it keeps the focus');
    assert.equal(section.querySelector('input[data-k="debugMode"]') === debug, true);
    assert.equal(refresh.textContent, 'Refreshed');
    assert.equal(section.querySelectorAll('.nostrodomus-diagnostics-grid').length, 1);

    refresh.click();
    assert.equal(cardText(), 'diagnostics build 3');
    assert.equal(refresh.listenerCount('click'), 1, 'a refresh does not wire the button a second time');
    h.feedback.at(-1).fn();
    assert.equal(refresh.textContent, 'Refresh');
  });
}

// "Copy context" builds the readout summary from the context diagnostics API and one
// readActiveEditor() call; the API has no read() of its own.
test('Copy context copies the readout summary and the redacted active-editor readout', async () => {
  const h = createPanelHarness();
  let reads = 0;
  h.W.__nostrodomus.contextDiagnostics = Object.freeze({
    stage: 'context-diagnostics-readout',
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    isEnabled: () => false,
    readActiveEditor: () => {
      reads += 1;
      return { ok: true, activeEditor: { ok: true, editorFound: true, editor: { lineNumber: 3, linePreview: 'entity: lock.front_door' } }, editorFound: true, warning: '' };
    },
  });
  h.open();
  const section = await h.showTab('diagnostics');
  const button = section.querySelector('[data-diag-copy-context]');
  await Promise.all(button.click().results);

  const copied = JSON.parse(h.clipboard.at(-1));
  assert.deepEqual(copied.readout, {
    available: true,
    stage: 'context-diagnostics-readout',
    enabled: false,
    diagnosticsOnly: true,
    shadowOnly: true,
    drivesAutocomplete: false,
    mutatesRuntime: false,
    rendersUi: false,
    networkAccess: false,
    activeEditorOk: true,
    activeEditorFound: true,
    activeEditorWarning: 'none',
  });
  assert.equal(copied.redacted, true);
  assert.equal(copied.activeEditor.activeEditor.editor.linePreviewLength, 23, 'the editor line is still copied as a length only');
  assert.equal(h.clipboard.at(-1).includes('lock.front_door'), false);
  assert.equal(reads, 1, 'the editor is read once for both parts');
  assert.equal(button.textContent, 'Copied');
});

test('Copy context still copies readout: null when the context diagnostics API is not installed', async () => {
  const h = createPanelHarness();
  h.open();
  const section = await h.showTab('diagnostics');
  await Promise.all(section.querySelector('[data-diag-copy-context]').click().results);
  const copied = JSON.parse(h.clipboard.at(-1));
  assert.equal(copied.readout, null);
  assert.equal(copied.activeEditor, null);
});

// Choosing a syntax theme also turns syntax coloring on, and the "Enable syntax theme coloring"
// checkbox above the list shows it.
test('choosing a syntax theme checks the coloring checkbox it turns on', () => {
  const defaults = createPanelHarness().state.settings.style;
  const h = createPanelHarness({ activeTab: 'style', settings: { style: { ...defaults, syntaxTintEnabled: false } } });
  const panel = h.open();
  const toggle = panel.querySelector('input[data-style-toggle="style.syntaxTintEnabled"]');
  assert.equal(toggle.checked, false);

  const option = panel.querySelectorAll('button[data-option-group="style.syntaxTintPreset"]').find(button => button.dataset.optionValue === 'crimson');
  option.click();
  assert.equal(h.state.settings.style.syntaxTintPreset, 'crimson');
  assert.equal(h.state.settings.style.syntaxTintEnabled, true);
  assert.equal(toggle.checked, true, 'the checkbox follows the setting');
  assert.equal(h.named('setting-change').length, 1, 'one change, one save: the checkbox is set without a second change');

  // Unchecking it afterwards still works and is not undone.
  toggle.checked = false;
  toggle.dispatch('change');
  assert.equal(h.state.settings.style.syntaxTintEnabled, false);
  assert.equal(toggle.checked, false);
});

// The Close button resets every property in its style attribute, the outline included, so the
// focus ring the stylesheet gives every button in the panel needs a rule of its own there.
test('the Close button gets the focus ring of the other buttons', () => {
  const h = createPanelHarness();
  const panel = h.open();
  const close = panel.querySelector('[data-close]');
  assert.match(close.style.cssText, /^all:unset;/, 'the button keeps its reset, so its look is unchanged');

  const styles = panel.querySelectorAll('style');
  assert.equal(styles.length, 2);
  assert.equal(styles[0].textContent, h.runtime.makeSettingsStyle().textContent, 'the panel stylesheet itself is not changed');
  const rule = styles[1].textContent.replace(/\s+/g, ' ').trim();
  assert.equal(rule, '#nostrodomus-settings-root [data-close]:focus-visible { '
    + 'outline: 2px solid rgba(var(--nostrodomus-brand-rgb),.92) !important; '
    + 'outline-offset: 2px !important; '
    + 'box-shadow: 0 0 0 5px rgba(var(--nostrodomus-accent-rgb),.16) !important; }');
  // The same ring as the rule for every other button; important because a style attribute
  // only yields to an important rule.
  const shared = styles[0].textContent;
  for (const declaration of ['outline: 2px solid rgba(var(--nostrodomus-brand-rgb),.92);', 'outline-offset: 2px;', 'box-shadow: 0 0 0 5px rgba(var(--nostrodomus-accent-rgb),.16);']) {
    assert.equal(shared.includes(declaration), true, `the shared focus rule has "${declaration}"`);
  }
});

// A tablist is expected to move focus with the arrow keys. Focus only: Enter or Space selects,
// so walking past a tab does not build it.
test('arrow keys, Home and End move focus along the tab row without selecting', async () => {
  const h = createPanelHarness();
  h.open();
  const key = (tab, name) => h.tab(tab).dispatch('keydown', { key: name });
  const focused = () => h.document.activeElement?.dataset?.settingsTab;

  let event = key('general', 'ArrowRight');
  assert.equal(focused(), 'context');
  assert.equal(event.defaultPrevented, true, 'the tab row does not scroll instead');
  assert.equal(event.propagationStopped, true);
  await flushObservers();
  assert.equal(h.tab('context').getAttribute('aria-selected'), 'false', 'focus moved, the tab was not selected');
  assert.equal(h.tab('general').getAttribute('aria-selected'), 'true');
  assert.equal(h.builds.context, 0, 'and so it was not built');

  key('context', 'ArrowRight');
  assert.equal(focused(), 'diagnostics');
  key('diagnostics', 'ArrowLeft');
  assert.equal(focused(), 'context');
  key('general', 'ArrowLeft');
  assert.equal(focused(), 'help', 'the row wraps at the start');
  key('help', 'ArrowRight');
  assert.equal(focused(), 'general', 'and at the end');
  key('style', 'Home');
  assert.equal(focused(), 'general');
  key('context', 'End');
  assert.equal(focused(), 'help');

  // Other keys are left alone: Enter and Space are the button's own click, Tab moves on.
  for (const name of ['Enter', ' ', 'Tab', 'ArrowDown', 'a']) {
    event = key('general', name);
    assert.equal(event.defaultPrevented, false, `${JSON.stringify(name)} is not taken`);
    assert.equal(focused(), 'help');
  }
  const escape = key('general', 'Escape');
  assert.equal(escape.defaultPrevented, true, 'Escape still reaches the panel and closes it');
  assert.equal(h.state.settingsPanel === null, true);
});

// The panel's minimum size (380 by 360) gives way to its maximum (the window minus 16px), so the
// whole panel stays on a phone narrower than 396px, or shorter than 376px on its side.
test('the panel minimum size gives way to a small window', () => {
  const h = createPanelHarness();
  let panel = h.open();
  assert.match(panel.style.cssText, /(^|;)min-width:min\(380px, calc\(100vw - 16px\)\)(;|$)/);
  assert.match(panel.style.cssText, /(^|;)min-height:min\(360px, calc\(100vh - 16px\)\)(;|$)/);
  assert.match(panel.style.cssText, /(^|;)max-width:calc\(100vw - 16px\)(;|$)/);
  assert.match(panel.style.cssText, /(^|;)width:440px(;|$)/);

  h.W.innerWidth = 360;
  h.W.innerHeight = 640;
  panel = h.open();
  assert.match(panel.style.cssText, /(^|;)width:344px(;|$)/, 'a 360px window gets a 344px panel');
  assert.equal(panel.style.left, '8px');

  h.W.innerWidth = 640;
  h.W.innerHeight = 320;
  panel = h.open();
  assert.match(panel.style.cssText, /(^|;)height:304px(;|$)/, 'a 320px-high window gets a 304px panel');
  assert.equal(panel.style.top, '8px', 'placed so that its bottom edge is inside the window');
});

// With the defaults the list opens only on Ctrl+Space: typing reaches the completion refresh
// only while the list is open or "Keep Nostrodomus armed" is on. The General tab and the README
// must not say that suggestions appear while typing.
test('the General tab and the README describe when the list opens with the default settings', async () => {
  const { DEFAULT_SETTINGS } = await import('../../src/core/settings.js');
  assert.equal(DEFAULT_SETTINGS.keepOpen, false, 'the defaults are not changed');
  assert.equal(DEFAULT_SETTINGS.autoOpenOnFocus, false);
  assert.equal(DEFAULT_SETTINGS.triggerMode, 'smart');
  assert.equal(DEFAULT_SETTINGS.minChars, 1);

  const h = createPanelHarness();
  h.open();
  const general = h.section('general');
  const text = general.textContent;
  assert.match(text, /Opens the suggestion list by itself while you type/, 'what "Keep Nostrodomus armed" does');
  assert.match(text, /Off by default: the list opens when you press Ctrl\+Space/);
  assert.match(text, /With both off, the list opens only when you press Ctrl\+Space, whichever mode is selected/);
  assert.equal(text.includes('Keeps the engine ready without forcing a visible popup'), false);
  const modes = general.querySelectorAll('button[data-option-group="triggerMode"]').map(button => [button.dataset.optionValue, button.textContent]);
  assert.deepEqual(modes, [
    ['smart', 'Smart: after the minimum characters or a trigger character'],
    ['manual', 'Manual only: Ctrl+Space'],
    ['aggressive', 'Aggressive: one character sooner'],
  ]);

  const { readFileSync } = await import('node:fs');
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.equal(readme.includes('or let them appear as you type'), false);
  assert.match(readme, /Press `Ctrl\+Space` to open or close suggestions/);
  assert.match(readme, /turn on "Keep Nostrodomus armed"/);
});

// With site data blocked there is no store at all. The panel opens on General, tabs switch, and
// nothing is recorded as an error for the missing store.
test('the panel works without a settings store', async () => {
  const h = createPanelHarness({ overrides: { settingsStorage: null } });
  const panel = h.open();
  assert.equal(h.section('general').classList.contains('active'), true);
  await h.showTab('style');
  assert.equal(h.tab('style').getAttribute('aria-selected'), 'true');
  assert.deepEqual(h.named('recordRuntimeErrorOnce'), [], 'a missing store is not an error on open or on a tab switch');

  // A save has nowhere to go: that is reported like any other failed save.
  assert.equal(h.runtime.saveSettings('settings'), false);
  assert.match(panel.querySelector('[data-settings-save-status]').textContent, /could not be saved/);
});

test('Refresh keeps the cards that are shown when the new ones cannot be built', async () => {
  let fail = false;
  const h = createPanelHarness({
    overrides: {
      diagnosticsMarkup: () => {
        if (fail) throw new Error('readout failed');
        return [h.el('div', { className: 'nostrodomus-diagnostics-grid', text: 'cards' }), h.el('button', { text: 'Refresh', dataset: { diagRefresh: '' } })];
      },
    },
  });
  h.open();
  const section = await h.showTab('diagnostics');
  fail = true;
  section.querySelector('[data-diag-refresh]').click();
  assert.equal(section.querySelector('.nostrodomus-diagnostics-grid').textContent, 'cards');
  assert.equal(h.named('recordRuntimeErrorOnce').some(call => call[1] === 'settings:diagnostics'), true, 'the failure is recorded');
});

test('each Style description sits next to the control it describes', () => {
  const h = createPanelHarness();
  h.open();
  const nodes = Array.from(h.section('style').childNodes);
  const indexOf = predicate => nodes.findIndex(predicate);
  const title = text => indexOf(node => node.className === 'nostrodomus-section-title' && node.textContent === text);
  const desc = start => indexOf(node => node.className === 'nostrodomus-setting-desc' && String(node.textContent).startsWith(start));

  const themes = desc('Includes Classic (the default)');
  assert.ok(themes > title('Syntax theme'), 'the list of syntax themes is in the Syntax theme part');
  assert.ok(themes < title('Editor warnings'), 'and not under Editor warnings or Active line highlight');

  const details = desc('Off by default so Ctrl+Space stays compact');
  const detailsCheckbox = indexOf(node => !!node.querySelector?.('input[data-k="showDetailsPane"]'));
  assert.equal(details, detailsCheckbox + 1, 'the details pane note follows its checkbox');
  assert.ok(details < title('Completion accept mode'));
});

// Reset to default can turn "Hide editor warnings" off and "Glass editor dialog" on. Both sheets
// belong to the companion layer, which the style reapply does not run.
test('Reset to default re-applies the companion layer with the default settings', async () => {
  const applied = [];
  const editor = { id: 'active-editor' };
  const h = createPanelHarness({
    settings: { style: { hideEditorWarnings: true, glassDialog: false } },
    overrides: { applyCompanionEditorLayer: (target) => { applied.push({ target, style: { ...h.state.settings.style } }); } },
  });
  h.state.activeEditorCache.editor = editor;
  h.open();
  const help = await h.showTab('help');
  help.querySelector('[data-reset-defaults]').click();
  assert.equal(applied.length, 1, 'the companion layer is applied once');
  assert.equal(applied[0].target === editor, true, 'on the active editor');
  assert.equal(applied[0].style.hideEditorWarnings, false, 'with the default settings');
  assert.equal(applied[0].style.glassDialog, true);
});
