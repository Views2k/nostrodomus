// Pure-ish DOM builders for the settings panel (pills, range cards, toggles,
// checkboxes, grids, syntax theme dropdown). Output structure is under snapshot
// guard (tests/ui/settings_controls_snapshot.test.mjs).

export function createSettingsControls(deps = {}) {
  const {
    document,
    state,
    DEFAULT_SETTINGS,
    STYLE_SYNTAX_PRESETS,
    clampNumber,
    hueLabel,
    percentLabel,
    syntaxThemeOptions,
    syntaxThemePalette,
    createSettingsElement: createSettingsElementFromModule,
    appendSettingsChildren: appendSettingsChildrenFromModule,
    glowSizeLabel: glowSizeLabelFromModule,
    settingsTitle: settingsTitleFromModule,
  } = deps;

  function createSettingsElement(tag, options = {}, children = []) {
    return createSettingsElementFromModule(tag, options, children, document);
  }

  function appendChildren(parent, children) {
    return appendSettingsChildrenFromModule(parent, children, document);
  }

  function settingDesc(text) {
    return createSettingsElement("div", { className: "nostrodomus-setting-desc", text });
  }

  function settingsCard(children = [], className = "") {
    return createSettingsElement("div", { className: `nostrodomus-settings-card ${className}`.trim() }, children);
  }

  function rgbaFromPreset(preset = {}, opacity = 1, saturationScale = 1) {
    const hue = Math.round(clampNumber(preset?.baseHue, 0, 360, 210));
    const saturation = Math.round(clampNumber((preset?.saturation ?? 1) * saturationScale, 0, 2.5, 1) * 56);
    const alpha = clampNumber(opacity, 0, 1, 1);
    return `hsla(${hue} ${saturation}% 62% / ${alpha})`;
  }

  function optionButton(label, value, current, group) {
    const active = String(value) === String(current);
    return createSettingsElement("button", {
      className: `nostrodomus-pill ${active ? "active" : ""}`,
      text: label,
      dataset: { optionGroup: group, optionValue: value },
      attrs: { type: "button", "aria-pressed": active ? "true" : "false" },
    });
  }

  function colorOptionButton(label, value, current, group, preset) {
    const active = String(value) === String(current);
    const swatch = rgbaFromPreset(preset, 0.90, 1.12);
    const glow = rgbaFromPreset(preset, 0.24, 1.20);
    return createSettingsElement("button", {
      className: `nostrodomus-pill nostrodomus-color-choice ${active ? "active" : ""}`,
      dataset: { optionGroup: group, optionValue: value },
      attrs: { type: "button", "aria-pressed": active ? "true" : "false" },
      style: `--nostrodomus-choice-color:${swatch};--nostrodomus-choice-glow:${glow}`,
    }, [
      createSettingsElement("span", { className: "nostrodomus-color-strip" }),
      createSettingsElement("span", { text: label }),
    ]);
  }

  function glowSizeLabel(value) {
    return glowSizeLabelFromModule(value);
  }

  function styleRangeControl(label, key, value, min, max, step, formatter = percentLabel, rangeFormat = "") {
    const safeValue = clampNumber(value, min, max, Number(value ?? min));
    const display = formatter(safeValue);
    const input = createSettingsElement("input", {
      className: "nostrodomus-style-range",
      attrs: { type: "range", min, max, step, value: safeValue, "aria-label": label },
      dataset: { styleRange: key, rangeFormat },
    });
    input.value = String(safeValue);
    return settingsCard([
      createSettingsElement("div", { className: "nostrodomus-style-range-head" }, [
        createSettingsElement("b", { text: label }),
        createSettingsElement("span", { className: "nostrodomus-style-range-value", text: display, dataset: { rangeValueFor: key } }),
      ]),
      input,
    ], "nostrodomus-style-range-card");
  }

  function styleColorBarControl(label, key, value) {
    const safeValue = clampNumber(value, 0, 360, 0);
    const input = createSettingsElement("input", {
      className: "nostrodomus-style-range nostrodomus-color-bar",
      attrs: { type: "range", min: 0, max: 360, step: 1, value: safeValue, "aria-label": label },
      dataset: { styleRange: key, rangeFormat: "hue" },
    });
    input.value = String(safeValue);
    return settingsCard([
      createSettingsElement("div", { className: "nostrodomus-style-range-head" }, [
        createSettingsElement("b", { text: label }),
        createSettingsElement("span", { className: "nostrodomus-style-range-value", text: hueLabel(safeValue), dataset: { rangeValueFor: key } }),
      ]),
      input,
    ], "nostrodomus-style-range-card nostrodomus-color-bar-card");
  }

  function styleToggle(label, key, checked) {
    const input = createSettingsElement("input", {
      attrs: { type: "checkbox", "aria-label": label },
      dataset: { styleToggle: key },
    });
    input.checked = checked !== false;
    return createSettingsElement("label", { className: "nostrodomus-checkbox-row nostrodomus-style-toggle" }, [input, createSettingsElement("span", { text: label })]);
  }

  function syntaxThemeSelect(current) {
    const safeCurrent = STYLE_SYNTAX_PRESETS[current] ? current : DEFAULT_SETTINGS.style.syntaxTintPreset;
    const currentPreset = STYLE_SYNTAX_PRESETS[safeCurrent] || STYLE_SYNTAX_PRESETS[DEFAULT_SETTINGS.style.syntaxTintPreset] || STYLE_SYNTAX_PRESETS.vscodeDarkPlus;
    const currentLabel = currentPreset?.label || safeCurrent;
    const currentPalette = syntaxThemePalette(currentPreset, state.settings?.style?.syntaxThemeSaturation ?? DEFAULT_SETTINGS.style.syntaxThemeSaturation);
    const details = createSettingsElement("details", { className: "nostrodomus-syntax-theme-dropdown", dataset: { currentTheme: safeCurrent } });
    const summary = createSettingsElement("summary", { className: "nostrodomus-syntax-theme-summary", attrs: { "aria-label": "Syntax color theme", "aria-haspopup": "listbox", "aria-controls": "nostrodomus-syntax-theme-listbox" } }, [
      createSettingsElement("span", { className: "nostrodomus-syntax-theme-current", text: currentLabel, dataset: { syntaxThemeCurrent: "label" } }),
      createSettingsElement("span", { className: "nostrodomus-syntax-theme-current-swatches", attrs: { "aria-hidden": "true" }, dataset: { syntaxThemeCurrent: "swatches" } }, [
        createSettingsElement("span", { style: `background:${currentPalette.key}` }),
        createSettingsElement("span", { style: `background:${currentPalette.jinja}` }),
        createSettingsElement("span", { style: `background:${currentPalette.cssSelector}` }),
        createSettingsElement("span", { style: `background:${currentPalette.string}` }),
        createSettingsElement("span", { style: `background:${currentPalette.number}` }),
      ]),
      createSettingsElement("span", { className: "nostrodomus-syntax-theme-chevron", text: "⌄" }),
    ]);
    const list = createSettingsElement("div", { className: "nostrodomus-syntax-theme-options", id: "nostrodomus-syntax-theme-listbox", attrs: { role: "listbox", "aria-label": "Syntax color theme options" } });
    for (const option of syntaxThemeOptions()) {
      const active = option.key === safeCurrent;
      const palette = syntaxThemePalette(STYLE_SYNTAX_PRESETS[option.key], state.settings?.style?.syntaxThemeSaturation ?? DEFAULT_SETTINGS.style.syntaxThemeSaturation);
      const btn = createSettingsElement("button", {
        className: `nostrodomus-syntax-theme-option${active ? " active" : ""}`,
        attrs: { type: "button", role: "option", "aria-selected": active ? "true" : "false", "aria-current": active ? "true" : "false" },
        dataset: { optionGroup: "style.syntaxTintPreset", optionValue: option.key, syntaxThemeLabel: option.label },
      }, [
        createSettingsElement("span", { className: "nostrodomus-syntax-theme-label", text: option.label }),
        createSettingsElement("span", { className: "nostrodomus-syntax-theme-badge", text: active ? "Current" : "" }),
        createSettingsElement("span", { className: "nostrodomus-syntax-theme-swatches", attrs: { "aria-hidden": "true" } }, [
          createSettingsElement("span", { style: `background:${palette.key}` }),
          createSettingsElement("span", { style: `background:${palette.jinja}` }),
          createSettingsElement("span", { style: `background:${palette.cssSelector}` }),
          createSettingsElement("span", { style: `background:${palette.string}` }),
          createSettingsElement("span", { style: `background:${palette.number}` }),
        ]),
      ]);
      list.appendChild(btn);
    }
    details.append(summary, list);
    return settingsCard([
      createSettingsElement("div", { className: "nostrodomus-style-range-head" }, [
        createSettingsElement("b", { text: "Syntax color theme" }),
        createSettingsElement("span", { className: "nostrodomus-style-range-value", text: `${syntaxThemeOptions().length} themes` }),
      ]),
      details,
    ], "nostrodomus-style-select-card nostrodomus-syntax-theme-card");
  }

  function settingsCheckbox(label, key, checked, datasetKey = "k") {
    const input = createSettingsElement("input", {
      attrs: { type: "checkbox", "aria-label": label },
      dataset: { [datasetKey]: key },
    });
    input.checked = !!checked;
    return createSettingsElement("label", { className: "nostrodomus-checkbox-row" }, [input, createSettingsElement("span", { text: label })]);
  }

  function settingsTitle(text) {
    return settingsTitleFromModule(text, document);
  }

  function settingsGrid(columns, children, extraStyle = "") {
    return createSettingsElement("div", {
      style: `display:grid;grid-template-columns:${columns};gap:6px;margin-bottom:12px;${extraStyle}`,
    }, children);
  }

  return {
    createSettingsElement,
    appendChildren,
    settingDesc,
    settingsCard,
    optionButton,
    colorOptionButton,
    glowSizeLabel,
    styleRangeControl,
    styleColorBarControl,
    styleToggle,
    syntaxThemeSelect,
    settingsCheckbox,
    settingsTitle,
    settingsGrid,
  };
}
