// openSettings split into focused build/attach steps. The orchestrator calls the
// steps in statement order, and listener registration order plus event options are
// preserved exactly. Shared mutable panel state (state.settingsPanel, drag/resize
// transient state) keeps its original ownership.

import { PRODUCT_NAME, PROJECT_VERSION } from '../../core/version.js';
import { uiAccentVarsFromSettings } from '../codeboxStyle.js';
import { diagnosticsReadoutSummary, redactDiagnosticsUserText } from '../../diagnostics/diagnosticsCore.js';

// Copy through a temporary textarea: the path that still works on a plain-HTTP install, where
// navigator.clipboard does not exist. Must run inside the click.
function copyTextWithoutClipboardApi(text) {
  try {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc?.body || typeof doc.execCommand !== "function") return false;
    const area = doc.createElement("textarea");
    area.value = String(text || "");
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const ok = doc.execCommand("copy") === true;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

// important-override registry: focus ring of the panel's Close button.
// rule overridden: the button's own style attribute, which resets every property with
//   all:unset, the outline included, so the focus ring the settings stylesheet gives every
//   button in the panel never showed on it.
// owner: this style element, added to the panel next to the settings stylesheet (whose text is
//   under a byte-identity guard and is not changed).
// reason: a declaration in a style attribute only yields to an important rule.
// removal condition: the Close button no longer resets its outline in a style attribute.
// verification: tests/ui/settings_panel_shell.test.mjs; keyboard focus on Close in a browser.
const CLOSE_BUTTON_FOCUS_CSS = `
        #nostrodomus-settings-root [data-close]:focus-visible {
          outline: 2px solid rgba(var(--nostrodomus-brand-rgb),.92) !important;
          outline-offset: 2px !important;
          box-shadow: 0 0 0 5px rgba(var(--nostrodomus-accent-rgb),.16) !important;
        }
`;

export function createSettingsPanelShell(deps = {}) {
  const {
    document = globalThis.document,
    navigator = globalThis.navigator,
    settingsStorage = globalThis?.["local" + "Storage"],
    W,
    state,
    DEFAULT_SETTINGS,
    STYLE_SYNTAX_PRESETS,
    STYLE_TEXT_SIZE_PRESETS,
    percentLabel,
    sliderNumberLabel,
    languageLabel,
    createSettingsElement,
    appendChildren,
    settingsTitle,
    settingDesc,
    settingsCard,
    settingsCheckbox,
    settingsGrid,
    optionButton,
    styleToggle,
    styleColorBarControl,
    styleRangeControl,
    glowSizeLabel,
    syntaxThemeSelect,
    makeSettingsStyle,
    sectionPanel,
    helpCard,
    safeSettingsRuntimeNode,
    safeSettingsRuntimeNodes,
    safeSettingsRuntimeCall,
    clampSettingsPosition,
    clampSettingsSize,
    settingsViewportToPortalPosition,
    applySettingsPanelViewportPosition,
    saveSettingsPosition,
    saveSettingsSize,
    saveSettings,
    closeSettings,
    settingsPortalRoot,
    recordRuntimeErrorOnce,
    recordPerformanceEvent = () => {},
    applySettingChangePreservingInteraction,
    preserveSettingsInteractionDuring,
    ensureProviderSettings,
    updateProviderControlCard,
    providerControlsMarkup,
    contextInspectorMarkup,
    contextInspectorPayload,
    suggestionQualityCard,
    suggestionQualityPayload,
    diagnosticsMarkup,
    refreshContextInspectorPanel,
    refreshSuggestionQualityPanel,
    startContextInspectorHeartbeat,
    stopContextInspectorHeartbeat,
    scheduleDiagnosticsRefresh,
    scheduleCodeboxStyleReapply,
    applyCompanionEditorLayer = () => {},
    scheduleSourceClassSyntaxRefresh,
    scheduleSettingsSave,
    scheduleSettingsFeedbackReset,
    cancelStyleRangeCommitReapply,
    scheduleStyleRangeCommitReapply,
    applyStyleRangeMutation,
    scheduleStyleRangeValueLabelUpdate,
    scheduleStyleRangeLivePreview,
    scheduleStyleRangeLiveSave,
    updateStyleRangeValueLabel,
    copyDiagnosticsToClipboard,
    logDebug,
    logInfoOnce,
    health,
    cloneDefaultSettings,
    syntaxThemePalette,
    updateSettingsSaveStatus = () => {},
  } = deps;

  function buildPanelShell() {
    const root = settingsPortalRoot();
    const portalKind = root?.dataset?.nostrodomusPortalRootKind || state.settingsPortalRootKind || "unknown";

    const panel = document.createElement("div");
    panel.id = "nostrodomus-settings-root";
    panel.dataset.nostrodomusPortalKind = portalKind;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Nostrodomus settings");
    panel.setAttribute("aria-modal", "false");
    // Programmatically focusable (not in the tab order): opening moves focus here so keyboard and
    // screen-reader users land in the dialog (and Escape, handled below, then works from anywhere).
    panel.setAttribute("tabindex", "-1");

    const pos = clampSettingsPosition(state.settings.settingsPos);
    const localPos = settingsViewportToPortalPosition(pos);
    const size = clampSettingsSize(state.settings.settingsSize);

    panel.style.cssText = [
      "position:fixed",
      `left:${localPos.x}px`,
      `top:${localPos.y}px`,
      "z-index:2147483647",
      `width:${size.w}px`,
      `height:${size.h}px`,
      // The same rule as clampSettingsSize: the minimum gives way to a window smaller than it.
      "min-width:min(380px, calc(100vw - 16px))",
      "min-height:min(360px, calc(100vh - 16px))",
      "max-width:calc(100vw - 16px)",
      "max-height:calc(100vh - 16px)",
      "overflow:hidden",
      "padding:0",
      "border-radius:18px",
      "background:rgba(10,14,22,.985)",
      "border:1px solid rgba(var(--nostrodomus-brand-rgb, 120, 210, 255),.38)",
      "box-shadow:0 20px 70px rgba(0,0,0,.58), 0 0 28px rgba(var(--nostrodomus-accent-rgb, 80, 180, 255),.12)",
      "color:white",
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "font-size:13px",
      "user-select:text",
      "-webkit-user-select:text",
      "will-change:transform,width,height",
      "transform:translate3d(0,0,0)",
      "backface-visibility:hidden",
      "contain:paint style",
      "pointer-events:auto",
      "touch-action:auto",
    ].join(";");

    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend"]) {
      panel.addEventListener(type, ev => ev.stopPropagation());
    }

    return { root, portalKind, panel, pos };
  }

  function attachKeyboardBehavior(panel) {
    panel.addEventListener("keydown", ev => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        ev.preventDefault();
        closeSettings(false);
      }
    });
  }

  // The truly-focused element, piercing shadow roots (HA nests the editor in ha-code-editor's shadow),
  // so focus can be returned to it after the dialog closes. Fail-dark to null.
  function deepActiveElement() {
    try {
      let el = document.activeElement;
      while (el?.shadowRoot?.activeElement && el.shadowRoot.activeElement !== el) el = el.shadowRoot.activeElement;
      return el && typeof el.focus === "function" ? el : null;
    } catch { return null; }
  }

  function buildTabs(panel) {
    const s = state.settings;
    const langs = Object.keys(s.enabledLangs);
    const tabStorageKey = "nostrodomus.settings.activeCategory";
    const allowedTabs = new Set(["general", "context", "diagnostics", "style", "help"]);
    let activeTab = "general";
    try {
      const storedTab = settingsStorage?.getItem?.(tabStorageKey);
      if (storedTab === "suggestions") activeTab = "general";
      else if (allowedTabs.has(storedTab)) activeTab = storedTab;
    } catch (err) { recordRuntimeErrorOnce("settings:active-tab-storage-read", err, { phase: "openSettings" }); }

    function tabButton(label, value) {
      const active = activeTab === value;
      return createSettingsElement("button", {
        className: `nostrodomus-category-pill ${active ? "active" : ""}`,
        id: `nostrodomus-tab-${value}`,
        text: label,
        dataset: { settingsTab: value },
        attrs: { type: "button", role: "tab", "aria-selected": active ? "true" : "false", "aria-controls": `nostrodomus-tabpanel-${value}` },
      });
    }

    panel.appendChild(makeSettingsStyle());
    panel.appendChild(createSettingsElement("style", { text: CLOSE_BUTTON_FOCUS_CSS }));

    const header = createSettingsElement("div", {
      dataset: { dragHandle: "" },
      style: "display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;cursor:grab;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:18px 18px 0 0;touch-action:none;user-select:none;-webkit-user-select:none;",
    });
    const titleWrap = createSettingsElement("div");
    titleWrap.appendChild(createSettingsElement("b", { text: "Nostrodomus" }));
    // settingsPanelRuntime replaces this line's text while the last settings save has failed.
    const headerLine = `${PRODUCT_NAME} v${PROJECT_VERSION} • settings, suggestions, diagnostics, and help`;
    titleWrap.appendChild(createSettingsElement("div", {
      text: headerLine,
      dataset: { settingsSaveStatus: headerLine },
      attrs: { "aria-live": "polite" },
      style: "opacity:.64;font-size:11px;margin-top:2px",
    }));
    const headerButtons = createSettingsElement("span", { style: "display:flex;gap:8px;align-items:center" }, [
      createSettingsElement("button", {
        text: "Close",
        attrs: { type: "button", title: "Close settings", "aria-label": "Close Nostrodomus settings" },
        dataset: { close: "" },
        style: "all:unset;cursor:pointer;padding:5px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.045);color:rgba(255,255,255,.82);font-size:11px;font-weight:750;line-height:1",
      }),
    ]);
    appendChildren(header, [titleWrap, headerButtons]);
    panel.appendChild(header);

    const body = createSettingsElement("div", {
      className: "nostrodomus-settings-body",
      style: "padding:14px;height:calc(100% - 58px);overflow:auto",
    });
    body.appendChild(createSettingsElement("div", {
      text: "Real editor-style suggestions with focused controls, live context, and local-only diagnostics.",
      style: "opacity:.72;margin-bottom:10px;line-height:1.35",
    }));

    body.appendChild(createSettingsElement("div", {
      className: "nostrodomus-category-row",
      attrs: { role: "tablist", "aria-label": "Nostrodomus settings categories" },
    }, [
      tabButton("General", "general"),
      tabButton("Context", "context"),
      tabButton("Diagnostics", "diagnostics"),
      tabButton("Style", "style"),
      tabButton("Help", "help"),
    ]));

    function attachTabSwitching(panel) {
    // Arrow keys move the focus along the tab row, Home and End go to its ends, as a tablist is
    // expected to. Focus only: Enter or Space (the button's own click) selects the focused tab,
    // so walking past Diagnostics or Context does not build it.
    const tabButtons = Array.from(panel.querySelectorAll("[data-settings-tab]"));
    for (const btn of tabButtons) {
      btn.addEventListener("keydown", ev => {
        const last = tabButtons.length - 1;
        const index = tabButtons.indexOf(btn);
        let next = index;
        if (ev.key === "ArrowRight") next = index === last ? 0 : index + 1;
        else if (ev.key === "ArrowLeft") next = index === 0 ? last : index - 1;
        else if (ev.key === "Home") next = 0;
        else if (ev.key === "End") next = last;
        else return;
        ev.preventDefault();
        ev.stopPropagation();
        tabButtons[next]?.focus?.();
      });
    }
    for (const btn of panel.querySelectorAll("[data-settings-tab]")) {
      btn.addEventListener("click", () => {
        const next = btn.dataset.settingsTab || "general";
        if (!allowedTabs.has(next)) return;
        try { settingsStorage?.setItem?.(tabStorageKey, next); } catch (err) { recordRuntimeErrorOnce("settings:active-tab-storage-write", err, { phase: "settingsTabClick", tab: next }); }
        for (const other of panel.querySelectorAll("[data-settings-tab]")) {
          const selected = other === btn;
          other.classList.toggle("active", selected);
          other.setAttribute("aria-selected", selected ? "true" : "false");
        }
        for (const section of panel.querySelectorAll("[data-section]")) {
          const selected = section.dataset.section === next;
          section.classList.toggle("active", selected);
          section.setAttribute("aria-hidden", selected ? "false" : "true");
        }
        // Telemetry is recorded only while the Diagnostics or Context tab is shown, and its
        // rates are divided by that time. This call lets the recorder see the change now.
        recordPerformanceEvent("settings-tab-switch", 0, next);
        if (next === "context") {
          refreshContextInspectorPanel("tab-switch");
          refreshSuggestionQualityPanel("tab-switch");
          startContextInspectorHeartbeat("tab-switch-context");
        } else {
          stopContextInspectorHeartbeat("tab-switch-hidden");
        }
      });
    }
    }

    return { s, langs, activeTab, body, attachTabSwitching };
  }

  // A tab other than the open one is built when it is first shown. Building Diagnostics
  // searches the page for the active editor, takes two performance snapshots and can create a
  // WebGL context; building Context reads the editor context and the suggestion list; and every
  // open of the panel paid for all of it with another tab in front. `build` returns the
  // complete section. Until the tab is shown an empty section stands in for it, and it takes
  // the built section's content when it becomes the active one, whichever code path activates
  // it (a tab click, or the restore of the open tab after a settings change). Its controls are
  // wired at that moment. Without MutationObserver the section is built with the panel.
  function lazySectionPanel(name, activeTab, build) {
    const Observer = W?.MutationObserver;
    if (activeTab === name || typeof Observer !== "function") return build();
    const section = sectionPanel(name, activeTab, []);
    try {
      const observer = new Observer(() => {
        if (!section.classList?.contains?.("active")) return;
        observer.disconnect();
        section.replaceChildren(...safeSettingsRuntimeNodes(name, () => Array.from(build().childNodes || [])));
        attachSettingControlBehavior(section);
        attachDiagnosticsActions(section, { delegated: false });
      });
      observer.observe(section, { attributes: true, attributeFilter: ["class"] });
    } catch {
      return build();
    }
    return section;
  }

  function buildDiagnosticsSection(activeTab) {
    return lazySectionPanel("diagnostics", activeTab, () => sectionPanel("diagnostics", activeTab, safeSettingsRuntimeNodes("diagnostics", () => diagnosticsMarkup())));
  }

  function buildTabSections({ panel, body, s, langs, activeTab }) {
    const buildGeneralGrid = () => createSettingsElement("div", { className: "nostrodomus-field-grid" }, [
      settingsCheckbox("Keep Nostrodomus armed", "keepOpen", s.keepOpen),
      settingDesc("Opens the suggestion list by itself while you type, wherever suggestions apply. Off by default: the list opens when you press Ctrl+Space."),
      settingsCheckbox("Arm when editor is focused", "autoOpenOnFocus", s.autoOpenOnFocus),
      settingDesc("Opens the suggestion list when you click into the editor, if there are suggestions at the cursor."),
      settingsCheckbox('Show "No suggestions" for explicit Ctrl+Space', "idlePaneText", s.idlePaneText),
      settingDesc("Shows a small no-results state only when you explicitly request completions."),
    ]);
    body.appendChild(lazySectionPanel("general", activeTab, () => sectionPanel("general", activeTab, [
      settingsTitle("General"),
      settingDesc("Core suggestion behavior, popup controls, language packs, and provider controls in one place."),
      buildGeneralGrid(),
      settingsTitle("Trigger behavior"),
      settingDesc("How soon the list opens by itself, when one of the two options above is on. With both off, the list opens only when you press Ctrl+Space, whichever mode is selected."),
      settingsGrid("1fr", [
        optionButton("Smart: after the minimum characters or a trigger character", "smart", s.triggerMode, "triggerMode"),
        optionButton("Manual only: Ctrl+Space", "manual", s.triggerMode, "triggerMode"),
        optionButton("Aggressive: one character sooner", "aggressive", s.triggerMode, "triggerMode"),
      ]),
      settingsTitle("Completion mode"),
      settingDesc("Choose whether completions are conservative keys/properties, larger snippets, or both."),
      settingsGrid("1fr 1fr 1fr", [
        optionButton("Keys", "keys", s.mode, "mode"),
        optionButton("Snippets", "snippets", s.mode, "mode"),
        optionButton("Both", "both", s.mode, "mode"),
      ]),
      settingsCheckbox("Enable suggestions inside comments", "suggestInComments", s.suggestInComments),
      settingDesc("Off by default. Prevents automatic or Ctrl+Space suggestions while the cursor is inside YAML, CSS, JS, HTML, Jinja, or Python comments."),
      settingsCheckbox("Fuzzy / alias matching", "fuzzy", s.fuzzy),
      settingDesc("Matches labels, aliases, and related terms, not just exact prefixes."),
      settingsCheckbox("Replace Home Assistant native autocomplete", "replaceNativeAutocomplete", s.replaceNativeAutocomplete !== false),
      settingDesc("When Nostrodomus has parity for the active value context, disables HA built-in entity/icon popups so Enter/Tab cannot be stolen by a second autocomplete layer."),
      settingsCheckbox("Search all enabled language packs", "globalSearch", s.globalSearch),
      settingDesc("Allows cross-language suggestions. More powerful, but less context-strict."),
      settingsTitle("Smart completion (experimental)"),
      settingDesc("Newer surface-aware completion. Off by default; flip these to try it (no console needed)."),
      settingsCheckbox("Smart completion engine", "completions.engineV2", s.completions?.engineV2 === true, "nostrodomusToggle"),
      settingDesc("Surface awareness across Dev Tools, automations, scripts, and dashboards. Required by the experimental completion options below."),
      settingsCheckbox("Live entities inside templates", "completions.jinjaLane", s.completions?.jinjaLane === true, "nostrodomusToggle"),
      settingDesc("In Dev Tools → Template, typing states('…') / is_state(…) completes your real entity ids. Needs the smart engine on."),
      settingsCheckbox("Pick from a field's allowed values", "completions.schemaValues", s.completions?.schemaValues === true, "nostrodomusToggle"),
      settingDesc("In a service call, typing a field's value (e.g. effect:) completes that field's allowed options from Home Assistant. Needs the smart engine on."),
      settingsCheckbox("Scope suggestions to the editor you're in", "completions.surfaceScope", s.completions?.surfaceScope === true, "nostrodomusToggle"),
      settingDesc("Stops dashboard/card suggestions appearing while editing automations (and vice-versa). Fails open on unknown editors. Needs the smart engine on."),
      settingsCheckbox("Smarter match ranking", "completions.dpRanking", s.completions?.dpRanking === true, "nostrodomusToggle"),
      settingDesc("Ranks the best fuzzy match first — e.g. typing 'lk' puts light.kitchen at the top."),
      settingsCheckbox("Remember your favorites", "completions.frecency", s.completions?.frecency === true, "nostrodomusToggle"),
      settingDesc("Floats the entities, services, and snippets you accept most often toward the top over time, and remembers them across reloads."),
      settingsCheckbox("Detailed docs on the highlighted item", "completions.lazyResolve", s.completions?.lazyResolve === true, "nostrodomusToggle"),
      settingDesc("Shows richer detail for the highlighted suggestion only — a service's fields, an entity's friendly name, or an area/device's real name — computed on demand so big lists stay fast."),
      settingsCheckbox("Service argument hints", "completions.signatureHelp", s.completions?.signatureHelp === true, "nostrodomusToggle"),
      settingDesc("Shows a passive hint at the top of the popup with the arguments the current service call (or template function) takes — the required ones marked, the one you're on highlighted."),
      settingsCheckbox("Complete area, device & floor IDs", "completions.registryLane", s.completions?.registryLane === true, "nostrodomusToggle"),
      settingDesc("Completes your real area, device, floor, and label IDs at keys like area_id:, device_id:, floor_id:, and target:."),
      settingsTitle("Minimum typed characters"),
      settingDesc("How many characters must be typed before automatic suggestions appear."),
      settingsGrid("repeat(5,1fr)", [0,1,2,3,4].map(n => optionButton(String(n), String(n), String(s.minChars), "minChars"))),
      settingsCheckbox("Enter accepts suggestion", "enterCompletes", s.enterCompletes),
      settingDesc("Enter completes the highlighted item while the suggestion popup is open."),
      settingsCheckbox("Tab accepts suggestion", "tabCompletes", s.tabCompletes),
      settingDesc("Tab completes the highlighted item instead of only indenting while the suggestion popup is open."),
      settingsTitle("Maximum suggestions"),
      settingsGrid("repeat(4,1fr)", [6,8,12,16,20,32,40].map(n => optionButton(String(n), String(n), String(s.maxItems), "maxItems"))),
      settingsTitle("Language packs"),
      settingDesc("Enable or disable completion packs used by the context detector."),
      createSettingsElement("div", {
        style: "display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px",
      }, langs.map(lang => settingsCheckbox(languageLabel(lang), lang, s.enabledLangs[lang], "lang"))),
      settingsTitle("Providers"),
      settingDesc("Provider controls affect only real registered providers. Disabled providers are skipped before candidate generation for cleaner results and less work."),
      safeSettingsRuntimeNode("provider-controls", () => providerControlsMarkup()),
      settingDesc("Entity/service sub-toggles are reserved for a future architecture patch that splits Home Assistant runtime values into narrower providers."),
    ])));

    body.appendChild(lazySectionPanel("context", activeTab, () => sectionPanel("context", activeTab, [
      ...safeSettingsRuntimeNodes("context-inspector", () => contextInspectorMarkup()),
      settingsTitle("Suggestion Quality"),
      settingDesc("Plain-language summary of the current suggestion list: what is visible, which providers contributed, and why the popup may be empty."),
      safeSettingsRuntimeNode("suggestion-quality", () => suggestionQualityCard()),
      createSettingsElement("div", { className: "nostrodomus-action-row" }, [
        createSettingsElement("button", { className: "nostrodomus-pill", text: "Copy quality report", dataset: { qualityCopy: "" } }),
      ]),
    ])));

    body.appendChild(buildDiagnosticsSection(activeTab));

    // Style is built with the panel: two end-to-end specs change style.hideEditorWarnings
    // through its checkbox while another tab is the one shown.
    body.appendChild(sectionPanel("style", activeTab, [
      settingsTitle("Style"),
      settingDesc("Local visual controls for the active Home Assistant codebox and Ctrl+Space popup. Color controls are real hue bars with independent enable switches, opacity, and saturation where useful."),
      settingsTitle("Codebox text size"),
      settingsGrid("repeat(4,1fr)", Object.entries(STYLE_TEXT_SIZE_PRESETS).map(([key, preset]) => optionButton(preset.label, key, s.style?.codeTextSize || DEFAULT_SETTINGS.style.codeTextSize, "style.codeTextSize"))),

      settingsTitle("Codebox scrollbar"),
      settingDesc("Controls the actual CodeMirror scroll thumb. The selector intentionally targets the active scroll element and its WebKit scrollbar parts to override the older maroon thumb."),
      styleToggle("Enable custom scrollbar styling", "style.scrollbarStyleEnabled", s.style?.scrollbarStyleEnabled ?? DEFAULT_SETTINGS.style.scrollbarStyleEnabled),
      styleColorBarControl("Scrollbar color", "style.scrollbarHue", s.style?.scrollbarHue ?? DEFAULT_SETTINGS.style.scrollbarHue),
      styleRangeControl("Scrollbar opacity", "style.scrollbarOpacity", s.style?.scrollbarOpacity ?? DEFAULT_SETTINGS.style.scrollbarOpacity, 0, 1, 0.01, percentLabel),
      styleRangeControl("Scrollbar saturation", "style.scrollbarSaturation", s.style?.scrollbarSaturation ?? DEFAULT_SETTINGS.style.scrollbarSaturation, 0, 2.5, 0.01, sliderNumberLabel),

      settingsTitle("Codebox border + glow"),
      settingDesc("One integrated frame model, matched to the Nostrodomus menu style. This does not stack a second independent glow on top of the existing editor frame. Glow size controls direction: -100 is fully inside, 0 is off, and +100 is fully outside."),
      styleToggle("Enable custom border and glow", "style.codeboxFrameEnabled", s.style?.codeboxFrameEnabled ?? DEFAULT_SETTINGS.style.codeboxFrameEnabled),
      styleColorBarControl("Border color", "style.codeboxBorderHue", s.style?.codeboxBorderHue ?? DEFAULT_SETTINGS.style.codeboxBorderHue),
      styleRangeControl("Border opacity", "style.codeboxBorderOpacity", s.style?.codeboxBorderOpacity ?? DEFAULT_SETTINGS.style.codeboxBorderOpacity, 0, 1, 0.01, percentLabel),
      styleRangeControl("Border saturation", "style.codeboxBorderSaturation", s.style?.codeboxBorderSaturation ?? DEFAULT_SETTINGS.style.codeboxBorderSaturation, 0, 2.5, 0.01, sliderNumberLabel),
      styleColorBarControl("Glow color", "style.codeboxGlowHue", s.style?.codeboxGlowHue ?? DEFAULT_SETTINGS.style.codeboxGlowHue),
      styleRangeControl("Glow opacity", "style.codeboxGlowOpacity", s.style?.codeboxGlowOpacity ?? DEFAULT_SETTINGS.style.codeboxGlowOpacity, 0, 0.65, 0.01, percentLabel),
      styleRangeControl("Glow size", "style.codeboxGlowSize", s.style?.codeboxGlowSize ?? DEFAULT_SETTINGS.style.codeboxGlowSize, -100, 100, 1, glowSizeLabel, "glow-size"),
      styleRangeControl("Glow saturation", "style.codeboxGlowSaturation", s.style?.codeboxGlowSaturation ?? DEFAULT_SETTINGS.style.codeboxGlowSaturation, 0, 2.5, 0.01, sliderNumberLabel),

      settingsTitle("Codebox surface"),
      settingDesc("Controls the editor scrollbox surface without touching Home Assistant theme files."),
      styleToggle("Enable custom surface styling", "style.codeboxSurfaceEnabled", s.style?.codeboxSurfaceEnabled ?? DEFAULT_SETTINGS.style.codeboxSurfaceEnabled),
      styleColorBarControl("Surface color", "style.codeboxSurfaceHue", s.style?.codeboxSurfaceHue ?? DEFAULT_SETTINGS.style.codeboxSurfaceHue),
      styleRangeControl("Surface opacity", "style.codeboxSurfaceOpacity", s.style?.codeboxSurfaceOpacity ?? DEFAULT_SETTINGS.style.codeboxSurfaceOpacity, 0, 0.85, 0.01, percentLabel),
      styleRangeControl("Surface saturation", "style.codeboxSurfaceSaturation", s.style?.codeboxSurfaceSaturation ?? DEFAULT_SETTINGS.style.codeboxSurfaceSaturation, 0, 2.5, 0.01, sliderNumberLabel),

      settingsTitle("Card editor dialog"),
      settingDesc("Makes the card editor dialog translucent and blurs the dashboard behind it, so the dashboard shows through the dialog and around the card preview. On by default; turning it off saves graphics work on slow computers."),
      styleToggle("Glass editor dialog", "style.glassDialog", s.style?.glassDialog ?? DEFAULT_SETTINGS.style.glassDialog),

      settingsTitle("Syntax theme"),
      settingDesc("Choose a full syntax color theme for YAML/Lovelace, CSS/card_mod, Jinja, providers, values, and punctuation. Each syntax role uses a distinct color inside every theme."),
      styleToggle("Enable syntax theme coloring", "style.syntaxTintEnabled", s.style?.syntaxTintEnabled ?? DEFAULT_SETTINGS.style.syntaxTintEnabled),
      syntaxThemeSelect(s.style?.syntaxTintPreset || DEFAULT_SETTINGS.style.syntaxTintPreset),
      styleRangeControl("Syntax theme opacity", "style.syntaxThemeOpacity", s.style?.syntaxThemeOpacity ?? DEFAULT_SETTINGS.style.syntaxThemeOpacity, 0.35, 1, 0.01, percentLabel),
      styleRangeControl("Syntax theme saturation", "style.syntaxThemeSaturation", s.style?.syntaxThemeSaturation ?? DEFAULT_SETTINGS.style.syntaxThemeSaturation, 0.35, 1.85, 0.01, sliderNumberLabel),

      settingsTitle("Editor warnings"),
      settingDesc("Off by default — Home Assistant's in-editor warnings and validation errors stay visible. Turn on to hide the editor warning banners (e.g. \"Visual editor is not supported\") when they overlap the bottom-left Show visual/code editor buttons. Editor-scoped; does not affect anything outside the card editor."),
      styleToggle("Hide editor warnings", "style.hideEditorWarnings", s.style?.hideEditorWarnings === true),

      settingsTitle("Active line highlight"),
      settingDesc("On by default — the highlight on the row your cursor is in (the faint wash that reads blue over the frosted surface) is hidden in every styled codebox. Turn this off to bring the current-line highlight back. Editor-scoped; the cursor and text selection are unaffected."),
      styleToggle("Hide active line highlight", "style.hideActiveLineHighlight", s.style?.hideActiveLineHighlight !== false),
      settingDesc("Includes Classic (the default) plus a full spectrum of color-named palettes hue-sorted from red through magenta — Crimson, Amber, Green, Teal, Azure, Indigo, Violet, and Rose among them — and the light Parchment and Mist. Opacity and saturation apply to every palette without changing the selected theme."),

      settingsTitle("Ctrl+Space popup"),
      settingDesc("Popup sizing and visual density live here because they affect how the completion menu looks, not which suggestions are generated."),
      settingsGrid("1fr 1fr 1fr", [
        optionButton("Compact", "compact", s.popupSize, "popupSize"),
        optionButton("Comfort", "comfortable", s.popupSize, "popupSize"),
        optionButton("Large", "large", s.popupSize, "popupSize"),
      ]),
      settingsCheckbox("Show details pane in suggestion popup", "showDetailsPane", s.showDetailsPane),
      settingsCheckbox("Commit prefix-matched YAML keys when typing :", "commitCharacters", s.commitCharacters),
      settingsCheckbox("Offer buffer words when real providers have few matches", "wordFallback", s.wordFallback),
      settingsTitle("Completion accept mode"),
      settingsGrid("1fr 1fr", [
        optionButton("Replace word tail", "replace", s.acceptMode || "replace", "acceptMode"),
        optionButton("Insert at cursor", "insert", s.acceptMode || "replace", "acceptMode"),
      ]),
      settingDesc("Off by default so Ctrl+Space stays compact. Details are still available in diagnostics."),
    ]));

    body.appendChild(lazySectionPanel("help", activeTab, () => sectionPanel("help", activeTab, [
      settingsTitle("Help + Console API"),
      settingDesc("The UI covers common diagnostics, but the same tools stay available in the browser console for deeper troubleshooting."),
      helpCard("Open settings", [{ code: "window.__nostrodomus.settings()" }]),
      helpCard("Health check", [{ code: "window.__nostrodomus.health()" }]),
      helpCard("Full redacted diagnostic export", [{ code: "window.__nostrodomus.exportDiagnostics({ redact: true })" }]),
      helpCard("Active editor snapshot readout", [{ code: "window.__nostrodomus?.contextDiagnostics.readActiveEditor()" }]),
      settingsCard([
        createSettingsElement("b", { text: "Reset to default" }),
        createSettingsElement("div", {
          text: "Use this only when you want to restore Nostrodomus settings, providers, size, and position back to their defaults.",
          style: "opacity:.72;line-height:1.36;margin-top:4px",
        }),
        createSettingsElement("button", {
          className: "nostrodomus-pill",
          text: "Reset to default",
          dataset: { resetDefaults: "" },
          attrs: { type: "button", "aria-label": "Reset Nostrodomus settings to default values" },
          style: "margin-top:8px;width:100%",
        }),
      ], "nostrodomus-reset-defaults-card"),
      settingsCard([
        createSettingsElement("b", { text: "Style controls" }),
        createSettingsElement("div", {
          text: "Use the Style category for codebox text size, scrollbar, border, glow, surface, syntax theme, and Ctrl+Space menu sizing. Color bars are bounded local controls, not arbitrary CSS.",
          style: "opacity:.72;line-height:1.36;margin-top:4px",
        }),
      ], "nostrodomus-style-roadmap-card"),
      createSettingsElement("div", { className: "nostrodomus-help-card" }, [
        createSettingsElement("b", { text: "Safety model" }),
        createSettingsElement("div", {
          text: "Diagnostics are local-only and redacted; nothing is sent anywhere.",
          style: "opacity:.7;line-height:1.36;margin-top:4px",
        }),
      ]),
    ])));

    panel.appendChild(body);
    const resizeHandle = createSettingsElement("div", {
      className: "nostrodomus-settings-resize-handle",
      dataset: { resizeHandle: "" },
      attrs: { title: "Resize settings", role: "separator", "aria-label": "Resize settings panel" },
    });
    panel.appendChild(resizeHandle);
    return resizeHandle;
  }

  function attachResizeBehavior(panel, resizeHandle) {
    let resizing = false;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartW = 0;
    let resizeStartH = 0;
    let resizeW = 0;
    let resizeH = 0;
    let resizeRaf = 0;

    function applyResizeFrame() {
      resizeRaf = 0;
      const next = clampSettingsSize({ w: resizeW, h: resizeH });
      panel.style.width = `${next.w}px`;
      panel.style.height = `${next.h}px`;
    }

    function onResizeMove(ev) {
      if (!resizing) return;

      const sample = ev.getCoalescedEvents?.().at?.(-1) || ev;
      resizeW = resizeStartW + (sample.clientX - resizeStartX);
      resizeH = resizeStartH + (sample.clientY - resizeStartY);

      if (!resizeRaf) resizeRaf = requestAnimationFrame(applyResizeFrame);

      ev.preventDefault();
      ev.stopPropagation();
    }

    function onResizeEnd(ev) {
      if (!resizing) return;

      resizing = false;

      document.removeEventListener("pointermove", onResizeMove, true);
      document.removeEventListener("pointerup", onResizeEnd, true);
      document.removeEventListener("pointercancel", onResizeEnd, true);

      if (resizeRaf) {
        cancelAnimationFrame(resizeRaf);
        applyResizeFrame();
      }

      const finalSize = clampSettingsSize({ w: resizeW, h: resizeH });
      panel.classList.remove("nostrodomus-resizing");
      saveSettingsSize(finalSize.w, finalSize.h);

      ev?.preventDefault?.();
      ev?.stopPropagation?.();
    }

    resizeHandle?.addEventListener("pointerdown", ev => {
      resizing = true;
      resizeStartX = ev.clientX;
      resizeStartY = ev.clientY;
      const r = panel.getBoundingClientRect();
      resizeStartW = r.width;
      resizeStartH = r.height;
      resizeW = r.width;
      resizeH = r.height;

      panel.classList.add("nostrodomus-resizing");

      try { resizeHandle.setPointerCapture?.(ev.pointerId); } catch (err) { recordRuntimeErrorOnce("settings:resize-pointer-capture", err, { phase: "settingsResizeStart" }); }

      document.addEventListener("pointermove", onResizeMove, true);
      document.addEventListener("pointerup", onResizeEnd, true);
      document.addEventListener("pointercancel", onResizeEnd, true);

      ev.preventDefault();
      ev.stopPropagation();
    });

    // Keyboard resize. The separator is focusable; arrow keys grow/shrink the panel (Shift for a
    // larger step). Mirrors the pointer resize's clamp + save so keyboard and mouse stay consistent.
    resizeHandle?.setAttribute?.("tabindex", "0");
    resizeHandle?.setAttribute?.("aria-label", "Resize settings panel with arrow keys");
    resizeHandle?.addEventListener?.("keydown", ev => {
      const step = ev.shiftKey ? 32 : 10;
      let dw = 0;
      let dh = 0;
      if (ev.key === "ArrowLeft") dw = -step;
      else if (ev.key === "ArrowRight") dw = step;
      else if (ev.key === "ArrowUp") dh = -step;
      else if (ev.key === "ArrowDown") dh = step;
      else return;
      ev.preventDefault();
      ev.stopPropagation();
      const r = panel.getBoundingClientRect();
      const next = clampSettingsSize({ w: r.width + dw, h: r.height + dh });
      panel.style.width = `${next.w}px`;
      panel.style.height = `${next.h}px`;
      saveSettingsSize(next.w, next.h);
    });
  }

  function attachDragBehavior(panel) {
    const handle = panel.querySelector("[data-drag-handle]");
    let dragging = false;
    let dragMoved = false;
    let startX = 0;
    let startY = 0;
    let dragStartViewportX = 0;
    let dragStartViewportY = 0;
    let dragX = 0;
    let dragY = 0;
    let raf = 0;

    function applyDragFrame() {
      raf = 0;
      if (!dragMoved) return;
      const livePos = clampSettingsPosition({
        x: dragStartViewportX + dragX,
        y: dragStartViewportY + dragY,
      });
      const dx = livePos.x - dragStartViewportX;
      const dy = livePos.y - dragStartViewportY;
      panel.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }

    function onDragMove(ev) {
      if (!dragging) return;

      const sample = ev.getCoalescedEvents?.().at?.(-1) || ev;
      const nextX = sample.clientX - startX;
      const nextY = sample.clientY - startY;

      if (!dragMoved && Math.hypot(nextX, nextY) < 4) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      dragMoved = true;
      dragX = nextX;
      dragY = nextY;
      panel.classList.add("nostrodomus-dragging");

      if (!raf) raf = requestAnimationFrame(applyDragFrame);

      ev.preventDefault();
      ev.stopPropagation();
    }

    function onDragEnd(ev) {
      if (!dragging) return;

      dragging = false;

      document.removeEventListener("pointermove", onDragMove, true);
      document.removeEventListener("pointerup", onDragEnd, true);
      document.removeEventListener("pointercancel", onDragEnd, true);

      if (raf) {
        cancelAnimationFrame(raf);
        applyDragFrame();
      }

      panel.classList.remove("nostrodomus-dragging");

      if (!dragMoved) {
        panel.style.transform = "translate3d(0,0,0)";
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        return;
      }

      const finalPos = clampSettingsPosition({
        x: dragStartViewportX + dragX,
        y: dragStartViewportY + dragY,
      });

      panel.style.transform = "translate3d(0,0,0)";
      applySettingsPanelViewportPosition(panel, finalPos);
      saveSettingsPosition(finalPos.x, finalPos.y);

      ev?.preventDefault?.();
      ev?.stopPropagation?.();
    }

    handle?.addEventListener("pointerdown", ev => {
      if (ev.target?.closest?.("button") || ev.target?.closest?.("[data-resize-handle]")) return;

      dragging = true;
      dragMoved = false;
      startX = ev.clientX;
      startY = ev.clientY;

      const r = panel.getBoundingClientRect();
      dragStartViewportX = r.left;
      dragStartViewportY = r.top;
      dragX = 0;
      dragY = 0;
      panel.style.transform = "translate3d(0,0,0)";

      try { handle.setPointerCapture?.(ev.pointerId); } catch (err) { recordRuntimeErrorOnce("settings:drag-pointer-capture", err, { phase: "settingsDragStart" }); }

      document.addEventListener("pointermove", onDragMove, true);
      document.addEventListener("pointerup", onDragEnd, true);
      document.addEventListener("pointercancel", onDragEnd, true);

      ev.preventDefault();
      ev.stopPropagation();
    });

    // Keyboard move. The header is focusable; arrow keys reposition the panel (Shift for a
    // larger step). Mirrors the pointer drag-end's clamp + apply + save (viewport coords), so the
    // stored position stays in the same space the pointer path writes.
    if (handle) {
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-label", "Move settings panel with arrow keys");
      handle.addEventListener("keydown", ev => {
        if (ev.target?.closest?.("button")) return;
        const step = ev.shiftKey ? 32 : 10;
        let dx = 0;
        let dy = 0;
        if (ev.key === "ArrowLeft") dx = -step;
        else if (ev.key === "ArrowRight") dx = step;
        else if (ev.key === "ArrowUp") dy = -step;
        else if (ev.key === "ArrowDown") dy = step;
        else return;
        ev.preventDefault();
        ev.stopPropagation();
        const r = panel.getBoundingClientRect();
        const next = clampSettingsPosition({ x: r.left + dx, y: r.top + dy });
        panel.style.transform = "translate3d(0,0,0)";
        applySettingsPanelViewportPosition(panel, next);
        saveSettingsPosition(next.x, next.y);
      });
    }
  }

  // Choosing a syntax theme also sets style.syntaxTintEnabled. The checkbox for that setting is
  // brought in line here; setting `checked` from code fires no change event, so nothing is
  // saved twice.
  function syncSyntaxTintToggle(panel) {
    const toggle = panel.querySelector?.('input[data-style-toggle="style.syntaxTintEnabled"]');
    if (toggle) toggle.checked = state.settings?.style?.syntaxTintEnabled !== false;
  }

  function attachSettingControlBehavior(panel) {
    for (const input of panel.querySelectorAll("input[data-k]")) {
      input.addEventListener("change", () => {
        applySettingChangePreservingInteraction("settings", () => {
          state.settings[input.dataset.k] = input.checked;
        });
      });
    }

    for (const input of panel.querySelectorAll("input[data-lang]")) {
      input.addEventListener("change", () => {
        applySettingChangePreservingInteraction("settings", () => {
          state.settings.enabledLangs[input.dataset.lang] = input.checked;
        });
      });
    }

    for (const input of panel.querySelectorAll("input[data-provider]")) {
      input.addEventListener("change", () => {
        const providerId = input.dataset.provider;
        ensureProviderSettings();
        if (!providerId || !state.settings.providers[providerId]) return;

        applySettingChangePreservingInteraction("settings", () => {
          state.settings.providers[providerId].enabled = input.checked;
        }, () => {
          updateProviderControlCard(panel, providerId);
          refreshSuggestionQualityPanel("provider-toggle");
        });
      });
    }

    for (const btn of panel.querySelectorAll("button[data-option-group]")) {
      btn.addEventListener("click", () => {
        const group = btn.dataset.optionGroup;
        let value = btn.dataset.optionValue;

        if (group === "minChars" || group === "maxItems") value = Number(value);

        applySettingChangePreservingInteraction("settings", () => {
          if (group.includes(".")) {
            const parts = group.split(".");
            let target = state.settings;
            for (const part of parts.slice(0, -1)) {
              target[part] = target[part] && typeof target[part] === "object" ? target[part] : {};
              target = target[part];
            }
            target[parts.at(-1)] = value;
          } else {
            state.settings[group] = value;
          }
          if (group === "style.syntaxTintPreset") {
            state.settings.style = state.settings.style && typeof state.settings.style === "object" ? state.settings.style : {};
            state.settings.style.syntaxTintEnabled = value !== "default";
          }
        }, () => {
          for (const other of panel.querySelectorAll(`button[data-option-group="${group}"]`)) {
            const selected = String(other.dataset.optionValue) === String(value);
            other.classList.toggle("active", selected);
            other.setAttribute("aria-pressed", selected ? "true" : "false");
            if (other.hasAttribute("aria-selected")) other.setAttribute("aria-selected", selected ? "true" : "false");
            if (other.hasAttribute("aria-current")) other.setAttribute("aria-current", selected ? "true" : "false");
            const badge = other.querySelector?.(".nostrodomus-syntax-theme-badge");
            if (badge) badge.textContent = selected ? "Current" : "";
          }
          const syntaxDetails = btn.closest("details.nostrodomus-syntax-theme-dropdown");
          if (group === "style.syntaxTintPreset" && syntaxDetails) {
            syntaxDetails.dataset.currentTheme = String(value);
            const label = syntaxDetails.querySelector?.('[data-syntax-theme-current="label"]');
            if (label) label.textContent = btn.dataset.syntaxThemeLabel || STYLE_SYNTAX_PRESETS[value]?.label || String(value);
            const swatches = syntaxDetails.querySelector?.('[data-syntax-theme-current="swatches"]');
            const palette = syntaxThemePalette(STYLE_SYNTAX_PRESETS[value] || STYLE_SYNTAX_PRESETS.vscodeDarkPlus, state.settings?.style?.syntaxThemeSaturation ?? DEFAULT_SETTINGS.style.syntaxThemeSaturation);
            if (swatches) {
              const colors = [palette.key, palette.jinja, palette.cssSelector, palette.string, palette.number];
              Array.from(swatches.querySelectorAll("span")).forEach((node, index) => { node.style.background = colors[index] || palette.fg; });
            }
          }
          syntaxDetails?.removeAttribute("open");
          if (group === "style.syntaxTintPreset") syncSyntaxTintToggle(panel);
          if (group.startsWith("style.")) {
            scheduleCodeboxStyleReapply("style-option-change");
            if (group.includes("syntax")) scheduleSourceClassSyntaxRefresh("settings-syntax-option-change");
          }
          refreshSuggestionQualityPanel("settings-option-change");
        });
      });
    }

    for (const select of panel.querySelectorAll("select[data-option-group]")) {
      select.addEventListener("change", () => {
        const group = select.dataset.optionGroup;
        const value = select.value;
        if (!group) return;

        applySettingChangePreservingInteraction("settings-select", () => {
          if (group.includes(".")) {
            const parts = group.split(".");
            let target = state.settings;
            for (const part of parts.slice(0, -1)) {
              target[part] = target[part] && typeof target[part] === "object" ? target[part] : {};
              target = target[part];
            }
            target[parts.at(-1)] = value;
          } else {
            state.settings[group] = value;
          }
          if (group === "style.syntaxTintPreset") {
            state.settings.style = state.settings.style && typeof state.settings.style === "object" ? state.settings.style : {};
            state.settings.style.syntaxTintEnabled = true;
          }
        }, () => {
          if (group === "style.syntaxTintPreset") syncSyntaxTintToggle(panel);
          scheduleCodeboxStyleReapply("style-option-change");
          refreshSuggestionQualityPanel("settings-select-change");
        });
      });
    }

    for (const input of panel.querySelectorAll("input[data-style-toggle]")) {
      input.addEventListener("change", () => {
        const group = input.dataset.styleToggle;
        if (!group) return;
        applySettingChangePreservingInteraction("style-toggle", () => {
          const parts = group.split(".");
          let target = state.settings;
          for (const part of parts.slice(0, -1)) {
            target[part] = target[part] && typeof target[part] === "object" ? target[part] : {};
            target = target[part];
          }
          target[parts.at(-1)] = input.checked;
        }, () => {
          scheduleCodeboxStyleReapply("style-toggle-change");
          if (String(input.dataset.styleToggle || "").includes("syntax")) scheduleSourceClassSyntaxRefresh("settings-syntax-toggle-change");
          // The companion's warning-hide reconcile rides applyForEditor, which scheduleCodeboxStyle
          // Reapply does not call (that path re-applies main's tokens to the cached editor only). So
          // for style.hideEditorWarnings, re-run the companion layer on the active editor directly,
          // otherwise the toggle persists but the nested warning sheet is never injected/removed.
          // The glass sheet of the card editor dialog (style.glassDialog) is added and removed
          // by the same layer.
          if (input.dataset.styleToggle === "style.hideEditorWarnings" || input.dataset.styleToggle === "style.glassDialog") {
            try { applyCompanionEditorLayer(state.activeEditorCache?.editor); } catch { /* fail-dark */ }
          }
        });
      });
    }

    // Completions feature flags (settings.completions.*): a dotted-path toggle like the style
    // toggles above, but for completion behavior (no style reapply needed; the completion engine
    // re-reads settings on the next keystroke). Flips engineV2/jinjaLane/dpRanking from the panel
    // instead of a console localStorage edit. Mirrors the nested-set; preserves interaction.
    for (const input of panel.querySelectorAll("input[data-nostrodomus-toggle]")) {
      input.addEventListener("change", () => {
        const path = input.dataset.nostrodomusToggle;
        if (!path) return;
        applySettingChangePreservingInteraction("completions-toggle", () => {
          const parts = path.split(".");
          let target = state.settings;
          for (const part of parts.slice(0, -1)) {
            target[part] = target[part] && typeof target[part] === "object" ? target[part] : {};
            target = target[part];
          }
          target[parts.at(-1)] = input.checked;
        });
      });
    }

    for (const input of panel.querySelectorAll("input[data-style-range]")) {
      // Color (hue) bars: tint the thumb's outer ring with the hue under it so the
      // currently-selected color is obvious. Hue bars carry rangeFormat "hue"; other
      // ranges (saturation/opacity) keep their default thumb. Purely visual, fail-dark.
      const paintColorBarThumb = () => {
        if (input.dataset.rangeFormat !== "hue") return;
        const hue = Number(input.value);
        if (!Number.isFinite(hue)) return;
        try { input.style.setProperty("--nostrodomus-color-bar-thumb", `hsl(${Math.round(hue)} 95% 62%)`); } catch { /* detached node */ }
      };
      paintColorBarThumb();

      input.addEventListener("input", () => {
        const group = input.dataset.styleRange;
        const value = Number(input.value);
        if (!group || !Number.isFinite(value)) return;

        paintColorBarThumb();
        cancelStyleRangeCommitReapply("style-range-live");
        applyStyleRangeMutation(group, value);
        scheduleStyleRangeValueLabelUpdate(panel, input, group, value);
        scheduleStyleRangeLivePreview(group);
        scheduleStyleRangeLiveSave("style-range-live");
      });

      input.addEventListener("change", () => {
        const group = input.dataset.styleRange;
        const value = Number(input.value);
        if (!group || !Number.isFinite(value)) return;

        paintColorBarThumb();
        applyStyleRangeMutation(group, value);
        updateStyleRangeValueLabel(panel, input, group, value);
        scheduleSettingsSave("style-range-commit", 260);
        scheduleStyleRangeCommitReapply(group);
      });
    }
  }

  // `delegated: false` is for a part of the panel that is wired after the panel itself (the
  // Diagnostics section): its buttons are bound, and the panel-wide click handler is not added a
  // second time.
  function attachDiagnosticsActions(panel, { delegated = true } = {}) {
    panel.querySelector("[data-diag-refresh]")?.addEventListener("click", () => {
      const btn = panel.querySelector("[data-diag-refresh]");
      preserveSettingsInteractionDuring(() => {
        refreshContextInspectorPanel("diagnostics-refresh");
        refreshSuggestionQualityPanel("diagnostics-refresh");
        // The two calls above are for the Context tab, which is hidden while this button is on
        // screen. The cards of this tab are built again and take the place of the ones shown.
        // The buttons and the checkbox under them stay as they are, wired and focused.
        const grid = panel.querySelector(".nostrodomus-diagnostics-grid");
        const fresh = grid
          ? safeSettingsRuntimeNodes("diagnostics", () => diagnosticsMarkup()).find(node => node?.classList?.contains?.("nostrodomus-diagnostics-grid"))
          : null;
        if (fresh) grid.replaceChildren(...Array.from(fresh.childNodes || []));
        logDebug("diagnostics refresh", health());
        if (btn) btn.textContent = "Refreshed";
      });
      scheduleSettingsFeedbackReset(() => { if (btn?.isConnected) btn.textContent = "Refresh"; }, 900, "diagnostics-refresh");
    });

    panel.querySelector("[data-diag-copy]")?.addEventListener("click", async () => {
      const btn = panel.querySelector("[data-diag-copy]");
      const ok = await copyDiagnosticsToClipboard();
      if (btn) btn.textContent = ok ? "Copied" : "Logged";
      scheduleSettingsFeedbackReset(() => { if (btn?.isConnected) btn.textContent = "Copy full report"; }, 1200, "copy-full-report");
    });

    panel.querySelector("[data-diag-copy-context]")?.addEventListener("click", async () => {
      const btn = panel.querySelector("[data-diag-copy-context]");
      // The readout is the summary the ContextSnapshot card of this tab shows. The API has no
      // read() of its own (asking for one always gave null). The editor is read once and the
      // summary is made from that same result.
      const contextApi = W.__nostrodomus?.contextDiagnostics || null;
      const activeEditor = contextApi?.readActiveEditor?.() || null;
      const payload = JSON.stringify({
        exportedAt: new Date().toISOString(),
        redacted: true,
        readout: contextApi ? diagnosticsReadoutSummary({ ...contextApi, readActiveEditor: () => activeEditor }) : null,
        activeEditor: redactDiagnosticsUserText(activeEditor),
      }, null, 2);
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(payload);
          copied = true;
        }
      } catch (err) { recordRuntimeErrorOnce("diagnostics:context-clipboard-write", err, { phase: "copyContextDiagnostics" }); }
      if (!copied) copied = copyTextWithoutClipboardApi(payload);
      if (!copied) logInfoOnce("user:context-diagnostics-fallback", "context diagnostics", payload);
      if (btn) btn.textContent = copied ? "Copied" : "Logged";
      scheduleSettingsFeedbackReset(() => { if (btn?.isConnected) btn.textContent = "Copy context"; }, 1200, "copy-context");
    });

    panel.querySelector("[data-context-copy-inspector]")?.addEventListener("click", async () => {
      const btn = panel.querySelector("[data-context-copy-inspector]");
      const payload = JSON.stringify(redactDiagnosticsUserText(contextInspectorPayload(state.context)), null, 2);
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(payload);
          copied = true;
        }
      } catch (err) { recordRuntimeErrorOnce("diagnostics:context-inspector-clipboard-write", err, { phase: "copyContextInspector" }); }
      if (!copied) copied = copyTextWithoutClipboardApi(payload);
      if (!copied) logInfoOnce("user:context-inspector-fallback", "context inspector", payload);
      if (btn) btn.textContent = copied ? "Copied" : "Logged";
      scheduleSettingsFeedbackReset(() => { if (btn?.isConnected) btn.textContent = "Copy inspector"; }, 1200, "copy-inspector");
    });

    panel.querySelector("[data-reset-defaults]")?.addEventListener("click", () => {
      const ok = W.confirm?.("Reset Nostrodomus settings to defaults? This will restore suggestion behavior, providers, panel size, and panel position.") ?? true;
      if (!ok) return;
      state.settings = cloneDefaultSettings();
      saveSettings("reset-defaults");
      scheduleCodeboxStyleReapply("reset-defaults");
      closeSettings(false);
      openSettings();
    });

    if (delegated) panel.addEventListener("click", async ev => {
      const commandButton = ev.target?.closest?.("[data-copy-command]");
      if (!commandButton || !panel.contains(commandButton)) return;

      const command = commandButton.dataset.copyCommand || "";
      if (!command) return;

      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(command);
          copied = true;
        }
      } catch (err) { recordRuntimeErrorOnce("diagnostics:console-command-clipboard-write", err, { phase: "copyConsoleCommand" }); }

      if (!copied) copied = copyTextWithoutClipboardApi(command);
      if (!copied) logInfoOnce("user:console-command-fallback", "console command", command);

      const hint = commandButton.querySelector(".nostrodomus-help-copy-hint");
      const prior = hint?.textContent || "Click this whole command card to copy";
      if (hint) hint.textContent = copied ? "Copied to clipboard" : "Logged to console";
      scheduleSettingsFeedbackReset(() => {
        if (hint?.isConnected) hint.textContent = prior;
      }, 1200, "copy-console-command");

      ev.preventDefault();
      ev.stopPropagation();
    });

    panel.querySelector("[data-diag-health]")?.addEventListener("click", () => {
      const btn = panel.querySelector("[data-diag-health]");
      preserveSettingsInteractionDuring(() => {
        const result = health();
        logInfoOnce("user:health", "health", result);
        if (btn) btn.textContent = result.ok ? "Health OK" : "Logged health";
      });
      scheduleSettingsFeedbackReset(() => { if (btn?.isConnected) btn.textContent = "Log health"; }, 1200, "log-health");
    });

    panel.querySelector("[data-quality-copy]")?.addEventListener("click", async () => {
      const btn = panel.querySelector("[data-quality-copy]");
      const payload = JSON.stringify(redactDiagnosticsUserText(state.suggestionQuality || suggestionQualityPayload(state.context, state.items)), null, 2);
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(payload);
          copied = true;
        }
      } catch (err) {
        recordRuntimeErrorOnce("diagnostics:suggestion-quality-clipboard-write", err, { phase: "copySuggestionQuality" });
      }
      if (!copied) copied = copyTextWithoutClipboardApi(payload);
      if (!copied) logInfoOnce("user:suggestion-quality-fallback", "suggestion quality", payload);
      if (btn) btn.textContent = copied ? "Copied" : "Logged";
      scheduleSettingsFeedbackReset(() => { if (btn?.isConnected) btn.textContent = "Copy quality report"; }, 1200, "copy-quality-report");
    });
  }

  function openSettings() {
    // Remember where focus was so it can be returned on close. Captured before closeSettings, but
    // stored after it (closeSettings clears settingsReturnFocus), and only when it is outside any
    // settings panel so a reopen doesn't try to return focus into the torn-down dialog.
    const priorFocus = deepActiveElement();
    closeSettings(false);
    if (priorFocus && !priorFocus.closest?.("#nostrodomus-settings-root")) state.settingsReturnFocus = priorFocus;

    const { root, portalKind, panel, pos } = buildPanelShell();
    attachKeyboardBehavior(panel);
    const { s, langs, activeTab, body, attachTabSwitching } = buildTabs(panel);
    const resizeHandle = buildTabSections({ panel, body, s, langs, activeTab });
    panel.querySelector("[data-close]")?.addEventListener("click", () => closeSettings(false));
    attachTabSwitching(panel);
    attachResizeBehavior(panel, resizeHandle);
    attachDragBehavior(panel);
    attachSettingControlBehavior(panel);
    attachDiagnosticsActions(panel);

    root.appendChild(panel);
    applySettingsPanelViewportPosition(panel, pos);
    try {
      panel.style.setProperty("position", "fixed", "important");
      panel.style.setProperty("margin", "0", "important");
      if (portalKind !== "top-layer-dialog") {
        panel.setAttribute("popover", "manual");
        if (typeof panel.showPopover === "function" && !panel.matches?.(":popover-open")) panel.showPopover();
      } else {
        panel.removeAttribute("popover");
      }
    } catch (err) { recordRuntimeErrorOnce("settings:panel-popover-setup", err, { phase: "openSettings", portalKind }); }
    state.settingsPanel = panel;
    updateSettingsSaveStatus();
    // Match the settings panel's scrollbar + borders to the user's codebox accent (border
    // color). Inline override of the brand/accent tokens on the panel root only — the
    // byte-frozen settings stylesheet is untouched; descendants inherit. Fail-dark.
    try {
      const accent = uiAccentVarsFromSettings(state?.settings?.style);
      panel.style.setProperty("--nostrodomus-brand-rgb", accent.brand);
      panel.style.setProperty("--nostrodomus-accent-rgb", accent.accent);
      panel.style.setProperty("--nostrodomus-scrollbar-rgb", accent.scrollbar);
    } catch { /* accent is decorative; never break settings */ }
    safeSettingsRuntimeCall("codebox-style-reapply", () => scheduleCodeboxStyleReapply("settings-open"));

    safeSettingsRuntimeCall("context-refresh", () => refreshContextInspectorPanel("settings-open"));
    safeSettingsRuntimeCall("suggestion-quality-refresh", () => refreshSuggestionQualityPanel("settings-open"));
    safeSettingsRuntimeCall("diagnostics-refresh", () => scheduleDiagnosticsRefresh("settings-open"));
    safeSettingsRuntimeCall("context-heartbeat", () => startContextInspectorHeartbeat("settings-open"));

    // Move focus into the dialog (manual popovers don't auto-focus) so keyboard/AT users land in it
    // and Escape closes from anywhere inside. preventScroll keeps the editor from jumping.
    try { panel.focus?.({ preventScroll: true }); } catch { try { panel.focus?.(); } catch { /* detached */ } }
  }

  return { openSettings };
}
