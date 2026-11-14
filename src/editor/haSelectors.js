// HA-internal DOM selector registry.
//
// Single source of truth for the Home Assistant / CodeMirror DOM selectors the
// runtime couples to. Every entry is a VERBATIM string previously inlined at a
// call site; callers import from here instead of hand-writing the selector, so
// an HA DOM rename is a one-line change in one file and the treadmill is
// visible. Each export carries a one-line note: what it finds and which
// feature degrades if HA changes it.
//
// Scope: this registry is for RUNTIME DOM COUPLING (querySelector / matches /
// closest / tagName). Selectors embedded in CSS template strings are prose,
// not coupling, and stay where they are. The static guard
// (tests/test_ha_selector_registry_static.py) enforces that the treadmill-
// coupled element patterns (hui-*, ha-panel-*, home-assistant*, non-contracted
// .cm-*) appear only here.
//
// The contracted CodeMirror class set — `.cm-editor`, `.cm-content`,
// `.cm-scroller`, `.cm-line` — is the stable CM6 surface the editor styling
// and syntax contracts already depend on; those four are exempt from the guard
// but still centralized here for single-sourcing.

// --- Home Assistant structural elements ---

/** The HA app shell host; its shadowRoot is the runtime's DOM entry point. Breaks: all editor/dialog detection. */
export const HOME_ASSISTANT = "home-assistant";
/** HA main element under the app shell shadow; a hass-object carrier. Breaks: live runtime data (hass) discovery. */
export const HOME_ASSISTANT_MAIN = "home-assistant-main";
/** Panel resolver under the shell; a hass-object carrier. Breaks: live runtime data discovery on some layouts. */
export const PARTIAL_PANEL_RESOLVER = "partial-panel-resolver";
/** The Lovelace panel; a hass-object carrier. Breaks: live runtime data discovery. */
export const HA_PANEL_LOVELACE = "ha-panel-lovelace";
/** Lovelace dashboard root; a hass-object carrier. Breaks: live runtime data discovery. */
export const HUI_ROOT = "hui-root";
/** The card edit dialog (the editor surface host). Breaks: completion/styling scope — the whole editor feature. */
export const HUI_DIALOG_EDIT_CARD = "hui-dialog-edit-card";
/** 2026.6 dialog body wrapper inside hui-dialog-edit-card's shadow. Breaks: dialog-visible detection on 2026.6. */
export const HA_DIALOG = "ha-dialog";
/** Material-web dialog variant some HA builds use. Breaks: diagnostics editor-traversal coverage. */
export const HA_MD_DIALOG = "ha-md-dialog";
/** HA YAML editor wrapper. Breaks: diagnostics editor-traversal coverage. */
export const HA_YAML_EDITOR = "ha-yaml-editor";
/** A Lovelace view container. Breaks: diagnostics shadow-host traversal. */
export const HUI_VIEW = "hui-view";
/** A Lovelace card container. Breaks: diagnostics shadow-host traversal. */
export const HUI_CARD = "hui-card";
/** Card element-editor host. Breaks: diagnostics shadow-host traversal. */
export const HUI_CARD_ELEMENT_EDITOR = "hui-card-element-editor";
/** Card options-editor host. Breaks: diagnostics shadow-host traversal. */
export const HUI_CARD_OPTIONS_EDITOR = "hui-card-options-editor";
/** Card editor host. Breaks: diagnostics shadow-host traversal. */
export const HUI_CARD_EDITOR = "hui-card-editor";
/** Stack-card editor host (vertical/horizontal/grid stack visual editors nest their sub-card editors
 *  one boundary deeper, through this host). Breaks: codebox discovery reaching a stack sub-card codebox
 *  on open (the editor styles only after a click without this in the traversal allowlist). */
export const HUI_STACK_CARD_EDITOR = "hui-stack-card-editor";
/** HA form element (dashboard-containment traversal host). Breaks: dashboard-CSS containment cleanup coverage. */
export const HA_FORM = "ha-form";
/** HA selector element (containment traversal host). Breaks: dashboard-CSS containment cleanup coverage. */
export const HA_SELECTOR = "ha-selector";
/** HA text field (containment traversal host). Breaks: dashboard-CSS containment cleanup coverage. */
export const HA_TEXTFIELD = "ha-textfield";
/** HA combo box (containment traversal host). Breaks: dashboard-CSS containment cleanup coverage. */
export const HA_COMBO_BOX = "ha-combo-box";
/** 2026.6 inner dialog element inside ha-dialog's shadow. Breaks: dialog-visible detection on 2026.6. */
export const WA_DIALOG = "wa-dialog";
/** Dialog footer (Cancel/Save row) slotted into ha-dialog. Breaks: measured codebox fit falls back to the dialog edge. */
export const HA_DIALOG_FOOTER = "ha-dialog-footer";
/** HA's CodeMirror host element. Breaks: editor detection, codebox styling, completion view binding. */
export const HA_CODE_EDITOR = "ha-code-editor";

// --- Universal codebox surface hosts ---
// Shadow hosts that sit BETWEEN home-assistant-main / ha-panel-lovelace and the
// ha-code-editor on non-card-dialog surfaces. The targeted shadow walk only
// descends into hosts it matches, so without these the bounded walk stops one or
// two hosts short and never reaches the editor (the universal-styling gap).
// Probe-verified host chains (real HA): Dev Tools Template
// (developer-tools-template < ha-panel-developer-tools), dashboard raw config
// (hui-editor < ha-panel-lovelace), automation YAML (ha-automation-editor),
// script YAML (ha-script-editor).
/** Dashboard raw-configuration editor host (Edit dashboard → Raw configuration editor). */
export const HUI_EDITOR = "hui-editor";
/** Settings → Automations YAML-mode editor host. */
export const HA_AUTOMATION_EDITOR = "ha-automation-editor";
/** Settings → Scripts YAML-mode editor host. */
export const HA_SCRIPT_EDITOR = "ha-script-editor";
/** Developer Tools panel host (wraps the per-tab tool components). */
export const HA_PANEL_DEVELOPER_TOOLS = "ha-panel-developer-tools";
/** Developer Tools → Template tool component (probe-verified codebox host). */
export const DEVELOPER_TOOLS_TEMPLATE = "developer-tools-template";
/** Developer Tools → Actions YAML tool component (same panel family; forward coverage). */
export const DEVELOPER_TOOLS_ACTION = "developer-tools-action";
/** Developer Tools → Events YAML tool component (same panel family; forward coverage). */
export const DEVELOPER_TOOLS_EVENT = "developer-tools-event";
// Home Assistant 2026.11 moved Developer Tools under Settings as "Tools" and renamed its elements
// (measured on 2026.11.1: ha-code-editor < tools-template < tools-router < ha-panel-tools <
// ha-panel-config). The action and event names follow the same pattern (forward coverage).
export const HA_PANEL_TOOLS = "ha-panel-tools";
export const TOOLS_TEMPLATE = "tools-template";
export const TOOLS_ACTION = "tools-action";
export const TOOLS_EVENT = "tools-event";

/** The inner YAML-editor wrapper whose shadow DIRECTLY hosts ha-code-editor on panel surfaces
 *  (automation/script): ha-code-editor < ha-yaml-editor. The panel host shadow can't see the
 *  ha-code-editor mount (one boundary deeper). Breaks: sync-on-mount panel detection (open-flash fix). */
export const PANEL_EDITOR_YAML_WRAPPER = "ha-yaml-editor";

// The non-card-dialog editor SURFACE hosts (panels) that may host autocomplete.
// The leak guard for the universal completion gates: a keystroke/view is admitted
// to autocomplete on a panel ONLY when it is inside a real editor surface AND inside one of these
// allowlisted HA-native hosts — never a bare dashboard (no editor surface in the path) and never a
// third-party card (not an allowlisted host). The card-edit dialog keeps its own existing gate.
export const UNIVERSAL_PANEL_HOSTS = [
  HA_PANEL_DEVELOPER_TOOLS,
  DEVELOPER_TOOLS_TEMPLATE,
  DEVELOPER_TOOLS_ACTION,
  DEVELOPER_TOOLS_EVENT,
  HA_PANEL_TOOLS,
  TOOLS_TEMPLATE,
  TOOLS_ACTION,
  TOOLS_EVENT,
  HUI_EDITOR,
  HA_AUTOMATION_EDITOR,
  HA_SCRIPT_EDITOR,
].join(", ");

// Map an allowlisted host tag (the one already matched in the event
// path at view-bind) to a surface id from contextResolver.SURFACES. Pure data — keep the keys in
// lockstep with UNIVERSAL_PANEL_HOSTS and the values in lockstep with SURFACES. The developer-tools
// panel WRAPPER defaults to Template (the dominant tool); when the more-specific inner
// developer-tools-* node is present in the path it is matched first, so the precise surface wins.
export const HOST_TAG_TO_SURFACE = Object.freeze({
  [HA_PANEL_DEVELOPER_TOOLS]: "devtools-template",
  [DEVELOPER_TOOLS_TEMPLATE]: "devtools-template",
  [DEVELOPER_TOOLS_ACTION]: "devtools-action",
  [DEVELOPER_TOOLS_EVENT]: "devtools-action",
  [HA_PANEL_TOOLS]: "devtools-template",
  [TOOLS_TEMPLATE]: "devtools-template",
  [TOOLS_ACTION]: "devtools-action",
  [TOOLS_EVENT]: "devtools-action",
  [HUI_EDITOR]: "raw-dashboard",
  [HA_AUTOMATION_EDITOR]: "automation",
  [HA_SCRIPT_EDITOR]: "script",
});

// The routes that host a YAML or template editor outside the card dialog: an automation or
// script being edited, and the Developer Tools tabs with an editor. The automation and script
// lists, the other Settings pages and the other Developer Tools tabs have none.
const PANEL_EDITOR_ROUTE = /\/config\/(?:automation|script)\/(?:edit|show)\/|\/developer-tools\/(?:template|action|service|event)(?:\/|$)/;

export function isPanelEditorRoute(pathname) {
  return PANEL_EDITOR_ROUTE.test(String(pathname || ""));
}

// The elements of one row of the visual automation or script editor (a trigger, condition,
// action or option row, a script field row) and the sidebar that shows a row's settings. A YAML
// editor inside one of them edits that row, not the whole automation.
export const PANEL_ROW_EDITOR_HOST = /^ha-(?:automation|script)-[a-z-]*(?:row|sidebar)[a-z-]*$/;

/** Map a (case-insensitive) host tag to a surface id; 'unknown' when unrecognized. Pure, fail-dark. */
export function surfaceFromHostTag(tag) {
  const t = typeof tag === "string" ? tag.toLowerCase() : "";
  return HOST_TAG_TO_SURFACE[t] || "unknown";
}

// --- CodeMirror surface (contracted CM6 class set) ---

/** CM editor root. Breaks: editor detection, syntax, completion. */
export const CM_EDITOR = ".cm-editor";
/** CM editable document. Breaks: typing/context extraction, syntax painting. */
export const CM_CONTENT = ".cm-content";
/** CM scroll container. Breaks: popup placement, scrollbar styling. */
export const CM_SCROLLER = ".cm-scroller";
/** CM rendered line. Breaks: per-line syntax token painting. */
/** CM line token spans. Breaks: first-paint span styling and smart-syntax token painting. */
export const CM_LINE_SPAN = ".cm-line span";

// --- HA dialog body / scrollbar surfaces ---

/** Legacy (pre-2026.6) dialog content surface. Breaks: dialog-visible detection on older HA. */
export const HUI_DIALOG_CONTENT = ".content";
/** Dialog body element (2026.6, inside ha-dialog shadow). Breaks: dialog body detection / unclip. */
export const HA_DIALOG_BODY = "div.body";
/** Scrollbar-styled dialog body. Breaks: codebox slot unclip targeting. */
export const HA_DIALOG_BODY_SCROLLBAR = "div.body.ha-scrollbar";

/** The pane of the card dialog that holds the editor (the preview pane is its sibling). */
export const CARD_DIALOG_EDITOR_PANE = ".element-editor";
/** Home Assistant's element editors (hui-card-element-editor, hui-row-element-editor and the like): the host of a card's YAML editor or of its visual editor. Breaks: telling a custom card's own editor from Home Assistant's; the editor-warning badge. */
export const ELEMENT_EDITOR_HOST = /^hui-(?:[a-z0-9]+-)*element-editor$/;
/** The area inside an element editor that holds the editor element a card supplies. Breaks: a custom card's visual editor is treated like any other part of the dialog again. */
export const ELEMENT_EDITOR_CARD_AREA = ".gui-editor";
/** Name prefix of Home Assistant's own dashboard elements, its visual editors included. Breaks: the same rule. */
export const HUI_ELEMENT_PREFIX = "hui-";
/** What Home Assistant itself puts in the card editor area besides the editor element: the Config, Visibility and Layout tab row and the loading placeholder. Breaks: a click on those counts as a click in a custom card's editor (the suggestion list closes, nothing else). */
export const ELEMENT_EDITOR_OWN_CHILDREN = Object.freeze(["ha-tab-group", "ha-fade-in", "ha-spinner", "ha-circular-progress"]);
/**
 * Window widths at which the card dialog stacks the preview under the editor instead of beside it
 * (Home Assistant's own breakpoint). In that layout the dialog body has to scroll, so the rules
 * that stop it from scrolling in the side-by-side layout do not apply.
 */
export const CARD_DIALOG_STACKED_MEDIA = "(max-width: 999px)";

// --- Composite selectors (verbatim, as used at the call sites) ---

/** Editor-surface match used by pathHasEditorSurface. Breaks: scoped-event detection. */
export const CM_EDITOR_SURFACE = ".cm-editor, .cm-content, .cm-line";
/** CM root candidates (overlayRoot active-editor search). Breaks: overlay anchoring. */
export const CM_ROOT_CANDIDATES = ".cm-content, .cm-editor, .cm-scroller";
/** CM tree match (lifecycle sentinel depth-1 closest). Breaks: editor lifecycle detection. */
export const CM_EDITOR_TREE = ".cm-content, .cm-line, .cm-scroller, .cm-editor";
/** The three CM owners (style-ownership isCodeMirrorTarget). Breaks: style isolation checks. */
export const CM_OWNERS = ".cm-editor, .cm-scroller, .cm-content";
/** CM surfaces incl. line (frame containment). Breaks: external-frame containment. */
/** Editor host or CM surface (codebox preflight potential-editor probe). Breaks: codebox preflight. */
/** All editor/dialog lifecycle targets (sentinel isEditorLike). Breaks: editor lifecycle mutation watching. */
export const EDITOR_LIFECYCLE_TARGETS =
  "ha-code-editor, hui-dialog-edit-card, ha-dialog, dialog, .cm-editor, .cm-scroller, .cm-content";
/** CodeMirror containment surfaces incl. internal layers (sentinel editor-descendant match). Breaks: editor mutation containment. */
export const CM_CONTAINMENT_SURFACES =
  ".cm-content, .cm-line, .cm-scroller, .cm-editor, .cm-gutters, .cm-selectionLayer, .cm-cursorLayer, span.cm";

// --- Plain-class substrings (className.includes checks, not selectors) ---

/** className substring for a CM content node (overlay/active-editor scoring). */
export const CM_CONTENT_CLASS = "cm-content";
/** className substring for a CM editor node (overlay/active-editor scoring). */
export const CM_EDITOR_CLASS = "cm-editor";
/** className substring for a CM scroller node (overlay scoring). */
export const CM_SCROLLER_CLASS = "cm-scroller";

// --- Option-tab detection (codebox enlargement classification) ---
// The card editor's Layout/Visibility/Config tab row. Their PRESENCE means a
// "tabbed" editor (shorter codebox); their absence means a "simple" editor (the
// codebox can extend taller). Verbatim from the v17 companion's hasOptionTabs.
// Breaks: the simple-vs-tabbed codebox enlargement classification.
/** Option-tab CONTAINER selectors (a visible one => tabbed editor). */
export const OPTION_TAB_CONTAINERS = '[role="tablist"], ha-tabs, mwc-tab-bar, .mdc-tab-bar, .tabs';
/** Individual option-tab selectors (>=2 visible => tabbed editor). */
export const OPTION_TABS = '[role="tab"], ha-tab, mwc-tab, .mdc-tab';

// --- Picker visual fix targets ---
// The entity-picker / popover / popup surfaces the picker fix styles.
// Verbatim from picker-safe's PICKER_FIX_TARGETS. Breaks: picker glass/transparency
// styling target coverage. The fix's COLLECTION uses a bounded, depth-capped,
// registry-driven traversal — no `querySelectorAll("*")`.
const PICKER_FIX_TARGETS = Object.freeze([
  "ha-picker-combo-box",
  "wa-popover",
  "wa-popup",
  "ha-input-search",
  "ha-input-search wa-input",
  "ha-picker-combo-box ha-combo-box-item",
  "ha-picker-combo-box ha-ripple",
]);
/** Joined selector for the picker-fix targets (collection querySelectorAll). */
export const PICKER_FIX_SELECTOR = PICKER_FIX_TARGETS.join(", ");
/** The picker overlay containers (presence => a picker is open / worth a pass). */

// --- Pseudo-class ---

/** Native top-layer modal match (settings portal dialog finder). Breaks: settings portal mount targeting. */
export const MODAL_PSEUDO = ":modal";
