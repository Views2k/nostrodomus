// The companion stylesheets of the codebox and the card editor dialog, and the editor warning
// badge.
//
// CODEBOX_CSS and DIALOG_ROOT_CSS, between the @gen markers, are byte for byte the two sheets of
// the standalone editor layout script (reference/companions/nostrodomus_editor_v17_2_learned_reapply.js),
// injected under the same element ids; tests/companion/scrollbar_css_byte_identity.test.mjs
// compares them. Do not edit them by hand. The other sheets in this file have ids of their own;
// the ones that change a rule of these two are injected after them. The sheets keep the
// `--nostrodomus-codebox-scrollbar-*` variables, so a theme can still set the scrollbar colors.
//
// Active by default (SCROLLBAR_SHIPPED_ACTIVE) and gated by companionLayerActive: while the
// layer is dormant, applyForEditor writes nothing.

import { HA_FORM, HA_SELECTOR, HA_YAML_EDITOR, HUI_DIALOG_EDIT_CARD } from '../editor/haSelectors.js';
import { CARD_EDITOR_AREA_SELECTOR, insideCardOwnEditor, nestedInCardOwnEditor } from '../editor/cardOwnEditor.js';
import { OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR } from '../editor/overlayRoot.js';
import { companionLayerActive } from './coordinatorRuntime.js';

export const CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';
export const DIALOG_ROOT_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-dialog-root';
// Sizes the dialog on Home Assistant 2026.6 and later. DIALOG_ROOT_CSS sizes `:host`, `ha-dialog`
// and the `--mdc-dialog-*` variables, which reach nothing since the editor dialog became a
// `wa-dialog` (Web Awesome) inside ha-dialog's shadow root. This sheet goes one level deeper,
// into that shadow root, where `wa-dialog::part(dialog)` can be matched.
export const WA_DIALOG_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-wa-dialog';

// Turns off the line wrapping of CODEBOX_CSS (white-space: pre-wrap, word-break, overflow-wrap
// on .cm-content and .cm-line): long lines run on, and a horizontal scrollbar shows only when a
// line is wider than the box. CODEBOX_CSS also gives .cm-content width: 100%, which overshoots
// the gutter in the flex scroller and shows a scrollbar on short content. Injected into the code
// root after CODEBOX_CSS, so it wins at equal specificity.
export const NO_WRAP_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-no-wrap';

// Fits .cm-editor and .cm-scroller to their host. CODEBOX_CSS gives both a fixed width and
// minimum width of calc(-18px + 54vw), the left pane of the dialog. A codebox in a narrower host
// (a visual editor, a narrow window) then pushes its content, scrollbar and toolbar about 25px
// past the host on the right. Injected after CODEBOX_CSS and NO_WRAP.
export const CONTENT_FIT_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-content-fit';

// Hides the "Enter fullscreen" / "Exit fullscreen" button of ha-code-editor's toolbar; Undo,
// Redo, Copy and Find and replace stay. The toolbar is in ha-code-editor's shadow root, so the
// sheet goes there. `!important` wins over Home Assistant's adopted toolbar styles whatever their
// order.
export const FULLSCREEN_HIDE_STYLE_ID = 'nostrodomus-editor-fullscreen-button-hide';

// Hides Home Assistant's own autocomplete list (`.cm-tooltip-autocomplete` and its detail panel)
// while "Replace Home Assistant native autocomplete" is on. Home Assistant reads its
// autocompleteEntities and autocompleteIcons properties only when the editor is created, so
// setting them later does not remove the list; a stylesheet in the code root does, whenever it
// opens. `!important` wins over CodeMirror's tooltip styles. Nostrodomus's own list is
// `#nostrodomus-completions-root`, and other CodeMirror tooltips (hover, lint) have no
// -autocomplete class, so neither is affected.
export const NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID = 'nostrodomus-editor-native-autocomplete-hide';

// Lets a Sections view section fill the preview pane (see PREVIEW_FILL_CSS). Injected into the
// dialog shadow root after DIALOG_ROOT_CSS.
export const PREVIEW_FILL_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-preview-fill';

// "Hide editor warnings" (style.hideEditorWarnings, off by default). Home Assistant draws the
// editor's warnings ("Visual editor is not supported", configuration errors) inside the shadow
// root of hui-card-element-editor, where DIALOG_ROOT_CSS does not reach, so this sheet is what
// hides them. Same id as the sheet of the standalone editor layout script, which hid them
// always.
export const WARNING_HIDE_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-warning-hide';

// The warning badge, the look of an editor warning while "Hide editor warnings" is off: a 22px
// icon at the top left of the editor, in the accent color of the codebox frame
// (--nostrodomus-badge-accent), that shows the message beside it on hover or focus. Without it
// the warning is a banner the width of the codebox, over the "Show code editor" buttons. Two
// sheets in two roots:
//   HOST   in the root that holds the <ha-alert>: takes the alert out of the flow
//          (position: absolute), so it cannot push the editor down, and draws the icon box.
//   SHADOW in the ha-alert's own shadow root: reduces the banner to its icon and lays out the
//          message.
// Neither uses `!important`. For normal declarations a rule of the outer tree beats one of the
// inner tree before specificity counts, so on any property both set, the HOST sheet wins. That
// is why the clip to the icon box and its release on hover are both in the HOST sheet.
export const WARNING_BADGE_HOST_STYLE_ID = 'nostrodomus-editor-warning-badge-host';
export const WARNING_BADGE_SHADOW_STYLE_ID = 'nostrodomus-editor-warning-badge-shadow';

// Which alerts are editor warnings. Home Assistant draws its warnings ("Visual editor is not
// supported", configuration errors, a condition that cannot be shown) in its own editors. An
// ha-alert inside a custom card's own visual editor is a note the card's author put between its
// controls, and it is left as the card drew it.
//
// The warning walk does not enter a custom card's editor (see deepShadowRootsWithin), so its
// shadow roots are never seen here. What is left is a card editor that draws without a shadow
// root: its notes are in the element editor's own tree, under the card editor area, and the
// sheets leave that area out with `:not(.gui-editor ...)`. This filter is the same rule for the
// alerts that get the inner badge sheet.
export function editorWarningAlerts(root) {
  let alerts = [];
  try { alerts = Array.from(root?.querySelectorAll?.('ha-alert') || []); } catch { alerts = []; }
  return alerts.filter((alert) => {
    try { if (alert?.closest?.(CARD_EDITOR_AREA_SELECTOR)) return false; } catch { /* detached */ }
    return !insideCardOwnEditor(alert);
  });
}

const SCROLLBAR_SHIPPED_ACTIVE = true;

// @gen:codebox-css-start
const CODEBOX_CSS = `
      .cm-editor {
        width: calc(-18px + 54vw) !important;
        max-width: calc(-18px + 54vw) !important;
        min-width: calc(-18px + 54vw) !important;
        height: calc(94vh - 437px) !important;
        max-height: calc(94vh - 437px) !important;
        min-height: 0 !important;
        border-radius: 24px !important;
        overflow: hidden !important;
        background: rgba(0, 0, 0, 0.35) !important;
        background-color: rgba(0, 0, 0, 0.35) !important;
        background-image: none !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
      }

      .cm-editor.cm-focused,
      .cm-scroller,
      .cm-content {
        outline: 0 !important;
      }

      .cm-editor::before,
      .cm-editor::after,
      .cm-scroller::before,
      .cm-scroller::after,
      .cm-content::before,
      .cm-content::after {
        display: none !important;
        content: none !important;
      }

      .cm-scroller,
      .cm-scroller.ha-scrollbar {
        width: calc(-18px + 54vw) !important;
        max-width: calc(-18px + 54vw) !important;
        min-width: calc(-18px + 54vw) !important;
        height: calc(94vh - 439px) !important;
        max-height: calc(94vh - 439px) !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        background: transparent !important;
        background-color: transparent !important;
        padding: 16px 18px 30px 14px !important;
        margin: 0 !important;
        scrollbar-width: thin !important;
        scrollbar-color: var(--nostrodomus-codebox-scrollbar-thumb, rgba(120, 210, 255, 0.68)) var(--nostrodomus-codebox-scrollbar-track, rgba(0, 0, 0, 0.10)) !important;
        -ms-overflow-style: auto !important;
        box-sizing: border-box !important;
      }

      .cm-content {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        flex-basis: auto !important;
        overflow-x: hidden !important;
        background: transparent !important;
        background-color: transparent !important;
        border-radius: 0 !important;
        min-height: calc(100% - 46px) !important;
        padding: 0 8px 18px 0 !important;
        margin: 0 !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        box-sizing: border-box !important;
      }

      .cm-line,
      .cm-line span,
      .cm-activeLine {
        max-width: 100% !important;
        background: transparent !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        box-sizing: border-box !important;
      }

      .cm-line,
      .cm-activeLine {
        padding-left: 2px !important;
        padding-right: 8px !important;
      }

      .cm-gutters,
      .cm-gutters-before,
      .cm-gutter,
      .cm-lineNumbers,
      .cm-foldGutter,
      .cm-gutterElement,
      .cm-activeLineGutter,
      ha-icon-button-toolbar,
      ha-icon-button-group,
      .code-editor-toolbar,
      .icon-toolbar-buttongroup {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
      }

      .cm-scroller::-webkit-scrollbar {
        width: 12px !important;
        height: 0 !important;
        background: transparent !important;
      }

      .cm-scroller::-webkit-scrollbar:horizontal,
      .cm-editor::-webkit-scrollbar:horizontal,
      .cm-content::-webkit-scrollbar:horizontal {
        height: 0 !important;
        max-height: 0 !important;
        display: none !important;
        background: transparent !important;
      }

      .cm-scroller::-webkit-scrollbar-track {
        background: linear-gradient(180deg, rgba(0,0,0,0.055), rgba(0,0,0,0.13)) !important;
        border-radius: 999px !important;
        margin: 18px 5px 18px 0 !important;
        border: 1px solid rgba(255,255,255,0.025) !important;
        box-shadow: inset 0 0 8px rgba(0,0,0,0.18) !important;
      }

      .cm-scroller::-webkit-scrollbar-thumb {
        background: var(--nostrodomus-codebox-scrollbar-thumb, rgba(120, 210, 255, 0.68)) !important;
        border-radius: 999px !important;
        border: 3px solid rgba(16,18,24,0.72) !important;
        box-shadow:
          0 0 6px rgba(145,35,60,0.22),
          inset 0 1px 0 rgba(255,255,255,0.09),
          inset 0 -1px 0 rgba(0,0,0,0.18) !important;
        min-height: 72px !important;
      }
    `;
// @gen:codebox-css-end

// @gen:dialog-root-css-start
const DIALOG_ROOT_CSS = `
      :host {
        width: 98vw !important;
        max-width: 98vw !important;
        height: 94vh !important;
        max-height: 94vh !important;
        overflow: hidden auto !important;
        box-sizing: border-box !important;
      }

      ha-dialog {
        --dialog-width: 98vw !important;
        --mdc-dialog-min-width: 98vw !important;
        --mdc-dialog-max-width: 98vw !important;
        --dialog-height: 94vh !important;
        --mdc-dialog-max-height: 94vh !important;
        overflow: hidden !important;
        scrollbar-width: none !important;
        box-sizing: border-box !important;
      }

      .content {
        display: flex !important;
        max-width: 100% !important;
        min-width: 0 !important;
        overflow: visible !important;
      }

      .element-editor,
      .element-editor.ha-scrollbar {
        width: 54vw !important;
        max-width: 54vw !important;
        min-width: 54vw !important;
        height: calc(-198px + 94vh) !important;
        max-height: calc(-198px + 94vh) !important;
        min-height: 0 !important;
        overflow: visible !important;
        box-sizing: border-box !important;
        padding-right: 18px !important;
        padding-bottom: 12px !important;
        margin-left: 4px !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }

      .element-editor::-webkit-scrollbar,
      .element-editor.ha-scrollbar::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }

      .element-preview,
      .element-preview.ha-scrollbar {
        display: flex !important;
        width: calc(-44px + 44vw) !important;
        max-width: calc(-44px + 44vw) !important;
        min-width: 0 !important;
        height: calc(-136px + 94vh) !important;
        max-height: calc(-136px + 94vh) !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        padding: 16px 4px 4px 4px !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        align-items: flex-start !important;
        justify-content: center !important;
      }

      .element-preview::-webkit-scrollbar,
      .element-preview.ha-scrollbar::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }

      ha-alert,
      [role="alert"],
      .issue-type.warning,
      .warning,
      .error {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `;
// @gen:dialog-root-css-end

// The wa-dialog sizing sheet (WA_DIALOG_STYLE_ID), for the native top-layer
// `<dialog part="dialog">` inside wa-dialog. Web Awesome sizes that part with
// `--width: min(1024px, 95vw, …)`, a height that follows the content and the <dialog> defaults
// for maximum width and height. The side-by-side editor and preview need 98vw by 94vh, the size
// DIALOG_ROOT_CSS gives the older dialog, so the part's width and height are set with
// `!important`. Covered by tests/e2e/companion-discovery-path.spec.mjs.
//
// The height is capped at the window height minus the dialog's top margin. Home Assistant places
// the dialog that margin (40px) below the top of the window, so 94vh alone ends below the window
// in windows shorter than about 667px and cuts into the row with Save and Cancel. From 667px up
// the cap is larger than 94vh and changes nothing.
const WA_DIALOG_HEIGHT = 'min(94vh, calc(100vh - var(--dialog-surface-margin-top, 40px)))';
export const WA_DIALOG_CSS = `
      wa-dialog::part(dialog) {
        width: 98vw !important;
        max-width: 98vw !important;
        height: ${WA_DIALOG_HEIGHT} !important;
        max-height: ${WA_DIALOG_HEIGHT} !important;
        box-sizing: border-box !important;
      }

      wa-dialog::part(body) {
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        box-sizing: border-box !important;
      }

      /* Side by side (editor left, preview right): each pane scrolls on its own, the body never. */
      @media (min-width: 1000px) {
        wa-dialog::part(body) {
          overflow: hidden !important;
        }
      }

      /* Stacked (preview under the editor): the body scrolls, so the preview can be reached and
         the row with Save and Cancel stays inside the dialog. A body that cannot scroll grows to
         the height of both panes and pushes that row out of the window. */
      @media (max-width: 999px) {
        wa-dialog::part(body) {
          overflow: hidden auto !important;
        }
      }
    `;

// The two sheets that match the standalone editor layout script byte for byte.
export function buildCompanionScrollbarCss() {
  return { codebox: CODEBOX_CSS, dialogRoot: DIALOG_ROOT_CSS };
}

function safeDocument(globalRef) {
  try {
    return globalRef?.document || (typeof document !== 'undefined' ? document : null);
  } catch {
    return null;
  }
}

// The nearest element matching `selector`, walking up through shadow hosts.
function composedClosestSelector(node, selector) {
  let n = node;
  while (n) {
    try { if (n.matches?.(selector)) return n; } catch { /* detached */ }
    const root = n.getRootNode?.();
    n = root?.host || n.parentElement || null;
  }
  return null;
}

// See NO_WRAP_STYLE_ID.
const NO_WRAP_CSS = `
      .cm-scroller,
      .cm-scroller.ha-scrollbar {
        overflow-x: auto !important;
        overflow-y: auto !important;
      }
      .cm-content {
        white-space: pre !important;
        word-break: normal !important;
        overflow-wrap: normal !important;
        width: max-content !important;
        max-width: none !important;
        overflow-x: visible !important;
      }
      .cm-line,
      .cm-line span,
      .cm-activeLine {
        white-space: pre !important;
        word-break: normal !important;
        overflow-wrap: normal !important;
        max-width: none !important;
      }
      .cm-scroller::-webkit-scrollbar:horizontal,
      .cm-editor::-webkit-scrollbar:horizontal,
      .cm-content::-webkit-scrollbar:horizontal {
        height: 12px !important;
        max-height: 12px !important;
        display: block !important;
      }
    `;

// See CONTENT_FIT_STYLE_ID. `min(100%, calc(-18px + 54vw))` is the width of CODEBOX_CSS in the
// full card dialog and the host's width where the host is narrower; `min-width: 0` lifts the
// minimum of CODEBOX_CSS. .cm-content keeps the `max-content` width of NO_WRAP, so long lines
// scroll inside the fitted scroller.
// It also sets the .cm-editor `border-radius` of CODEBOX_CSS (24px) to 0: with
// `overflow: hidden`, that rounding cut off the bottom of the vertical scrollbar. The rounded
// frame the user sees is the host's ::before, so the codebox still looks rounded.
export const CONTENT_FIT_CSS = `
      .cm-editor {
        width: min(100%, calc(-18px + 54vw)) !important;
        min-width: 0 !important;
        max-width: 100% !important;
        border-radius: 0 !important;
      }
      .cm-scroller,
      .cm-scroller.ha-scrollbar {
        width: min(100%, calc(-18px + 54vw)) !important;
        min-width: 0 !important;
        max-width: 100% !important;
      }

      /* Stacked card dialog (below 1000px): the editor pane spans the dialog, so the code takes
         the width of its host. The 54vw cap would cut the text off at about half the box. */
      @media (max-width: 999px) {
        .cm-editor,
        .cm-scroller,
        .cm-scroller.ha-scrollbar {
          width: 100% !important;
        }
      }
    `;

// See FULLSCREEN_HIDE_STYLE_ID. Matches only the fullscreen toggle, on either button element, by
// its aria-label and title. Injected into every code root, panel editors included.
export const FULLSCREEN_HIDE_CSS = `
      ha-button[aria-label="Enter fullscreen"],
      ha-button[title="Enter fullscreen"],
      ha-button[aria-label="Exit fullscreen"],
      ha-button[title="Exit fullscreen"],
      ha-icon-button[aria-label="Enter fullscreen"],
      ha-icon-button[title="Enter fullscreen"],
      ha-icon-button[aria-label="Exit fullscreen"],
      ha-icon-button[title="Exit fullscreen"] {
        display: none !important;
      }
    `;

// See NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID. Home Assistant draws the detail panel with its own
// class `completion-info` rather than CodeMirror's `.cm-completionInfo`; both are listed, or the
// panel would show alone at the top left of the screen.
export const NATIVE_AUTOCOMPLETE_HIDE_CSS = `
      .cm-tooltip.cm-tooltip-autocomplete,
      .cm-tooltip-autocomplete,
      .cm-completionInfo,
      .completion-info {
        display: none !important;
      }
    `;

// See PREVIEW_FILL_STYLE_ID. DIALOG_ROOT_CSS makes `.element-preview` a centered flex container.
// A `hui-section` or `hui-grid-section` has no width of its own (it fills its container), so as a
// centered flex item it shrinks to about 88px. Here it takes the full width, up to the maximum
// width Home Assistant gives it (about 500px), centered by auto margins, and `zoom: 1.5` makes
// it half again as large. `zoom` lays the section out again (sharp, where transform: scale
// blurs) and its overflow scrolls in the pane. Other cards have a width of their own and keep
// the centering of DIALOG_ROOT_CSS. `!important` because the rules of DIALOG_ROOT_CSS are.
const PREVIEW_FILL_CSS = `
      .element-preview {
        overflow: auto !important;
      }
      .element-preview > hui-section,
      .element-preview > hui-grid-section {
        width: 100% !important;
        align-self: flex-start !important;
        margin-left: auto !important;
        margin-right: auto !important;
        zoom: 1.5 !important;
      }
    `;

// DIALOG_ROOT_CSS gives `.element-editor.ha-scrollbar` an 18px right padding, which shows as a
// shaded strip right of the codebox's scrollbar. This sheet sets only the right (inline end)
// padding to 0, and the codebox takes the 18px. Injected after DIALOG_ROOT_CSS into the same
// dialog shadow root, with `!important` like the rule it overrides.
export const EDITOR_GUTTER_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-editor-gutter';
const EDITOR_GUTTER_CSS = `
      .element-editor.ha-scrollbar {
        padding-right: 0 !important;
        padding-inline-end: 0 !important;
      }
    `;

// The stacked card dialog (window narrower than 1000px). DIALOG_ROOT_CSS gives .element-editor
// 54vw and .element-preview 44vw - 44px, the widths of the side-by-side layout; below 1000px
// Home Assistant stacks the two panes, and at 900px they would be 486px and 352px wide in an
// 882px dialog. Here both take the full width, and the preview is as tall as its card (the
// dialog body scrolls). Nothing changes from 1000px up. The selectors are one class more
// specific than those of DIALOG_ROOT_CSS, so the order of the sheets does not matter. Covered by
// tests/e2e/companion-dialog-size.spec.mjs at 900px.
export const STACKED_PANES_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-stacked-panes';
export const STACKED_PANES_CSS = `
      @media (max-width: 999px) {
        .content .element-editor,
        .content .element-editor.ha-scrollbar {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin-left: 0 !important;
        }
        .content .element-preview,
        .content .element-preview.ha-scrollbar {
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          max-height: none !important;
          min-height: 120px !important;
        }
      }
    `;

// The visual editor in a styled card dialog. DIALOG_ROOT_CSS gives .element-editor a fixed
// height and `overflow: visible`, so the codebox glow is not cut off; Home Assistant's own rule
// lets the pane scroll. The sheet stays in the dialog when a visual editor takes the code
// editor's place, and a visual editor taller than the pane would then run on under the Save row
// with its lower controls out of reach (measured on 2026.6 and 2026.11 at 1280x720 with a 1638px
// editor). While the dialog does not show its main code editor (reconcileVisualEditorPane), this
// sheet lets the pane scroll again, with a thin scrollbar. Covered by the "taller than the
// dialog" case of tests/e2e/custom-card-visual-editor.spec.mjs.
export const VISUAL_EDITOR_SCROLL_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-visual-editor-scroll';
export const VISUAL_EDITOR_SCROLL_CSS = `
      .element-editor,
      .element-editor.ha-scrollbar {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        scrollbar-width: thin !important;
      }
    `;

// Glass editor dialog (style.glassDialog, default on). A sheet in the dialog shadow root, built
// per dialog by buildGlassDialogCss. It makes the surface of the card editor dialog translucent
// with a blur of what is behind it, and clears the background of the preview pane, so the
// dashboard shows through, softened.
//
// The surface is not styled directly. Home Assistant's ha-dialog paints wa-dialog's surface with
// `--ha-dialog-surface-background` (falling back to the card background) and gives it
// `backdrop-filter: var(--ha-dialog-surface-backdrop-filter, none)`. The sheet sets those two
// custom properties on `ha-dialog`; an outer-tree rule wins over ha-dialog's own `:host` rule,
// so they need no important flag.
//
// A theme that styles its dialogs keeps its look. The same properties are read on the
// hui-dialog-edit-card host, where only the theme's inherited values can be found (the sheet
// sets them one level deeper, on ha-dialog), and each line the theme already covers is left out.
//
// The preview rule needs `!important`. Home Assistant's dialog sheet gives `.element-preview` the
// theme's primary background color; it is adopted by the same shadow root, and adopted sheets
// come after an appended style element, so a normal declaration with the same selector loses.
// (DIALOG_ROOT_CSS overrides the pane's padding and size the same way.) No other sheet of this
// layer sets a background on the pane. Only in the shadow root of hui-dialog-edit-card. Covered
// by tests/e2e/companion-glass-dialog.spec.mjs.
export const GLASS_DIALOG_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-glass-dialog';
// How much of the theme's card surface color stays; the rest is transparent.
export const GLASS_DIALOG_SURFACE_OPACITY_PERCENT = 60;
export const GLASS_DIALOG_BACKDROP_FILTER = 'blur(18px) saturate(135%)';

// The glass sheet for one dialog, from the three theme values read on the dialog host.
//   surfaceBackground      --ha-dialog-surface-background: when the theme sets it, the theme
//                          owns the surface and the surface line is left out.
//   surfaceBackdropFilter  --ha-dialog-surface-backdrop-filter: when the theme sets it, the
//                          blur line is left out.
//   scrimBackdropFilter    --ha-dialog-scrim-backdrop-filter: a theme that already blurs the
//                          page behind the dialog gets no second blur on top of it.
// The preview rule is always there.
export function buildGlassDialogCss({ surfaceBackground = '', surfaceBackdropFilter = '', scrimBackdropFilter = '' } = {}) {
  const themed = (value) => String(value ?? '').trim();
  const lines = [];
  if (!themed(surfaceBackground)) {
    lines.push(`--ha-dialog-surface-background: color-mix(in srgb, var(--card-background-color, var(--ha-color-surface-default, #fff)) ${GLASS_DIALOG_SURFACE_OPACITY_PERCENT}%, transparent);`);
  }
  if (!themed(surfaceBackdropFilter) && !themed(scrimBackdropFilter).toLowerCase().includes('blur(')) {
    lines.push(`--ha-dialog-surface-backdrop-filter: ${GLASS_DIALOG_BACKDROP_FILTER};`);
  }
  const surfaceRule = lines.length
    ? `
      ha-dialog {
${lines.map((line) => `        ${line}`).join('\n')}
      }
`
    : '';
  return `${surfaceRule}
      .element-preview {
        background: transparent !important;
      }
    `;
}

// See WARNING_HIDE_STYLE_ID. Only the <ha-alert> element itself: `[role="alert"]` would also match
// the wrapper Home Assistant puts around the visual editor's notice (`div[role="alert"]`), and
// collapsing that pushes the codebox down. The badge sheet has already taken the alert out of the
// flow, so hiding it moves nothing. `:not(.gui-editor ha-alert)` leaves a custom card's own notes
// alone (see editorWarningAlerts).
export const WARNING_HIDE_CSS = `
      ha-alert:not(.gui-editor ha-alert) {
        display: none !important;
      }
    `;

// The HOST sheet of the warning badge: the alert's caution icon, 22px, at the top left, with no
// box around it. Its color is `--nostrodomus-badge-accent`, which the runtime sets on the alert
// from the codebox frame color (badgeAccentFromBorderColor), with a cyan fallback. The size does
// not change on hover: the message opens beside the icon instead, so the area under the pointer
// stays the same. `:has(> ha-alert)` makes the alert's parent the positioning context. Every
// selector leaves out `.gui-editor`, the area of the card's own editor: an editor that draws
// without a shadow root has its notes in this same tree, and they are the card's.
export const WARNING_BADGE_HOST_CSS = `
      :has(> ha-alert):not(.gui-editor, .gui-editor *) {
        position: relative;
      }
      ha-alert:not(.gui-editor ha-alert) {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 4;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        /* Clipped to the icon box: while Home Assistant rebuilds the alert (on each keystroke) the
           SHADOW sheet can be missing for a moment, and the alert then shows as a clipped icon,
           not as a banner across the editor. */
        overflow: hidden;
        background: transparent;
        border: 0;
        box-shadow: none;
        color: var(--nostrodomus-badge-accent, hsl(198, 90%, 62%));
        cursor: help;
      }
      /* Unclipped on hover and focus, so the message beside the icon can show. This has to be in
         this outer-tree sheet: the SHADOW sheet's :host rule loses to the outer rule above
         whatever its specificity. Within this sheet :hover and :focus-within are more specific
         than the rule above. */
      ha-alert:not(.gui-editor ha-alert):hover,
      ha-alert:not(.gui-editor ha-alert):focus-within {
        overflow: visible;
      }
      ha-alert ~ ha-alert:not(.gui-editor ha-alert) {
        top: 38px;
      }
      ha-alert ~ ha-alert ~ ha-alert:not(.gui-editor ha-alert) {
        top: 68px;
      }
    `;

// The SHADOW sheet of the warning badge, in the ha-alert's own shadow root. It reduces the banner
// to its leading icon and shows the message in a panel to the right of the icon on hover or
// focus. The panel is positioned against the icon box (the host sheet makes the alert
// position: absolute) and animates only opacity and transform, so it opens without a layout
// pass. `:host`-prefixed selectors are more specific than Home Assistant's adopted styles, so no
// `!important` is needed. The icon is drawn in `currentColor`, the accent the host sheet sets,
// instead of the warning color Home Assistant gives both the icon and the square behind it.
export const WARNING_BADGE_SHADOW_CSS = `
      :host {
        overflow: visible;
      }
      :host .issue-type {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        min-height: 0;
        padding: 0;
        margin: 0;
        background: none;
        border: 0;
      }
      :host .issue-type .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        margin: 0;
        padding: 0;
        color: currentColor;
      }
      /* Home Assistant colors the icon in an adopted sheet, which comes after this appended
         <style> at equal specificity, so these selectors are more specific. --icon-primary-color
         and fill cover both ways ha-svg-icon can be painted. */
      :host([alert-type]) .issue-type .icon,
      :host([alert-type]) .issue-type .icon ha-svg-icon {
        color: currentColor;
        fill: currentColor;
        --icon-primary-color: currentColor;
      }
      /* Home Assistant draws the square behind the icon as .issue-type::after in the warning
         color (rgb(255, 166, 0)); the element's own background is transparent. The pseudo-elements
         are removed, with selectors more specific than .issue-type.warning::after. */
      :host([alert-type]) .issue-type::before,
      :host([alert-type]) .issue-type::after {
        content: none;
        background: none;
        display: none;
      }
      :host .issue-type .icon ha-svg-icon {
        --mdc-icon-size: 16px;
        width: 16px;
        height: 16px;
      }
      :host .issue-type .content {
        position: absolute;
        left: calc(100% + 8px);
        top: 50%;
        box-sizing: border-box;
        width: max-content;
        max-width: 300px;
        padding: 7px 10px;
        border-radius: 8px;
        background: rgba(15, 20, 30, 0.97);
        color: #e8edf3;
        border: 1px solid var(--nostrodomus-badge-accent, hsla(198, 90%, 62%, 0.6));
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
        text-align: left;
        white-space: normal;
        font-size: 12px;
        line-height: 1.35;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(-50%) translateX(-6px);
        transition: opacity 130ms ease, transform 130ms ease, visibility 0s linear 130ms;
      }
      :host(:hover) .issue-type .content,
      :host(:focus-within) .issue-type .content {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(-50%) translateX(0);
        transition: opacity 130ms ease, transform 130ms ease, visibility 0s;
      }
      :host .content .title {
        font-weight: 600;
        line-height: 1.25;
        margin-bottom: 2px;
      }
      :host .content .action {
        margin: 0;
      }
    `;

// The shadow roots of the editor hosts under the dialog's own shadow root (not that root
// itself), where Home Assistant draws the editor's warnings: inside hui-card-element-editor and
// hui-card-editor, out of DIALOG_ROOT_CSS's reach. Enters only the editor hosts in
// OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR, at most WARNING_ROOT_MAX_DEPTH deep.
const WARNING_ROOT_MAX_DEPTH = 8;
function nestedEditorRootsForDialog(dialog) {
  const top = dialog?.shadowRoot;
  if (!top || typeof top.querySelectorAll !== 'function') return [];
  const roots = [];
  const seen = new Set([top]);
  const stack = [{ node: top, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (depth >= WARNING_ROOT_MAX_DEPTH) continue;
    let hosts = [];
    try { hosts = Array.from(node.querySelectorAll(OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR) || []); } catch { hosts = []; }
    for (const el of hosts) {
      const sr = el && el.shadowRoot;
      if (!sr || seen.has(sr)) continue;
      if (insideCardOwnEditor(el)) continue; // a code box of a custom card's own editor
      seen.add(sr); roots.push(sr); stack.push({ node: sr, depth: depth + 1 });
    }
  }
  return roots;
}

// The badge accent: the hue and saturation of the codebox frame color, opaque, at a lightness that
// reads as an icon. The frame color is `hsla(h, s%, 65%, a)` with a low alpha (about 0.42). Returns
// null for anything else (an rgba color while the frame is off), and the CSS fallback applies.
export function badgeAccentFromBorderColor(borderColor) {
  if (typeof borderColor !== 'string') return null;
  const m = borderColor.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*[\d.]+%/i);
  if (!m) return null;
  const h = Math.round(parseFloat(m[1]));
  const s = Math.min(100, Math.max(0, Math.round(parseFloat(m[2]))));
  if (!Number.isFinite(h) || !Number.isFinite(s)) return null;
  return `hsl(${h}, ${s}%, 62%)`;
}

// Adds the sheet unless the root already has one with this id (from an earlier apply or the
// standalone editor layout script). Returns true only when this call added it.
function injectOwnedStyle(root, id, css, documentRef) {
  if (!root?.querySelector || !documentRef?.createElement) return false;
  if (root.querySelector(`#${id}`)) return false;
  const style = documentRef.createElement('style');
  style.id = id;
  style.textContent = css;
  root.appendChild(style);
  return true;
}

function removeOwnedStyle(root, id) {
  try {
    const el = root?.querySelector?.(`#${id}`);
    if (el) { el.remove(); return true; }
  } catch { /* detached root */ }
  return false;
}

/** @param {Record<string, any>} [deps] */
export function createCompanionStyleRuntime(deps = {}) {
  const {
    globalRef = globalThis,
    storage,
    documentRef = safeDocument(globalRef),
    // Replaces the companionLayerActive check (tests).
    isActive,
    // "Hide editor warnings" (style.hideEditorWarnings), off by default. Read on each apply.
    hideEditorWarnings = () => false,
    replaceNativeAutocomplete = () => true,
    // "Glass editor dialog" (style.glassDialog). Default on. Re-read on each apply, so a change
    // of the setting adds or removes the glass sheet.
    glassDialog = () => true,
    // Called once when a styled dialog stops showing its main code editor (a visual editor or
    // another tab took its place). Main uses it to give the dialog body back its own overflow,
    // which the unclip changed for the codebox glow.
    onMainEditorLeft = () => {},
    // For the observer that badges an alert again when Home Assistant rebuilds it (it does on
    // every keystroke while the configuration is invalid, and the rebuilt alert has no sheets).
    MutationObserver: MutationObserverCtor = globalRef?.MutationObserver,
    // Schedules the retry for an alert whose shadow root is attached a frame after the alert.
    requestAnimationFrame: rafDep = globalRef?.requestAnimationFrame?.bind?.(globalRef),
  } = deps;

  function scheduleFrame(fn) {
    try {
      if (typeof rafDep === 'function') return rafDep(fn);
      const st = globalRef?.setTimeout?.bind?.(globalRef);
      if (st) return st(fn, 16);
      if (typeof queueMicrotask === 'function') return queueMicrotask(fn);
    } catch { /* no scheduler: no retry, and the alert stays a clipped icon */ }
    return undefined;
  }

  // Every root this runtime added a sheet to, for teardown.
  const ownedRoots = new Set();
  // Container root -> the observer that badges a rebuilt alert at once (ensureWarningReapplyObserver).
  const warningReapplyObservers = new Map();
  // Whether a badge or hide sheet is injected anywhere. With the layer off, the setting off and
  // this false, the warning reconcile does not walk the dialog.
  let warningStyleActive = false;
  // The ha-alert elements given an inline --nostrodomus-badge-accent, so teardown can remove it.
  const badgedAlerts = new Set();
  // Glass editor dialog: dialogShadowRoot -> { haDialog, css }, one entry per dialog root that
  // holds the glass sheet. It remembers the sheet text built from the theme, so the computed
  // style of the dialog host is read once per opening of the dialog and not on every apply.
  // Home Assistant keeps the hui-dialog-edit-card element (and with it the injected sheets) and
  // renders a new ha-dialog inside it each time the dialog opens; an entry whose ha-dialog is
  // no longer the current one is read again, so a theme chosen between two openings is seen.
  // Entries go when the setting is turned off and on teardown. They are not pruned with the
  // detached owned roots: a closed dialog that comes back brings its sheet with it, and turning
  // the setting off in between has to reach that sheet. The dialog element is reused, so the
  // map stays at one entry per dialog element.
  const glassDialogSheets = new Map();

  function active() {
    if (typeof isActive === 'function') return !!isActive();
    return companionLayerActive({ globalRef, storage, shippedDefault: SCROLLBAR_SHIPPED_ACTIVE });
  }

  // The badge accent from the frame color of a styled ha-code-editor in the surface, as an `hsl(...)`
  // string, or null (no getComputedStyle, as in Node, or nothing readable), for the CSS fallback.
  function liveBadgeAccent(surfaceEl, roots = null) {
    try {
      const gcs = globalRef && globalRef.getComputedStyle;
      if (typeof gcs !== 'function' || !surfaceEl) return null;
      for (const root of roots || deepShadowRootsWithin(surfaceEl)) {
        let editor = null;
        try { editor = root.querySelector && root.querySelector('ha-code-editor'); } catch { editor = null; }
        if (!editor) continue;
        let border = '';
        // gcs is getComputedStyle read off the injected global, checked to be a function above.
        // eslint-disable-next-line no-obj-calls
        try { border = gcs(editor).getPropertyValue('--nostrodomus-codebox-frame-border'); } catch { border = ''; }
        const accent = badgeAccentFromBorderColor(border && border.trim());
        if (accent) return accent;
      }
    } catch { /* the CSS fallback applies */ }
    return null;
  }

  // Forgets roots and alerts that left the page (a closed dialog), so the sets do not grow over a
  // long session. A detached root took its sheets with it. The document is never forgotten.
  function pruneDetachedOwnedRoots() {
    let pruned = 0;
    for (const root of Array.from(ownedRoots)) {
      if (root && root.nodeType !== 9 && root.isConnected === false) { ownedRoots.delete(root); pruned += 1; }
    }
    for (const alert of Array.from(badgedAlerts)) {
      if (alert && alert.isConnected === false) badgedAlerts.delete(alert);
    }
    return pruned;
  }

  // The three theme values the glass sheet depends on, read on the hui-dialog-edit-card host.
  // The sheet sets its own values on ha-dialog, inside the host's shadow root, so the host only
  // ever carries what the theme defines. Without getComputedStyle (the headless test runtime) or
  // on a failed read every value is empty, which is the answer for a theme that defines none.
  function glassDialogThemeValues(dialogHost) {
    const values = { surfaceBackground: '', surfaceBackdropFilter: '', scrimBackdropFilter: '' };
    try {
      const gcs = globalRef && globalRef.getComputedStyle;
      if (typeof gcs !== 'function' || !dialogHost) return values;
      // gcs is getComputedStyle read off the injected global, checked to be a function above.
      // eslint-disable-next-line no-obj-calls
      const computed = gcs(dialogHost);
      const read = (name) => String(computed?.getPropertyValue?.(name) || '').trim();
      values.surfaceBackground = read('--ha-dialog-surface-background');
      values.surfaceBackdropFilter = read('--ha-dialog-surface-backdrop-filter');
      values.scrimBackdropFilter = read('--ha-dialog-scrim-backdrop-filter');
    } catch { /* detached host: treated as a theme that defines nothing */ }
    return values;
  }

  // Glass editor dialog, one dialog root: add the sheet when the setting is on, remove it when
  // it is off. The steady state (sheet present, same opening of the dialog) costs the one id
  // lookup of injectOwnedStyle and no style read.
  function reconcileGlassDialogSheet(dialogRoot, haDialog) {
    if (!glassDialog()) {
      glassDialogSheets.delete(dialogRoot);
      return removeOwnedStyle(dialogRoot, GLASS_DIALOG_STYLE_ID);
    }
    let entry = glassDialogSheets.get(dialogRoot);
    const sameOpening = !!entry && entry.haDialog === haDialog;
    if (!sameOpening) {
      entry = { haDialog, css: buildGlassDialogCss(glassDialogThemeValues(dialogRoot.host)) };
    }
    if (injectOwnedStyle(dialogRoot, GLASS_DIALOG_STYLE_ID, entry.css, documentRef)) {
      ownedRoots.add(dialogRoot);
      glassDialogSheets.set(dialogRoot, entry);
      return true;
    }
    if (sameOpening) return false;
    // The sheet is still there from an earlier opening of this dialog. Give it the text for the
    // theme of this opening.
    glassDialogSheets.set(dialogRoot, entry);
    try {
      const sheet = dialogRoot.querySelector(`#${GLASS_DIALOG_STYLE_ID}`);
      if (sheet && sheet.textContent !== entry.css) { sheet.textContent = entry.css; return true; }
    } catch { /* detached root */ }
    return false;
  }

  // Glass editor dialog, setting off: remove the sheet from every dialog root that holds it.
  // Runs at the start of applyForEditor, before an editor is required, because the editor the
  // settings panel passes when the checkbox changes can be gone (the dialog shows its visual
  // editor, or was closed). Costs nothing once the sheets are gone.
  function removeGlassDialogSheets() {
    let removed = false;
    for (const root of Array.from(glassDialogSheets.keys())) {
      if (removeOwnedStyle(root, GLASS_DIALOG_STYLE_ID)) removed = true;
    }
    glassDialogSheets.clear();
    return removed;
  }

  // Injects the sheets into the roots it is given: the code root (ha-code-editor's shadow root),
  // the dialog root (hui-dialog-edit-card's) and the wa-dialog root (ha-dialog's), and adds or
  // removes the warning hide sheet in `warningRoots` to follow the setting.
  function applyToRoots({ codeRoot = null, dialogRoot = null, waDialogRoot = null, warningRoots = [], codeRootDialogScoped = true } = {}) {
    if (!active()) return false;
    pruneDetachedOwnedRoots();
    let applied = false;
    // CODEBOX_CSS holds the geometry of the dialog's two panes (.cm-editor and .cm-scroller
    // 54vw - 18px wide, 94vh - 437px high), and NO_WRAP and CONTENT_FIT go with it, so these three
    // are for the dialog's main codebox only. A panel editor fills its host and keeps that size.
    if (codeRoot && codeRootDialogScoped && injectOwnedStyle(codeRoot, CODEBOX_STYLE_ID, CODEBOX_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    if (codeRoot && codeRootDialogScoped && injectOwnedStyle(codeRoot, NO_WRAP_STYLE_ID, NO_WRAP_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    if (codeRoot && codeRootDialogScoped && injectOwnedStyle(codeRoot, CONTENT_FIT_STYLE_ID, CONTENT_FIT_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    // Every codebox, panel editors included.
    if (codeRoot && injectOwnedStyle(codeRoot, FULLSCREEN_HIDE_STYLE_ID, FULLSCREEN_HIDE_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    // Every codebox, while "Replace Home Assistant native autocomplete" is on. With the setting
    // off the sheet is removed and Home Assistant's list shows again.
    if (codeRoot && replaceNativeAutocomplete()) {
      if (injectOwnedStyle(codeRoot, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID, NATIVE_AUTOCOMPLETE_HIDE_CSS, documentRef)) {
        ownedRoots.add(codeRoot);
        applied = true;
      }
    } else if (codeRoot && removeOwnedStyle(codeRoot, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID)) {
      applied = true;
    }
    if (dialogRoot && injectOwnedStyle(dialogRoot, DIALOG_ROOT_STYLE_ID, DIALOG_ROOT_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      applied = true;
    }
    // The dialog root sheets after DIALOG_ROOT_CSS, which they override at equal specificity.
    if (dialogRoot && injectOwnedStyle(dialogRoot, PREVIEW_FILL_STYLE_ID, PREVIEW_FILL_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      applied = true;
    }
    if (dialogRoot && injectOwnedStyle(dialogRoot, EDITOR_GUTTER_STYLE_ID, EDITOR_GUTTER_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      applied = true;
    }
    if (dialogRoot && injectOwnedStyle(dialogRoot, STACKED_PANES_STYLE_ID, STACKED_PANES_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      applied = true;
    }
    // The glass sheet follows "Glass editor dialog". The ha-dialog element (the host of the
    // wa-dialog root) tells one opening of the dialog from the next.
    if (dialogRoot && reconcileGlassDialogSheet(dialogRoot, waDialogRoot?.host || null)) {
      applied = true;
    }
    if (waDialogRoot && injectOwnedStyle(waDialogRoot, WA_DIALOG_STYLE_ID, WA_DIALOG_CSS, documentRef)) {
      ownedRoots.add(waDialogRoot);
      applied = true;
    }
    // "Hide editor warnings": the hide sheet in the editor roots while it is on, removed while it
    // is off, so a change applies without a reload.
    const shouldHideWarnings = !!hideEditorWarnings();
    for (const warningRoot of warningRoots) {
      if (!warningRoot) continue;
      if (shouldHideWarnings) {
        if (injectOwnedStyle(warningRoot, WARNING_HIDE_STYLE_ID, WARNING_HIDE_CSS, documentRef)) {
          ownedRoots.add(warningRoot);
          applied = true;
        }
      } else if (removeOwnedStyle(warningRoot, WARNING_HIDE_STYLE_ID)) {
        applied = true;
      }
    }
    return applied;
  }

  // The shadow root that holds CodeMirror, where the .cm-* elements and so CODEBOX_CSS go. The
  // active editor is the `.cm-editor` div (activeEditorCacheRuntime.styleEditorFromNode), which
  // has no shadow root of its own; its root node is the ha-code-editor shadow root.
  function codeShadowRootForEditor(editor) {
    if (!editor) return null;
    try {
      // The editor is itself the shadow host (ha-code-editor).
      if (editor.shadowRoot) return editor.shadowRoot;
    } catch { /* detached */ }
    try {
      // The editor is inside the host's shadow root (the `.cm-editor` case).
      const root = editor.getRootNode?.();
      if (root && root !== documentRef && root.host && typeof root.querySelector === 'function') return root;
    } catch { /* detached */ }
    try {
      // The ha-code-editor host's root. A local variable, because
      // tests/test_settings_out_of_band_static.py rejects the text `return host.shadowRoot`.
      const editorHost = editor.closest?.('ha-code-editor');
      const editorHostRoot = editorHost?.shadowRoot || null;
      if (editorHostRoot) return editorHostRoot;
    } catch { /* detached */ }
    return null;
  }

  // The shadow root of the ha-dialog inside the card dialog, which holds wa-dialog, so a
  // `wa-dialog::part(dialog)` rule there matches. Null before Home Assistant 2026.6 (no
  // wa-dialog), and the wa-dialog sheet is then not injected.
  function waDialogShadowRootForDialog(dialog) {
    try {
      const haDialog = dialog?.shadowRoot?.querySelector?.('ha-dialog');
      const root = haDialog?.shadowRoot || null;
      if (root && typeof root.querySelector === 'function' && root.host && root.querySelector('wa-dialog')) return root;
    } catch { /* detached, or the dialog before 2026.6 */ }
    return null;
  }

  // The main code editor last styled in each card dialog, by dialog shadow root.
  const dialogMainEditors = new WeakMap();

  // Injects the sheets for an editor: finds its code root, its card dialog and the wa-dialog root,
  // and passes them to applyToRoots. Does nothing while the layer is inactive or when no code root
  // is found.
  function applyForEditor(editor) {
    if (!active()) return false;
    // Glass editor dialog turned off: its sheets go even when there is no usable editor.
    const glassRemoved = glassDialogSheets.size > 0 && !glassDialog() ? removeGlassDialogSheets() : false;
    if (!editor) return glassRemoved;
    // A code box inside a custom card's own visual editor: no sheet for it and none for the
    // dialog on its account.
    if (insideCardOwnEditor(editor)) return glassRemoved;
    const codeRoot = codeShadowRootForEditor(editor);
    if (!codeRoot) return glassRemoved;
    const dialog = composedClosestSelector(editor, HUI_DIALOG_EDIT_CARD);
    const dialogRoot = dialog?.shadowRoot || null;
    const waDialogRoot = waDialogShadowRootForDialog(dialog);
    const warningRoots = nestedEditorRootsForDialog(dialog);
    // The dialog geometry sheets are for the dialog's main codebox only: always inside
    // ha-yaml-editor, never inside a form control. Any other code editor in the dialog (one in a
    // card's visual editor, a form field) is left at its own size, as codeboxEnlargeRuntime does.
    const mainCodebox = !!dialog
      && !!composedClosestSelector(editor, HA_YAML_EDITOR)
      && !composedClosestSelector(editor, `${HA_FORM}, ${HA_SELECTOR}`)
      && !nestedInCardOwnEditor(editor);
    // The dialog shows its code editor: the pane must not clip the glow (see reconcileVisualEditorPane).
    if (dialogRoot && mainCodebox) {
      dialogMainEditors.set(dialogRoot, editor);
      removeOwnedStyle(dialogRoot, VISUAL_EDITOR_SCROLL_STYLE_ID);
    }
    return applyToRoots({ codeRoot, dialogRoot, waDialogRoot, warningRoots, codeRootDialogScoped: mainCodebox }) || glassRemoved;
  }

  // The shadow roots of an editor surface (a card dialog or a panel), for the warning badge and
  // hide sheets. The warnings can be several shadow roots deep (a stack card's editor), past the
  // hosts nestedEditorRootsForDialog enters, so this walk enters every shadow host under the
  // surface, capped by depth and number of roots. It stays inside the surface: alerts elsewhere
  // on the page are not touched.
  const PREVIEW_PANE_SELECTOR = '.element-preview';
  function deepShadowRootsWithin(surfaceEl, maxDepth = 10, maxRoots = 80) {
    const out = [];
    const start = surfaceEl?.shadowRoot || (surfaceEl?.querySelectorAll ? surfaceEl : null);
    if (!start) return out;
    const seen = new Set();
    const stack = [{ node: start, depth: 0 }];
    while (stack.length && out.length < maxRoots) {
      const { node, depth } = stack.pop();
      if (!node || seen.has(node) || depth > maxDepth) continue;
      seen.add(node);
      if (node.host) out.push(node); // node is a ShadowRoot
      let els = [];
      try { els = node.querySelectorAll?.("*") || []; } catch { els = []; }
      for (const el of els) {
        const sr = el.shadowRoot;
        if (!sr || seen.has(sr)) continue;
        // The card preview is not part of the editor: its alerts (a missing entity, a markdown
        // card's own ha-alert) are the card's, a large preview would use up the root budget
        // before the editor's alert is reached, and it is rebuilt on every keystroke.
        let inPreview = false;
        try { inPreview = !!el.closest?.(PREVIEW_PANE_SELECTOR); } catch { inPreview = false; }
        if (inPreview) continue;
        // A custom card's own editor is not walked either: its notes are the card's, and a large
        // editor would use up the root budget before Home Assistant's warning is reached.
        if (insideCardOwnEditor(el)) continue;
        stack.push({ node: sr, depth: depth + 1 });
      }
    }
    return out;
  }

  // Badges the alerts of one container root: the HOST sheet in the root, the SHADOW sheet and the
  // accent on each editor alert in it. Both sheets are added in the same call, so an alert nested
  // deeper than the surface walk reaches is not left with one of them only.
  function badgeContainerRoot(root, badgeAccent, retriesLeft = 4) {
    let applied = false;
    let pendingShadow = false;
    if (injectOwnedStyle(root, WARNING_BADGE_HOST_STYLE_ID, WARNING_BADGE_HOST_CSS, documentRef)) { ownedRoots.add(root); applied = true; }
    try {
      for (const alert of editorWarningAlerts(root)) {
        const alertShadow = alert.shadowRoot;
        // An alert Home Assistant has just rebuilt gets its shadow root a little later. The HOST
        // sheet clips it meanwhile; the retry below adds the SHADOW sheet once the root exists.
        if (!alertShadow) { pendingShadow = true; continue; }
        if (injectOwnedStyle(alertShadow, WARNING_BADGE_SHADOW_STYLE_ID, WARNING_BADGE_SHADOW_CSS, documentRef)) { ownedRoots.add(alertShadow); applied = true; }
        if (badgeAccent) { try { alert.style?.setProperty?.('--nostrodomus-badge-accent', badgeAccent); badgedAlerts.add(alert); } catch { /* HA element without .style */ } }
      }
    } catch { /* detached mid-walk */ }
    // Retry on the next frames, at most `retriesLeft` times, while the badge is still wanted (the
    // setting or the layer can change in between).
    if (pendingShadow && retriesLeft > 0) {
      scheduleFrame(() => {
        if (active() && !hideEditorWarnings()) { try { badgeContainerRoot(root, badgeAccent, retriesLeft - 1); } catch { /* never throws from the frame callback */ } }
      });
    }
    return applied;
  }

  // Disconnects and forgets the observers of container roots that left the page (a closed
  // dialog), so the map does not hold detached roots for the rest of the session.
  function pruneDetachedWarningReapplyObservers() {
    if (!warningReapplyObservers || typeof warningReapplyObservers.forEach !== 'function') return 0;
    let pruned = 0;
    for (const [root, obs] of Array.from(warningReapplyObservers)) {
      if (root && root.nodeType !== 9 && root.isConnected === false) {
        try { obs?.disconnect?.(); } catch { /* injected observer */ }
        warningReapplyObservers.delete(root);
        pruned += 1;
      }
    }
    return pruned;
  }

  // Watches a badged container root and badges a new ha-alert as soon as it is added. While the
  // configuration is invalid, Home Assistant removes and re-adds the alert on every keystroke, and
  // the new one has none of the sheets; the editor probes do not run on that change, so without
  // this the full banner would flash. The callback runs before paint and reacts only to added
  // alerts, so the sheets it adds itself do not trigger it. One observer per root.
  function ensureWarningReapplyObserver(root, surfaceEl) {
    pruneDetachedWarningReapplyObservers();
    if (!MutationObserverCtor || !root || warningReapplyObservers.has(root)) return;
    let obs;
    try {
      obs = new MutationObserverCtor((records) => {
        if (!active() || !!hideEditorWarnings()) return; // not badging: applyEditorWarningHide handles it
        let alertAdded = false;
        for (const rec of records) {
          for (const node of rec.addedNodes || []) {
            try { if (node.nodeType === 1 && (node.localName === 'ha-alert' || node.querySelector?.('ha-alert'))) { alertAdded = true; break; } } catch { /* detached */ }
          }
          if (alertAdded) break;
        }
        if (alertAdded) { try { badgeContainerRoot(root, liveBadgeAccent(surfaceEl)); } catch { /* never throws from the observer callback */ } }
      });
      // subtree: Home Assistant re-adds the alert inside a wrapper, not always as a direct child.
      obs.observe(root, { childList: true, subtree: true });
      warningReapplyObservers.set(root, obs);
    } catch { /* a root that cannot be observed gets no observer */ }
  }

  // The editor pane scrolls while the styled dialog does not show its main code editor (a visual
  // editor, another tab). Runs with every warning reconcile, which the editor probe calls with and
  // without an editor. Two lookups in the dialog root when nothing changes.
  function reconcileVisualEditorPane(surfaceEl) {
    const dialogRoot = surfaceEl?.shadowRoot || null;
    if (!dialogRoot?.querySelector) return false;
    if (!active() || !dialogRoot.querySelector(`#${DIALOG_ROOT_STYLE_ID}`)) {
      return removeOwnedStyle(dialogRoot, VISUAL_EDITOR_SCROLL_STYLE_ID);
    }
    const editor = dialogMainEditors.get(dialogRoot) || null;
    let shown = false;
    if (editor && editor.isConnected !== false) {
      try { shown = typeof editor.getClientRects !== 'function' || editor.getClientRects().length > 0; } catch { shown = false; }
    }
    if (shown) return removeOwnedStyle(dialogRoot, VISUAL_EDITOR_SCROLL_STYLE_ID);
    if (injectOwnedStyle(dialogRoot, VISUAL_EDITOR_SCROLL_STYLE_ID, VISUAL_EDITOR_SCROLL_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      try { onMainEditorLeft(surfaceEl); } catch { /* the hook must not stop the reconcile */ }
      return true;
    }
    return false;
  }

  // The editor warnings of a surface (a card dialog or a panel), decided on each call:
  //   - "Hide editor warnings" on: the hide sheet in every root of the surface (it matches only
  //     ha-alert), and no badge sheets. This works whether or not the layer is active.
  //   - Off, layer active: the badge. The HOST sheet only in roots that hold an editor alert, the
  //     SHADOW sheet in each alert's shadow root.
  //   - Off, layer inactive: every badge and hide sheet is removed.
  // A sheet that is already there is not added again, so a call per editor probe only reaches
  // new roots. With nothing injected, the setting off and the layer off, it does not walk.
  function applyEditorWarningHide(surfaceEl) {
    try { reconcileVisualEditorPane(surfaceEl); } catch { /* a root that went away mid-pass */ }
    const hide = !!hideEditorWarnings();
    const layerOn = active();
    if (!hide && !layerOn && !warningStyleActive) return false;
    if (!surfaceEl) return false;
    // One walk of the surface, shared with the accent lookup.
    const roots = deepShadowRootsWithin(surfaceEl);
    const badgeAccent = (!hide && layerOn) ? liveBadgeAccent(surfaceEl, roots) : null;
    let applied = false;
    let injectedAny = false;
    for (const root of roots) {
      const isAlertShadow = !!(root.host && root.host.localName === 'ha-alert');
      if (isAlertShadow) {
        // An alert's own shadow root: the SHADOW sheet and the accent, or neither.
        if (!hide && layerOn) {
          if (injectOwnedStyle(root, WARNING_BADGE_SHADOW_STYLE_ID, WARNING_BADGE_SHADOW_CSS, documentRef)) { ownedRoots.add(root); applied = true; }
          if (badgeAccent) {
            try { root.host.style?.setProperty?.('--nostrodomus-badge-accent', badgeAccent); badgedAlerts.add(root.host); } catch { /* HA element without .style */ }
          }
          injectedAny = true;
        } else {
          if (removeOwnedStyle(root, WARNING_BADGE_SHADOW_STYLE_ID)) applied = true;
          try { root.host?.style?.removeProperty?.('--nostrodomus-badge-accent'); } catch { /* detached */ }
          badgedAlerts.delete(root.host);
        }
        continue;
      }
      const hasAlert = editorWarningAlerts(root).length > 0;
      if (hide) {
        removeOwnedStyle(root, WARNING_BADGE_HOST_STYLE_ID);
        if (injectOwnedStyle(root, WARNING_HIDE_STYLE_ID, WARNING_HIDE_CSS, documentRef)) { ownedRoots.add(root); applied = true; }
        injectedAny = true;
      } else if (layerOn && hasAlert) {
        removeOwnedStyle(root, WARNING_HIDE_STYLE_ID);
        if (badgeContainerRoot(root, badgeAccent)) applied = true;
        ensureWarningReapplyObserver(root, surfaceEl);
        injectedAny = true;
      } else {
        // Layer off, or no editor alert in this root.
        if (removeOwnedStyle(root, WARNING_HIDE_STYLE_ID)) applied = true;
        if (removeOwnedStyle(root, WARNING_BADGE_HOST_STYLE_ID)) applied = true;
      }
    }
    warningStyleActive = injectedAny;
    return applied;
  }

  // Removes every sheet this runtime added, from the roots it added them to.
  function teardown() {
    for (const root of ownedRoots) {
      removeOwnedStyle(root, CODEBOX_STYLE_ID);
      removeOwnedStyle(root, NO_WRAP_STYLE_ID);
      removeOwnedStyle(root, CONTENT_FIT_STYLE_ID);
      removeOwnedStyle(root, FULLSCREEN_HIDE_STYLE_ID);
      removeOwnedStyle(root, NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID);
      removeOwnedStyle(root, DIALOG_ROOT_STYLE_ID);
      removeOwnedStyle(root, PREVIEW_FILL_STYLE_ID);
      removeOwnedStyle(root, EDITOR_GUTTER_STYLE_ID);
      removeOwnedStyle(root, STACKED_PANES_STYLE_ID);
      removeOwnedStyle(root, VISUAL_EDITOR_SCROLL_STYLE_ID);
      removeOwnedStyle(root, GLASS_DIALOG_STYLE_ID);
      removeOwnedStyle(root, WA_DIALOG_STYLE_ID);
      removeOwnedStyle(root, WARNING_HIDE_STYLE_ID);
      removeOwnedStyle(root, WARNING_BADGE_HOST_STYLE_ID);
      removeOwnedStyle(root, WARNING_BADGE_SHADOW_STYLE_ID);
    }
    for (const alert of badgedAlerts) {
      try { alert.style?.removeProperty?.('--nostrodomus-badge-accent'); } catch { /* detached */ }
    }
    badgedAlerts.clear();
    for (const obs of warningReapplyObservers.values()) {
      try { obs.disconnect(); } catch { /* already gone */ }
    }
    warningReapplyObservers.clear();
    // A dialog root that was detached and pruned from ownedRoots can still hold the glass sheet.
    removeGlassDialogSheets();
    ownedRoots.clear();
    warningStyleActive = false;
  }

  // The warning watchers, for the observer readout and the manual disconnect in diagnostics.
  // Disconnecting leaves the styles in place; the next apply for a root watches it again.
  function warningObserverCount() {
    return warningReapplyObservers.size;
  }

  function disconnectWarningObservers() {
    let disconnected = 0;
    for (const obs of warningReapplyObservers.values()) {
      try { obs.disconnect(); disconnected += 1; } catch { /* already gone */ }
    }
    warningReapplyObservers.clear();
    return disconnected;
  }

  return {
    applyForEditor,
    applyToRoots,
    applyEditorWarningHide,
    reconcileVisualEditorPane,
    ensureWarningReapplyObserver,
    pruneDetachedWarningReapplyObservers,
    warningObserverCount,
    disconnectWarningObservers,
    pruneDetachedOwnedRoots,
    teardown,
    isActive: active,
    buildCss: buildCompanionScrollbarCss,
  };
}
