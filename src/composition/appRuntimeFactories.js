import { createSettingsPanelRuntime } from '../ui/settingsPanelRuntime.js';
import {
  appendSettingsChildren,
  clampSettingsPosition,
  clampSettingsSize,
  createSettingsElement,
  settingsTitle,
} from '../ui/settingsPanel.js';
import { glowSizeLabel, languageLabel } from '../ui/settingsLabels.js';

/**
 * @param {{
 *   globals?: Record<string, any>, identity?: Record<string, any>, settings?: Record<string, any>,
 *   diagnostics?: Record<string, any>, providers?: Record<string, any>, style?: Record<string, any>,
 *   lifecycle?: Record<string, any>, state?: any,
 * }} [deps]
 */
export function createAppSettingsPanelRuntime({
  globals = {},
  identity = {},
  settings = {},
  diagnostics = {},
  providers = {},
  style = {},
  lifecycle = {},
  state,
} = {}) {
  return createSettingsPanelRuntime({
    ...globals,
    ...identity,
    ...settings,
    ...diagnostics,
    ...providers,
    ...style,
    ...lifecycle,
    state,
    appendSettingsChildren,
    clampSettingsPosition,
    clampSettingsSize,
    createSettingsElement,
    glowSizeLabel,
    languageLabel,
    settingsTitle,
  });
}
