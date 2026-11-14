// The CSS string is under byte-identity guard
// (tests/ui/settings_stylesheet_snapshot.test.mjs) and must not change by a
// single character.

export function createSettingsStylesheet(deps = {}) {
  const { createSettingsElement } = deps;

  // important-override registry — settings panel interaction css.

  // external rules overridden: HA modal dialog / backdrop pointer-events management

  //   (the panel portals into the active HA dialog top-layer), HA theme universal

  //   transition rules (drag stability), and HA generic input styling (hue sliders).

  // owner: settings panel style block (#nostrodomus-settings-root).

  // reason: the panel must stay interactive inside HA's modal focus/pointer trap, and

  //   dragging must not animate (drag-frame stability history).

  // removal condition: portal-scoped pointer ownership negotiated with HA dialogs.

  // verification: settings modal pointer portal + drag stability static tests; browser

  //   smoke item 7.

  function makeSettingsStyle() {
    const style = createSettingsElement("style");
    style.textContent = `
        #nostrodomus-settings-root,
        #nostrodomus-completions-root {
          --nostrodomus-brand-rgb: 120, 210, 255;
          --nostrodomus-white-rgb: 255, 255, 255;
          --nostrodomus-black-rgb: 0, 0, 0;
          --nostrodomus-accent-rgb: 80, 180, 255;
          --nostrodomus-dark-rgb: 10, 14, 22;
          --nostrodomus-radius-pill: 999px;
          --nostrodomus-font-mono: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
        }

        #nostrodomus-settings-root {
          scrollbar-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255), 0.68) rgba(var(--nostrodomus-white-rgb), 0.045);
          scrollbar-width: thin;
          pointer-events: auto !important;
          touch-action: auto !important;
          user-select: text;
          -webkit-user-select: text;
        }

        #nostrodomus-settings-root * {
          box-sizing: border-box;
          pointer-events: auto;
        }

        #nostrodomus-settings-root button,
        #nostrodomus-settings-root input,
        #nostrodomus-settings-root select,
        #nostrodomus-settings-root label {
          font: inherit;
        }

        #nostrodomus-settings-root button:focus-visible,
        #nostrodomus-settings-root input:focus-visible,
        #nostrodomus-settings-root select:focus-visible,
        #nostrodomus-settings-root .nostrodomus-syntax-theme-summary:focus-visible,
        #nostrodomus-settings-root [tabindex]:focus-visible {
          outline: 2px solid rgba(var(--nostrodomus-brand-rgb),.92);
          outline-offset: 2px;
          box-shadow: 0 0 0 5px rgba(var(--nostrodomus-accent-rgb),.16);
        }

        #nostrodomus-settings-root .nostrodomus-settings-card {
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.10);
          border-radius: 14px;
          padding: 10px;
          background: rgba(var(--nostrodomus-white-rgb),.035);
          margin: 8px 0 12px;
        }

        #nostrodomus-settings-root .nostrodomus-checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 32px;
          padding: 6px 8px;
          border-radius: 12px;
          background: rgba(var(--nostrodomus-white-rgb),.025);
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.07);
          cursor: pointer;
          user-select: text;
          -webkit-user-select: text;
        }

        #nostrodomus-settings-root .nostrodomus-checkbox-row:hover {
          background: rgba(var(--nostrodomus-white-rgb),.045);
          border-color: rgba(var(--nostrodomus-brand-rgb),.16);
        }

        #nostrodomus-settings-root .nostrodomus-checkbox-row input {
          accent-color: rgb(var(--nostrodomus-brand-rgb));
          flex: 0 0 auto;
        }

        #nostrodomus-settings-root .nostrodomus-settings-body {
          pointer-events: auto !important;
          touch-action: pan-y !important;
          scrollbar-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255), 0.68) rgba(var(--nostrodomus-white-rgb), 0.045);
          scrollbar-width: thin;
          user-select: text;
          -webkit-user-select: text;
        }

        #nostrodomus-settings-root .nostrodomus-settings-body::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        #nostrodomus-settings-root .nostrodomus-settings-body::-webkit-scrollbar-track {
          background: rgba(var(--nostrodomus-white-rgb), 0.045);
          border-radius: var(--nostrodomus-radius-pill);
        }

        #nostrodomus-settings-root .nostrodomus-settings-body::-webkit-scrollbar-thumb {
          background-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255), 0.68);
          border-radius: var(--nostrodomus-radius-pill);
          border: 2px solid rgba(var(--nostrodomus-dark-rgb), 0.92);
          background-clip: padding-box;
        }

        #nostrodomus-settings-root .nostrodomus-settings-body::-webkit-scrollbar-thumb:hover {
          background-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255), 0.86);
        }

        #nostrodomus-settings-root .nostrodomus-settings-body::-webkit-scrollbar-button {
          display: none;
          width: 0;
          height: 0;
        }

        #nostrodomus-completions-root {
          scrollbar-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255), 0.68) rgba(var(--nostrodomus-white-rgb), 0.045);
          scrollbar-width: thin;
        }

        #nostrodomus-completions-root::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        #nostrodomus-completions-root::-webkit-scrollbar-track {
          background: rgba(var(--nostrodomus-white-rgb), 0.045);
          border-radius: var(--nostrodomus-radius-pill);
        }

        #nostrodomus-completions-root::-webkit-scrollbar-thumb {
          background-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255), 0.68);
          border-radius: var(--nostrodomus-radius-pill);
          border: 2px solid rgba(var(--nostrodomus-dark-rgb), 0.92);
          background-clip: padding-box;
        }

        #nostrodomus-settings-root .nostrodomus-pill,
        #nostrodomus-settings-root .nostrodomus-category-pill {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.16);
          background: rgba(var(--nostrodomus-white-rgb),.045);
          color: rgba(var(--nostrodomus-white-rgb),.82);
          font-weight: 650;
          text-align: center;
          white-space: nowrap;
          line-height: 1.2;
        }

        #nostrodomus-settings-root .nostrodomus-pill.active,
        #nostrodomus-settings-root .nostrodomus-category-pill.active {
          border-color: rgba(var(--nostrodomus-brand-rgb),.68);
          background: rgba(var(--nostrodomus-accent-rgb),.24);
          color: #fff;
          font-weight: 780;
        }

        #nostrodomus-settings-root .nostrodomus-color-choice {
          display: grid;
          grid-template-columns: 1fr;
          gap: 5px;
          align-items: center;
          min-height: 46px;
        }

        #nostrodomus-settings-root .nostrodomus-color-choice.active {
          border-color: var(--nostrodomus-choice-color);
          box-shadow: 0 0 18px var(--nostrodomus-choice-glow);
        }

        #nostrodomus-settings-root .nostrodomus-color-strip {
          display: block;
          height: 7px;
          border-radius: var(--nostrodomus-radius-pill);
          background: linear-gradient(90deg, rgba(var(--nostrodomus-white-rgb),.16), var(--nostrodomus-choice-color), rgba(var(--nostrodomus-white-rgb),.12));
          box-shadow: 0 0 14px var(--nostrodomus-choice-glow);
        }

        #nostrodomus-settings-root .nostrodomus-style-range-card {
          margin: 6px 0 10px;
        }

        #nostrodomus-settings-root .nostrodomus-style-range-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }

        #nostrodomus-settings-root .nostrodomus-style-range-value {
          font-family: var(--nostrodomus-font-mono);
          opacity: .74;
          font-size: 11px;
        }

        #nostrodomus-settings-root .nostrodomus-style-range {
          width: 100%;
          accent-color: rgb(var(--nostrodomus-brand-rgb));
        }

        #nostrodomus-settings-root .nostrodomus-style-select-card {
          margin: 6px 0 12px;
        }

        #nostrodomus-settings-root .nostrodomus-style-select {
          width: 100%;
          min-height: 42px;
          padding: 9px 38px 9px 12px;
          border-radius: 13px;
          border: 1px solid rgba(var(--nostrodomus-brand-rgb),.26);
          color: rgba(240,248,255,.94);
          background:
            linear-gradient(135deg, rgba(var(--nostrodomus-brand-rgb),.11), rgba(var(--nostrodomus-white-rgb),.035)),
            rgba(var(--nostrodomus-dark-rgb),.92);
          box-shadow: inset 0 0 0 1px rgba(var(--nostrodomus-white-rgb),.045), 0 10px 26px rgba(var(--nostrodomus-black-rgb),.18);
          cursor: pointer;
          appearance: auto;
          -webkit-appearance: menulist;
        }

        #nostrodomus-settings-root .nostrodomus-style-select:hover {
          border-color: rgba(var(--nostrodomus-brand-rgb),.46);
          background:
            linear-gradient(135deg, rgba(var(--nostrodomus-brand-rgb),.16), rgba(var(--nostrodomus-white-rgb),.045)),
            rgba(var(--nostrodomus-dark-rgb),.94);
        }

        #nostrodomus-settings-root .nostrodomus-style-select option {
          background: rgb(14, 19, 29);
          color: rgba(245,250,255,.95);
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-dropdown {
          position: relative;
          width: 100%;
          border-radius: 15px;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-summary {
          list-style: none;
          min-height: 44px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(var(--nostrodomus-brand-rgb),.30);
          color: rgba(240,248,255,.94);
          background:
            linear-gradient(135deg, rgba(var(--nostrodomus-brand-rgb),.13), rgba(var(--nostrodomus-white-rgb),.04)),
            rgba(var(--nostrodomus-dark-rgb),.92);
          box-shadow: inset 0 0 0 1px rgba(var(--nostrodomus-white-rgb),.045), 0 10px 26px rgba(var(--nostrodomus-black-rgb),.18);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          user-select: none;
          -webkit-user-select: none;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-summary::-webkit-details-marker {
          display: none;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-dropdown[open] .nostrodomus-syntax-theme-summary,
        #nostrodomus-settings-root .nostrodomus-syntax-theme-summary:hover {
          border-color: rgba(var(--nostrodomus-brand-rgb),.62);
          background:
            linear-gradient(135deg, rgba(var(--nostrodomus-brand-rgb),.20), rgba(var(--nostrodomus-white-rgb),.055)),
            rgba(var(--nostrodomus-dark-rgb),.96);
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-current {
          font-weight: 780;
          letter-spacing: .01em;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-current-swatches {
          margin-left: auto;
          display: flex;
          gap: 3px;
          align-items: center;
          justify-content: flex-end;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-current-swatches span {
          width: 8px;
          height: 18px;
          border-radius: var(--nostrodomus-radius-pill);
          box-shadow: inset 0 0 0 1px rgba(var(--nostrodomus-black-rgb),.28);
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-chevron {
          color: rgba(170,225,255,.88);
          font-size: 15px;
          transition: transform .15s ease;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-dropdown[open] .nostrodomus-syntax-theme-chevron {
          transform: rotate(180deg);
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-options {
          margin-top: 8px;
          max-height: 320px;
          overflow-y: auto;
          padding: 8px;
          border-radius: 16px;
          border: 1px solid rgba(var(--nostrodomus-brand-rgb),.20);
          background:
            linear-gradient(180deg, rgba(20,28,40,.98), rgba(9,13,20,.98));
          box-shadow: 0 18px 52px rgba(var(--nostrodomus-black-rgb),.42), inset 0 0 0 1px rgba(var(--nostrodomus-white-rgb),.035);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
          scrollbar-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255),.72) rgba(var(--nostrodomus-white-rgb),.05);
          scrollbar-width: thin;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-option {
          all: unset;
          box-sizing: border-box;
          min-height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.09);
          background: rgba(var(--nostrodomus-white-rgb),.035);
          color: rgba(244,250,255,.90);
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 6px;
          align-items: center;
          padding: 9px 10px;
          cursor: pointer;
          font-weight: 720;
          overflow: hidden;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-option:hover {
          border-color: rgba(var(--nostrodomus-brand-rgb),.38);
          background: rgba(var(--nostrodomus-brand-rgb),.10);
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-option.active {
          border-color: rgba(var(--nostrodomus-brand-rgb),.74);
          background: rgba(var(--nostrodomus-accent-rgb),.18);
          box-shadow: 0 0 18px rgba(var(--nostrodomus-brand-rgb),.12);
          color: #fff;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-badge {
          min-width: 0;
          color: rgba(175,235,255,.92);
          font-size: 10px;
          font-weight: 820;
          text-transform: uppercase;
          letter-spacing: .06em;
          text-align: right;
          opacity: .82;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-option:not(.active) .nostrodomus-syntax-theme-badge {
          opacity: 0;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-swatches {
          display: flex;
          gap: 2px;
          align-items: center;
          justify-content: flex-end;
        }

        #nostrodomus-settings-root .nostrodomus-syntax-theme-swatches span {
          width: 8px;
          height: 18px;
          border-radius: var(--nostrodomus-radius-pill);
          box-shadow: inset 0 0 0 1px rgba(var(--nostrodomus-black-rgb),.28);
        }

        #nostrodomus-settings-root .nostrodomus-color-bar {
          appearance: none;
          -webkit-appearance: none;
          height: 16px;
          border-radius: var(--nostrodomus-radius-pill);
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.16);
          background:
            linear-gradient(90deg,
              hsl(0 95% 62%),
              hsl(45 95% 62%),
              hsl(90 95% 62%),
              hsl(135 95% 62%),
              hsl(180 95% 62%),
              hsl(225 95% 62%),
              hsl(270 95% 62%),
              hsl(315 95% 62%),
              hsl(360 95% 62%)) !important;
          box-shadow: inset 0 0 0 1px rgba(var(--nostrodomus-black-rgb),.22), 0 0 18px rgba(var(--nostrodomus-brand-rgb),.10);
        }

        #nostrodomus-settings-root .nostrodomus-color-bar::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: var(--nostrodomus-radius-pill);
          border: 2px solid var(--nostrodomus-color-bar-thumb, rgba(var(--nostrodomus-white-rgb),.92));
          background: rgba(15,20,30,.96);
          box-shadow: 0 0 0 2px rgba(var(--nostrodomus-black-rgb),.38), 0 0 16px rgba(var(--nostrodomus-brand-rgb),.32);
          cursor: pointer;
        }

        #nostrodomus-settings-root .nostrodomus-color-bar::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: var(--nostrodomus-radius-pill);
          border: 2px solid var(--nostrodomus-color-bar-thumb, rgba(var(--nostrodomus-white-rgb),.92));
          background: rgba(15,20,30,.96);
          box-shadow: 0 0 0 2px rgba(var(--nostrodomus-black-rgb),.38), 0 0 16px rgba(var(--nostrodomus-brand-rgb),.32);
          cursor: pointer;
        }

        #nostrodomus-settings-root .nostrodomus-category-row {
          display: flex;
          gap: 7px;
          overflow-x: auto;
          padding: 2px 0 10px;
          margin-bottom: 8px;
          scrollbar-width: thin;
        }

        #nostrodomus-settings-root .nostrodomus-category-row::-webkit-scrollbar {
          height: 6px;
        }

        #nostrodomus-settings-root .nostrodomus-section {
          display: none;
          animation: nostrodomusSectionIn 120ms ease-out;
        }

        #nostrodomus-settings-root .nostrodomus-section.active {
          display: block;
        }

        @keyframes nostrodomusSectionIn {
          from { opacity: .74; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }

        #nostrodomus-settings-root .nostrodomus-setting-desc {
          opacity: .58;
          font-size: 11.5px;
          line-height: 1.32;
          margin: 2px 0 8px;
        }

        #nostrodomus-settings-root .nostrodomus-section-title {
          font-size: 13px;
          line-height: 1.2;
          font-weight: 850;
          margin: 14px 0 5px;
          letter-spacing: .01em;
        }

        #nostrodomus-settings-root .nostrodomus-section-title:first-child {
          margin-top: 0;
        }

        #nostrodomus-settings-root .nostrodomus-field-grid {
          display: grid;
          gap: 7px;
          margin-bottom: 12px;
        }

        #nostrodomus-settings-root .nostrodomus-action-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin: 10px 0 12px;
        }

        #nostrodomus-settings-root .nostrodomus-diagnostics-grid {
          display: grid;
          gap: 8px;
          margin: 8px 0 10px;
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-card {
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.10);
          border-radius: 14px;
          padding: 9px 10px;
          background: rgba(var(--nostrodomus-white-rgb),.035);
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-card-title {
          font-weight: 820;
          margin-bottom: 4px;
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-row {
          display:grid;
          grid-template-columns:145px 1fr;
          gap:8px;
          align-items:start;
          padding:3px 0;
          border-bottom:1px solid rgba(var(--nostrodomus-white-rgb),.055);
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-row:last-child {
          border-bottom:0;
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-row span:first-child {
          opacity:.58;
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-row span:last-child {
          font-family:var(--nostrodomus-font-mono);
          min-width:0;
          overflow:visible;
          text-overflow:clip;
          white-space:normal;
          overflow-wrap:anywhere;
          word-break:break-word;
          line-height:1.25;
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-card[data-context-inspector="true"] {
          border-color: rgba(var(--nostrodomus-brand-rgb),.18);
          background: linear-gradient(180deg, rgba(var(--nostrodomus-brand-rgb),.055), rgba(var(--nostrodomus-white-rgb),.025));
        }

        #nostrodomus-settings-root .nostrodomus-diagnostic-card[data-context-inspector="true"] .nostrodomus-diagnostic-row span:last-child {
          white-space: normal;
          overflow-wrap: anywhere;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-card {
          border: 1px solid rgba(var(--nostrodomus-brand-rgb),.18);
          border-radius: 16px;
          padding: 10px;
          background: linear-gradient(180deg, rgba(var(--nostrodomus-accent-rgb),.08), rgba(var(--nostrodomus-white-rgb),.025));
          margin: 8px 0 10px;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 7px;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-title {
          font-weight: 850;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-subtitle {
          opacity: .62;
          font-size: 11px;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-scroll {
          max-height: 220px;
          overflow: auto;
          padding-right: 6px;
          scrollbar-color: rgba(var(--nostrodomus-scrollbar-rgb, 120, 210, 255),.68) rgba(var(--nostrodomus-white-rgb),.045);
          scrollbar-width: thin;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-release {
          border-top: 1px solid rgba(var(--nostrodomus-white-rgb),.08);
          padding: 8px 0;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-release:first-child {
          border-top: 0;
          padding-top: 0;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-release-title {
          font-weight: 820;
          margin-bottom: 2px;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-release-status {
          opacity: .62;
          font-size: 11px;
          margin-bottom: 5px;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-list {
          margin: 0;
          padding-left: 18px;
          line-height: 1.36;
          opacity: .84;
        }

        #nostrodomus-settings-root .nostrodomus-changelog-list li {
          margin: 3px 0;
        }

        #nostrodomus-settings-root .nostrodomus-provider-control-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin: 8px 0 12px;
        }

        #nostrodomus-settings-root .nostrodomus-provider-control-card {
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.10);
          border-radius: 14px;
          padding: 10px;
          background: rgba(var(--nostrodomus-white-rgb),.035);
        }

        #nostrodomus-settings-root .nostrodomus-provider-health-row {
          margin-top: 8px;
          padding: 6px 8px;
          border-radius: 10px;
          border: 1px solid rgba(var(--nostrodomus-brand-rgb),.12);
          background: rgba(var(--nostrodomus-accent-rgb),.055);
          color: rgba(215,245,255,.86);
          font-size: 11px;
          font-family: var(--nostrodomus-font-mono);
        }

        #nostrodomus-settings-root .nostrodomus-quality-card {
          border: 1px solid rgba(var(--nostrodomus-brand-rgb),.14);
          border-radius: 14px;
          padding: 10px;
          margin: 8px 0 12px;
          background: linear-gradient(180deg, rgba(var(--nostrodomus-accent-rgb),.075), rgba(var(--nostrodomus-white-rgb),.032));
        }

        #nostrodomus-settings-root .nostrodomus-quality-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
          margin-top: 8px;
        }

        #nostrodomus-settings-root .nostrodomus-quality-metric {
          border: 1px solid rgba(var(--nostrodomus-white-rgb),.09);
          border-radius: 11px;
          padding: 7px 8px;
          background: rgba(var(--nostrodomus-white-rgb),.035);
          min-width: 0;
        }

        #nostrodomus-settings-root .nostrodomus-quality-label {
          opacity: .58;
          font-size: 10.5px;
          margin-bottom: 2px;
        }

        #nostrodomus-settings-root .nostrodomus-quality-value {
          font-weight: 780;
          font-size: 11.5px;
          word-break: break-word;
        }

        #nostrodomus-settings-root .nostrodomus-help-card {
          border:1px solid rgba(var(--nostrodomus-white-rgb),.10);
          border-radius:14px;
          padding:10px;
          background:rgba(var(--nostrodomus-white-rgb),.035);
          margin-bottom:8px;
          user-select: text;
          -webkit-user-select: text;
        }

        #nostrodomus-settings-root .nostrodomus-help-copy-card {
          all: unset;
          display: block;
          width: 100%;
          box-sizing: border-box;
          cursor: pointer;
          margin-top: 7px;
          padding: 9px 10px;
          border-radius: 12px;
          border: 1px solid rgba(var(--nostrodomus-brand-rgb),.18);
          background: rgba(var(--nostrodomus-accent-rgb),.075);
          color: rgba(var(--nostrodomus-white-rgb),.92);
          user-select: text;
          -webkit-user-select: text;
        }

        #nostrodomus-settings-root .nostrodomus-help-copy-card:hover {
          border-color: rgba(var(--nostrodomus-brand-rgb),.44);
          background: rgba(var(--nostrodomus-accent-rgb),.12);
        }

        #nostrodomus-settings-root .nostrodomus-help-copy-title {
          display: block;
          font-weight: 800;
          margin-bottom: 4px;
        }

        #nostrodomus-settings-root .nostrodomus-help-copy-hint {
          display: block;
          opacity: .58;
          font-size: 10.5px;
          margin-top: 5px;
        }

        @media (max-width: 560px) {
          #nostrodomus-settings-root .nostrodomus-action-row,
          #nostrodomus-settings-root .nostrodomus-quality-grid {
            grid-template-columns: 1fr;
          }

          #nostrodomus-settings-root .nostrodomus-diagnostic-row {
            grid-template-columns: 1fr;
            gap: 2px;
          }
        }

        #nostrodomus-settings-root .nostrodomus-settings-resize-handle {
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 18px;
          height: 18px;
          border-radius: 8px 0 12px 0;
          cursor: nwse-resize;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          background: linear-gradient(135deg, transparent 0 45%, rgba(var(--nostrodomus-brand-rgb),.42) 46% 55%, transparent 56% 100%);
          opacity: .72;
        }

        #nostrodomus-settings-root.nostrodomus-resizing {
          cursor: nwse-resize;
        }

        #nostrodomus-settings-root.nostrodomus-resizing .nostrodomus-settings-body {
          pointer-events: none;
        }

        #nostrodomus-settings-root code {
          font-family:var(--nostrodomus-font-mono);
          font-size:11.5px;
          color:rgba(180,235,255,.96);
          word-break:break-word;
        }

        #nostrodomus-settings-root.nostrodomus-dragging {
          transition: none !important;
          box-shadow: 0 10px 32px rgba(var(--nostrodomus-black-rgb),.42), 0 0 16px rgba(var(--nostrodomus-accent-rgb),.10) !important;
          opacity: .94;
          cursor: grabbing;
        }

        #nostrodomus-settings-root.nostrodomus-dragging .nostrodomus-settings-body {
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          #nostrodomus-settings-root .nostrodomus-section {
            animation: none;
          }
          #nostrodomus-settings-root .nostrodomus-syntax-theme-chevron {
            transition: none;
          }
        }
      `;
    return style;
  }

  return { makeSettingsStyle };
}
