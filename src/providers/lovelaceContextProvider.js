// Lovelace/YAML context provider module.
// Covers Home Assistant dashboard, automation, script, trigger, condition, and action YAML.

import { LOVELACE_CONTEXT_PROVIDER_ID } from '../core/runtimeConstants.js';
import { normalizeItem } from './staticLibraryProvider.js';
import { surfaceAllows } from './surfaceScope.js';

// Each row's meta.contextKind belongs to one kind of editor. Automation kinds (triggers, action
// steps, the automation and script root keys) are not offered in a dashboard or card editor, and
// dashboard kinds (card keys, tap actions, button-card, style blocks) not in an automation or
// script editor. Shared kinds (condition, which dashboard visibility uses too, target, data,
// confirmation) are offered everywhere. provide() filters the rows only with surface scoping on.
const AUTOMATION_CONTEXT_KINDS = new Set(['trigger', 'automation-action', 'ha-root']);
const LOVELACE_CONTEXT_KINDS = new Set(['lovelace', 'cards', 'entity-row', 'button-card', 'styles', 'css-yaml', 'browser_mod', 'action']);

// The YAML block structure around the cursor, read from the text before the cursor (its last line
// is the cursor line). The YAML path counts the first key of a list item as the parent of the
// item's other keys (a choose option `- conditions: ...` followed by `sequence:` gives the path
// [..., "conditions", "sequence"]), and in compact sequences, where "- " items sit at their key's
// own column, it drops the key (`actions:\n- action: x\n  ` gives ["action"]). Indentation has
// neither problem, so this scan decides which automation rows apply.
//
// A line encloses the lines below it when it is less indented than all of them; a key line also
// encloses "- " items at its own column, and a `- key:` item encloses lines deeper than its key and
// "- " items at its key's column. Like the YAML path, an empty container opener on the line right
// above a cursor line that has no key yet encloses it at its own column (editors put the new line
// at the opener's column). The scan reports:
//   key:        the nearest enclosing block opener (`key:` with nothing after the colon but
//               anchors, !!seq/!!map tags or a comment; the key may be quoted), or "".
//   cursorKeys: the keys already in the mapping the cursor line belongs to (a condition step
//               `- condition: state` puts "condition" here for the lines below it).
//   blockKeys:  the keys of the mapping that holds the opener (`default:` next to `choose:`).
//   outer:      the keys of the enclosing lines further out, nearest first.
//   inScalar:   the cursor is inside the text of a block scalar (`key: |`, `- key: >-`, `- |`).
// Blank lines and comments are skipped. Cost is proportional to the distance to the outermost
// enclosing line.
const BLOCK_OPENER_LINE = /^(["']?)([A-Za-z0-9_-]+)\1[ \t]*:[ \t]*(?:(?:&[^\s#]+|!!(?:seq|map|omap))[ \t]*){0,2}(?:#[\s\S]*)?$/;
const KEY_LINE = /^(["']?)([A-Za-z0-9_$.-]+)\1[ \t]*:(?:[ \t]|$)/;
// A block scalar header: the value after the key's colon (or a key-less "- " item's content),
// with any trailing comment removed, is node properties then | or > with optional indicators.
const BLOCK_SCALAR_VALUE = /^(?:(?:&\S+|!\S*)[ \t]+)*[|>][-+0-9]*$/;
// The YAML path's BLOCK_CONTAINER_KEYS (src/yaml/yamlCompletionContext.js): an empty one of these
// right above a key-less cursor line encloses it at its own column.
const CONTAINER_OPENERS = new Set([
  "data", "service_data", "target", "tap_action", "hold_action", "double_tap_action",
  "triggers", "conditions", "actions", "sequence", "then", "else", "choose", "repeat", "parallel",
  "entities", "cards", "card", "elements", "segments", "sections", "views", "badges", "grid_options",
  "variables", "card_mod", "styles", "browser_mod", "visibility",
]);

function lineIndent(line) {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i += 1;
  return i;
}

function isItemText(rest) {
  return rest[0] === "-" && (rest.length === 1 || rest[1] === " " || rest[1] === "\t");
}

function withoutComment(text) {
  const hash = text.search(/(?:^|[ \t])#/);
  return hash === -1 ? text : text.slice(0, hash);
}

function lineValue(content, keyMatch) {
  return withoutComment(keyMatch ? content.slice(keyMatch[0].length) : content).trim();
}

function enclosingBlock(textBeforeCursor, options = {}) {
  const text = String(textBeforeCursor || "");
  const cursorStart = text.lastIndexOf("\n") + 1;
  const cursorLine = text.slice(cursorStart).replace(/\r$/, "");
  let limit = lineIndent(cursorLine);
  const cursorRest = cursorLine.slice(limit);
  let limitIsItem = isItemText(cursorRest);
  const cursorHasKey = !limitIsItem && (options.cursorLineHasKey === true || KEY_LINE.test(cursorRest));
  const result = { key: "", keyIndent: -1, cursorIndent: limit, inScalar: false, cursorKeys: new Set(), cursorType: "", blockKeys: new Set(), outer: [] };
  let levelKeys = result.cursorKeys;   // keys of the mapping at the current level, while needed
  const addLevelKey = (lineKey, content, keyMatch) => {
    levelKeys.add(lineKey);
    if (levelKeys === result.cursorKeys && lineKey === "type" && !result.cursorType) {
      result.cursorType = lineValue(content, keyMatch).replace(/^["']|["']$/g, "").toLowerCase();
    }
  };
  let found = null;
  let directlyAbove = true;
  let end = cursorStart - 1;           // the "\n" that ends the line above
  while (end >= 0) {
    const prev = end > 0 ? text.lastIndexOf("\n", end - 1) : -1;
    const line = text.slice(prev + 1, end).replace(/\r$/, "");
    end = prev;
    const lineAbove = directlyAbove;
    directlyAbove = false;
    const indent = lineIndent(line);
    const rest = line.slice(indent);
    if (!rest || rest[0] === "#") continue;
    const item = isItemText(rest);
    const content = (item ? rest.slice(1) : rest).trim();
    const keyMatch = KEY_LINE.exec(content);
    const lineKey = keyMatch ? keyMatch[2].toLowerCase() : "";
    const opener = BLOCK_OPENER_LINE.exec(content);
    let encloses = item ? indent < limit : (indent < limit || (indent === limit && limitIsItem));
    if (!encloses && !item && indent === limit && lineAbove && found === null && !limitIsItem && !cursorHasKey
      && opener && CONTAINER_OPENERS.has(opener[2].toLowerCase())) {
      encloses = true;                 // an empty container opener right above, at the cursor's column
    }
    if (!encloses) {
      if (levelKeys && !item && indent === limit && lineKey) addLevelKey(lineKey, content, keyMatch);
      continue;
    }
    const scalarHeader = BLOCK_SCALAR_VALUE.test(lineValue(content, keyMatch));
    if (item) {
      const keyColumn = indent + 1 + lineIndent(rest.slice(1));
      // A key-less scalar item ("- |") holds text from the column after its dash.
      const inside = !keyMatch && scalarHeader ? limit > indent : (limit > keyColumn || (limit === keyColumn && limitIsItem));
      if (inside && scalarHeader) {
        result.inScalar = true;
        return result;
      }
      if (!inside && limit === keyColumn && lineKey && levelKeys) addLevelKey(lineKey, content, keyMatch);
      if (found === null && inside && opener) {
        found = opener[2].toLowerCase();
        result.keyIndent = indent;
        result.blockKeys.add(found);
      } else if (found !== null && lineKey) {
        result.outer.push(lineKey);
      }
      levelKeys = null;
      limit = indent;
      limitIsItem = true;
    } else {
      if (scalarHeader) {
        result.inScalar = true;
        return result;
      }
      if (found === null) {
        found = opener ? opener[2].toLowerCase() : "";
        result.keyIndent = indent;
        if (found) result.blockKeys.add(found);
        levelKeys = result.blockKeys;
      } else {
        if (lineKey) result.outer.push(lineKey);
        levelKeys = null;
      }
      limit = indent;
      limitIsItem = false;
    }
    // Nothing encloses a column-0 key line. A column-0 default: still needs its siblings (choose:).
    if (limit === 0 && !limitIsItem && found !== null && found !== "default") break;
  }
  result.key = found || "";
  return result;
}

export function enclosingBlockKey(textBeforeCursor) {
  const scan = enclosingBlock(textBeforeCursor);
  return scan.inScalar ? "" : scan.key;
}

// The text before the cursor for enclosingBlock: at most ENCLOSING_SCAN_CHARS characters (the
// bound the YAML path uses), starting at a line boundary so a cut line is not read as column 0.
const ENCLOSING_SCAN_CHARS = 24000;

function enclosingScanText(doc, pos) {
  const text = String(doc || "");
  const end = Math.max(0, Math.min(text.length, Number.isFinite(Number(pos)) ? Number(pos) : text.length));
  const start = Math.max(0, end - ENCLOSING_SCAN_CHARS);
  const slice = text.slice(start, end);
  if (start === 0 || text[start - 1] === "\n") return slice;
  const nl = slice.indexOf("\n");
  return nl === -1 ? slice : slice.slice(nl + 1);
}

// The part of an automation (trigger, condition, action) named by the key of the block that
// encloses the cursor. default: is a choose step's default only next to choose:, and and:, or:
// and not: are condition shorthands only inside automation blocks (dashboards use the same words:
// decluttering template defaults, auto-entities filters).
const AUTOMATION_PART_BY_BLOCK = Object.freeze({
  triggers: "trigger",
  wait_for_trigger: "trigger",
  conditions: "condition",
  if: "condition",
  until: "condition",
  while: "condition",
  and: "condition",
  or: "condition",
  not: "condition",
  actions: "action",
  sequence: "action",
  then: "action",
  else: "action",
  default: "action",
  parallel: "action",
});
const AUTOMATION_BLOCK_KEYS = new Set([
  "triggers", "trigger", "wait_for_trigger", "conditions", "condition", "if", "until", "while",
  "and", "or", "not", "actions", "sequence", "then", "else", "default", "parallel", "choose", "repeat",
]);

// Automations that were never saved again in the UI still use singular root lists.
const SINGULAR_ROOT_PART = Object.freeze({ trigger: "trigger", condition: "condition", action: "action" });

function automationPartFor(key, blockKeys, outer, keyIndent = -1) {
  if (keyIndent === 0 && Object.prototype.hasOwnProperty.call(SINGULAR_ROOT_PART, key)) return SINGULAR_ROOT_PART[key];
  if (!Object.prototype.hasOwnProperty.call(AUTOMATION_PART_BY_BLOCK, key)) return "";
  if (key === "default" && !blockKeys.has("choose")) return "";
  if ((key === "and" || key === "or" || key === "not") && !outer.some(k => AUTOMATION_BLOCK_KEYS.has(k))) return "";
  return AUTOMATION_PART_BY_BLOCK[key];
}

// Dashboard list blocks whose items are cards (or card-like: views, sections, badges).
const CARD_LIST_KEYS = new Set(["cards", "views", "sections", "badges"]);
// Dashboard tap action blocks (the action-block continuation rows apply only inside one).
const TAP_ACTION_KEYS = new Set(["tap_action", "hold_action", "double_tap_action", "icon_tap_action", "icon_hold_action", "icon_double_tap_action"]);
// A dashboard document: a column-0 cards: or views: line (an indented one can sit in an action's
// data, such as a browser_mod popup's content). When the scanned text was cut, the view's own
// cards: line can be out of reach, so any cards: line counts.
const DASHBOARD_ROOT_OPENER = /(^|\n)(?:-[ \t]+)?(cards|views)[ \t]*:[ \t]*(?:#[^\n]*)?(\r?\n|$)/;
const ANY_CARDS_OPENER = /(^|\n)[ \t]*(?:-[ \t]+)?cards[ \t]*:[ \t]*(?:#[^\n]*)?(\r?\n|$)/;
// The document's own card type: its column-0 type: line.
const ROOT_TYPE_LINE = /(?:^|\n)type[ \t]*:[ \t]*["']?([^"'\s#]+)/;
// The root of a one-step fragment (Home Assistant's "Edit in YAML" for a single action, condition
// or trigger) is named by its own keys; automation and script root keys mean a whole config.
const DOCUMENT_ROOT_KEYS = new Set(["triggers", "actions", "sequence", "mode", "description", "use_blueprint", "fields", "max", "trace"]);
const ACTION_STEP_KEYS = new Set(["action", "service", "choose", "repeat", "if", "then", "else", "parallel", "wait_for_trigger", "wait_template", "delay", "event", "stop", "default", "scene", "device_id"]);

function fragmentAutomationPart(keys) {
  if (!keys.size) return "";
  for (const key of keys) if (DOCUMENT_ROOT_KEYS.has(key)) return "";
  if (keys.has("trigger") && keys.has("action")) return "";        // an automation root in the singular form
  for (const key of keys) if (ACTION_STEP_KEYS.has(key)) return "action";
  if (keys.has("condition")) return "condition";
  if (keys.has("trigger") || keys.has("platform")) return "trigger";
  return "";
}

// The cursor right after a `key:` on its own line (not a "- key:" item): the inserted row goes
// into that key's block.
const SAME_LINE_BLOCK_KEY = /^[ \t]*(["']?)([A-Za-z0-9_-]+)\1[ \t]*:[ \t]*$/;
// button-card style targets whose values are lists of CSS properties.
const BUTTON_STYLE_TARGETS = ["styles.card", "styles.icon", "styles.name", "styles.label", "styles.grid", "styles.img_cell", "styles.state", "styles.entity_picture", "styles.lock", "styles.custom_fields."];

export function scopeContextRows(rows, ctx) {
  if (!ctx || ctx.surfaceScopeEnabled !== true) return rows;
  return rows.filter(row => {
    const kind = row?.meta?.contextKind;
    if (AUTOMATION_CONTEXT_KINDS.has(kind)) return surfaceAllows(ctx, 'automation');
    if (LOVELACE_CONTEXT_KINDS.has(kind)) return surfaceAllows(ctx, 'lovelace');
    return true; // condition, target, data, confirmation and unknown kinds are shared
  });
}

export function contextRow(id, type, label, insert, aliases = [], meta = {}, options = {}) {
  const normalize = typeof options.normalizeItem === "function" ? options.normalizeItem : normalizeItem;
  const providerId = options.providerId || LOVELACE_CONTEXT_PROVIDER_ID;
  const item = normalize([id, "yaml", type, label, insert, aliases], providerId);
  if (!item) return null;
  item.meta = {
    ...(item.meta || {}),
    sourceDetail: meta.sourceDetail || "Lovelace context",
    documentation: meta.documentation || "Suggested because of the current Lovelace/YAML block.",
    contextKind: meta.contextKind || "lovelace"
  };
  return item;
}

export function rowSet(rows, options = {}) {
  return rows.map(row => contextRow(...row, options)).filter(Boolean);
}

export function yamlPathText(ctx) {
  return (ctx?.yamlPath || []).join(".").toLowerCase();
}

export function recentYamlText(ctx, options = {}) {
  const doc = String(
    typeof options.getDoc === "function" ? options.getDoc() :
    options.doc ?? ctx?.doc ?? ctx?.sourceText ?? ""
  );
  const rawPos = typeof options.getPos === "function" ? options.getPos() : options.pos ?? ctx?.pos ?? doc.length;
  const pos = Number.isFinite(Number(rawPos)) ? Number(rawPos) : doc.length;
  return doc.slice(Math.max(0, pos - 2400), pos).toLowerCase();
}

export function looksLikeButtonCardContext(ctx, options = {}) {
  const p = yamlPathText(ctx);
  const recent = recentYamlText(ctx, options);
  return p.includes("styles") || p.includes("custom_fields") || recent.includes("custom:button-card");
}

export function lovelaceContextRows(ctx, options = {}) {
  if (!ctx || ctx.lang !== "yaml") return [];
  if (!(ctx.yamlRole === "key" || ctx.yamlRole === "blank" || ctx.yamlRole === "list-key")) return [];

  const p = yamlPathText(ctx);
  const key = String(ctx.yamlKey || "").toLowerCase();
  const focusKind = String(ctx.focusKind || "").toLowerCase();
  const toRows = rows => rowSet(rows, options);

  const rootYaml = [
    ["ctx.root.alias", "key", "alias:", "alias: ", ["automation", "script", "name"], { contextKind: "ha-root", documentation: "Automation/script display name." }],
    ["ctx.root.description", "key", "description:", "description: ", ["automation", "script"], { contextKind: "ha-root", documentation: "Description for this automation, script, or card config." }],
    ["ctx.root.triggers", "key", "triggers:", "triggers:", ["automation", "trigger"], { contextKind: "ha-root", documentation: "Automation trigger list." }],
    ["ctx.root.conditions", "key", "conditions:", "conditions:", ["automation", "condition"], { contextKind: "ha-root", documentation: "Automation condition list." }],
    ["ctx.root.actions", "key", "actions:", "actions:", ["automation", "action"], { contextKind: "ha-root", documentation: "Automation action sequence." }],
    ["ctx.root.sequence", "key", "sequence:", "sequence:", ["script", "action"], { contextKind: "ha-root", documentation: "Script action sequence." }],
    ["ctx.root.variables", "key", "variables:", "variables:", ["automation", "script", "template"], { contextKind: "ha-root", documentation: "Variables available to templates/actions." }],
    ["ctx.root.mode", "key", "mode:", "mode: ", ["single", "restart", "queued", "parallel"], { contextKind: "ha-root", documentation: "Automation/script run mode." }],
    ["ctx.root.trace", "key", "trace:", "trace:", ["stored_traces"], { contextKind: "ha-root", documentation: "Trace settings such as stored_traces." }],
  ];

  const commonCard = [
    ["ctx.type", "key", "type:", "type: ", ["card", "lovelace"], { documentation: "Lovelace card type." }],
    ["ctx.entity", "key", "entity:", "entity: ", ["entity_id", "ha"], { documentation: "Primary Home Assistant entity for this card." }],
    ["ctx.entities", "key", "entities:", "entities:", ["entity list", "ha"], { documentation: "List of entities or entity rows." }],
    ["ctx.title", "key", "title:", "title: ", ["heading"], { documentation: "Card title/heading." }],
    ["ctx.name", "key", "name:", "name: ", ["title"], { documentation: "Display name/title." }],
    ["ctx.icon", "key", "icon:", "icon: mdi:", ["mdi"], { documentation: "Material Design icon." }],
    ["ctx.theme", "key", "theme:", "theme: ", ["theme"], { documentation: "Override theme for this card." }],
    ["ctx.state_color", "key", "state_color:", "state_color: ", ["boolean", "entities"], { documentation: "Use entity state color where supported." }],
    ["ctx.show_header_toggle", "key", "show_header_toggle:", "show_header_toggle: ", ["entities"], { documentation: "Show the entities-card header toggle." }],
    ["ctx.tap_action", "key", "tap_action:", "tap_action:", ["action", "tap"], { documentation: "Action when the card is tapped." }],
    ["ctx.hold_action", "key", "hold_action:", "hold_action:", ["hold", "action"], { documentation: "Action when the card is held." }],
    ["ctx.double_tap_action", "key", "double_tap_action:", "double_tap_action:", ["double", "tap", "action"], { documentation: "Action when the card is double-tapped." }],
    ["ctx.visibility", "key", "visibility:", "visibility:", ["condition", "dashboard"], { documentation: "Per-card visibility conditions." }],
    ["ctx.view_layout", "key", "view_layout:", "view_layout:", ["layout", "sections"], { documentation: "Dashboard layout options for custom layouts/sections." }],
    ["ctx.card_mod", "key", "card_mod:", "card_mod:", ["style", "css"], { documentation: "card_mod styling block." }],
  ];

  const cardContainer = [
    ["ctx.cards", "key", "cards:", "cards:", ["stack", "grid"], { contextKind: "cards", documentation: "Nested cards for stack/grid/conditional cards." }],
    ["ctx.card", "key", "card:", "card:", ["conditional", "entity-filter"], { contextKind: "cards", documentation: "Single nested card." }],
    ["ctx.columns", "key", "columns:", "columns: ", ["grid"], { contextKind: "cards", documentation: "Grid card column count." }],
    ["ctx.square", "key", "square:", "square: ", ["grid", "boolean"], { contextKind: "cards", documentation: "Use square grid cells." }],
  ];

  const entityRow = [
    ["ctx.entity_row.entity", "key", "entity:", "entity: ", ["entity_id"], { contextKind: "entity-row", documentation: "Entity row entity ID." }],
    ["ctx.entity_row.name", "key", "name:", "name: ", ["entity row"], { contextKind: "entity-row", documentation: "Entity row display name." }],
    ["ctx.entity_row.icon", "key", "icon:", "icon: mdi:", ["entity row", "mdi"], { contextKind: "entity-row", documentation: "Entity row icon." }],
    ["ctx.entity_row.type", "key", "type:", "type: ", ["divider", "section", "custom"], { contextKind: "entity-row", documentation: "Entity row type." }],
    ["ctx.entity_row.secondary_info", "key", "secondary_info:", "secondary_info: ", ["last-changed", "entity row"], { contextKind: "entity-row", documentation: "Secondary info displayed under an entity row." }],
  ];

  const actionBlock = [
    ["ctx.action.action", "key", "action:", "action: ", ["tap_action", "more-info", "perform-action", "call-service"], { contextKind: "action", documentation: "Dashboard action type such as more-info, toggle, perform-action/call-service, navigate, url, assist, or fire-dom-event." }],
    ["ctx.action.perform_action", "key", "perform_action:", "perform_action: ", ["service", "perform-action"], { contextKind: "action", documentation: "Service action to perform for modern dashboard action YAML." }],
    ["ctx.action.service", "key", "service:", "service: ", ["call-service", "service"], { contextKind: "action", documentation: "Legacy service key for call-service dashboard actions." }],
    ["ctx.action.target", "key", "target:", "target:", ["entity_id", "device_id", "area_id"], { contextKind: "action", documentation: "Target block for service calls/actions." }],
    ["ctx.action.data", "key", "data:", "data:", ["service_data"], { contextKind: "action", documentation: "Action/service data payload." }],
    ["ctx.action.navigation_path", "key", "navigation_path:", "navigation_path: ", ["navigate", "path"], { contextKind: "action", documentation: "Dashboard path for navigate actions." }],
    ["ctx.action.url_path", "key", "url_path:", "url_path: ", ["url"], { contextKind: "action", documentation: "URL for url actions." }],
    ["ctx.action.confirmation", "key", "confirmation:", "confirmation:", ["confirm"], { contextKind: "action", documentation: "Confirmation block before running this action." }],
    ["ctx.action.perform_action_snippet", "snippet", "perform-action dashboard block", "action: perform-action\nperform_action: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}\ndata:\n  ${3:brightness_pct}: ${4:100}", ["tap_action", "perform-action", "service", "target", "snippet"], { contextKind: "action", documentation: "Modern dashboard perform-action block with snippet placeholders." }],
    ["ctx.action.call_service_snippet", "snippet", "call-service action block", "action: call-service\nservice: ${1:service.name}\ntarget:\n  entity_id: ${2:entity.id}\ndata:\n  ${3:data_key}: ${4:value}", ["tap_action", "service", "target", "snippet"], { contextKind: "action", documentation: "Legacy call-service action block with snippet placeholders." }],
    ["ctx.action.navigate_snippet", "snippet", "navigate action block", "action: navigate\nnavigation_path: ${1:/my-dashboard/home}", ["tap_action", "navigate", "snippet"], { contextKind: "action", documentation: "Complete navigate action block with a path placeholder." }],
  ];

  const automationActionBlock = [
    ["ctx.auto_action.alias", "key", "alias:", "alias: ", ["automation", "script"], { contextKind: "automation-action", documentation: "Action step alias shown in traces." }],
    ["ctx.auto_action.action", "key", "action:", "action: ", ["service", "perform action"], { contextKind: "automation-action", documentation: "Home Assistant service action, for example light.turn_on." }],
    ["ctx.auto_action.service", "key", "service:", "service: ", ["legacy", "service"], { contextKind: "automation-action", documentation: "Legacy service-action key supported in many YAML examples." }],
    ["ctx.auto_action.target", "key", "target:", "target:", ["entity_id", "device_id", "area_id"], { contextKind: "automation-action", documentation: "Target entities/devices/areas for this action." }],
    ["ctx.auto_action.data", "key", "data:", "data:", ["service data"], { contextKind: "automation-action", documentation: "Action data payload." }],
    ["ctx.auto_action.response_variable", "key", "response_variable:", "response_variable: ", ["script", "response"], { contextKind: "automation-action", documentation: "Variable name for action response data." }],
    ["ctx.auto_action.enabled", "key", "enabled:", "enabled: ", ["boolean"], { contextKind: "automation-action", documentation: "Enable/disable this individual action." }],
    ["ctx.auto_action.continue_on_error", "key", "continue_on_error:", "continue_on_error: ", ["boolean"], { contextKind: "automation-action", documentation: "Continue sequence when this action errors." }],
    ["ctx.auto_action.delay", "key", "delay:", "delay: ", ["script"], { contextKind: "automation-action", documentation: "Wait for a duration." }],
    ["ctx.auto_action.wait_template", "key", "wait_template:", "wait_template: ", ["script", "template"], { contextKind: "automation-action", documentation: "Wait until a template evaluates true." }],
    ["ctx.auto_action.wait_for_trigger", "key", "wait_for_trigger:", "wait_for_trigger:", ["script", "trigger"], { contextKind: "automation-action", documentation: "Wait for one or more triggers." }],
    ["ctx.auto_action.choose", "key", "choose:", "choose:", ["script", "branch"], { contextKind: "automation-action", documentation: "Choose between conditional action sequences." }],
    ["ctx.auto_action.if", "key", "if:", "if:", ["script", "condition"], { contextKind: "automation-action", documentation: "If/then/else action block." }],
    ["ctx.auto_action.then", "key", "then:", "then:", ["script", "if"], { contextKind: "automation-action", documentation: "Actions to run when if conditions pass." }],
    ["ctx.auto_action.else", "key", "else:", "else:", ["script", "if"], { contextKind: "automation-action", documentation: "Actions to run when if conditions fail." }],
    ["ctx.auto_action.repeat", "key", "repeat:", "repeat:", ["script", "loop"], { contextKind: "automation-action", documentation: "Repeat a sequence." }],
    ["ctx.auto_action.parallel", "key", "parallel:", "parallel:", ["script", "parallel"], { contextKind: "automation-action", documentation: "Run grouped actions in parallel." }],
    ["ctx.auto_action.variables", "key", "variables:", "variables:", ["template"], { contextKind: "automation-action", documentation: "Set variables for later actions/templates." }],
    ["ctx.auto_action.stop", "key", "stop:", "stop: ", ["script"], { contextKind: "automation-action", documentation: "Stop script/automation execution with a message." }],
    ["ctx.auto_action.service_snippet", "snippet", "service action step", "action: ${1:light.turn_on}\ntarget:\n  entity_id: ${2:light.example}\ndata:\n  ${3:brightness_pct}: ${4:100}", ["automation", "script", "service", "snippet"], { contextKind: "automation-action", documentation: "Service action step with target and data placeholders." }],
    ["ctx.auto_action.if_snippet", "snippet", "if then else block", "if:\n  - condition: ${1:state}\n    entity_id: ${2:binary_sensor.example}\n    state: ${3:on}\nthen:\n  - action: ${4:light.turn_on}\n    target:\n      entity_id: ${5:light.example}\nelse:\n  - action: ${6:light.turn_off}\n    target:\n      entity_id: ${7:light.example}", ["if", "then", "else", "snippet"], { contextKind: "automation-action", documentation: "If/then/else action block." }],
  ];

  const triggerBlock = [
    ["ctx.trigger.trigger", "key", "trigger:", "trigger: ", ["state", "time", "event"], { contextKind: "trigger", documentation: "Modern trigger type key." }],
    ["ctx.trigger.platform", "key", "platform:", "platform: ", ["legacy", "trigger"], { contextKind: "trigger", documentation: "Legacy trigger platform key." }],
    ["ctx.trigger.entity_id", "key", "entity_id:", "entity_id: ", ["entity"], { contextKind: "trigger", documentation: "Entity that causes the trigger." }],
    ["ctx.trigger.to", "key", "to:", "to: ", ["state"], { contextKind: "trigger", documentation: "State to trigger on." }],
    ["ctx.trigger.from", "key", "from:", "from: ", ["state"], { contextKind: "trigger", documentation: "Previous state to match." }],
    ["ctx.trigger.for", "key", "for:", "for: ", ["duration"], { contextKind: "trigger", documentation: "How long the state must stay matched." }],
    ["ctx.trigger.at", "key", "at:", "at: ", ["time"], { contextKind: "trigger", documentation: "Time trigger value." }],
    ["ctx.trigger.event_type", "key", "event_type:", "event_type: ", ["event"], { contextKind: "trigger", documentation: "Event type for event triggers." }],
    ["ctx.trigger.event_data", "key", "event_data:", "event_data:", ["event"], { contextKind: "trigger", documentation: "Event-data filter for event triggers." }],
    ["ctx.trigger.offset", "key", "offset:", "offset: ", ["sun", "calendar"], { contextKind: "trigger", documentation: "Offset before/after sun or calendar event." }],
    ["ctx.trigger.id", "key", "id:", "id: ", ["trigger id"], { contextKind: "trigger", documentation: "Optional trigger id for trigger conditions/templates." }],
    ["ctx.trigger.state_snippet", "snippet", "state trigger", "trigger: state\nentity_id: ${1:binary_sensor.example}\nto: ${2:on}", ["trigger", "state", "snippet"], { contextKind: "trigger", documentation: "State trigger snippet." }],
    ["ctx.trigger.time_snippet", "snippet", "time trigger", "trigger: time\nat: ${1:07:00:00}", ["trigger", "time", "snippet"], { contextKind: "trigger", documentation: "Time trigger snippet." }],
  ];

  const conditionBlock = [
    ["ctx.condition.condition", "key", "condition:", "condition: ", ["state", "template", "numeric_state"], { contextKind: "condition", documentation: "Condition type." }],
    ["ctx.condition.entity_id", "key", "entity_id:", "entity_id: ", ["entity"], { contextKind: "condition", documentation: "Entity used by the condition." }],
    ["ctx.condition.state", "key", "state:", "state: ", ["state"], { contextKind: "condition", documentation: "Required state for a state condition." }],
    ["ctx.condition.above", "key", "above:", "above: ", ["numeric_state"], { contextKind: "condition", documentation: "Numeric-state lower bound." }],
    ["ctx.condition.below", "key", "below:", "below: ", ["numeric_state"], { contextKind: "condition", documentation: "Numeric-state upper bound." }],
    ["ctx.condition.after", "key", "after:", "after: ", ["time", "sun"], { contextKind: "condition", documentation: "Time/sun lower bound." }],
    ["ctx.condition.before", "key", "before:", "before: ", ["time", "sun"], { contextKind: "condition", documentation: "Time/sun upper bound." }],
    ["ctx.condition.weekday", "key", "weekday:", "weekday:", ["time"], { contextKind: "condition", documentation: "Weekday list for time conditions." }],
    ["ctx.condition.value_template", "key", "value_template:", "value_template: ", ["template"], { contextKind: "condition", documentation: "Template that must evaluate true." }],
    ["ctx.condition.conditions", "key", "conditions:", "conditions:", ["and", "or", "not"], { contextKind: "condition", documentation: "Nested conditions for and/or/not." }],
    ["ctx.condition.state_snippet", "snippet", "state condition", "condition: state\nentity_id: ${1:binary_sensor.example}\nstate: ${2:on}", ["condition", "state", "snippet"], { contextKind: "condition", documentation: "State condition snippet." }],
    ["ctx.condition.numeric_snippet", "snippet", "numeric condition", "condition: numeric_state\nentity_id: ${1:sensor.example}\nabove: ${2:0}\nbelow: ${3:100}", ["condition", "numeric", "snippet"], { contextKind: "condition", documentation: "Numeric-state condition snippet." }],
  ];

  const targetBlock = [
    ["ctx.target.entity_id", "key", "entity_id:", "entity_id: ", ["entity", "target"], { contextKind: "target", documentation: "Target one or more entities." }],
    ["ctx.target.device_id", "key", "device_id:", "device_id: ", ["device", "target"], { contextKind: "target", documentation: "Target a Home Assistant device ID." }],
    ["ctx.target.area_id", "key", "area_id:", "area_id: ", ["area", "target"], { contextKind: "target", documentation: "Target a Home Assistant area ID." }],
  ];

  // Data keys that fit any service. The fields of the service itself (brightness_pct for a light)
  // come from the Home Assistant provider.
  const dataBlock = [
    ["ctx.data.message", "key", "message:", "message: ", ["notify", "data"], { contextKind: "data", documentation: "Common notify/message data field." }],
    ["ctx.data.title", "key", "title:", "title: ", ["notify", "data"], { contextKind: "data", documentation: "Common title data field." }],
  ];

  const buttonCard = [
    ["ctx.button.entity", "key", "entity:", "entity: ", ["button-card", "entity"], { contextKind: "button-card", documentation: "Primary entity for custom:button-card." }],
    ["ctx.button.name", "key", "name:", "name: ", ["button-card", "title"], { contextKind: "button-card", documentation: "Button label." }],
    ["ctx.button.icon", "key", "icon:", "icon: mdi:", ["button-card", "mdi"], { contextKind: "button-card", documentation: "Button icon." }],
    ["ctx.button.show_state", "key", "show_state:", "show_state: ", ["button-card"], { contextKind: "button-card", documentation: "Show or hide entity state." }],
    ["ctx.button.show_name", "key", "show_name:", "show_name: ", ["button-card"], { contextKind: "button-card", documentation: "Show or hide name." }],
    ["ctx.button.show_icon", "key", "show_icon:", "show_icon: ", ["button-card"], { contextKind: "button-card", documentation: "Show or hide icon." }],
    ["ctx.button.show_label", "key", "show_label:", "show_label: ", ["button-card"], { contextKind: "button-card", documentation: "Show or hide label." }],
    ["ctx.button.label", "key", "label:", "label: ", ["button-card"], { contextKind: "button-card", documentation: "Button label text or JS template." }],
    ["ctx.button.triggers_update", "key", "triggers_update:", "triggers_update:", ["button-card", "update"], { contextKind: "button-card", documentation: "Entities that trigger button-card template updates." }],
    ["ctx.button.variables", "key", "variables:", "variables:", ["button-card", "vars"], { contextKind: "button-card", documentation: "Reusable variables for templates/styles." }],
    ["ctx.button.styles", "key", "styles:", "styles:", ["button-card", "css"], { contextKind: "button-card", documentation: "button-card styles object." }],
    ["ctx.button.custom_fields", "key", "custom_fields:", "custom_fields:", ["button-card", "fields"], { contextKind: "button-card", documentation: "Custom field definitions." }],
    ["ctx.button.state", "key", "state:", "state:", ["button-card", "state"], { contextKind: "button-card", documentation: "State-based card changes." }],
    ["ctx.button.template", "key", "template:", "template: ", ["button-card", "template"], { contextKind: "button-card", documentation: "button-card template name." }],
  ];

  const stylesBlock = [
    ["ctx.styles.card", "key", "card:", "card:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style the outer card." }],
    ["ctx.styles.icon", "key", "icon:", "icon:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style the icon." }],
    ["ctx.styles.name", "key", "name:", "name:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style the name text." }],
    ["ctx.styles.label", "key", "label:", "label:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style the label text." }],
    ["ctx.styles.state", "key", "state:", "state:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style the state text." }],
    ["ctx.styles.img_cell", "key", "img_cell:", "img_cell:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style the icon/image cell." }],
    ["ctx.styles.grid", "key", "grid:", "grid:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style the button-card grid layout." }],
    ["ctx.styles.custom_fields", "key", "custom_fields:", "custom_fields:", ["button-card", "styles"], { contextKind: "styles", documentation: "Style custom fields." }],
  ];

  const cssAsYaml = [
    ["ctx.css.background", "key", "background:", "background: ", ["css", "style"], { contextKind: "css-yaml", documentation: "CSS background property." }],
    ["ctx.css.color", "key", "color:", "color: ", ["css", "style"], { contextKind: "css-yaml", documentation: "CSS text color property." }],
    ["ctx.css.border", "key", "border:", "border: ", ["css"], { contextKind: "css-yaml", documentation: "CSS border property." }],
    ["ctx.css.border_radius", "key", "border-radius:", "border-radius: ", ["css", "style"], { contextKind: "css-yaml", documentation: "CSS rounded corners." }],
    ["ctx.css.padding", "key", "padding:", "padding: ", ["css", "style"], { contextKind: "css-yaml", documentation: "CSS padding property." }],
    ["ctx.css.margin", "key", "margin:", "margin: ", ["css", "style"], { contextKind: "css-yaml", documentation: "CSS margin property." }],
    ["ctx.css.display", "key", "display:", "display: ", ["css", "style"], { contextKind: "css-yaml", documentation: "CSS display property." }],
    ["ctx.css.position", "key", "position:", "position: ", ["css"], { contextKind: "css-yaml", documentation: "CSS position property." }],
    ["ctx.css.width", "key", "width:", "width: ", ["css"], { contextKind: "css-yaml", documentation: "CSS width property." }],
    ["ctx.css.height", "key", "height:", "height: ", ["css"], { contextKind: "css-yaml", documentation: "CSS height property." }],
    ["ctx.css.grid_template", "key", "grid-template-columns:", "grid-template-columns: ", ["css", "grid"], { contextKind: "css-yaml", documentation: "CSS grid column layout." }],
    ["ctx.css.box_shadow", "key", "box-shadow:", "box-shadow: ", ["css", "shadow"], { contextKind: "css-yaml", documentation: "CSS shadow/glow property." }],
    ["ctx.css.backdrop_filter", "key", "backdrop-filter:", "backdrop-filter: ", ["css", "blur"], { contextKind: "css-yaml", documentation: "CSS backdrop-filter property." }],
    ["ctx.css.transform", "key", "transform:", "transform: ", ["css", "transform"], { contextKind: "css-yaml", documentation: "CSS transform property." }],
    ["ctx.css.opacity", "key", "opacity:", "opacity: ", ["css", "style"], { contextKind: "css-yaml", documentation: "CSS opacity property." }],
    ["ctx.css.overflow", "key", "overflow:", "overflow: ", ["css", "clip"], { contextKind: "css-yaml", documentation: "CSS overflow behavior." }],
    ["ctx.css.z_index", "key", "z-index:", "z-index: ", ["css", "stacking"], { contextKind: "css-yaml", documentation: "CSS stacking order." }],
  ];

  // The keys of a card_mod: mapping. style: opens the CSS as a block of text.
  const cardModBlock = [
    ["ctx.card_mod.style", "key", "style:", "style: |", ["card_mod", "css"], { contextKind: "styles", documentation: "card_mod CSS for this card, written as a block of text." }],
    ["ctx.card_mod.class", "key", "class:", "class: ", ["card_mod", "css"], { contextKind: "styles", documentation: "CSS classes that card_mod adds to this card." }],
  ];

  const browserMod = [
    ["ctx.browser_mod.service", "key", "service:", "service: browser_mod.popup", ["browser_mod", "popup"], { contextKind: "browser_mod", documentation: "browser_mod service name." }],
    ["ctx.browser_mod.data", "key", "data:", "data:", ["browser_mod"], { contextKind: "browser_mod", documentation: "browser_mod data block." }],
    ["ctx.browser_mod.title", "key", "title:", "title: ", ["browser_mod", "popup"], { contextKind: "browser_mod", documentation: "Popup title." }],
    ["ctx.browser_mod.content", "key", "content:", "content:", ["browser_mod", "popup"], { contextKind: "browser_mod", documentation: "Popup content card." }],
    ["ctx.browser_mod.dismissable", "key", "dismissable:", "dismissable: true", ["browser_mod", "popup"], { contextKind: "browser_mod", documentation: "Whether the popup can be dismissed." }],
    ["ctx.browser_mod.size", "key", "size:", "size: normal", ["browser_mod", "popup"], { contextKind: "browser_mod", documentation: "browser_mod popup size." }],
  ];

  const doc = typeof options.getDoc === "function" ? options.getDoc() : options.doc || "";
  const pos = typeof options.getPos === "function" ? options.getPos() : options.pos || 0;

  // The YAML block structure around the cursor (see enclosingBlock). Inside block-scalar text
  // (a notify message, markdown content, a template) no key row applies.
  const scanSource = typeof options.getDoc === "function" ? doc : String(options.doc ?? ctx?.doc ?? ctx?.sourceText ?? "");
  const scanPos = typeof options.getPos === "function" ? pos : Number(options.pos ?? ctx?.pos ?? scanSource.length);
  const scanText = enclosingScanText(scanSource, scanPos);
  const scanCut = Number(scanPos) > ENCLOSING_SCAN_CHARS;
  const cursorLineText = `${ctx.beforeCursor || ""}${ctx.afterCursor || ""}`.trim();
  const scan = enclosingBlock(scanText, { cursorLineHasKey: KEY_LINE.test(cursorLineText) });
  if (scan.inScalar) return [];
  const sameLine = SAME_LINE_BLOCK_KEY.exec(ctx.beforeCursor || "");
  const enclosing = sameLine ? sameLine[2].toLowerCase() : scan.key;

  // A context that carries its branch state is not computed again; null (outside an action
  // block) counts as carried.
  const branchState = ctx.branchState !== undefined
    ? ctx.branchState
    : (typeof options.yamlBranchState === "function" ? options.yamlBranchState(doc, pos) : null);
  // The action-block continuation rows need the missing, used and action fields of a dashboard
  // action block's branch state (an automation step's branch state has no missingKeys). They
  // apply only inside the tap action block itself, not at the column of a finished one or inside
  // its data: block.
  if (branchState?.kind === "action-block" && Array.isArray(branchState.missingKeys) && TAP_ACTION_KEYS.has(enclosing)) {
    const allowed = new Set(branchState.missingKeys || []);
    const hasAction = !!branchState.actionValue;
    const used = new Set(Object.keys(branchState.siblings || {}));

    const rows = actionBlock.filter(row => {
      const type = row[1];
      const label = String(row[2] || "").replace(/:$/, "");
      if (type === "snippet") return !hasAction && used.size === 0;
      if (!hasAction) return !used.has(label);
      return allowed.has(label) && !used.has(label);
    });

    if (rows.length) return toRows(rows);
  }

  // Routing. The data/target leaves of the path come first (they name their block exactly).
  // Then the block that encloses the cursor line by indentation: the block a key typed on the
  // cursor's own line opens, else the nearest enclosing block. It decides card lists, data and
  // target blocks, entity rows and the parts of an automation (a condition step inside an action
  // list keeps condition keys). Then the path's own segments, matched as whole segments, and the
  // dashboard fallbacks. Text above the cursor that does not enclose it never decides the rows:
  // in an automation, the `triggers:` block above `actions:` says nothing about an action step,
  // and a conditional card earlier in a stack says nothing about the cards after it.
  const segments = p ? p.split(".") : [];
  const pathLeaf = segments[segments.length - 1] || "";
  const hasSegment = (...names) => segments.some(segment => names.includes(segment));
  // The YAML path keeps an empty data:/target: opener above a key-less line, judged from the text
  // before the cursor only; with the cursor inside an existing key on that line, the key is a
  // sibling of the opener, which the scan sees.
  const leafFromOpener = KEY_LINE.test(cursorLineText) && !sameLine && scan.key !== pathLeaf;
  if (!leafFromOpener && branchState?.kind === "target-block") return toRows(targetBlock);
  if (!leafFromOpener && (pathLeaf === "data" || pathLeaf === "service_data")) return toRows(dataBlock);
  if (!leafFromOpener && pathLeaf === "target") return toRows(targetBlock);

  const enclosingKeys = sameLine ? new Set([enclosing, ...scan.cursorKeys]) : scan.blockKeys;
  const enclosingOuter = sameLine ? (scan.key ? [scan.key, ...scan.outer] : scan.outer) : scan.outer;
  const enclosingIndent = sameLine ? -1 : scan.keyIndent;
  // The cursor is a key of a card (an item of a card list, or the card under card:); a
  // button-card's own keys are button-card keys.
  const cardHost = !sameLine && (CARD_LIST_KEYS.has(enclosing) || enclosing === "card");
  if (cardHost && scan.cursorType === "custom:button-card") return toRows(buttonCard);
  if (CARD_LIST_KEYS.has(enclosing)) return toRows([...commonCard, ...cardContainer]);
  if (enclosing === "data" || enclosing === "service_data") return toRows(dataBlock);
  if (enclosing === "target") return toRows(targetBlock);
  if (enclosing === "entities" || enclosing === "row") return toRows(entityRow);
  // Directly inside card_mod: its own keys, not the card's.
  if (enclosing === "card_mod") return toRows(cardModBlock);
  const automationPart = automationPartFor(enclosing, enclosingKeys, enclosingOuter, enclosingIndent);
  if (automationPart === "action" && !sameLine && scan.cursorKeys.has("condition")) return toRows(conditionBlock);
  if (automationPart === "trigger") return toRows(triggerBlock);
  if (automationPart === "condition") return toRows(conditionBlock);
  if (automationPart === "action") return toRows(automationActionBlock);

  if (focusKind === "trigger-block" || hasSegment("triggers", "trigger", "wait_for_trigger")) return toRows(triggerBlock);
  if (focusKind === "condition-block" || hasSegment("conditions", "condition")) return toRows(conditionBlock);
  if (focusKind === "automation-action" || hasSegment("actions", "sequence", "then", "else", "parallel", "choose", "repeat")) return toRows(automationActionBlock);
  if (p.endsWith("data") || p.includes(".data") || p.endsWith("service_data") || p.includes(".service_data")) return toRows(dataBlock);
  if (p.endsWith("tap_action") || p.endsWith("hold_action") || p.endsWith("double_tap_action") || p.includes("tap_action") || p.includes("hold_action") || p.includes("double_tap_action")) return toRows(actionBlock);
  if (p.endsWith("target") || p.includes(".target")) return toRows(targetBlock);
  if (p.endsWith("confirmation") || p.includes(".confirmation")) return toRows([["ctx.confirmation.text", "key", "text:", "text: ", ["confirmation", "message"], { contextKind: "confirmation", documentation: "Confirmation message shown before the action runs." }]]);
  if (p.includes("browser_mod")) return toRows(browserMod);
  if (hasSegment("entities")) return toRows(entityRow);
  // Blocks inside a card rank above the card itself, so a card in a stack or a view keeps its
  // styles and visibility rows.
  if (BUTTON_STYLE_TARGETS.some(target => p.includes(target))) return toRows(cssAsYaml);
  if (p.endsWith("styles") || p.includes(".styles")) {
    if (/styles\s*:\s*$/.test(ctx.beforeCursor || "") || p.endsWith("styles")) return toRows(stylesBlock);
    return toRows([...stylesBlock, ...cssAsYaml]);
  }
  if (p.endsWith("visibility") || p.includes(".visibility")) return toRows(conditionBlock);
  // Inside a card of a stack or grid ("cards.type" is the first key of a list item under cards:).
  if (hasSegment("cards")) return toRows([...commonCard, ...cardContainer]);

  if (enclosing === "browser_mod") return toRows(browserMod);
  // A button-card style target in compact form, where the path drops the target: its list items
  // ("- " or "- back") and the keys of an item.
  if (hasSegment("styles") && /^\s*-\s*[\w-]*$/.test(ctx.beforeCursor || "")) return toRows(cssAsYaml);
  if (enclosing === "card" && !sameLine && enclosingOuter[0] === "styles") return toRows(cssAsYaml);
  if (enclosing === "card") return toRows([...commonCard, ...cardContainer]);

  // A position in a dashboard that no block names (a stack or grid root, the dashboard root, the
  // root of a card that is not a button-card): card keys, before the button-card check, which
  // matches custom:button-card anywhere above.
  const dashboard = DASHBOARD_ROOT_OPENER.test(scanText) || (scanCut && !scan.key && ANY_CARDS_OPENER.test(scanText));
  const rootType = p ? "" : String(ROOT_TYPE_LINE.exec(scanText)?.[1] || "").toLowerCase();
  if (!p && !scan.key && !sameLine && scan.cursorIndent === 0 && !dashboard && !rootType) {
    const fragmentPart = fragmentAutomationPart(scan.cursorKeys);
    if (fragmentPart === "action") return toRows(automationActionBlock);
    if (fragmentPart === "condition") return toRows(conditionBlock);
    if (fragmentPart === "trigger") return toRows(triggerBlock);
  }
  if ((dashboard || (rootType && rootType !== "custom:button-card")) && (!key || ctx.yamlRole === "key")) return toRows([...commonCard, ...cardContainer]);
  if (looksLikeButtonCardContext(ctx, options)) return toRows(buttonCard);
  if (!key) return toRows([...commonCard, ...cardContainer, ...rootYaml]);
  return [];
}

export function lovelaceContextProvider(options = {}) {
  return {
    id: options.providerId || LOVELACE_CONTEXT_PROVIDER_ID,
    label: "Lovelace context provider",
    canHandle(ctx) {
      return ctx?.lang === "yaml" && (ctx.yamlRole === "key" || ctx.yamlRole === "blank" || ctx.yamlRole === "list-key");
    },
    provide(ctx) {
      return scopeContextRows(lovelaceContextRows(ctx, options), ctx);
    }
  };
}
