// Position/size clamping, portal-viewport coordinate translation, and
// position/size persistence for the settings panel. Shared mutable state
// (state.settings, state.settingsPortalHost) stays owned by the composer and
// is passed by reference.

export function createSettingsGeometry(deps = {}) {
  const {
    window,
    state,
    clampSettingsPosition: clampSettingsPositionFromModule,
    clampSettingsSize: clampSettingsSizeFromModule,
    saveSettings,
  } = deps;

  function clampSettingsPosition(pos) {
    const size = clampSettingsSize(state.settings?.settingsSize);
    return clampSettingsPositionFromModule(pos, window, size.w, size.h);
  }

  function clampSettingsSize(size) {
    return clampSettingsSizeFromModule(size, window);
  }

  function settingsPortalViewportRect() {
    const host = state.settingsPortalHost;
    const rect = host?.getBoundingClientRect?.();
    if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
      return rect;
    }
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function settingsViewportToPortalPosition(pos) {
    const p = clampSettingsPosition(pos);
    const rect = settingsPortalViewportRect();
    return {
      x: Math.round(p.x - (Number.isFinite(rect.left) ? rect.left : 0)),
      y: Math.round(p.y - (Number.isFinite(rect.top) ? rect.top : 0)),
    };
  }

  function applySettingsPanelViewportPosition(panel, pos) {
    if (!panel) return null;
    const viewport = clampSettingsPosition(pos);
    const local = settingsViewportToPortalPosition(viewport);
    panel.style.left = `${local.x}px`;
    panel.style.top = `${local.y}px`;
    panel.dataset.nostrodomusViewportX = String(viewport.x);
    panel.dataset.nostrodomusViewportY = String(viewport.y);
    return viewport;
  }

  function saveSettingsPosition(x, y) {
    state.settings.settingsPos = clampSettingsPosition({ x, y });
    saveSettings("settings-position");
  }

  function saveSettingsSize(w, h) {
    state.settings.settingsSize = clampSettingsSize({ w, h });
    saveSettings("settings-size");
  }

  return {
    clampSettingsPosition,
    clampSettingsSize,
    settingsPortalViewportRect,
    settingsViewportToPortalPosition,
    applySettingsPanelViewportPosition,
    saveSettingsPosition,
    saveSettingsSize,
  };
}
