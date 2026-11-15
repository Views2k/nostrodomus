// The codebox colors and root stylesheet, computed from the style settings, and the rules that
// decide from a reason string how much of a style pass runs. Pure functions: no DOM, storage,
// events, timers, observers, runtime state or Home Assistant reads.

import { hslaFromHue, hslToRgb } from '../core/format.js';
import { clampNumber } from '../core/string.js';

export function codeboxStyleTokensFromSettings(settings = {}, options = {}) {
  const source = settings || {};
  const defaultStyle = options?.defaultStyle || {};
  const scrollbarEnabled = source.scrollbarStyleEnabled !== false;
  const frameEnabled = source.codeboxFrameEnabled !== false;
  const surfaceEnabled = source.codeboxSurfaceEnabled !== false;

  const scrollbarThumb = scrollbarEnabled
    ? hslaFromHue(source.scrollbarHue, source.scrollbarSaturation, 62, source.scrollbarOpacity)
    : "auto";
  const scrollbarTrack = surfaceEnabled
    ? hslaFromHue(source.codeboxSurfaceHue, source.codeboxSurfaceSaturation * 0.42, 10, Math.min(0.32, Math.max(0.055, source.codeboxSurfaceOpacity * 0.42)))
    : "rgba(255,255,255,.045)";
  const frameBorder = frameEnabled
    ? hslaFromHue(source.codeboxBorderHue, source.codeboxBorderSaturation, 65, source.codeboxBorderOpacity)
    : "rgba(255,255,255,.10)";
  const glowSize = clampNumber(source.codeboxGlowSize, -100, 100, defaultStyle.codeboxGlowSize ?? -100);
  const innerGlowStrength = frameEnabled ? Math.max(0, -glowSize) / 100 : 0;
  const outerGlowStrength = frameEnabled ? Math.max(0, glowSize) / 100 : 0;
  const frameGlow = frameEnabled
    ? hslaFromHue(source.codeboxGlowHue, source.codeboxGlowSaturation, 64, source.codeboxGlowOpacity)
    : "rgba(0,0,0,0)";
  const frameGlowSoft = frameEnabled
    ? hslaFromHue(source.codeboxGlowHue, source.codeboxGlowSaturation * 0.78, 64, source.codeboxGlowOpacity * 0.58)
    : "rgba(0,0,0,0)";
  const frameGlowInner = frameEnabled
    ? hslaFromHue(source.codeboxGlowHue, source.codeboxGlowSaturation, 64, source.codeboxGlowOpacity * innerGlowStrength)
    : "rgba(0,0,0,0)";
  const frameGlowInnerSoft = frameEnabled
    ? hslaFromHue(source.codeboxGlowHue, source.codeboxGlowSaturation * 0.78, 64, source.codeboxGlowOpacity * 0.58 * innerGlowStrength)
    : "rgba(0,0,0,0)";
  const frameGlowOuter = frameEnabled
    ? hslaFromHue(source.codeboxGlowHue, source.codeboxGlowSaturation, 64, source.codeboxGlowOpacity * outerGlowStrength)
    : "rgba(0,0,0,0)";
  const frameGlowOuterSoft = frameEnabled
    ? hslaFromHue(source.codeboxGlowHue, source.codeboxGlowSaturation * 0.78, 64, source.codeboxGlowOpacity * 0.58 * outerGlowStrength)
    : "rgba(0,0,0,0)";
  const editorSurface = surfaceEnabled
    ? hslaFromHue(source.codeboxSurfaceHue, source.codeboxSurfaceSaturation * 0.50, 8, source.codeboxSurfaceOpacity)
    : "transparent";
  const thumbBorder = surfaceEnabled
    ? hslaFromHue(source.codeboxSurfaceHue, source.codeboxSurfaceSaturation * 0.35, 8, Math.min(0.92, Math.max(0.36, source.codeboxSurfaceOpacity + 0.30)))
    : "rgba(10,14,22,.86)";

  return { scrollbarThumb, scrollbarTrack, frameBorder, frameGlow, frameGlowSoft, frameGlowInner, frameGlowInnerSoft, frameGlowOuter, frameGlowOuterSoft, editorSurface, thumbBorder };
}

const CODEBOX_DEFAULT_TEXT_COLOR = "#d4d4d4";
const CODEBOX_DEFAULT_GUTTER_COLOR = "rgba(201, 209, 217, 0.52)";
const CODEBOX_DEFAULT_ACTIVE_LINE_WASH = "rgba(255, 255, 255, 0.045)";
// A surface drawn over a page of the opposite brightness is drawn at least this opaque. A more
// transparent one takes the brightness of the page behind it, and the text is lost again.
const CODEBOX_OPPOSITE_SURFACE_MIN_OPACITY = 0.92;

// True for a CSS color whose perceived brightness is in the lower half. Accepts #rgb, #rrggbb and
// rgb()/rgba() with comma or space separators; anything else returns null.
export function cssColorIsDark(color) {
  const text = String(color || "").trim().toLowerCase();
  let rgb = null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    rgb = [0, 2, 4].map(at => parseInt(digits.slice(at, at + 2), 16));
  } else {
    const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
    if (fn) rgb = [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  }
  if (!rgb || rgb.some(value => !Number.isFinite(value))) return null;
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 128;
}

// Colors that keep the code readable when the Home Assistant theme is light or the syntax preset
// paints dark text (Parchment, Mist). `tokens` is the result of codeboxStyleTokensFromSettings.
//   - text, line numbers and caret follow the preset's own text color when that color is dark;
//   - the surface takes the brightness the text needs: light under dark text, dark under light text;
//   - over a page of the opposite brightness the surface is drawn nearly opaque.
// With a dark theme and a light-text preset every value is the default one. A surface the user
// switched off stays off where the text can be read without it (dark text on a light theme);
// where it cannot (light text on a light theme, dark text on a dark theme) the surface is drawn
// anyway, because nothing else can make the code readable. The Result pane of the template tool
// keeps the plain surface (resultPaneSurface), because its text is the theme's own.
/**
 * @param {Record<string, any>} [settings]
 * @param {Record<string, any>} [tokens]
 * @param {{ themeIsLight?: boolean, textIsDark?: boolean, textColor?: string }} [options]
 * @returns {Record<string, any>}
 */
export function codeboxReadableStyleTokens(settings = {}, tokens = {}, options = {}) {
  const source = settings || {};
  const themeIsLight = options?.themeIsLight === true;
  const textIsDark = options?.textIsDark === true;
  /** @type {Record<string, any>} */
  const out = {
    ...tokens,
    syntaxFg: CODEBOX_DEFAULT_TEXT_COLOR,
    gutterColor: CODEBOX_DEFAULT_GUTTER_COLOR,
    caretColor: "",
    activeLineWash: CODEBOX_DEFAULT_ACTIVE_LINE_WASH,
    resultPaneSurface: tokens.editorSurface,
  };
  if (!themeIsLight && !textIsDark) return out;
  if (textIsDark) {
    out.syntaxFg = options?.textColor || "#24292f";
    out.gutterColor = "rgba(36, 41, 47, 0.58)";
    out.activeLineWash = "rgba(0, 0, 0, 0.055)";
  }
  out.caretColor = out.syntaxFg;
  // The text has the brightness of the page behind it: unreadable unless the surface is drawn.
  const needsSurface = textIsDark !== themeIsLight;
  if (source.codeboxSurfaceEnabled === false && !needsSurface) return out;
  const opacity = source.codeboxSurfaceEnabled === false ? 0 : clampNumber(source.codeboxSurfaceOpacity, 0, 1, 0.35);
  const surfaceOpacity = needsSurface ? Math.max(CODEBOX_OPPOSITE_SURFACE_MIN_OPACITY, opacity) : opacity;
  const lightness = textIsDark ? 94 : 8;
  out.editorSurface = hslaFromHue(source.codeboxSurfaceHue, source.codeboxSurfaceSaturation * 0.50, lightness, surfaceOpacity);
  out.thumbBorder = hslaFromHue(source.codeboxSurfaceHue, source.codeboxSurfaceSaturation * 0.35, lightness, Math.min(0.92, Math.max(0.36, surfaceOpacity + 0.30)));
  return out;
}

// The accent of the settings panel and the suggestion popup, from the hue and saturation of the
// codebox frame, so both match the codebox. Returns `r, g, b` strings for
// `--nostrodomus-brand-rgb` (lighter), `--nostrodomus-accent-rgb` (deeper) and
// `--nostrodomus-scrollbar-rgb`, which those surfaces use as `rgba(var(--token), alpha)`. The
// runtime sets them inline on the panel and popup roots; the frozen settings stylesheet only
// reads them. The defaults are those of the codebox border (hue 198, saturation 0.92).
export function uiAccentVarsFromSettings(settings = {}) {
  const source = settings || {};
  const hue = clampNumber(source.codeboxBorderHue, 0, 360, 198);
  const saturation = Math.min(1, clampNumber(source.codeboxBorderSaturation, 0, 2.5, 0.92));
  const brand = hslToRgb(hue, saturation, 0.72);
  const accent = hslToRgb(hue, saturation, 0.65);
  // The scrollbar color follows the codebox scrollbar (its own hue), not the border. Lightness
  // 0.62 is that of the codebox scrollbar thumb.
  const scrollbarHue = clampNumber(source.scrollbarHue, 0, 360, 195);
  const scrollbarSat = Math.min(1, clampNumber(source.scrollbarSaturation, 0, 2.5, 1.05));
  const scrollbar = hslToRgb(scrollbarHue, scrollbarSat, 0.62);
  return {
    brand: `${brand[0]}, ${brand[1]}, ${brand[2]}`,
    accent: `${accent[0]}, ${accent[1]}, ${accent[2]}`,
    scrollbar: `${scrollbar[0]}, ${scrollbar[1]}, ${scrollbar[2]}`,
  };
}

export function codeboxStyleTokenMap(tokens) {
  return {
    "--nostrodomus-codebox-scrollbar-thumb": tokens.scrollbarThumb,
    "--nostrodomus-codebox-scrollbar-track": tokens.scrollbarTrack,
    "--nostrodomus-codebox-frame-border": tokens.frameBorder,
    "--nostrodomus-codebox-frame-glow": tokens.frameGlow,
    "--nostrodomus-codebox-frame-glow-soft": tokens.frameGlowSoft,
    "--nostrodomus-codebox-frame-glow-inner": tokens.frameGlowInner,
    "--nostrodomus-codebox-frame-glow-inner-soft": tokens.frameGlowInnerSoft,
    "--nostrodomus-codebox-frame-glow-outer": tokens.frameGlowOuter,
    "--nostrodomus-codebox-frame-glow-outer-soft": tokens.frameGlowOuterSoft,
    "--nostrodomus-codebox-surface": tokens.editorSurface,
    "--nostrodomus-codebox-scrollbar-thumb-border": tokens.thumbBorder,
    "--nostrodomus-codebox-syntax-filter": tokens.syntaxFilter || "none",
  };
}

// The codebox root stylesheet: the frame and glow on the ha-code-editor host's ::before, the
// frosted surface on its ::after, the release of clipping ancestors, and the text, gutter and
// scrollbar colors (docs/contracts/STYLE_OWNERSHIP_CONTRACT.md). The rules use `!important`:
// they have to win over Home Assistant's component styles, which clip the editor surface, over
// theme and card-mod rules that reach into the editor, and over CodeMirror's own theme sheet,
// or the styling flickers each time one of them is applied again.
export function codeboxStyleBuildRootCss({ scrollbarThumb, scrollbarTrack, frameBorder, frameGlow, frameGlowSoft, frameGlowInner, frameGlowInnerSoft, frameGlowOuter, frameGlowOuterSoft, editorSurface, size, syntaxFilter, thumbBorder, syntaxFg = CODEBOX_DEFAULT_TEXT_COLOR, activeLineBackground = CODEBOX_DEFAULT_ACTIVE_LINE_WASH, gutterColor = CODEBOX_DEFAULT_GUTTER_COLOR, caretColor = "", resultPaneSurface = editorSurface }) {
  return `
      ha-code-editor[data-nostrodomus-codebox-frame-host="1"],
      :host([data-nostrodomus-codebox-frame-host="1"]),
      [data-nostrodomus-codebox-style="1"] {
        --nostrodomus-codebox-scrollbar-thumb: ${scrollbarThumb};
        --nostrodomus-codebox-scrollbar-track: ${scrollbarTrack};
        --nostrodomus-codebox-frame-border: ${frameBorder};
        --nostrodomus-codebox-frame-glow: ${frameGlow};
        --nostrodomus-codebox-frame-glow-soft: ${frameGlowSoft};
        --nostrodomus-codebox-frame-glow-inner: ${frameGlowInner};
        --nostrodomus-codebox-frame-glow-inner-soft: ${frameGlowInnerSoft};
        --nostrodomus-codebox-frame-glow-outer: ${frameGlowOuter};
        --nostrodomus-codebox-frame-glow-outer-soft: ${frameGlowOuterSoft};
        --nostrodomus-codebox-surface: ${editorSurface};
        --nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);
        --nostrodomus-codebox-syntax-fg: ${syntaxFg};
      }
      [data-nostrodomus-codebox-unclip],
      :host([data-nostrodomus-codebox-unclip]) {
        overflow: visible !important;
        overflow-x: visible !important;
        overflow-y: visible !important;
        contain: none !important;
        clip-path: none !important;
        mask-image: none !important;
        -webkit-mask-image: none !important;
      }
      ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::before,
      :host([data-nostrodomus-codebox-frame-host="1"])::before {
        content: "";
        position: absolute !important;
        inset: 0 !important;
        box-sizing: border-box !important;
        border-radius: 22px !important;
        pointer-events: none !important;
        z-index: 2147483001 !important;
        border: 1px solid var(--nostrodomus-codebox-frame-border) !important;
        box-shadow:
          inset 0 0 0 1px var(--nostrodomus-codebox-frame-border),
          inset 0 0 18px var(--nostrodomus-codebox-frame-glow-inner),
          inset 0 0 34px var(--nostrodomus-codebox-frame-glow-inner-soft),
          0 0 0 1px var(--nostrodomus-codebox-frame-border),
          0 0 24px var(--nostrodomus-codebox-frame-glow-outer),
          0 0 52px var(--nostrodomus-codebox-frame-glow-outer-soft) !important;
        background: transparent !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: translateZ(0) !important;
      }
      ha-code-editor[data-nostrodomus-codebox-frame-host="1"]::after,
      :host([data-nostrodomus-codebox-frame-host="1"])::after {
        content: "";
        position: absolute !important;
        inset: 0 !important;
        box-sizing: border-box !important;
        border-radius: 22px !important;
        pointer-events: none !important;
        z-index: 1 !important;
        background: var(--nostrodomus-codebox-surface) !important;
        backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;
        -webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;
        transform: translateZ(0) !important;
      }
      [data-nostrodomus-codebox-external-frame="1"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
      /* The Result pane of the template tool (ha-card.render-pane) gets the codebox frame: the
         same border and glow, and one frosted surface across the whole pane. The
         --nostrodomus-codebox-* variables are defined on the pane from the codebox colors, so it
         follows them, and the rules read them through var(), so a theme can still set them. The
         theme's --ha-card-* variables are not changed. ha-card.render-pane exists only in
         Developer Tools > Template, where this stylesheet is in the shadow root of
         developer-tools-template. */
      ha-card.render-pane {
        --nostrodomus-codebox-frame-border: ${frameBorder};
        --nostrodomus-codebox-frame-glow-inner: ${frameGlowInner};
        --nostrodomus-codebox-frame-glow-inner-soft: ${frameGlowInnerSoft};
        --nostrodomus-codebox-frame-glow-outer: ${frameGlowOuter};
        --nostrodomus-codebox-frame-glow-outer-soft: ${frameGlowOuterSoft};
        --nostrodomus-codebox-surface: ${resultPaneSurface};
        --nostrodomus-codebox-surface-blur: blur(16px) saturate(135%);
        background: var(--nostrodomus-codebox-surface) !important;
        -webkit-backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;
        backdrop-filter: var(--nostrodomus-codebox-surface-blur) !important;
        border: 1px solid var(--nostrodomus-codebox-frame-border) !important;
        border-radius: 22px !important;
        box-shadow:
          inset 0 0 0 1px var(--nostrodomus-codebox-frame-border),
          inset 0 0 18px var(--nostrodomus-codebox-frame-glow-inner),
          inset 0 0 34px var(--nostrodomus-codebox-frame-glow-inner-soft),
          0 0 0 1px var(--nostrodomus-codebox-frame-border),
          0 0 24px var(--nostrodomus-codebox-frame-glow-outer),
          0 0 52px var(--nostrodomus-codebox-frame-glow-outer-soft) !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"],
      .cm-scroller[data-nostrodomus-codebox-style="1"],
      .cm-content[data-nostrodomus-codebox-style="1"],
      .cm-line[data-nostrodomus-codebox-style="1"],
      [data-nostrodomus-codebox-style="1"] .cm-line,
      [data-nostrodomus-codebox-style="1"] .cm-line span,
      [data-nostrodomus-codebox-style="1"] .cm-content span {
        color: var(--nostrodomus-codebox-syntax-fg, ${syntaxFg}) !important;
        -webkit-text-fill-color: var(--nostrodomus-codebox-syntax-fg, ${syntaxFg}) !important;
        text-shadow: none !important;
      }

      .cm-content[data-nostrodomus-initial-syntax-pending="1"],
      .cm-content[data-nostrodomus-initial-syntax-pending="1"] .cm-line,
      .cm-content[data-nostrodomus-initial-syntax-pending="1"] .cm-line span {
        opacity: 0 !important;
        transition: none !important;
      }
      .cm-content[data-nostrodomus-initial-syntax-ready="1"],
      .cm-content[data-nostrodomus-initial-syntax-ready="1"] .cm-line,
      .cm-content[data-nostrodomus-initial-syntax-ready="1"] .cm-line span {
        opacity: 1 !important;
        transition: none !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-gutters,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-gutter,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-lineNumbers,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-foldGutter {
        color: ${gutterColor} !important;
        -webkit-text-fill-color: ${gutterColor} !important;
      }${caretColor ? `
      /* The caret follows the text color when the codebox colors were adjusted for a light theme or
         a dark-text preset. Home Assistant draws the caret as the left border of .cm-cursor in the
         theme's own color, which is lost on a surface of the opposite brightness. Not emitted for
         a dark theme with a light-text preset. */
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-cursor {
        border-left-color: ${caretColor} !important;
      }` : ""}
      /* The current-line indicator has two parts: the background of .cm-activeLine and
         .cm-activeLineGutter, and the borders Home Assistant gives .cm-content (top) and
         .cm-gutters (right), light gray at rest and blue (rgb(0, 154, 199)) on focus, an L shape.
         With style.hideActiveLineHighlight on (the default) the background is transparent and the
         block below hides the borders too; with it off the faint background and Home Assistant's
         borders show. */
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-activeLine,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-activeLineGutter {
        background: ${activeLineBackground} !important;
      }${activeLineBackground === "transparent" ? `
      /* Only while the current line is hidden. The border color is made transparent rather than
         the width 0, so CodeMirror's layout of gutter and content does not change. */
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-content {
        border-top-color: transparent !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-gutters,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-gutters.cm-gutters-before {
        border-right-color: transparent !important;
      }` : ""}
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-selectionBackground,
      .cm-content[data-nostrodomus-codebox-style="1"] ::selection {
        background: rgba(86, 156, 214, 0.35) !important;
      }
      ha-code-editor[data-nostrodomus-codebox-frame-host="1"],
      :host([data-nostrodomus-codebox-frame-host="1"]) {
        position: relative !important;
        z-index: 2 !important;
        display: block !important;
        border: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        isolation: isolate !important;
      }
      :host([data-nostrodomus-codebox-frame-host="1"]) .cm-editor,
      .cm-editor[data-nostrodomus-codebox-style="1"] {
        border: 0 !important;
        box-shadow: none !important;
        outline: none !important;
        background: transparent !important;
        position: relative !important;
        z-index: 2 !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-content,
      .cm-content[data-nostrodomus-codebox-style="1"] {
        font-size: ${size.value} !important;
        line-height: 1.48 !important;
        filter: var(--nostrodomus-codebox-syntax-filter, ${syntaxFilter}) !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller,
      .cm-scroller[data-nostrodomus-codebox-style="1"],
      .cm-content[data-nostrodomus-codebox-style="1"],
      .cm-editor[data-nostrodomus-codebox-style="1"] {
        background: transparent !important;
        scrollbar-color: var(--nostrodomus-codebox-scrollbar-thumb) var(--nostrodomus-codebox-scrollbar-track) !important;
        scrollbar-width: thin !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller,
      .cm-scroller[data-nostrodomus-codebox-style="1"] {
        overflow: auto !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller.ha-scrollbar::-webkit-scrollbar,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller::-webkit-scrollbar,
      .cm-scroller[data-nostrodomus-codebox-style="1"].ha-scrollbar::-webkit-scrollbar,
      .cm-scroller[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar,
      .cm-content[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar,
      .cm-editor[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar,
      [data-nostrodomus-codebox-style="1"]::-webkit-scrollbar {
        width: 10px !important;
        height: 10px !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller.ha-scrollbar::-webkit-scrollbar-track,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller::-webkit-scrollbar-track,
      .cm-scroller[data-nostrodomus-codebox-style="1"].ha-scrollbar::-webkit-scrollbar-track,
      .cm-scroller[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-track,
      .cm-content[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-track,
      .cm-editor[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-track,
      [data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-track {
        background: var(--nostrodomus-codebox-scrollbar-track) !important;
        border-radius: 999px !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller.ha-scrollbar::-webkit-scrollbar-thumb,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller::-webkit-scrollbar-thumb,
      .cm-scroller[data-nostrodomus-codebox-style="1"].ha-scrollbar::-webkit-scrollbar-thumb,
      .cm-scroller[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-thumb,
      .cm-content[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-thumb,
      .cm-editor[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-thumb,
      [data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-thumb {
        background: var(--nostrodomus-codebox-scrollbar-thumb) !important;
        background-color: var(--nostrodomus-codebox-scrollbar-thumb) !important;
        border-radius: 999px !important;
        border: 2px solid var(--nostrodomus-codebox-scrollbar-thumb-border, ${thumbBorder}) !important;
        background-clip: padding-box !important;
      }
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller.ha-scrollbar::-webkit-scrollbar-corner,
      .cm-editor[data-nostrodomus-codebox-style="1"] .cm-scroller::-webkit-scrollbar-corner,
      .cm-scroller[data-nostrodomus-codebox-style="1"].ha-scrollbar::-webkit-scrollbar-corner,
      .cm-scroller[data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-corner,
      [data-nostrodomus-codebox-style="1"]::-webkit-scrollbar-corner {
        background: transparent !important;
      }
    `;
}

export function codeboxStyleSignature({ settings, tokens, size, syntaxFilter, thumbBorder, frameEnabled, syntax }) {
  return JSON.stringify({
    size: size?.value || size || "",
    frameEnabled: frameEnabled !== false,
    scrollbarStyleEnabled: settings?.scrollbarStyleEnabled !== false,
    codeboxSurfaceEnabled: settings?.codeboxSurfaceEnabled !== false,
    syntaxTintEnabled: settings?.syntaxTintEnabled !== false,
    syntaxTintPreset: settings?.syntaxTintPreset || "",
    syntaxActive: !!syntax?.active,
    syntaxHue: syntax?.hue,
    syntaxSaturation: syntax?.saturation,
    syntaxOpacity: syntax?.opacity,
    syntaxThemeOpacity: syntax?.themeOpacity,
    syntaxThemeSaturation: syntax?.themeSaturation,
    syntaxFilter,
    thumbBorder,
    tokens,
  });
}

export function codeboxStyleReasonRequiresFullApply(reason = "", options = {}) {
  const text = String(reason || "").toLowerCase();
  return !options?.lastAppliedAt ||
    options?.cacheInvalidated ||
    text.includes("open") ||
    text.includes("install") ||
    text.includes("root") ||
    text.includes("structural") ||
    text.includes("option-change") ||
    text.includes("range-change") ||
    text.includes("toggle") ||
    text.includes("reset") ||
    text.includes("restore");
}

export function codeboxStyleReasonRequiresSyntaxPaint(reason = "", options = {}) {
  const text = String(reason || "").toLowerCase();
  return codeboxStyleReasonRequiresFullApply(reason, options) ||
    text.includes("dispatch") ||
    text.includes("mutation") ||
    text.includes("remember-view") ||
    text.includes("visible") ||
    text.includes("scroll") ||
    text.includes("focus") ||
    text.includes("pointer") ||
    text.includes("syntax") ||
    text.includes("content");
}

export function codeboxStyleSettleReasonCoalesceDecision(options = {}) {
  const cleanReason = String(options?.reason || "style-settle");
  const activeTimerCount = Number(options?.activeTimerCount || 0) || 0;
  const currentReason = String(options?.currentReason || "");
  if (activeTimerCount > 0 && currentReason === cleanReason) {
    const currentCount = Number(options?.currentCount || 1) || 1;
    return { coalesce: true, reason: cleanReason, count: Math.max(1, currentCount) };
  }
  return { coalesce: false, reason: cleanReason, count: 0 };
}

export function codeboxStyleReasonNeedsSettle(reason = "") {
  const text = String(reason || "").toLowerCase();
  return text.includes("open") ||
    text.includes("install") ||
    text.includes("settings-open") ||
    text.includes("option-change") ||
    text.includes("range-change") ||
    text.includes("toggle") ||
    text.includes("reset") ||
    text.includes("restore") ||
    text.includes("editor-sentinel-new") ||
    text.includes("editor-sentinel-mutation") ||
    text.includes("no-active-editor");
}

export function codeboxStyleReasonIsSourceClassSteadyState(reason = "") {
  const text = String(reason || "").toLowerCase();
  return text.includes("editor-dispatch") ||
    text.includes("outside-pointer-syntax-repaint") ||
    text.includes("editor-focusout-syntax-repaint") ||
    text.includes("syntax-repaint") ||
    text.includes("remember-view");
}

export function codeboxStyleSourceClassSteadyStateSkipDecision(options = {}) {
  if (!codeboxStyleReasonIsSourceClassSteadyState(options?.reason)) {
    return { skip: false, reason: "not-steady-state-reason" };
  }
  if (options?.cacheInvalidated || !options?.lastAppliedAt) {
    return { skip: false, reason: "style-cache-dirty" };
  }
  if (!options?.hasEditor) {
    return { skip: false, reason: "no-editor" };
  }
  if (!options?.sourceClassActive) {
    return { skip: false, reason: "source-class-inactive" };
  }
  if (options?.lastEditorKey && options.lastEditorKey !== options?.editorKey) {
    return { skip: false, reason: "editor-key-changed" };
  }
  return { skip: true, reason: "source-class-steady-state" };
}
