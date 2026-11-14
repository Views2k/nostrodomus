// Companion scrollbar styling module.
//
// Reproduces v17's two injected scrollbar stylesheets byte-identically (the frozen
// scrollbar_css_byte_identity baseline is the proof) under the same element ids, and
// sources the placement (which roots) from the registry. The CSS keeps v17's
// `--nostrodomus-codebox-scrollbar-*` variable names so a theme can still override them
// (D-THEME-BOUNDARY).
//
// The layer is active by default (`SCROLLBAR_SHIPPED_ACTIVE = true`) and is gated by
// companionLayerActive (force-dormant / external-companion / force-active escape hatch).
// When the gate resolves inactive, applyForEditor is a verified no-op (no DOM write), so a
// dormant install changes nothing user-visible.
//
// The CSS constants between the @gen markers are produced from the frozen companion
// source by tools/absorb (do not hand-edit); the byte-identity test fails if they
// drift by a byte.

import { HA_FORM, HA_SELECTOR, HA_YAML_EDITOR, HUI_DIALOG_EDIT_CARD } from '../editor/haSelectors.js';
import { OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR } from '../editor/overlayRoot.js';
import { companionLayerActive } from './coordinatorRuntime.js';

export const CODEBOX_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style';
export const DIALOG_ROOT_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-dialog-root';
// HA 2026.6: a separate, additive sheet (own id) that sizes the real 2026.6 modal
// surface. The frozen v17 DIALOG_ROOT_CSS sizes via
// `:host` / `ha-dialog` / `--mdc-dialog-*`, but 2026.6's editor dialog is a `wa-dialog`
// (WebAwesome) nested in ha-dialog's shadow, so those selectors/vars reach nothing and
// the dialog stays unsized. This sheet is injected one level deeper (ha-dialog's shadow
// root) so it can target `wa-dialog::part(dialog)` directly. Not part of the v17
// byte-identity baseline (DIALOG_ROOT_CSS is untouched and stays byte-identical).
export const WA_DIALOG_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-wa-dialog';

// A separate, additive sheet (own id) that switches the codebox from v17's wrap design to
// normal code-editor behavior: long lines extend and a horizontal scrollbar appears only when
// needed (a deliberate deviation from v17). The frozen CODEBOX_CSS wraps via
// `.cm-content`/`.cm-line` white-space:pre-wrap + word-break:break-word +
// overflow-wrap:anywhere and caps content at width:100% (which also overshoots CM's gutter in
// the flex scroller, giving the spurious bar on short content). This sheet is injected into the
// CM root after CODEBOX_CSS (later wins at equal specificity), so the frozen v17 bytes are
// untouched (not in buildCompanionScrollbarCss; byte-identity unaffected).
export const NO_WRAP_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-no-wrap';

// A separate, additive sheet (own id) injected into the same code root after CODEBOX_CSS +
// NO_WRAP. The frozen CODEBOX_CSS pins .cm-editor / .cm-scroller to a fixed
// viewport-relative width/min-width/max-width: calc(-18px + 54vw) (the card-dialog 2-pane geometry). In a
// nested visual-editor codebox (or a narrowed window) the actual host is far narrower than 54vw, so the
// min-width:54vw forces the content + its horizontal scrollbar + HA's toolbar to spill ~25px past the host
// on the right. card-config used to clip it; the glow un-clip later revealed it. This sheet refits
// .cm-editor/.cm-scroller to the host width — width:min(100%, calc(-18px+54vw)) so it is value-identical to
// the frozen 54vw in the wide full dialog (no regression) but caps to the host when narrower. Not part of
// the v17 byte-identity baseline (CODEBOX_CSS untouched).
export const CONTENT_FIT_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-content-fit';

// §11.9 new !important — registry-owned external-rule block:
//   Owner:    remove-fullscreen-button (keep find-and-replace, remove only fullscreen).
//   Reason:   HA's ha-code-editor toolbar (in the ha-code-editor shadow root) renders an "Enter fullscreen"
//             button (toggles to "Exit fullscreen"); with the 54vw overflow it also rode outside the frame.
//             CSS can't cross shadow boundaries, so display:none must be injected into the ha-code-editor
//             shadow root. !important wins deterministically over HA's own adopted toolbar styles regardless
//             of cascade order (no host-root sheet can reach here).
//   Removal:  when HA exposes a hide-fullscreen prop/hook.
//   Verify:   the fullscreen button is gone; Undo/Redo/Copy/Find-and-replace remain.
export const FULLSCREEN_HIDE_STYLE_ID = 'nostrodomus-editor-fullscreen-button-hide';

// §11.9 new !important — registry-owned external-rule block:
//   Owner:    kill-native-autocomplete (suppress HA's native suggestion box behind Nostrodomus's pane).
//   Reason:   HA's ha-code-editor (CodeMirror 6) renders its native entity/icon autocomplete as a
//             `.cm-tooltip-autocomplete` tooltip (with a `.cm-completionInfo` detail panel) inside the
//             .cm-editor in the ha-code-editor shadow root. The documented property opt-out
//             (autocompleteEntities/autocompleteIcons=false) is read by HA only at editor init, so flipping
//             it after mount (our suppression path) is ignored and the native box still appears behind
//             Nostrodomus's own pane. A CSS hide is timing-independent and can't reach across the shadow
//             boundary from a host sheet, so display:none must be injected into the code root. !important
//             wins deterministically over CodeMirror's own tooltip styles. Safe: Nostrodomus's pane is
//             `#nostrodomus-completions-root` (a custom div), not a .cm-tooltip-autocomplete, so this never
//             hides our suggestions; other CM tooltips (hover/lint) use `.cm-tooltip` without the
//             -autocomplete class and are untouched.
//   Removal:  when HA honors a runtime autocomplete opt-out.
//   Verify:   no gray native suggestion box appears in any codebox; Nostrodomus's pane still works.
export const NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID = 'nostrodomus-editor-native-autocomplete-hide';

// HA 2026.6: a separate, additive sheet (own id) injected into the dialog shadow root
// after DIALOG_ROOT_CSS. The frozen DIALOG_ROOT_CSS makes
// `.element-preview` a centered flex container; a width-less card (a Sections-view
// `hui-section`, which is built to fill its container) collapses to its min-content width
// as a centered flex item, so the preview renders tiny. This sheet lets a section fill the
// pane. Not part of the v17 byte-identity baseline (DIALOG_ROOT_CSS is untouched).
export const PREVIEW_FILL_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-preview-fill';

// Opt-in toggle (reuses v17's hideWarningsEverywhere mechanism, gated):
// HA renders the editor warning/alert family (the "visual editor is not supported" notice and
// real config-validation errors, e.g. "Expected … received …") inside hui-card-element-editor's
// shadow root, beyond the frozen dialog-root rule's reach (both show `display:inline/flex` with
// the frozen rule active). So this sheet is the only thing that hides them, and it is gated by
// the `style.hideEditorWarnings` setting, default off (a deliberate deviation from v17, which hid
// them unconditionally). Default: warnings visible; on: hidden so they stop overlapping the
// bottom-left editor buttons. Injected into the nested editor roots under v17's exact style id
// (id-level coexistence with a legacy file).
export const WARNING_HIDE_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-warning-hide';

// Warning-badge: the default (toggle off) look for editor warnings — a small (22px) circular icon dot
// pinned top-left, accent-colored to match the codebox frame border (read live into
// --nostrodomus-badge-accent), that reveals the message as a tooltip flyout on hover (opacity/transform
// only, so it stays smooth and deterministic), instead of the full-width banner that ran the length of the
// codebox and overlapped the "Show visual/code editor" buttons. Two sheets, separate roots:
//   HOST   — into the light-DOM root that directly contains the <ha-alert> element. Takes the alert
//            out of normal flow (position:absolute) so it can never reflow/extend the editor body
//            (the "codebox extends way down" glitch) and styles the chip chrome.
//   SHADOW — into the ha-alert's own shadow root. Collapses the internal banner layout to icon-only
//            and reveals the text on host hover.
// Both are important-flag-free, per the no-new-important rule. Cross-tree cascade: for normal
// declarations an outer-tree rule beats an inner-tree rule before specificity is considered, so the HOST
// sheet always wins over the SHADOW sheet on any property they both set. That is why the overflow:hidden
// clip (the yellow-bar safety net) and its hover/focus overflow:visible escape both live in the HOST
// sheet: an inner-tree :host{overflow:visible} cannot un-clip the hover flyout on its own. The SHADOW
// sheet only does work the HOST sheet does not (collapsing the alert's internal banner layout to
// icon-only).
export const WARNING_BADGE_HOST_STYLE_ID = 'nostrodomus-editor-warning-badge-host';
export const WARNING_BADGE_SHADOW_STYLE_ID = 'nostrodomus-editor-warning-badge-shadow';

// Active by default. An external legacy companion or the force-dormant flag still keeps
// this internal layer dormant (companionLayerActive).
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

// HA 2026.6 wa-dialog sizing sheet — NOT @gen / NOT in the v17 byte-identity baseline
// (new 2026.6 compat code; the frozen DIALOG_ROOT_CSS above is untouched). Injected into
// ha-dialog's shadow root (one level deeper than DIALOG_ROOT_CSS) so it can reach the
// real modal surface, wa-dialog's native top-layer `<dialog part="dialog">`.
//
// §11.9 new !important — registry-owned external-rule block:
//   Owner:    companion-dialog-sizing (companion dialog sizing on HA 2026.6).
//   Reason:   WebAwesome's wa-dialog carries a UA/default size on ::part(dialog) —
//             `--width: min(1024px, 95vw, …)` plus a content-driven (auto) height and the
//             native <dialog> UA max-width/max-height. The editor dialog must be
//             98vw × 94vh for the side-by-side editor/preview layout (the same dimensions
//             the frozen v17 DIALOG_ROOT_CSS targeted on the old mdc dialog), so the
//             part's width/height are forced over those defaults.
//   Removal:  drop these !important declarations once HA/WebAwesome exposes a settable
//             sizing hook this layer can use without !important, or once the editor dialog
//             ships at this size natively.
//   Verify:   companion-discovery-path e2e (dialog ≈ 98vw×94vh, panes side-by-side).
export const WA_DIALOG_CSS = `
      wa-dialog::part(dialog) {
        width: 98vw !important;
        max-width: 98vw !important;
        height: 94vh !important;
        max-height: 94vh !important;
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

// Pure: the two stylesheets, byte-identical to v17. The wa-dialog sizing sheet is
// intentionally excluded: it is new 2026.6 compat CSS, not a v17 reproduction, so it
// never enters the byte-identity baseline.
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

// Walk up the composed tree (shadow host chain) to the nearest element matching a
// selector — the getRootNode().host idiom (composedContains), not a wildcard descend.
function composedClosestSelector(node, selector) {
  let n = node;
  while (n) {
    try { if (n.matches?.(selector)) return n; } catch { /* detached */ }
    const root = n.getRootNode?.();
    n = root?.host || n.parentElement || null;
  }
  return null;
}

// Override sheet (NO_WRAP_STYLE_ID): undo v17's wrap so long lines extend with a horizontal
// scrollbar only when needed. Injected after CODEBOX_CSS into the same root, so these win.
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

// Content-fit override (CONTENT_FIT_STYLE_ID): collapse the frozen CODEBOX_CSS fixed 54vw width on
// .cm-editor/.cm-scroller to fit the host, so the content + horizontal scrollbar + toolbar stay inside the
// frame in a nested/narrow codebox. `min(100%, calc(-18px + 54vw))` is value-identical to the frozen
// 54vw-18px when the host is wide (the full card dialog, no regression) and caps to the host width when the
// host is narrower than that (nested visual editor / halved window). min-width:0 overrides the frozen
// min-width:54vw that otherwise forces the overflow. Injected after CODEBOX_CSS + NO_WRAP (later wins at
// equal specificity). .cm-content is left to NO_WRAP (width:max-content) so long lines still scroll
// horizontally inside the now host-fitted scroller, where the scrollbar belongs. Dialog-scoped (the 54vw
// only exists in the dialog inject). Frozen CODEBOX_CSS bytes untouched.
// Also squares the frozen .cm-editor `border-radius: 24px` to 0. The editor's `overflow:hidden` + 24px
// rounding clipped the vertical scrollbar's bottom-right corner, cutting off the down arrow. The visible
// rounded glow frame is the host's ::before (border-radius:22px, unchanged), so the codebox still looks
// rounded; only the inner content box (behind the frame) goes square, un-clipping the arrow.
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
         the width of its host. With the 54vw cap the text was cut off at about half the box. */
      @media (max-width: 999px) {
        .cm-editor,
        .cm-scroller,
        .cm-scroller.ha-scrollbar {
          width: 100% !important;
        }
      }
    `;

// Fullscreen-button hide (FULLSCREEN_HIDE_STYLE_ID): see the §11.9 block at the id declaration. Targets only
// the fullscreen toggle (Enter/Exit) on either host tag (ha-button / ha-icon-button) by aria-label and title,
// so it never touches Undo/Redo/Copy/Find-and-replace. Injected into the code root ungated (covers panel
// editors too). HA's Ctrl+F search is unaffected (only the button goes).
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

// Native-autocomplete hide (NATIVE_AUTOCOMPLETE_HIDE_STYLE_ID): see the §11.9 block at the id declaration.
// Targets only the native completion tooltip + its detail panel, not `.cm-tooltip` in general (hover/lint
// tooltips keep working) and not Nostrodomus's own pane (`#nostrodomus-completions-root`, a div).
// All of these mount inside the ha-code-editor shadow root (the code root this sheet injects into), and HA
// renders the detail panel with its own custom class `completion-info` (not the stock `.cm-completionInfo`),
// so a stock-only rule would leak it to screen (0,0). The list `.cm-tooltip-autocomplete` was already hidden
// (its children — completionIcon/Label/Detail — go with it). Both stock and HA-custom info classes are
// listed so either rendering is covered. Injected into the code root ungated (covers panel editors too).
export const NATIVE_AUTOCOMPLETE_HIDE_CSS = `
      .cm-tooltip.cm-tooltip-autocomplete,
      .cm-tooltip-autocomplete,
      .cm-completionInfo,
      .completion-info {
        display: none !important;
      }
    `;

// §11.9 new !important — registry-owned external-rule block:
//   Owner:    preview-fill + zoom (Sections-view card preview on HA 2026.6).
//   Reason:   The frozen DIALOG_ROOT_CSS sets `.element-preview { display:flex;
//             justify-content:center; align-items:flex-start }`. A `hui-section` /
//             `hui-grid-section` has no intrinsic width (it is built to fill its container),
//             so as a centered flex item it collapses to min-content (~88px). Forcing the
//             section to fill width un-collapses it; `zoom: 1.5` then enlarges the preview
//             ~50%. `zoom` re-lays-out (crisp, unlike a blurry transform:scale) and creates
//             real scrollable overflow. `.element-preview { overflow:auto }` enables that
//             scroll. Normal cards (intrinsic width) are not matched and keep v17's centering.
//             The section is centered with symmetric `margin-left:auto; margin-right:auto`: it
//             cooperates with the frozen container's `justify-content:center` (both split the
//             free space equally) so the card sits in the middle of the pane. The free space
//             exists because HA's own `hui-section` carries a `max-width` (~500px); Nostrodomus
//             does not set that cap, it only stops fighting it.
//   Removal:  drop once the frozen preview layout no longer centers a width-less child, or
//             the zoom factor becomes a user setting.
//   Verify:   a Sections/grid-section preview is ~50% larger, centered in the pane (inner card
//             centerX ≈ pane centerX), fully visible/reachable (not clipped by the zoom),
//             scrollable if it overflows; normal card previews stay centered/unchanged.
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

// §11.9 new !important — registry-owned external-rule block:
//   Owner:    editor-gutter-fix.
//   Reason:   The frozen DIALOG_ROOT_CSS sets `.element-editor.ha-scrollbar { padding-right: 18px }`.
//             That 18px is a right-only gutter beside the styled codebox's scrollbar; it reads as a
//             shaded/overflow strip to the right of the box (outerPaddingRight 18px, rightDelta 18,
//             hit-test lands on div.element-editor.ha-scrollbar). Zeroing only the right / inline-end
//             padding removes the artifact; the codebox simply occupies the freed 18px (layout stable).
//             padding-bottom:12px and all other geometry are left intact. This is an additive override of
//             our own frozen dialog-root rule (the frozen bytes are untouched), injected after
//             DIALOG_ROOT_CSS into the same dialog shadow root, so it is already scoped to the active
//             card-edit dialog that contains a styled codebox (applyForEditor only injects the dialog-root
//             sheets when a codebox codeRoot resolves). Not dashboard-wide.
//   Removal:  drop when the frozen v17 DIALOG_ROOT_CSS right padding is revised.
//   Verify:   geometry probe — outerPaddingRight: 0px, outerPaddingInlineEnd: 0px, rightDelta: 0; the
//             shaded gutter beside the scrollbar is gone; frame/glow/surface/scrollbar/syntax all unchanged.
export const EDITOR_GUTTER_STYLE_ID = 'nostrodomus-editor-v17-2-learned-style-editor-gutter';
const EDITOR_GUTTER_CSS = `
      .element-editor.ha-scrollbar {
        padding-right: 0 !important;
        padding-inline-end: 0 !important;
      }
    `;

// §11.9 new !important — registry-owned external-rule block:
//   Owner:    stacked card dialog (window narrower than 1000px).
//   Reason:   The frozen DIALOG_ROOT_CSS gives .element-editor 54vw and .element-preview
//             44vw - 44px, the widths of the side-by-side layout. Below 1000px Home Assistant
//             stacks the two panes, and each kept its side-by-side width: at 900px the editor
//             pane was 486px and the preview 352px of an 882px dialog. In that layout both
//             panes take the full width, and the preview is as tall as its card instead of
//             a fixed part of the window height (the dialog body scrolls there).
//   Scope:    the media query; nothing changes from 1000px up. The selectors are one class
//             more specific than the frozen ones, so the order of the sheets does not matter.
//   Removal:  drop when the frozen dialog-root sheet is revised to carry its own breakpoint.
//   Verify:   companion-dialog-size e2e at 900px (both panes span the dialog).
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

// §11.9 registry-owned external-rule block (opt-in: style.hideEditorWarnings, default off):
//   Owner:    warning-hide toggle.
//   Reason:   When the user opts in, fully hide the editor warning/alert family. Narrowed to the
//             ha-alert element only — an earlier version also matched the broad, unscoped
//             `[role="alert"]` and `.issue-type.warning` and forced height:0 / max-height:0 /
//             overflow:hidden, which collapsed a structural container in the visual editor (HA's
//             notice wrapper is itself `div[role="alert"]`), re-triggering the "codebox extends way
//             down" glitch on toggle. `display:none` on the precise <ha-alert> host hides it cleanly
//             without collapsing any layout container. Because the default badge sheet already takes
//             ha-alert out of flow (position:absolute), toggling to this display:none causes no reflow.
//   Removal:  drop with the rest of the v17 editor-chrome layer (D-THEME-BOUNDARY), or when a
//             later change replaces this with the grouped per-type warning toggles.
//   Verify:   `style.hideEditorWarnings` on hides the editor alerts; off (default) shows the badge.
export const WARNING_HIDE_CSS = `
      ha-alert {
        display: none !important;
      }
    `;

// Warning-badge HOST sheet (default look, toggle off): a small (22px) accent-colored caution-triangle icon
// pinned top-left with no chrome around it (the dark surface, accent ring and soft glow are removed —
// background:transparent, border:0, box-shadow:none — leaving just the bare icon). The icon color is the
// same accent as the codebox frame border (not orange), published as `--nostrodomus-badge-accent` on the
// alert element at runtime (read live from the codebox's --nostrodomus-codebox-frame-border so it tracks
// the user's hue), with a cyan fallback. Constant size: it never resizes on hover (an earlier
// width/height:auto animation opened differently each time, because height:auto can't animate so it
// snapped, and a resizing trigger made the hover hit-area oscillate). Injected into the light-DOM root that
// contains the <ha-alert>; `:has(> ha-alert)` makes that parent the positioning context. No `!important`
// (outer-tree element selectors beat the alert's inner :host rules for normal declarations).
export const WARNING_BADGE_HOST_CSS = `
      :has(> ha-alert) {
        position: relative;
      }
      ha-alert {
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
        /* SAFETY NET: clip to the 22px dot (see the block comment above this const for the full why).
           overflow hidden makes a half-applied frame (HOST present, SHADOW briefly absent on HA's
           per-keystroke alert rebuild) a benign clipped dot instead of a full-width yellow bar; the
           SHADOW sheet's higher-specificity host overflow-visible rule restores the hover-flyout. */
        overflow: hidden;
        background: transparent;
        border: 0;
        box-shadow: none;
        color: var(--nostrodomus-badge-accent, hsl(198, 90%, 62%));
        cursor: help;
      }
      /* Un-clip on hover/focus so the message flyout (positioned OUTSIDE the 22px dot) can escape.
         This MUST live in the HOST (outer-tree) sheet: for normal declarations the CSS scoping cascade
         lets an outer-tree rule beat an inner-tree one BEFORE specificity, so the SHADOW sheet's
         inner-tree :host overflow:visible can NEVER override the outer ha-alert overflow:hidden (that was
         an earlier mistake that clipped the hover message). :hover/:focus-within raises specificity to
         (0,1,1) over base (0,0,1) within this same outer sheet, so it wins reliably -- and works even if
         the SHADOW sheet is not yet paired. The non-hovered dot keeps overflow:hidden (the yellow-bar
         safety net) for the steady state. Stays important-flag-free (wins by outer-tree + specificity). */
      ha-alert:hover,
      ha-alert:focus-within {
        overflow: visible;
      }
      ha-alert ~ ha-alert {
        top: 38px;
      }
      ha-alert ~ ha-alert ~ ha-alert {
        top: 68px;
      }
    `;

// Warning-badge SHADOW sheet (default look, toggle off). Injected into the ha-alert's own shadow root.
// Collapses the internal banner to just the leading icon (accent-colored, matching the codebox border),
// and reveals the message as a native-style tooltip flyout to the right on hover/focus. The flyout is an
// absolutely-positioned panel anchored to the 22px dot (which is the containing block since :host is
// position:absolute from the host sheet); it animates only opacity + transform (compositor-only, no layout
// thrash, no width/height:auto snap), so it opens the same smooth way every time. `:host`-prefixed
// selectors win same-tree ties without `!important` (even against HA's adoptedStyleSheets). The icon color
// is `currentColor`, inherited from the host's --nostrodomus-badge-accent, so HA's same-color tint no
// longer hides the glyph (the orange-on-orange bug): the dot's surface is dark, the glyph is the accent.
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
      /* Beat HA's same-color icon tint on specificity (HA styles the glyph via adoptedStyleSheets, which
         cascade AFTER our appended <style> at equal specificity — so we win by RAISING specificity, not by
         source order or forced priority). currentColor resolves to the host's --nostrodomus-badge-accent (the
         codebox border color); --icon-primary-color + fill cover whether ha-svg-icon paints via var or currentColor. */
      :host([alert-type]) .issue-type .icon,
      :host([alert-type]) .issue-type .icon ha-svg-icon {
        color: currentColor;
        fill: currentColor;
        --icon-primary-color: currentColor;
      }
      /* The "orange square behind the icon" = HA draws .issue-type::after as a SOLID warning-color box
         (probe: .issue-type element bg is transparent but its ::after bg is rgb(255,166,0)). Clearing the
         ELEMENT background can't touch a pseudo-element — so remove the decorative ::before/::after outright,
         at raised specificity (:host([alert-type]) … beats HA's .issue-type.warning::after), no forced priority. */
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

// Bounded walk: collect the shadow roots of the nested editor hosts under the dialog's own
// shadow root (where the "visual editor not supported" alert lives — inside
// hui-card-element-editor / hui-card-editor, beyond DIALOG_ROOT_CSS's reach). Descends only
// into the registry's known editor-host types (OVERLAY_ROOT_TARGETED_SHADOW_HOST_SELECTOR),
// never a wildcard shadow walk (the no-wildcard law; the same selector codeboxEnlargeRuntime /
// companionSettleRuntime descend). Depth-capped; excludes the top dialog shadow root itself
// (DIALOG_ROOT_CSS already hides alerts there). Reproduces v17 walkRoots, targeted.
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
      if (sr && !seen.has(sr)) { seen.add(sr); roots.push(sr); stack.push({ node: sr, depth: depth + 1 }); }
    }
  }
  return roots;
}

// Warning-badge accent: derive a vivid, fully-opaque accent from the codebox frame-border color so the dot
// matches the border color across the user's customized hue. The border resolves to `hsla(h, s%, 65%, a)`
// (a is low, ~0.42, so used as an icon it would be faint), so we keep the hue+saturation but force a solid,
// legible lightness. Returns null for non-hsl input (frame disabled → rgba fallback, or unparseable), in
// which case the CSS fallback cyan stands. Pure + deterministic (unit-tested).
export function badgeAccentFromBorderColor(borderColor) {
  if (typeof borderColor !== 'string') return null;
  const m = borderColor.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*[\d.]+%/i);
  if (!m) return null;
  const h = Math.round(parseFloat(m[1]));
  const s = Math.min(100, Math.max(0, Math.round(parseFloat(m[2]))));
  if (!Number.isFinite(h) || !Number.isFinite(s)) return null;
  return `hsl(${h}, ${s}%, 62%)`;
}

// First-injector-wins: skip if the id already exists in this root (an external file
// or a prior internal apply owns it). Returns true only when THIS call created it.
function injectOwnedStyle(root, id, css, documentRef) {
  if (!root?.querySelector || !documentRef?.createElement) return false;
  if (root.querySelector(`#${id}`)) return false; // already owned — first-injector-wins
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
export function createScrollbarStyleRuntime(deps = {}) {
  const {
    globalRef = globalThis,
    storage,
    documentRef = safeDocument(globalRef),
    // Test seam: override the active() predicate; defaults to the shared gate.
    isActive,
    // Opt-in "Hide editor warnings" (style.hideEditorWarnings). Default OFF: warnings visible.
    // Re-read on each apply, so a settings-toggle change reconciles the nested hide sheet.
    hideEditorWarnings = () => false,
    replaceNativeAutocomplete = () => true,
    // Test seam: the MutationObserver ctor used to re-apply the warning badge when HA rebuilds the
    // alert (live config-validation recreates the ha-alert + drops our sheets on every keystroke).
    MutationObserver: MutationObserverCtor = globalRef?.MutationObserver,
    // Test seam: schedules the bounded SHADOW-sheet re-pair retry (a freshly HA-rebuilt alert attaches
    // its shadow root a frame later). Defaults to rAF; falls back to setTimeout/queueMicrotask.
    requestAnimationFrame: rafDep = globalRef?.requestAnimationFrame?.bind?.(globalRef),
  } = deps;

  function scheduleFrame(fn) {
    try {
      if (typeof rafDep === 'function') return rafDep(fn);
      const st = globalRef?.setTimeout?.bind?.(globalRef);
      if (st) return st(fn, 16);
      if (typeof queueMicrotask === 'function') return queueMicrotask(fn);
    } catch { /* no scheduler in this environment → skip the retry (the overflow:hidden net still holds) */ }
    return undefined;
  }

  const ownedRoots = new Set();
  // Re-apply watchers: containerShadowRoot -> MutationObserver. HA rebuilds a card's validation
  // alert (and wipes our injected sheets) on every keystroke; the watcher re-badges the new alert
  // the instant it is re-added, so the badge never flickers back to HA's full native banner.
  const warningReapplyObservers = new Map();
  // WARNING-BADGE/HIDE: whether any surface-wide warning sheet (badge or hide) is currently injected.
  // Lets the fully-dormant path (companion off, toggle off, never injected) skip the deep walk entirely.
  let warningStyleActive = false;
  // ha-alert elements we set the inline --nostrodomus-badge-accent on, so teardown can clear it.
  const badgedAlerts = new Set();

  function active() {
    if (typeof isActive === 'function') return !!isActive();
    return companionLayerActive({ globalRef, storage, shippedDefault: SCROLLBAR_SHIPPED_ACTIVE });
  }

  // Read the LIVE codebox frame-border color from a styled ha-code-editor in the surface and derive the
  // badge accent (so the dot matches the user's actual border hue, not a hardcoded cyan). Bounded, fully
  // guarded: getComputedStyle is absent in the headless test runtime (returns null → CSS fallback stands),
  // and any cross-root / detached read fails closed. Returns an `hsl(...)` string or null.
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
    } catch { /* fail closed → CSS fallback */ }
    return null;
  }

  // Inject into explicit roots: the codebox shadow root, the dialog (hui-dialog-edit-card)
  // shadow root, and — on HA 2026.6 — the ha-dialog shadow root that hosts wa-dialog.
  // Drop shadow roots / badged alert hosts that have left the DOM (a closed editor dialog) from the
  // owned-style registries so a long session that opens and closes many dialogs doesn't accumulate
  // detached roots (a leak: these Sets were only walked on teardown). A detached root took its styles
  // with it, so it needs no removeOwnedStyle. document (nodeType 9) is never pruned.
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

  function applyToRoots({ codeRoot = null, dialogRoot = null, waDialogRoot = null, warningRoots = [], codeRootDialogScoped = true } = {}) {
    if (!active()) return false;
    pruneDetachedOwnedRoots();
    let applied = false;
    // The frozen v17 CODEBOX_CSS encodes the card-edit dialog's absolute geometry —
    // `.cm-editor`/`.cm-scroller { width: calc(-18px + 54vw); height: calc(94vh - 437px) }` —
    // sized for the dialog's 2-pane (YAML + preview) split. On a non-dialog panel editor
    // (Dev Tools, dashboard raw config, automation/script YAML), which already fills its host
    // and has no preview pane, that geometry squishes the editor to ~54vw of the viewport. So the
    // dialog-geometry code-root sheets (CODEBOX_CSS and the NO_WRAP override that pairs with it)
    // are injected only in the card-dialog context. On a panel editor the host's native full-width
    // geometry stands and main's decorative chrome still applies via discovery. Byte-frozen CSS
    // untouched; no competing override sheet stacked.
    if (codeRoot && codeRootDialogScoped && injectOwnedStyle(codeRoot, CODEBOX_STYLE_ID, CODEBOX_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    // Injected AFTER CODEBOX_CSS into the same root so the no-wrap overrides win (later at
    // equal specificity). Separate id; first-injector-wins; the frozen CODEBOX_CSS is untouched.
    if (codeRoot && codeRootDialogScoped && injectOwnedStyle(codeRoot, NO_WRAP_STYLE_ID, NO_WRAP_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    // Content-fit: refit the dialog's fixed 54vw codebox content to the host width so the scrollbar + text
    // stay inside the frame in a nested/narrow codebox. Injected AFTER CODEBOX_CSS + NO_WRAP (later wins).
    // Dialog-scoped (the 54vw only exists in the dialog inject); value-identical to 54vw in the wide dialog.
    if (codeRoot && codeRootDialogScoped && injectOwnedStyle(codeRoot, CONTENT_FIT_STYLE_ID, CONTENT_FIT_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    // Fullscreen-button hide: ungated (every codebox, panels too). The toolbar lives in the ha-code-editor
    // shadow root (= codeRoot), beyond any host-root sheet's reach. Removes only the fullscreen toggle.
    if (codeRoot && injectOwnedStyle(codeRoot, FULLSCREEN_HIDE_STYLE_ID, FULLSCREEN_HIDE_CSS, documentRef)) {
      ownedRoots.add(codeRoot);
      applied = true;
    }
    // Native-autocomplete hide: ungated (every codebox, panels too). HA's CM6 native entity/icon dropdown
    // renders inside .cm-editor in the code root, beyond a host sheet's reach. Hides only the autocomplete
    // tooltip, never Nostrodomus's own pane or other CM tooltips. Property opt-out is read only at init, so
    // this CSS hide is the reliable kill.
    // It follows the "Replace Home Assistant native autocomplete" setting: with the setting off the
    // sheet is removed, so the native list is visible again.
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
    // Additive: section preview-fill into the SAME dialog root, AFTER DIALOG_ROOT_CSS (later →
    // wins at equal specificity). Separate id; first-injector-wins; frozen bytes untouched.
    if (dialogRoot && injectOwnedStyle(dialogRoot, PREVIEW_FILL_STYLE_ID, PREVIEW_FILL_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      applied = true;
    }
    // Additive: zero the frozen DIALOG_ROOT_CSS right-only gutter on .element-editor.ha-scrollbar (the
    // shaded strip beside the codebox scrollbar). Same dialog root, AFTER DIALOG_ROOT_CSS (later → wins).
    if (dialogRoot && injectOwnedStyle(dialogRoot, EDITOR_GUTTER_STYLE_ID, EDITOR_GUTTER_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      applied = true;
    }
    // Additive: full-width panes while the dialog stacks them (below 1000px).
    if (dialogRoot && injectOwnedStyle(dialogRoot, STACKED_PANES_STYLE_ID, STACKED_PANES_CSS, documentRef)) {
      ownedRoots.add(dialogRoot);
      applied = true;
    }
    if (waDialogRoot && injectOwnedStyle(waDialogRoot, WA_DIALOG_STYLE_ID, WA_DIALOG_CSS, documentRef)) {
      ownedRoots.add(waDialogRoot);
      applied = true;
    }
    // Opt-in: warning-hide into the nested editor shadow roots (where HA renders the editor
    // alert family — the dialog-root DIALOG_ROOT_CSS rule can't reach them). Reconciled each
    // apply against the live setting: inject when the toggle is ON, remove when OFF (default),
    // so flipping `style.hideEditorWarnings` (which re-applies via scheduleCodeboxStyleReapply)
    // shows/hides them without a reload.
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

  // Resolve the shadow root that HOSTS CodeMirror — the styled .cm-* elements live
  // there, so CODEBOX_CSS must be injected into it. The active editor in this codebase is
  // the `.cm-editor` div (activeEditorCacheRuntime.styleEditorFromNode normalizes every
  // candidate to `.cm-editor`), which is not a shadow host: it has no `.shadowRoot`, and its
  // getRootNode() is the ha-code-editor shadow root, so resolving by `editor.shadowRoot`
  // alone would never match for `.cm-editor`.
  function codeShadowRootForEditor(editor) {
    if (!editor) return null;
    try {
      // editor is itself the shadow host (e.g. ha-code-editor).
      if (editor.shadowRoot) return editor.shadowRoot;
    } catch { /* detached */ }
    try {
      // editor is a node inside the host's shadow root (the `.cm-editor` case): its
      // root node is that shadow root (a ShadowRoot has `.host`).
      const root = editor.getRootNode?.();
      if (root && root !== documentRef && root.host && typeof root.querySelector === 'function') return root;
    } catch { /* detached */ }
    try {
      // last resort: resolve the ha-code-editor host explicitly and use its root.
      // (Return a local, never the literal `return host.shadowRoot`, which a settings-
      // overlay regression guard, test_settings_out_of_band_static, forbids in dist.)
      const editorHost = editor.closest?.('ha-code-editor');
      const editorHostRoot = editorHost?.shadowRoot || null;
      if (editorHostRoot) return editorHostRoot;
    } catch { /* detached */ }
    return null;
  }

  // Resolve the ha-dialog shadow root NESTED inside the hui-dialog-edit-card dialog —
  // the scope that CONTAINS wa-dialog, so a `wa-dialog::part(dialog)` rule there actually
  // matches (HA 2026.6). Returns null pre-2026.6 (no ha-dialog / no wa-dialog), so the
  // wa-dialog sheet is simply not injected and nothing changes on older HA. Bounded:
  // one querySelector for ha-dialog in the dialog's own shadow root, no wildcard walk.
  function waDialogShadowRootForDialog(dialog) {
    try {
      const haDialog = dialog?.shadowRoot?.querySelector?.('ha-dialog');
      const root = haDialog?.shadowRoot || null;
      if (root && typeof root.querySelector === 'function' && root.host && root.querySelector('wa-dialog')) return root;
    } catch { /* detached / pre-2026.6 shape */ }
    return null;
  }

  // The editor-ready hook: derive the codebox shadow root (the CodeMirror host root), the
  // dialog root (composed walk-up), and the ha-dialog shadow root (for wa-dialog sizing on
  // 2026.6) from whatever editor node the caller passes, then inject. No-op while inactive
  // or when no CodeMirror root resolves.
  function applyForEditor(editor) {
    if (!active() || !editor) return false;
    const codeRoot = codeShadowRootForEditor(editor);
    if (!codeRoot) return false;
    const dialog = composedClosestSelector(editor, HUI_DIALOG_EDIT_CARD);
    const dialogRoot = dialog?.shadowRoot || null;
    const waDialogRoot = waDialogShadowRootForDialog(dialog);
    const warningRoots = nestedEditorRootsForDialog(dialog);
    // CODEBOX_CSS / NO_WRAP carry the dialog's 54vw/94vh geometry — only inject them into the
    // code root when this editor actually lives in the card-edit dialog (Issue #1). A panel
    // editor (no HUI_DIALOG_EDIT_CARD ancestor) keeps its native full-width geometry.
    // Inside the dialog that geometry is the main codebox's only. The main editor is always
    // wrapped in ha-yaml-editor and never inside a form control; any other editor there (a code
    // editor a custom card puts in its visual editor, a field of a form) is left alone by the
    // sizing layer (codeboxEnlargeRuntime, same rule), and these sheets forced it to the size of
    // the main codebox.
    const mainCodebox = !!dialog
      && !!composedClosestSelector(editor, HA_YAML_EDITOR)
      && !composedClosestSelector(editor, `${HA_FORM}, ${HA_SELECTOR}`);
    return applyToRoots({ codeRoot, dialogRoot, waDialogRoot, warningRoots, codeRootDialogScoped: mainCodebox });
  }

  // Warning badge/hide: reach HA's editor warnings (ha-alert) across an entire editor surface (a
  // card-edit dialog or a panel), not just the CodeMirror nested roots, so it covers the visual editor
  // (no CodeMirror there) and all screens. The warning is an ha-alert buried in nested card-editor /
  // stacked-card-editor shadows, which the allowlist walk in nestedEditorRootsForDialog stops short of;
  // this is a generic bounded shadow walk (descend all hosts, depth/root capped) that reaches it. CSS
  // can't cross shadow boundaries, so the sheets are injected per-root within the surface, never
  // document-wide, so ha-alerts elsewhere are untouched.
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
        // card's own ha-alert) are the card's, and a large preview used up the root budget before
        // the editor's alert was reached. It is also rebuilt on every keystroke.
        let inPreview = false;
        try { inPreview = !!el.closest?.(PREVIEW_PANE_SELECTOR); } catch { inPreview = false; }
        if (!inPreview) stack.push({ node: sr, depth: depth + 1 });
      }
    }
    return out;
  }

  // Surface-wide warning reconcile. Three states, decided per call:
  //   • hideEditorWarnings on  → hide: `display:none` on the precise <ha-alert> host. The narrowed
  //     sheet is sprayed into every non-alert-shadow root (inert where there is no ha-alert), which
  //     keeps the toggle's reconcile observable and cannot collapse a structural [role="alert"]
  //     container (the "codebox extends down" glitch). Gated solely by the toggle (works regardless
  //     of the companion layer).
  //   • toggle off + companion layer active → badge (the default look): the corner-chip HOST sheet
  //     into only the root(s) that actually contain an <ha-alert> (never the codebox/editor root, so
  //     no blast radius), and the SHADOW sheet into each ha-alert's own shadow root. position:absolute
  //     takes the alert out of flow, so it neither overlaps the editor buttons nor reflows the body.
  //   • toggle off + companion layer inactive → remove everything Nostrodomus injected (leave native).
  // Idempotent (first-injector-wins per root); re-running on each probe only injects newly-mounted
  // roots. `warningStyleActive` lets the fully-dormant default path skip the walk entirely.
  // Badge one container root: the HOST sheet (collapses each contained ha-alert to a 22px corner dot)
  // plus the SHADOW sheet on each alert's own shadow (collapses the internals to a hover-flyout + sizes
  // the icon) plus the live accent. Both halves always land together (see the deeply-nested-alert fix).
  function badgeContainerRoot(root, badgeAccent, retriesLeft = 4) {
    let applied = false;
    let pendingShadow = false;
    if (injectOwnedStyle(root, WARNING_BADGE_HOST_STYLE_ID, WARNING_BADGE_HOST_CSS, documentRef)) { ownedRoots.add(root); applied = true; }
    try {
      for (const alert of root.querySelectorAll('ha-alert')) {
        const alertShadow = alert.shadowRoot;
        // A freshly HA-rebuilt alert attaches its shadow root in a later microtask/frame — so it can be
        // null right when the watcher fires. The HOST sheet already clamps it (safely clipped now), but
        // we must re-pair the SHADOW sheet once the shadow exists, else it stays a bare clipped dot.
        if (!alertShadow) { pendingShadow = true; continue; }
        if (injectOwnedStyle(alertShadow, WARNING_BADGE_SHADOW_STYLE_ID, WARNING_BADGE_SHADOW_CSS, documentRef)) { ownedRoots.add(alertShadow); applied = true; }
        if (badgeAccent) { try { alert.style?.setProperty?.('--nostrodomus-badge-accent', badgeAccent); badgedAlerts.add(alert); } catch { /* HA element without .style */ } }
      }
    } catch { /* detached mid-walk */ }
    // Bounded, fail-dark re-pair retry: re-run once the not-yet-attached shadow root(s) exist. Gated on
    // still-in-badge-state so a toggle/teardown between frames cancels it; capped so it can never spin.
    if (pendingShadow && retriesLeft > 0) {
      scheduleFrame(() => {
        if (active() && !hideEditorWarnings()) { try { badgeContainerRoot(root, badgeAccent, retriesLeft - 1); } catch { /* fail-dark */ } }
      });
    }
    return applied;
  }

  // Watch a badged container root and RE-BADGE the instant HA re-adds an ha-alert. HA live-validates a
  // card on every keystroke by REMOVING + re-ADDING the ha-alert in this (stable) container shadow,
  // which drops our injected sheets → the alert flashes back to HA's full native yellow banner. The
  // current probe triggers don't fire synchronously on that nested childList change, so the badge
  // flickered. This re-applies in the MutationObserver callback (pre-paint), gated to ha-alert
  // ADDITIONS only (our own <style> re-injection adds no ha-alert → no re-entrancy/loop). One observer
  // per root (idempotent); disconnected on teardown. No-op where MutationObserver is unavailable.
  // Drop re-apply observers whose badged container root has left the DOM (a closed card-editor
  // dialog). warningReapplyObservers is a strong Map cleared only on teardown, so without this each
  // dialog open/close left its observer + detached root retained for the session (a leak).
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

  function ensureWarningReapplyObserver(root, surfaceEl) {
    pruneDetachedWarningReapplyObservers();
    if (!MutationObserverCtor || !root || warningReapplyObservers.has(root)) return;
    let obs;
    try {
      obs = new MutationObserverCtor((records) => {
        if (!active() || !!hideEditorWarnings()) return; // not in badge state → main reconcile owns it
        let alertAdded = false;
        for (const rec of records) {
          for (const node of rec.addedNodes || []) {
            try { if (node.nodeType === 1 && (node.localName === 'ha-alert' || node.querySelector?.('ha-alert'))) { alertAdded = true; break; } } catch { /* detached */ }
          }
          if (alertAdded) break;
        }
        if (alertAdded) { try { badgeContainerRoot(root, liveBadgeAccent(surfaceEl)); } catch { /* fail-dark */ } }
      });
      // subtree:true — HA re-adds the rebuilt ha-alert BELOW a wrapper inside this container shadow, not
      // always as a direct child of the root; a childList-only (non-subtree) observe would never fire then.
      // The addedNodes guard in the callback (ha-alert additions only) keeps this from re-entering on our
      // own <style>/attribute writes.
      obs.observe(root, { childList: true, subtree: true });
      warningReapplyObservers.set(root, obs);
    } catch { /* fake/detached root in tests or a hostile node — degrade to no watcher */ }
  }

  function applyEditorWarningHide(surfaceEl) {
    const hide = !!hideEditorWarnings();
    const layerOn = active();
    // Fully dormant (companion off, toggle off, nothing injected) → skip the walk.
    if (!hide && !layerOn && !warningStyleActive) return false;
    if (!surfaceEl) return false;
    // Badge default look: resolve the live accent (codebox border color) once per reconcile.
    // One walk of the surface per reconcile, shared with the accent lookup.
    const roots = deepShadowRootsWithin(surfaceEl);
    const badgeAccent = (!hide && layerOn) ? liveBadgeAccent(surfaceEl, roots) : null;
    let applied = false;
    let injectedAny = false;
    for (const root of roots) {
      const isAlertShadow = !!(root.host && root.host.localName === 'ha-alert');
      if (isAlertShadow) {
        // The ha-alert's OWN shadow root: badge-restyle it (default) or strip the restyle.
        if (!hide && layerOn) {
          if (injectOwnedStyle(root, WARNING_BADGE_SHADOW_STYLE_ID, WARNING_BADGE_SHADOW_CSS, documentRef)) { ownedRoots.add(root); applied = true; }
          // Tint the dot to the live codebox border color (inherits into the shadow for the icon).
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
      let hasAlert = false;
      try { hasAlert = !!root.querySelector?.('ha-alert'); } catch { hasAlert = false; }
      if (hide) {
        // HIDE wins. Spray the narrowed sheet (inert without an ha-alert); drop any badge host sheet.
        removeOwnedStyle(root, WARNING_BADGE_HOST_STYLE_ID);
        if (injectOwnedStyle(root, WARNING_HIDE_STYLE_ID, WARNING_HIDE_CSS, documentRef)) { ownedRoots.add(root); applied = true; }
        injectedAny = true;
      } else if (layerOn && hasAlert) {
        // BADGE (default): corner chip anchored to the alert's wrapper; drop any stale hide sheet.
        // badgeContainerRoot pairs the SHADOW restyle DIRECTLY with the HOST sheet (so a deeply-nested
        // alert past the deep-walk's cap is never HALF-applied), and the watcher re-badges the instant
        // HA rebuilds the alert on a keystroke (live config-validation) so it never flashes the native bar.
        removeOwnedStyle(root, WARNING_HIDE_STYLE_ID);
        if (badgeContainerRoot(root, badgeAccent)) applied = true;
        ensureWarningReapplyObserver(root, surfaceEl);
        injectedAny = true;
      } else {
        // Companion off, or no alert in this root: leave nothing of ours behind.
        if (removeOwnedStyle(root, WARNING_HIDE_STYLE_ID)) applied = true;
        if (removeOwnedStyle(root, WARNING_BADGE_HOST_STYLE_ID)) applied = true;
      }
    }
    warningStyleActive = injectedAny;
    return applied;
  }

  // Remove every stylesheet this runtime created (leaves external-owned ids alone).
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
