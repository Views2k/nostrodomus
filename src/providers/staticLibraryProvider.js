// Nostrodomus static library provider module.
// This layer owns static library catalog loading, row sanitization, normalization, indexing, and the static provider factory.
// It must not own HA runtime discovery, Lovelace runtime context, popup UI, settings UI, visual styling, or network behavior.

import { SECURITY_LIMITS, STATIC_PROVIDER_ID } from '../core/runtimeConstants.js';
import { safeString } from '../core/string.js';
import { hacsCatalogProvider } from './hacsCatalogProvider.js';
import { providerDiagnosticId } from './providerRegistry.js';
import { templateBlockOpening } from '../yaml/yamlCompletionContext.js';

function limitsFromOptions(options = {}) {
  return options?.limits || SECURITY_LIMITS;
}

// The static completion libraries, bundled with the plugin so they need no extra resource loads.
export const BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1 = Object.freeze({
version: "nostrodomus-library-core-v1",
packs: {
  yaml: [
    ["yaml.type", "yaml", "key", "type:", "type: ", ["type", "card"]],
    ["yaml.entity", "yaml", "key", "entity:", "entity: ", ["entity", "entity_id"]],
    ["yaml.entities", "yaml", "key", "entities:", "entities:", ["entities"]],
    ["yaml.name", "yaml", "key", "name:", "name: ", ["name", "title"]],
    ["yaml.icon", "yaml", "key", "icon:", "icon: mdi:", ["icon", "mdi"]],
    ["yaml.tap_action", "yaml", "key", "tap_action:", "tap_action:", ["tap", "action"]],
    ["yaml.hold_action", "yaml", "key", "hold_action:", "hold_action:", ["hold", "action"]],
    ["yaml.double_tap_action", "yaml", "key", "double_tap_action:", "double_tap_action:", ["double", "tap"]],
    ["yaml.action", "yaml", "key", "action:", "action: ", ["action"]],
    ["yaml.service", "yaml", "key", "service:", "service: ", ["service", "call-service"]],
    ["yaml.target", "yaml", "key", "target:", "target:", ["target"]],
    ["yaml.data", "yaml", "key", "data:", "data:", ["data", "service_data"]],
    ["yaml.card_mod", "yaml", "key", "card_mod:", "card_mod:", ["cardmod", "card_mod"]],
    ["yaml.style_pipe", "yaml", "key", "style: |", "style: |", ["style", "css"]],
    ["yaml.styles", "yaml", "key", "styles:", "styles:", ["button-card", "styles"]],
    ["yaml.show_state", "yaml", "key", "show_state:", "show_state: ", ["show_state"]],
    ["yaml.show_label", "yaml", "key", "show_label:", "show_label: ", ["show_label"]],
    ["yaml.show_icon", "yaml", "key", "show_icon:", "show_icon: ", ["show_icon"]],
    ["yaml.show_name", "yaml", "key", "show_name:", "show_name: ", ["show_name"]],
    ["yaml.state", "yaml", "key", "state:", "state:", ["state"]],
    ["yaml.conditions", "yaml", "key", "conditions:", "conditions:", ["conditions"]],
    ["yaml.cards", "yaml", "key", "cards:", "cards:", ["cards"]],
    ["yaml.grid_options", "yaml", "key", "grid_options:", "grid_options:", ["grid"]],
    ["yaml.columns", "yaml", "key", "columns:", "columns: ", ["columns"]],
    ["yaml.square", "yaml", "key", "square:", "square: ", ["square"]],
    ["yaml.layout", "yaml", "key", "layout:", "layout:", ["layout"]],
    ["yaml.view_layout", "yaml", "key", "view_layout:", "view_layout:", ["view_layout"]],
    ["yaml.visibility", "yaml", "key", "visibility:", "visibility:", ["visibility"]],
    ["yaml.browser_mod_popup", "yaml", "snippet", "browser_mod popup", "tap_action:\n  action: fire-dom-event\n  browser_mod:\n    service: browser_mod.popup\n    data:\n      title: ${1:Title}\n      content:\n        type: ${2:custom:button-card}", ["browser_mod", "popup"]],
    ["yaml.card_mod_style", "yaml", "snippet", "card_mod style block", "card_mod:\n  style: |\n    ha-card {\n      ${1:background: rgba(0, 0, 0, 0.35); }\n    }", ["card_mod", "style", "ha-card"]],
    ["yaml.type_button", "yaml", "key", "custom:button-card", "type: custom:button-card", ["button-card"]],
    ["yaml.type_mod", "yaml", "key", "custom:mod-card", "type: custom:mod-card", ["mod-card"]],
    ["yaml.type_stack", "yaml", "key", "custom:stack-in-card", "type: custom:stack-in-card", ["stack"]],
    ["yaml.type_layout", "yaml", "key", "custom:layout-card", "type: custom:layout-card", ["layout-card"]],
    ["yaml.type_mushroom", "yaml", "key", "custom:mushroom-template-card", "type: custom:mushroom-template-card", ["mushroom"]],
    ["yaml.type_bt", "yaml", "key", "custom:better-thermostat-ui-card", "type: custom:better-thermostat-ui-card", ["thermostat", "better"]],
  ],

  css: [
    ["css.display", "css", "property", "display:", "display: ", ["display"]],
    ["css.flex", "css", "property", "display: flex;", "display: flex;", ["flex"]],
    ["css.grid", "css", "property", "display: grid;", "display: grid;", ["grid"]],
    ["css.position", "css", "property", "position:", "position: ", ["position"]],
    ["css.relative", "css", "property", "position: relative;", "position: relative;", ["relative"]],
    ["css.absolute", "css", "property", "position: absolute;", "position: absolute;", ["absolute"]],
    ["css.fixed", "css", "property", "position: fixed;", "position: fixed;", ["fixed"]],
    ["css.zindex", "css", "property", "z-index:", "z-index: ", ["zindex", "z-index"]],
    ["css.overflow", "css", "property", "overflow:", "overflow: ", ["overflow"]],
    ["css.overflow_visible", "css", "property", "overflow: visible;", "overflow: visible;", ["overflow visible"]],
    ["css.overflow_hidden", "css", "property", "overflow: hidden;", "overflow: hidden;", ["overflow hidden"]],
    ["css.width", "css", "property", "width:", "width: ", ["width"]],
    ["css.height", "css", "property", "height:", "height: ", ["height"]],
    ["css.margin", "css", "property", "margin:", "margin: ", ["margin"]],
    ["css.padding", "css", "property", "padding:", "padding: ", ["padding"]],
    ["css.border_radius", "css", "property", "border-radius:", "border-radius: ", ["radius", "rounded"]],
    ["css.background", "css", "property", "background:", "background: ", ["background", "bg"]],
    ["css.background_rgba", "css", "snippet", "background rgba glass", "background: rgba(0, 0, 0, 0.35);", ["rgba", "glass"]],
    ["css.color", "css", "property", "color:", "color: ", ["color"]],
    ["css.box_shadow", "css", "property", "box-shadow:", "box-shadow: ", ["shadow", "glow"]],
    ["css.backdrop", "css", "property", "backdrop-filter:", "backdrop-filter: blur(12px) saturate(135%);", ["blur", "backdrop"]],
    ["css.webkit_backdrop", "css", "property", "-webkit-backdrop-filter:", "-webkit-backdrop-filter: blur(12px) saturate(135%);", ["webkit", "blur"]],
    ["css.transform", "css", "property", "transform:", "transform: ", ["transform"]],
    ["css.transition", "css", "property", "transition:", "transition: ", ["transition"]],
    ["css.pointer", "css", "property", "pointer-events:", "pointer-events: ", ["pointer"]],
    ["css.important", "css", "token", "!important", " !important", ["important"]],
    ["css.ha_card", "css", "selector", "ha-card", "ha-card {\n  \n}", ["ha-card"]],
    ["css.shadow_ha_card", "css", "selector", "$ ha-card", "$ ha-card {\n  \n}", ["shadow", "card-mod"]],
  ],

  js: [
    ["js.const", "js", "keyword", "const", "const ", ["const"]],
    ["js.let", "js", "keyword", "let", "let ", ["let"]],
    ["js.return", "js", "keyword", "return", "return ", ["return"]],
    ["js.entity", "js", "snippet", "entity?.state", "entity?.state", ["entity", "state"]],
    ["js.attr", "js", "snippet", "entity?.attributes", "entity?.attributes", ["attributes", "attr"]],
    ["js.states", "js", "snippet", "states['entity.id']", "states['entity.id']", ["states"]],
    ["js.optional", "js", "token", "?.", "?.", ["optional"]],
    ["js.template", "js", "snippet", "html template", "html`\n  ${1:}\n`", ["html", "template"]],
    ["js.button_wrapper", "js", "snippet", "[[[ return ... ]]]", "[[[\n  return ${1:entity?.state};\n]]]", ["button-card", "triple"]],
    ["js.math_round", "js", "snippet", "Math.round()", "Math.round()", ["math", "round"]],
    ["js.number", "js", "snippet", "Number()", "Number()", ["number"]],
  ],

  jinja: [
    ["jinja.states", "jinja", "function", "states()", "states('')", ["states"]],
    ["jinja.state_attr", "jinja", "function", "state_attr()", "state_attr('', '')", ["attribute", "attr"]],
    ["jinja.is_state", "jinja", "function", "is_state()", "is_state('', '')", ["is_state"]],
    ["jinja.if", "jinja", "snippet", "{% if %}", "{% if ${1:condition} %}\n${2:}\n{% endif %}", ["if"]],
    ["jinja.set", "jinja", "snippet", "{% set %}", "{% set ${1:x} = ${2:value} %}", ["set"]],
    ["jinja.default", "jinja", "filter", "| default", " | default('')", ["default"]],
    ["jinja.float", "jinja", "filter", "| float(0)", " | float(0)", ["float"]],
    ["jinja.int", "jinja", "filter", "| int(0)", " | int(0)", ["int"]],
    ["jinja.round", "jinja", "filter", "| round(1)", " | round(1)", ["round"]],
    ["jinja.lower", "jinja", "filter", "| lower", " | lower", ["lower"]],
  ],

  html: [
    ["html.div", "html", "tag", "<div>", "<div>\n  \n</div>", ["div"]],
    ["html.span", "html", "tag", "<span>", "<span></span>", ["span"]],
    ["html.ha_icon", "html", "tag", "<ha-icon>", "<ha-icon icon=\"mdi:\"></ha-icon>", ["icon", "ha-icon"]],
    ["html.class", "html", "attribute", "class", "class=\"\"", ["class"]],
    ["html.style", "html", "attribute", "style", "style=\"\"", ["style"]],
    ["html.aria", "html", "attribute", "aria-label", "aria-label=\"\"", ["aria"]],
  ],

  python: [
    ["py.def", "python", "keyword", "def", "def name():\n    ", ["def", "function"]],
    ["py.import", "python", "keyword", "import", "import ", ["import"]],
    ["py.from", "python", "keyword", "from import", "from  import ", ["from"]],
    ["py.pathlib", "python", "snippet", "from pathlib import Path", "from pathlib import Path", ["pathlib", "path"]],
    ["py.json", "python", "snippet", "import json", "import json", ["json"]],
    ["py.try", "python", "snippet", "try/except", "try:\n    ${1:pass}\nexcept Exception as err:\n    print(err)", ["try", "except"]],
    ["py.main", "python", "snippet", "if __name__ == '__main__'", "if __name__ == '__main__':\n    ${1:main()}", ["main"]],
  ],
}
});

export const BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1 = Object.freeze({
version: "nostrodomus-library-webdev-v1",
packs: {
  yaml: [
    ["ha.type_entities", "yaml", "key", "type: entities", "type: entities", ["lovelace", "entities card"]],
    ["ha.type_grid", "yaml", "key", "type: grid", "type: grid", ["lovelace", "grid"]],
    ["ha.type_vertical_stack", "yaml", "key", "type: vertical-stack", "type: vertical-stack", ["stack"]],
    ["ha.type_horizontal_stack", "yaml", "key", "type: horizontal-stack", "type: horizontal-stack", ["stack"]],
    ["ha.type_conditional", "yaml", "key", "type: conditional", "type: conditional", ["condition"]],
    ["ha.type_picture_elements", "yaml", "key", "type: picture-elements", "type: picture-elements", ["picture"]],
    ["ha.type_markdown", "yaml", "key", "type: markdown", "type: markdown", ["markdown"]],
    ["ha.type_iframe", "yaml", "key", "type: iframe", "type: iframe", ["iframe"]],
    ["ha.type_custom_button", "yaml", "key", "type: custom:button-card", "type: custom:button-card", ["button-card"]],
    ["ha.type_custom_mushroom", "yaml", "key", "type: custom:mushroom-template-card", "type: custom:mushroom-template-card", ["mushroom"]],
    ["ha.tap_more_info", "yaml", "key", "action: more-info", "action: more-info", ["tap_action"]],
    ["ha.tap_toggle", "yaml", "key", "action: toggle", "action: toggle", ["tap_action"]],
    ["ha.tap_call_service", "yaml", "key", "action: call-service", "action: call-service", ["tap_action", "service"]],
    ["ha.tap_fire_dom", "yaml", "key", "action: fire-dom-event", "action: fire-dom-event", ["browser_mod"]],
    ["ha.confirmation", "yaml", "snippet", "confirmation block", "confirmation:\n  text: ${1:Are you sure?}", ["confirm", "popup"]],
    ["ha.browser_mod_popup", "yaml", "snippet", "browser_mod popup", "browser_mod:\n  service: browser_mod.popup\n  data:\n    title: ${1:Title}\n    content:\n      type: ${2:custom:button-card}", ["browser_mod", "popup"]],
    ["ha.card_mod_ha_card", "yaml", "snippet", "card_mod ha-card", "card_mod:\n  style: |\n    ha-card {\n      ${1:background: rgba(0, 0, 0, 0.35); }\n    }", ["card_mod", "css"]],
    ["ha.card_mod_shadow", "yaml", "snippet", "card_mod shadow root", "card_mod:\n  style:\n    $: |\n      ${1:ha-card { }}\n", ["card_mod", "shadow"]],
  ],

  css: [
    ["css.align_items", "css", "property", "align-items:", "align-items: ", ["flex", "center"]],
    ["css.justify_content", "css", "property", "justify-content:", "justify-content: ", ["flex", "center"]],
    ["css.gap", "css", "property", "gap:", "gap: ", ["grid", "flex"]],
    ["css.grid_template_columns", "css", "property", "grid-template-columns:", "grid-template-columns: ", ["grid"]],
    ["css.flex_direction", "css", "property", "flex-direction:", "flex-direction: ", ["flex"]],
    ["css.inset", "css", "property", "inset:", "inset: ", ["position"]],
    ["css.top", "css", "property", "top:", "top: ", ["position"]],
    ["css.left", "css", "property", "left:", "left: ", ["position"]],
    ["css.right", "css", "property", "right:", "right: ", ["position"]],
    ["css.bottom", "css", "property", "bottom:", "bottom: ", ["position"]],
    ["css.min_width", "css", "property", "min-width:", "min-width: ", ["size"]],
    ["css.max_width", "css", "property", "max-width:", "max-width: ", ["size"]],
    ["css.min_height", "css", "property", "min-height:", "min-height: ", ["size"]],
    ["css.max_height", "css", "property", "max-height:", "max-height: ", ["size"]],
    ["css.opacity", "css", "property", "opacity:", "opacity: ", ["fade"]],
    ["css.visibility", "css", "property", "visibility:", "visibility: ", ["visible", "hidden"]],
    ["css.clip_path", "css", "property", "clip-path:", "clip-path: ", ["clip"]],
    ["css.contain", "css", "property", "contain:", "contain: ", ["paint", "layout"]],
    ["css.isolation", "css", "property", "isolation:", "isolation: isolate;", ["stacking"]],
    ["css.will_change", "css", "property", "will-change:", "will-change: transform;", ["performance"]],
    ["css.translate3d", "css", "snippet", "translate3d GPU", "transform: translate3d(${1:0}, ${2:0}, ${3:0});", ["gpu", "smooth"]],
    ["css.scrollbar_color", "css", "snippet", "Nostrodomus blue scrollbar", "scrollbar-color: ${1:rgba(120, 210, 255, 0.68)} ${2:rgba(255, 255, 255, 0.045)};", ["scrollbar", "blue"]],
    ["css.webkit_scrollbar", "css", "snippet", "webkit scrollbar thumb", "::-webkit-scrollbar-thumb {\n  background: ${1:rgba(120, 210, 255, 0.68)};\n  border-radius: ${2:999px};\n}", ["scrollbar", "webkit"]],
  ],

  js: [
    ["js.query_selector", "js", "function", "querySelector()", "querySelector('')", ["dom"]],
    ["js.query_selector_all", "js", "function", "querySelectorAll()", "querySelectorAll('')", ["dom"]],
    ["js.add_event_listener", "js", "snippet", "addEventListener()", "addEventListener('${1:click}', ev => {\n  ${2:}\n})", ["event"]],
    ["js.request_animation_frame", "js", "snippet", "requestAnimationFrame()", "requestAnimationFrame(() => {\n  ${1:}\n})", ["raf", "smooth"]],
    ["js.local_storage_get", "js", "function", "localStorage.getItem()", "localStorage.getItem('')", ["storage"]],
    ["js.local_storage_set", "js", "snippet", "localStorage.setItem()", "localStorage.setItem('${1:key}', JSON.stringify(${2:value}))", ["storage"]],
    ["js.json_parse", "js", "function", "JSON.parse()", "JSON.parse()", ["json"]],
    ["js.json_stringify", "js", "function", "JSON.stringify()", "JSON.stringify()", ["json"]],
    ["js.optional_chain", "js", "token", "optional chaining", "?.", ["optional", "safe"]],
    ["js.nullish", "js", "token", "nullish coalescing", " ?? ", ["default"]],
    ["js.array_map", "js", "snippet", ".map()", ".map(${1:x} => ${2:x})", ["array"]],
    ["js.array_filter", "js", "snippet", ".filter()", ".filter(${1:x} => ${2:x})", ["array"]],
    ["js.array_reduce", "js", "snippet", ".reduce()", ".reduce((${1:acc}, ${2:x}) => ${3:acc}, ${4:initial})", ["array"]],
  ],

  jinja: [
    ["jinja_now", "jinja", "function", "now()", "now()", ["time"]],
    ["jinja_as_timestamp", "jinja", "filter", "| as_timestamp", " | as_timestamp", ["time"]],
    ["jinja_timestamp_custom", "jinja", "filter", "| timestamp_custom", " | timestamp_custom('%H:%M')", ["time"]],
    ["jinja_selectattr", "jinja", "filter", "| selectattr", " | selectattr('', 'eq', '')", ["filter"]],
    ["jinja_map", "jinja", "filter", "| map", " | map(attribute='')", ["filter"]],
    ["jinja_list", "jinja", "filter", "| list", " | list", ["filter"]],
    ["jinja_count", "jinja", "filter", "| count", " | count", ["filter"]],
  ],

  html: [
    ["html.button", "html", "tag", "<button>", "<button type=\"button\"></button>", ["button"]],
    ["html.input", "html", "tag", "<input>", "<input type=\"text\" />", ["input"]],
    ["html.label", "html", "tag", "<label>", "<label></label>", ["form"]],
    ["html.section", "html", "tag", "<section>", "<section>\n  \n</section>", ["layout"]],
    ["html.template", "html", "tag", "<template>", "<template>\n  \n</template>", ["template"]],
    ["html.data_attr", "html", "attribute", "data-*", "data-name=\"\"", ["data"]],
    ["html.md_bold", "html", "snippet", "**bold**", "**${1:text}**", ["markdown", "bold", "strong"]],
    ["html.md_link", "html", "snippet", "[link](url)", "[${1:label}](${2:https://example.com})", ["markdown", "link", "url"]],
    ["html.md_template_states", "html", "snippet", "{{ states() }}", "{{ states('${1:sensor.example}') }}", ["markdown", "jinja", "states"]],
    ["html.ha_alert", "html", "snippet", "<ha-alert>", "<ha-alert alert-type=\"${1:info}\">${2:Message}</ha-alert>", ["home assistant", "alert"]],
    ["html.line_break", "html", "tag", "<br>", "<br>", ["break", "markdown-html"]],
  ],

  json: [
    ["json.title", "json", "snippet", "\"title\"", "\"title\": \"${1:Title}\"", ["title", "browser_mod"]],
    ["json.content", "json", "snippet", "\"content\"", "\"content\": ${1:{}}", ["content", "card"]],
    ["json.card", "json", "snippet", "\"card\"", "\"card\": {\n  \"type\": \"${1:custom:button-card}\"\n}", ["card", "lovelace"]],
    ["json.entity_id", "json", "snippet", "\"entity_id\"", "\"entity_id\": \"${1:light.example}\"", ["entity", "target"]],
    ["json.dismissable", "json", "property", "\"dismissable\"", "\"dismissable\": true", ["dialog", "popup"]],
    ["json.autoclose", "json", "property", "\"autoclose\"", "\"autoclose\": false", ["dialog", "popup"]],
    ["json.browser_mod_popup", "json", "snippet", "browser_mod popup payload", "{\n  \"title\": \"${1:Title}\",\n  \"content\": {\n    \"type\": \"${2:custom:button-card}\"\n  },\n  \"dismissable\": true\n}", ["browser_mod", "popup", "payload"]],
  ],

  python: [
    ["py_subprocess_run", "python", "function", "subprocess.run()", "subprocess.run([], check=True, text=True, capture_output=True)", ["subprocess"]],
    ["py_os_environ", "python", "property", "os.environ", "os.environ.get('')", ["env"]],
    ["py_sqlite_connect", "python", "function", "sqlite3.connect()", "sqlite3.connect(path)", ["sqlite"]],
    ["py_path_read", "python", "function", "Path.read_text()", "Path(path).read_text(encoding='utf-8')", ["pathlib"]],
    ["py_path_write", "python", "function", "Path.write_text()", "Path(path).write_text(text, encoding='utf-8')", ["pathlib"]],
    ["py_json_loads", "python", "function", "json.loads()", "json.loads(text)", ["json"]],
    ["py_json_dumps", "python", "function", "json.dumps()", "json.dumps(data, indent=2)", ["json"]],
  ],
}
});

const BUILTIN_NOSTRODOMUS_LIBRARY_HA_VOCAB_V1 = Object.freeze({
version: "nostrodomus-library-ha-vocab-v1",
packs: {
  css: [
    ["css.var.primary_color.0","css","property","--primary-color","--primary-color",["--primary-color","primary color"]],
    ["css.var.accent_color.1","css","property","--accent-color","--accent-color",["--accent-color","accent color"]],
    ["css.var.dark_primary_color.2","css","property","--dark-primary-color","--dark-primary-color",["--dark-primary-color","dark primary color"]],
    ["css.var.light_primary_color.3","css","property","--light-primary-color","--light-primary-color",["--light-primary-color","light primary color"]],
    ["css.var.primary_background_color.4","css","property","--primary-background-color","--primary-background-color",["--primary-background-color","primary background color"]],
    ["css.var.secondary_background_color.5","css","property","--secondary-background-color","--secondary-background-color",["--secondary-background-color","secondary background color"]],
    ["css.var.card_background_color.6","css","property","--card-background-color","--card-background-color",["--card-background-color","card background color"]],
    ["css.var.divider_color.7","css","property","--divider-color","--divider-color",["--divider-color","divider color"]],
    ["css.var.disabled_color.8","css","property","--disabled-color","--disabled-color",["--disabled-color","disabled color"]],
    ["css.var.error_color.9","css","property","--error-color","--error-color",["--error-color","error color"]],
    ["css.var.warning_color.10","css","property","--warning-color","--warning-color",["--warning-color","warning color"]],
    ["css.var.success_color.11","css","property","--success-color","--success-color",["--success-color","success color"]],
    ["css.var.info_color.12","css","property","--info-color","--info-color",["--info-color","info color"]],
    ["css.var.primary_text_color.13","css","property","--primary-text-color","--primary-text-color",["--primary-text-color","primary text color"]],
    ["css.var.secondary_text_color.14","css","property","--secondary-text-color","--secondary-text-color",["--secondary-text-color","secondary text color"]],
    ["css.var.text_primary_color.15","css","property","--text-primary-color","--text-primary-color",["--text-primary-color","text primary color"]],
    ["css.var.disabled_text_color.16","css","property","--disabled-text-color","--disabled-text-color",["--disabled-text-color","disabled text color"]],
    ["css.var.ha_card_background.17","css","property","--ha-card-background","--ha-card-background",["--ha-card-background","ha card background"]],
    ["css.var.ha_card_border_radius.18","css","property","--ha-card-border-radius","--ha-card-border-radius",["--ha-card-border-radius","ha card border radius"]],
    ["css.var.ha_card_border_width.19","css","property","--ha-card-border-width","--ha-card-border-width",["--ha-card-border-width","ha card border width"]],
    ["css.var.ha_card_border_color.20","css","property","--ha-card-border-color","--ha-card-border-color",["--ha-card-border-color","ha card border color"]],
    ["css.var.ha_card_box_shadow.21","css","property","--ha-card-box-shadow","--ha-card-box-shadow",["--ha-card-box-shadow","ha card box shadow"]],
    ["css.var.ha_card_header_color.22","css","property","--ha-card-header-color","--ha-card-header-color",["--ha-card-header-color","ha card header color"]],
    ["css.var.ha_card_header_font_size.23","css","property","--ha-card-header-font-size","--ha-card-header-font-size",["--ha-card-header-font-size","ha card header font size"]],
    ["css.var.mdc_theme_primary.24","css","property","--mdc-theme-primary","--mdc-theme-primary",["--mdc-theme-primary","mdc theme primary"]],
    ["css.var.state_icon_color.25","css","property","--state-icon-color","--state-icon-color",["--state-icon-color","state icon color"]],
    ["css.var.state_active_color.26","css","property","--state-active-color","--state-active-color",["--state-active-color","state active color"]],
    ["css.var.state_inactive_color.27","css","property","--state-inactive-color","--state-inactive-color",["--state-inactive-color","state inactive color"]],
    ["css.var.state_unavailable_color.28","css","property","--state-unavailable-color","--state-unavailable-color",["--state-unavailable-color","state unavailable color"]],
    ["css.var.icon_primary_color.29","css","property","--icon-primary-color","--icon-primary-color",["--icon-primary-color","icon primary color"]],
    ["css.var.icon_secondary_color.30","css","property","--icon-secondary-color","--icon-secondary-color",["--icon-secondary-color","icon secondary color"]],
    ["css.var.rgb_primary_color.31","css","property","--rgb-primary-color","--rgb-primary-color",["--rgb-primary-color","rgb primary color"]],
    ["css.var.rgb_accent_color.32","css","property","--rgb-accent-color","--rgb-accent-color",["--rgb-accent-color","rgb accent color"]],
    ["css.var.rgb_primary_text_color.33","css","property","--rgb-primary-text-color","--rgb-primary-text-color",["--rgb-primary-text-color","rgb primary text color"]],
    ["css.var.rgb_secondary_text_color.34","css","property","--rgb-secondary-text-color","--rgb-secondary-text-color",["--rgb-secondary-text-color","rgb secondary text color"]],
    ["css.var.rgb_card_background_color.35","css","property","--rgb-card-background-color","--rgb-card-background-color",["--rgb-card-background-color","rgb card background color"]],
    ["css.var.rgb_state_icon_color.36","css","property","--rgb-state-icon-color","--rgb-state-icon-color",["--rgb-state-icon-color","rgb state icon color"]],
    ["css.var.rgb_state_active_color.37","css","property","--rgb-state-active-color","--rgb-state-active-color",["--rgb-state-active-color","rgb state active color"]],
    ["css.var.rgb_disabled_color.38","css","property","--rgb-disabled-color","--rgb-disabled-color",["--rgb-disabled-color","rgb disabled color"]],
    ["css.var.rgb_error_color.39","css","property","--rgb-error-color","--rgb-error-color",["--rgb-error-color","rgb error color"]],
    ["css.var.rgb_warning_color.40","css","property","--rgb-warning-color","--rgb-warning-color",["--rgb-warning-color","rgb warning color"]],
    ["css.var.rgb_success_color.41","css","property","--rgb-success-color","--rgb-success-color",["--rgb-success-color","rgb success color"]],
    ["css.var.rgb_info_color.42","css","property","--rgb-info-color","--rgb-info-color",["--rgb-info-color","rgb info color"]],
    ["css.var.rgb_state_light_color.43","css","property","--rgb-state-light-color","--rgb-state-light-color",["--rgb-state-light-color","rgb state light color"]],
    ["css.var.rgb_state_switch_color.44","css","property","--rgb-state-switch-color","--rgb-state-switch-color",["--rgb-state-switch-color","rgb state switch color"]],
    ["css.var.rgb_state_climate_color.45","css","property","--rgb-state-climate-color","--rgb-state-climate-color",["--rgb-state-climate-color","rgb state climate color"]],
    ["css.var.rgb_state_binary_sensor_color.46","css","property","--rgb-state-binary-sensor-color","--rgb-state-binary-sensor-color",["--rgb-state-binary-sensor-color","rgb state binary sensor color"]],
    ["css.var.state_light_color.47","css","property","--state-light-color","--state-light-color",["--state-light-color","state light color"]],
    ["css.var.state_switch_color.48","css","property","--state-switch-color","--state-switch-color",["--state-switch-color","state switch color"]],
    ["css.var.state_climate_color.49","css","property","--state-climate-color","--state-climate-color",["--state-climate-color","state climate color"]],
    ["css.var.state_binary_sensor_color.50","css","property","--state-binary-sensor-color","--state-binary-sensor-color",["--state-binary-sensor-color","state binary sensor color"]],
    ["css.var.state_fan_color.51","css","property","--state-fan-color","--state-fan-color",["--state-fan-color","state fan color"]],
    ["css.var.state_cover_color.52","css","property","--state-cover-color","--state-cover-color",["--state-cover-color","state cover color"]],
    ["css.var.state_lock_color.53","css","property","--state-lock-color","--state-lock-color",["--state-lock-color","state lock color"]],
    ["css.var.state_media_player_color.54","css","property","--state-media-player-color","--state-media-player-color",["--state-media-player-color","state media player color"]],
    ["css.var.state_vacuum_color.55","css","property","--state-vacuum-color","--state-vacuum-color",["--state-vacuum-color","state vacuum color"]],
    ["css.var.sidebar_icon_color.56","css","property","--sidebar-icon-color","--sidebar-icon-color",["--sidebar-icon-color","sidebar icon color"]],
    ["css.var.sidebar_text_color.57","css","property","--sidebar-text-color","--sidebar-text-color",["--sidebar-text-color","sidebar text color"]],
    ["css.var.sidebar_selected_icon_color.58","css","property","--sidebar-selected-icon-color","--sidebar-selected-icon-color",["--sidebar-selected-icon-color","sidebar selected icon color"]],
    ["css.var.sidebar_selected_text_color.59","css","property","--sidebar-selected-text-color","--sidebar-selected-text-color",["--sidebar-selected-text-color","sidebar selected text color"]],
    ["css.var.sidebar_background_color.60","css","property","--sidebar-background-color","--sidebar-background-color",["--sidebar-background-color","sidebar background color"]],
    ["css.var.app_header_background_color.61","css","property","--app-header-background-color","--app-header-background-color",["--app-header-background-color","app header background color"]],
    ["css.var.app_header_text_color.62","css","property","--app-header-text-color","--app-header-text-color",["--app-header-text-color","app header text color"]],
    ["css.var.primary_font_family.63","css","property","--primary-font-family","--primary-font-family",["--primary-font-family","primary font family"]],
    ["css.var.code_font_family.64","css","property","--code-font-family","--code-font-family",["--code-font-family","code font family"]],
    ["css.var.paper_item_icon_color.65","css","property","--paper-item-icon-color","--paper-item-icon-color",["--paper-item-icon-color","paper item icon color"]],
    ["css.var.paper_item_icon_active_color.66","css","property","--paper-item-icon-active-color","--paper-item-icon-active-color",["--paper-item-icon-active-color","paper item icon active color"]],
    ["css.var.switch_checked_color.67","css","property","--switch-checked-color","--switch-checked-color",["--switch-checked-color","switch checked color"]],
    ["css.var.label_badge_background_color.68","css","property","--label-badge-background-color","--label-badge-background-color",["--label-badge-background-color","label badge background color"]],
    ["css.var.label_badge_text_color.69","css","property","--label-badge-text-color","--label-badge-text-color",["--label-badge-text-color","label badge text color"]],
    ["css.var.mdc_dialog_content_ink_color.70","css","property","--mdc-dialog-content-ink-color","--mdc-dialog-content-ink-color",["--mdc-dialog-content-ink-color","mdc dialog content ink color"]],
    ["css.var.material_background_color.71","css","property","--material-background-color","--material-background-color",["--material-background-color","material background color"]],
    ["css.var.material_secondary_background_color.72","css","property","--material-secondary-background-color","--material-secondary-background-color",["--material-secondary-background-color","material secondary background color"]],
    ["css.var.clear_background_color.73","css","property","--clear-background-color","--clear-background-color",["--clear-background-color","clear background color"]],
    ["css.var.ha_bar_background_color.74","css","property","--ha-bar-background-color","--ha-bar-background-color",["--ha-bar-background-color","ha bar background color"]],
    ["css.sel.host.75","css","selector",":host",":host {\n  \n}",[":host"]],
    ["css.sel.m.76","css","selector","$","$ ",["$"]],
    ["css.sel.m.77","css","selector",".",". ",["."]],
    ["css.sel.ha_card.78","css","selector","ha-card","ha-card {\n  \n}",["ha-card"]],
    ["css.sel.card_content.79","css","selector",".card-content",".card-content {\n  \n}",[".card-content"]],
    ["css.sel.header.80","css","selector",".header",".header {\n  \n}",[".header"]],
    ["css.sel.name.81","css","selector",".name",".name {\n  \n}",[".name"]],
    ["css.sel.state.82","css","selector",".state",".state {\n  \n}",[".state"]],
    ["css.sel.icon.83","css","selector",".icon",".icon {\n  \n}",[".icon"]],
    ["css.sel.secondary.84","css","selector",".secondary",".secondary {\n  \n}",[".secondary"]],
    ["css.sel.primary.85","css","selector",".primary",".primary {\n  \n}",[".primary"]],
    ["css.sel.value.86","css","selector",".value",".value {\n  \n}",[".value"]],
    ["css.sel.chevron.87","css","selector",".chevron",".chevron {\n  \n}",[".chevron"]],
    ["css.sel.img.88","css","selector","img","img {\n  \n}",["img"]],
    ["css.sel.before.89","css","selector","::before","::before {\n  \n}",["::before"]],
    ["css.sel.after.90","css","selector","::after","::after {\n  \n}",["::after"]],
    ["css.sel.host_type_light.91","css","selector",":host([type=light])",":host([type=light]) {\n  \n}",[":host([type=light])"]],
    ["css.sel.ha_icon.92","css","selector","ha-icon","ha-icon {\n  \n}",["ha-icon"]],
    ["css.sel.ha_state_icon.93","css","selector","ha-state-icon","ha-state-icon {\n  \n}",["ha-state-icon"]],
    ["css.sel.ha_svg_icon.94","css","selector","ha-svg-icon","ha-svg-icon {\n  \n}",["ha-svg-icon"]],
    ["css.sel.ha_icon_button.95","css","selector","ha-icon-button","ha-icon-button {\n  \n}",["ha-icon-button"]],
    ["css.sel.state_badge.96","css","selector","state-badge","state-badge {\n  \n}",["state-badge"]],
    ["css.sel.ha_tile_icon.97","css","selector","ha-tile-icon","ha-tile-icon {\n  \n}",["ha-tile-icon"]],
    ["css.sel.ha_tile_info.98","css","selector","ha-tile-info","ha-tile-info {\n  \n}",["ha-tile-info"]],
    ["css.sel.mushroom_template_card.113","css","selector","mushroom-template-card","mushroom-template-card {\n  \n}",["mushroom-template-card"]],
    ["css.sel.mushroom_entity_card.114","css","selector","mushroom-entity-card","mushroom-entity-card {\n  \n}",["mushroom-entity-card"]],
    ["css.sel.mushroom_light_card.115","css","selector","mushroom-light-card","mushroom-light-card {\n  \n}",["mushroom-light-card"]],
    ["css.sel.mushroom_chips_card.116","css","selector","mushroom-chips-card","mushroom-chips-card {\n  \n}",["mushroom-chips-card"]],
    ["css.sel.mushroom_title_card.117","css","selector","mushroom-title-card","mushroom-title-card {\n  \n}",["mushroom-title-card"]],
    ["css.sel.mushroom_cover_card.118","css","selector","mushroom-cover-card","mushroom-cover-card {\n  \n}",["mushroom-cover-card"]],
    ["css.sel.mushroom_state_info.119","css","selector","mushroom-state-info","mushroom-state-info {\n  \n}",["mushroom-state-info"]],
    ["css.sel.mushroom_shape_icon.120","css","selector","mushroom-shape-icon","mushroom-shape-icon {\n  \n}",["mushroom-shape-icon"]],
    ["css.sel.mushroom_shape_avatar.121","css","selector","mushroom-shape-avatar","mushroom-shape-avatar {\n  \n}",["mushroom-shape-avatar"]],
    ["css.sel.mushroom_badge_icon.122","css","selector","mushroom-badge-icon","mushroom-badge-icon {\n  \n}",["mushroom-badge-icon"]],
    ["css.val.block.123","css","value","block","block",["block"]],
    ["css.val.inline.124","css","value","inline","inline",["inline"]],
    ["css.val.inline_block.125","css","value","inline-block","inline-block",["inline-block"]],
    ["css.val.flex.126","css","value","flex","flex",["flex"]],
    ["css.val.inline_flex.127","css","value","inline-flex","inline-flex",["inline-flex"]],
    ["css.val.grid.128","css","value","grid","grid",["grid"]],
    ["css.val.inline_grid.129","css","value","inline-grid","inline-grid",["inline-grid"]],
    ["css.val.none.130","css","value","none","none",["none"]],
    ["css.val.contents.131","css","value","contents","contents",["contents"]],
    ["css.val.table.132","css","value","table","table",["table"]],
    ["css.val.static.133","css","value","static","static",["static"]],
    ["css.val.relative.134","css","value","relative","relative",["relative"]],
    ["css.val.absolute.135","css","value","absolute","absolute",["absolute"]],
    ["css.val.fixed.136","css","value","fixed","fixed",["fixed"]],
    ["css.val.sticky.137","css","value","sticky","sticky",["sticky"]],
    ["css.val.row.138","css","value","row","row",["row"]],
    ["css.val.row_reverse.139","css","value","row-reverse","row-reverse",["row-reverse"]],
    ["css.val.column.140","css","value","column","column",["column"]],
    ["css.val.column_reverse.141","css","value","column-reverse","column-reverse",["column-reverse"]],
    ["css.val.nowrap.142","css","value","nowrap","nowrap",["nowrap"]],
    ["css.val.wrap.143","css","value","wrap","wrap",["wrap"]],
    ["css.val.wrap_reverse.144","css","value","wrap-reverse","wrap-reverse",["wrap-reverse"]],
    ["css.val.flex_start.145","css","value","flex-start","flex-start",["flex-start"]],
    ["css.val.flex_end.146","css","value","flex-end","flex-end",["flex-end"]],
    ["css.val.center.147","css","value","center","center",["center"]],
    ["css.val.space_between.148","css","value","space-between","space-between",["space-between"]],
    ["css.val.space_around.149","css","value","space-around","space-around",["space-around"]],
    ["css.val.space_evenly.150","css","value","space-evenly","space-evenly",["space-evenly"]],
    ["css.val.start.151","css","value","start","start",["start"]],
    ["css.val.end.152","css","value","end","end",["end"]],
    ["css.val.stretch.153","css","value","stretch","stretch",["stretch"]],
    ["css.val.baseline.154","css","value","baseline","baseline",["baseline"]],
    ["css.val.left.155","css","value","left","left",["left"]],
    ["css.val.right.156","css","value","right","right",["right"]],
    ["css.val.justify.157","css","value","justify","justify",["justify"]],
    ["css.val.visible.158","css","value","visible","visible",["visible"]],
    ["css.val.hidden.159","css","value","hidden","hidden",["hidden"]],
    ["css.val.scroll.160","css","value","scroll","scroll",["scroll"]],
    ["css.val.auto.161","css","value","auto","auto",["auto"]],
    ["css.val.clip.162","css","value","clip","clip",["clip"]],
    ["css.val.transparent.163","css","value","transparent","transparent",["transparent"]],
    ["css.val.rgba_0_0_0_0_35.164","css","value","rgba(0, 0, 0, 0.35)","rgba(0, 0, 0, 0.35)",["rgba(0, 0, 0, 0.35)"]],
    ["css.val.var_ha_card_background.165","css","value","var(--ha-card-background)","var(--ha-card-background)",["var(--ha-card-background)"]],
    ["css.val.var_card_background_color.166","css","value","var(--card-background-color)","var(--card-background-color)",["var(--card-background-color)"]],
    ["css.val.linear_gradient.167","css","value","linear-gradient()","linear-gradient()",["linear-gradient()"]],
    ["css.val.radial_gradient.168","css","value","radial-gradient()","radial-gradient()",["radial-gradient()"]],
    ["css.val.center_cover_no_repeat.169","css","value","center / cover no-repeat","center / cover no-repeat",["center / cover no-repeat"]],
    ["css.val.1px_solid_var_divider_color.170","css","value","1px solid var(--divider-color)","1px solid var(--divider-color)",["1px solid var(--divider-color)"]],
    ["css.val.2px_solid_var_primary_color.171","css","value","2px solid var(--primary-color)","2px solid var(--primary-color)",["2px solid var(--primary-color)"]],
    ["css.val.1px_solid_rgba_255_255_255_0_1.172","css","value","1px solid rgba(255, 255, 255, 0.1)","1px solid rgba(255, 255, 255, 0.1)",["1px solid rgba(255, 255, 255, 0.1)"]],
    ["css.val.0.173","css","value","0","0",["0"]],
    ["css.val.4px.174","css","value","4px","4px",["4px"]],
    ["css.val.8px.175","css","value","8px","8px",["8px"]],
    ["css.val.12px.176","css","value","12px","12px",["12px"]],
    ["css.val.16px.177","css","value","16px","16px",["16px"]],
    ["css.val.24px.178","css","value","24px","24px",["24px"]],
    ["css.val.50.179","css","value","50%","50%",["50%"]],
    ["css.val.999px.180","css","value","999px","999px",["999px"]],
    ["css.val.var_ha_card_border_radius.181","css","value","var(--ha-card-border-radius)","var(--ha-card-border-radius)",["var(--ha-card-border-radius)"]],
    ["css.val.0_2px_8px_rgba_0_0_0_0_2.182","css","value","0 2px 8px rgba(0, 0, 0, 0.2)","0 2px 8px rgba(0, 0, 0, 0.2)",["0 2px 8px rgba(0, 0, 0, 0.2)"]],
    ["css.val.0_0_12px_var_primary_color.183","css","value","0 0 12px var(--primary-color)","0 0 12px var(--primary-color)",["0 0 12px var(--primary-color)"]],
    ["css.val.inset_0_0_0_1px_rgba_255_255_255_0_1.184","css","value","inset 0 0 0 1px rgba(255, 255, 255, 0.1)","inset 0 0 0 1px rgba(255, 255, 255, 0.1)",["inset 0 0 0 1px rgba(255, 255, 255, 0.1)"]],
    ["css.val.var_ha_card_box_shadow.185","css","value","var(--ha-card-box-shadow)","var(--ha-card-box-shadow)",["var(--ha-card-box-shadow)"]],
    ["css.val.blur_12px.186","css","value","blur(12px)","blur(12px)",["blur(12px)"]],
    ["css.val.blur_12px_saturate_135.187","css","value","blur(12px) saturate(135%)","blur(12px) saturate(135%)",["blur(12px) saturate(135%)"]],
    ["css.val.brightness_0_9.188","css","value","brightness(0.9)","brightness(0.9)",["brightness(0.9)"]],
    ["css.val.saturate_180.189","css","value","saturate(180%)","saturate(180%)",["saturate(180%)"]],
    ["css.val.var_primary_text_color.190","css","value","var(--primary-text-color)","var(--primary-text-color)",["var(--primary-text-color)"]],
    ["css.val.var_secondary_text_color.191","css","value","var(--secondary-text-color)","var(--secondary-text-color)",["var(--secondary-text-color)"]],
    ["css.val.var_primary_color.192","css","value","var(--primary-color)","var(--primary-color)",["var(--primary-color)"]],
    ["css.val.var_accent_color.193","css","value","var(--accent-color)","var(--accent-color)",["var(--accent-color)"]],
    ["css.val.var_state_icon_color.194","css","value","var(--state-icon-color)","var(--state-icon-color)",["var(--state-icon-color)"]],
    ["css.val.white.195","css","value","white","white",["white"]],
    ["css.val.inherit.196","css","value","inherit","inherit",["inherit"]],
    ["css.val.currentcolor.197","css","value","currentColor","currentColor",["currentColor"]],
    ["css.val.normal.198","css","value","normal","normal",["normal"]],
    ["css.val.bold.199","css","value","bold","bold",["bold"]],
    ["css.val.lighter.200","css","value","lighter","lighter",["lighter"]],
    ["css.val.bolder.201","css","value","bolder","bolder",["bolder"]],
    ["css.val.100.202","css","value","100","100",["100"]],
    ["css.val.300.203","css","value","300","300",["300"]],
    ["css.val.400.204","css","value","400","400",["400"]],
    ["css.val.500.205","css","value","500","500",["500"]],
    ["css.val.600.206","css","value","600","600",["600"]],
    ["css.val.700.207","css","value","700","700",["700"]],
    ["css.val.900.208","css","value","900","900",["900"]],
    ["css.val.default.209","css","value","default","default",["default"]],
    ["css.val.pointer.210","css","value","pointer","pointer",["pointer"]],
    ["css.val.not_allowed.211","css","value","not-allowed","not-allowed",["not-allowed"]],
    ["css.val.grab.212","css","value","grab","grab",["grab"]],
    ["css.val.grabbing.213","css","value","grabbing","grabbing",["grabbing"]],
    ["css.val.text.214","css","value","text","text",["text"]],
    ["css.val.wait.215","css","value","wait","wait",["wait"]],
    ["css.val.help.216","css","value","help","help",["help"]],
    ["css.val.0_25.217","css","value","0.25","0.25",["0.25"]],
    ["css.val.0_5.218","css","value","0.5","0.5",["0.5"]],
    ["css.val.0_75.219","css","value","0.75","0.75",["0.75"]],
    ["css.val.1.220","css","value","1","1",["1"]],
    ["css.val.scale_1_05.221","css","value","scale(1.05)","scale(1.05)",["scale(1.05)"]],
    ["css.val.scale_0_95.222","css","value","scale(0.95)","scale(0.95)",["scale(0.95)"]],
    ["css.val.translate_0_0.223","css","value","translate(0, 0)","translate(0, 0)",["translate(0, 0)"]],
    ["css.val.translatex_10px.224","css","value","translateX(10px)","translateX(10px)",["translateX(10px)"]],
    ["css.val.translatey_4px.225","css","value","translateY(-4px)","translateY(-4px)",["translateY(-4px)"]],
    ["css.val.translate3d_0_0_0.226","css","value","translate3d(0, 0, 0)","translate3d(0, 0, 0)",["translate3d(0, 0, 0)"]],
    ["css.val.rotate_45deg.227","css","value","rotate(45deg)","rotate(45deg)",["rotate(45deg)"]],
    ["css.val.rotate_90deg.228","css","value","rotate(90deg)","rotate(90deg)",["rotate(90deg)"]],
    ["css.val.skew_10deg.229","css","value","skew(10deg)","skew(10deg)",["skew(10deg)"]],
    ["css.val.all_0_2s_ease.230","css","value","all 0.2s ease","all 0.2s ease",["all 0.2s ease"]],
    ["css.val.all_0_3s_ease_in_out.231","css","value","all 0.3s ease-in-out","all 0.3s ease-in-out",["all 0.3s ease-in-out"]],
    ["css.val.transform_0_2s_ease.232","css","value","transform 0.2s ease","transform 0.2s ease",["transform 0.2s ease"]],
    ["css.val.opacity_0_3s_ease.233","css","value","opacity 0.3s ease","opacity 0.3s ease",["opacity 0.3s ease"]],
    ["css.val.0_2s.234","css","value","0.2s","0.2s",["0.2s"]],
    ["css.val.collapse.235","css","value","collapse","collapse",["collapse"]],
    ["css.val.all.236","css","value","all","all",["all"]],
    ["css.val.pre.237","css","value","pre","pre",["pre"]],
    ["css.val.pre_wrap.238","css","value","pre-wrap","pre-wrap",["pre-wrap"]],
    ["css.val.pre_line.239","css","value","pre-line","pre-line",["pre-line"]],
    ["css.val.break_spaces.240","css","value","break-spaces","break-spaces",["break-spaces"]],
    ["css.val.fill.241","css","value","fill","fill",["fill"]],
    ["css.val.contain.242","css","value","contain","contain",["contain"]],
    ["css.val.cover.243","css","value","cover","cover",["cover"]],
    ["css.val.scale_down.244","css","value","scale-down","scale-down",["scale-down"]],
    ["css.val.blur_2px.245","css","value","blur(2px)","blur(2px)",["blur(2px)"]],
    ["css.val.brightness_1_2.246","css","value","brightness(1.2)","brightness(1.2)",["brightness(1.2)"]],
    ["css.val.grayscale_1.247","css","value","grayscale(1)","grayscale(1)",["grayscale(1)"]],
    ["css.val.drop_shadow_0_0_4px_var_primary_color.248","css","value","drop-shadow(0 0 4px var(--primary-color))","drop-shadow(0 0 4px var(--primary-color))",["drop-shadow(0 0 4px var(--primary-color))"]],
    ["css.val.invert_1.249","css","value","invert(1)","invert(1)",["invert(1)"]],
  ],

  jinja: [
    ["jinja.fn.is_state_attr.250","jinja","function","is_state_attr","is_state_attr(",["is_state_attr"]],
    ["jinja.fn.state_translated.251","jinja","function","state_translated","state_translated(",["state_translated"]],
    ["jinja.fn.has_value.252","jinja","function","has_value","has_value(",["has_value"]],
    ["jinja.fn.now.253","jinja","function","now","now(",["now"]],
    ["jinja.fn.utcnow.254","jinja","function","utcnow","utcnow(",["utcnow"]],
    ["jinja.fn.today_at.255","jinja","function","today_at","today_at(",["today_at"]],
    ["jinja.fn.as_datetime.256","jinja","function","as_datetime","as_datetime(",["as_datetime"]],
    ["jinja.fn.as_timestamp.257","jinja","function","as_timestamp","as_timestamp(",["as_timestamp"]],
    ["jinja.fn.as_local.258","jinja","function","as_local","as_local(",["as_local"]],
    ["jinja.fn.as_timedelta.259","jinja","function","as_timedelta","as_timedelta(",["as_timedelta"]],
    ["jinja.fn.relative_time.260","jinja","function","relative_time","relative_time(",["relative_time"]],
    ["jinja.fn.time_since.261","jinja","function","time_since","time_since(",["time_since"]],
    ["jinja.fn.time_until.262","jinja","function","time_until","time_until(",["time_until"]],
    ["jinja.fn.expand.263","jinja","function","expand","expand(",["expand"]],
    ["jinja.fn.closest.264","jinja","function","closest","closest(",["closest"]],
    ["jinja.fn.distance.265","jinja","function","distance","distance(",["distance"]],
    ["jinja.fn.iif.266","jinja","function","iif","iif(",["iif"]],
    ["jinja.fn.area_id.267","jinja","function","area_id","area_id(",["area_id"]],
    ["jinja.fn.area_name.268","jinja","function","area_name","area_name(",["area_name"]],
    ["jinja.fn.area_entities.269","jinja","function","area_entities","area_entities(",["area_entities"]],
    ["jinja.fn.area_devices.270","jinja","function","area_devices","area_devices(",["area_devices"]],
    ["jinja.fn.areas.271","jinja","function","areas","areas(",["areas"]],
    ["jinja.fn.device_id.272","jinja","function","device_id","device_id(",["device_id"]],
    ["jinja.fn.device_attr.273","jinja","function","device_attr","device_attr(",["device_attr"]],
    ["jinja.fn.is_device_attr.274","jinja","function","is_device_attr","is_device_attr(",["is_device_attr"]],
    ["jinja.fn.device_entities.275","jinja","function","device_entities","device_entities(",["device_entities"]],
    ["jinja.fn.devices.277","jinja","function","devices","devices(",["devices"]],
    ["jinja.fn.floor_id.278","jinja","function","floor_id","floor_id(",["floor_id"]],
    ["jinja.fn.floor_name.279","jinja","function","floor_name","floor_name(",["floor_name"]],
    ["jinja.fn.floor_areas.280","jinja","function","floor_areas","floor_areas(",["floor_areas"]],
    ["jinja.fn.floors.281","jinja","function","floors","floors(",["floors"]],
    ["jinja.fn.label_id.282","jinja","function","label_id","label_id(",["label_id"]],
    ["jinja.fn.label_name.283","jinja","function","label_name","label_name(",["label_name"]],
    ["jinja.fn.label_areas.284","jinja","function","label_areas","label_areas(",["label_areas"]],
    ["jinja.fn.label_devices.285","jinja","function","label_devices","label_devices(",["label_devices"]],
    ["jinja.fn.label_entities.286","jinja","function","label_entities","label_entities(",["label_entities"]],
    ["jinja.fn.labels.287","jinja","function","labels","labels(",["labels"]],
    ["jinja.fn.integration_entities.288","jinja","function","integration_entities","integration_entities(",["integration_entities"]],
    ["jinja.fn.config_entry_id.289","jinja","function","config_entry_id","config_entry_id(",["config_entry_id"]],
    ["jinja.fn.config_entry_attr.290","jinja","function","config_entry_attr","config_entry_attr(",["config_entry_attr"]],
    ["jinja.fn.is_hidden_entity.291","jinja","function","is_hidden_entity","is_hidden_entity(",["is_hidden_entity"]],
    ["jinja.fn.entity_id.292","jinja","function","entity_id","entity_id(",["entity_id"]],
    ["jinja.fn.entities.293","jinja","function","entities","entities(",["entities"]],
    ["jinja.fn.namespace.294","jinja","function","namespace","namespace(",["namespace"]],
    ["jinja.fn.min.295","jinja","function","min","min(",["min"]],
    ["jinja.fn.max.296","jinja","function","max","max(",["max"]],
    ["jinja.fn.average.297","jinja","function","average","average(",["average"]],
    ["jinja.fn.median.298","jinja","function","median","median(",["median"]],
    ["jinja.fn.sum.299","jinja","function","sum","sum(",["sum"]],
    ["jinja.filter.abs.301","jinja","filter","abs","abs",["abs"]],
    ["jinja.filter.multiply.302","jinja","filter","multiply","multiply",["multiply"]],
    ["jinja.filter.add.303","jinja","filter","add","add",["add"]],
    ["jinja.filter.log.304","jinja","filter","log","log",["log"]],
    ["jinja.filter.sin.305","jinja","filter","sin","sin",["sin"]],
    ["jinja.filter.cos.306","jinja","filter","cos","cos",["cos"]],
    ["jinja.filter.tan.307","jinja","filter","tan","tan",["tan"]],
    ["jinja.filter.sqrt.308","jinja","filter","sqrt","sqrt",["sqrt"]],
    ["jinja.filter.timestamp_custom.309","jinja","filter","timestamp_custom","timestamp_custom",["timestamp_custom"]],
    ["jinja.filter.timestamp_local.310","jinja","filter","timestamp_local","timestamp_local",["timestamp_local"]],
    ["jinja.filter.timestamp_utc.311","jinja","filter","timestamp_utc","timestamp_utc",["timestamp_utc"]],
    ["jinja.filter.as_timestamp.312","jinja","filter","as_timestamp","as_timestamp",["as_timestamp"]],
    ["jinja.filter.as_datetime.313","jinja","filter","as_datetime","as_datetime",["as_datetime"]],
    ["jinja.filter.as_local.314","jinja","filter","as_local","as_local",["as_local"]],
    ["jinja.filter.as_timedelta.315","jinja","filter","as_timedelta","as_timedelta",["as_timedelta"]],
    ["jinja.filter.relative_time.316","jinja","filter","relative_time","relative_time",["relative_time"]],
    ["jinja.filter.time_since.317","jinja","filter","time_since","time_since",["time_since"]],
    ["jinja.filter.time_until.318","jinja","filter","time_until","time_until",["time_until"]],
    ["jinja.filter.regex_match.319","jinja","filter","regex_match","regex_match",["regex_match"]],
    ["jinja.filter.regex_search.320","jinja","filter","regex_search","regex_search",["regex_search"]],
    ["jinja.filter.regex_replace.321","jinja","filter","regex_replace","regex_replace",["regex_replace"]],
    ["jinja.filter.regex_findall.322","jinja","filter","regex_findall","regex_findall",["regex_findall"]],
    ["jinja.filter.regex_findall_index.323","jinja","filter","regex_findall_index","regex_findall_index",["regex_findall_index"]],
    ["jinja.filter.selectattr.324","jinja","filter","selectattr","selectattr",["selectattr"]],
    ["jinja.filter.rejectattr.325","jinja","filter","rejectattr","rejectattr",["rejectattr"]],
    ["jinja.filter.select.326","jinja","filter","select","select",["select"]],
    ["jinja.filter.reject.327","jinja","filter","reject","reject",["reject"]],
    ["jinja.filter.map.328","jinja","filter","map","map",["map"]],
    ["jinja.filter.list.329","jinja","filter","list","list",["list"]],
    ["jinja.filter.join.330","jinja","filter","join","join",["join"]],
    ["jinja.filter.min.331","jinja","filter","min","min",["min"]],
    ["jinja.filter.max.332","jinja","filter","max","max",["max"]],
    ["jinja.filter.sum.333","jinja","filter","sum","sum",["sum"]],
    ["jinja.filter.average.334","jinja","filter","average","average",["average"]],
    ["jinja.filter.median.335","jinja","filter","median","median",["median"]],
    ["jinja.filter.statistical_mode.336","jinja","filter","statistical_mode","statistical_mode",["statistical_mode"]],
    ["jinja.filter.first.337","jinja","filter","first","first",["first"]],
    ["jinja.filter.last.338","jinja","filter","last","last",["last"]],
    ["jinja.filter.unique.339","jinja","filter","unique","unique",["unique"]],
    ["jinja.filter.sort.340","jinja","filter","sort","sort",["sort"]],
    ["jinja.filter.slugify.341","jinja","filter","slugify","slugify",["slugify"]],
    ["jinja.filter.ordinal.342","jinja","filter","ordinal","ordinal",["ordinal"]],
    ["jinja.filter.ord.343","jinja","filter","ord","ord",["ord"]],
    ["jinja.filter.base64_encode.344","jinja","filter","base64_encode","base64_encode",["base64_encode"]],
    ["jinja.filter.base64_decode.345","jinja","filter","base64_decode","base64_decode",["base64_decode"]],
    ["jinja.filter.to_json.346","jinja","filter","to_json","to_json",["to_json"]],
    ["jinja.filter.from_hex.347","jinja","filter","from_hex","from_hex",["from_hex"]],
    ["jinja.filter.is_defined.348","jinja","filter","is_defined","is_defined",["is_defined"]],
    ["jinja.filter.bitwise_and.349","jinja","filter","bitwise_and","bitwise_and",["bitwise_and"]],
    ["jinja.filter.bitwise_or.350","jinja","filter","bitwise_or","bitwise_or",["bitwise_or"]],
    ["jinja.filter.bitwise_xor.351","jinja","filter","bitwise_xor","bitwise_xor",["bitwise_xor"]],
    ["jinja.filter.iif.352","jinja","filter","iif","iif",["iif"]],
    ["jinja.filter.contains.353","jinja","filter","contains","contains",["contains"]],
    ["jinja.filter.upper.354","jinja","filter","upper","upper",["upper"]],
    ["jinja.filter.title.355","jinja","filter","title","title",["title"]],
    ["jinja.filter.capitalize.356","jinja","filter","capitalize","capitalize",["capitalize"]],
    ["jinja.filter.replace.357","jinja","filter","replace","replace",["replace"]],
    ["jinja.filter.trim.358","jinja","filter","trim","trim",["trim"]],
    ["jinja.test.defined.359","jinja","function","defined","defined",["defined","is defined"]],
    ["jinja.test.undefined.360","jinja","function","undefined","undefined",["undefined","is undefined"]],
    ["jinja.test.none.361","jinja","function","none","none",["none","is none"]],
    ["jinja.test.number.362","jinja","function","number","number",["number","is number"]],
    ["jinja.test.string.363","jinja","function","string","string",["string","is string"]],
    ["jinja.test.boolean.364","jinja","function","boolean","boolean",["boolean","is boolean"]],
    ["jinja.test.integer.365","jinja","function","integer","integer",["integer","is integer"]],
    ["jinja.test.float.366","jinja","function","float","float",["float","is float"]],
    ["jinja.test.mapping.367","jinja","function","mapping","mapping",["mapping","is mapping"]],
    ["jinja.test.sequence.368","jinja","function","sequence","sequence",["sequence","is sequence"]],
    ["jinja.test.iterable.369","jinja","function","iterable","iterable",["iterable","is iterable"]],
    ["jinja.test.callable.370","jinja","function","callable","callable",["callable","is callable"]],
    ["jinja.test.match.371","jinja","function","match","match",["match","is match"]],
    ["jinja.test.search.372","jinja","function","search","search",["search","is search"]],
    ["jinja.test.in.373","jinja","function","in","in",["in","is in"]],
    ["jinja.test.contains.374","jinja","function","contains","contains",["contains","is contains"]],
    ["jinja.test.is_number.375","jinja","function","is_number","is_number",["is_number","is is_number"]],
    ["jinja.test.datetime.376","jinja","function","datetime","datetime",["datetime","is datetime"]],
    ["jinja.test.true.377","jinja","function","true","true",["true","is true"]],
    ["jinja.test.false.378","jinja","function","false","false",["false","is false"]],
    ["jinja.test.even.379","jinja","function","even","even",["even","is even"]],
    ["jinja.test.odd.380","jinja","function","odd","odd",["odd","is odd"]],
    ["jinja.test.divisibleby.381","jinja","function","divisibleby","divisibleby",["divisibleby","is divisibleby"]],
    ["jinja.test.eq.382","jinja","function","eq","eq",["eq","is eq"]],
    ["jinja.test.ne.383","jinja","function","ne","ne",["ne","is ne"]],
    ["jinja.test.lt.384","jinja","function","lt","lt",["lt","is lt"]],
    ["jinja.test.le.385","jinja","function","le","le",["le","is le"]],
    ["jinja.test.gt.386","jinja","function","gt","gt",["gt","is gt"]],
    ["jinja.test.ge.387","jinja","function","ge","ge",["ge","is ge"]],
    ["jinja.test.sameas.388","jinja","function","sameas","sameas",["sameas","is sameas"]],
  ],
},
});

export async function loadLibrary(input) {
  const options = input || {};
  const runtimeState = options?.state;
  const buildRuntimeIndex = typeof options?.buildIndex === 'function' ? options.buildIndex : null;
  if (runtimeState?.library) return runtimeState.library;

  const coreLib = BUILTIN_NOSTRODOMUS_LIBRARY_CORE_V1;
  const addonLib = BUILTIN_NOSTRODOMUS_LIBRARY_WEBDEV_V1;
  const vocabLib = BUILTIN_NOSTRODOMUS_LIBRARY_HA_VOCAB_V1;

  const packs = {};
  for (const [lang, rows] of Object.entries(coreLib?.packs || {})) {
    packs[lang] = [...rows];
  }

  for (const lib of [addonLib, vocabLib]) {
    if (!lib?.packs) continue;
    for (const [lang, rows] of Object.entries(lib.packs)) {
      packs[lang] = [...(packs[lang] || []), ...rows];
    }
  }

  const library = {
    version: 'nostrodomus-library-bundled',
    bundled: true,
    packs,
    sources: [
      coreLib?.version || 'core-bundled',
      addonLib?.version || 'webdev-bundled',
      vocabLib?.version || 'ha-vocab-bundled',
    ].filter(Boolean),
  };

  if (runtimeState) {
    runtimeState.library = library;
    if (buildRuntimeIndex) buildRuntimeIndex();
  }

  return library;
}

export function sanitizeLibraryRow(raw, source = 'library', options = {}) {
  const limits = limitsFromOptions(options);
  if (!Array.isArray(raw) || raw.length < 5) return null;

  const id = safeString(raw[0], 180);
  const lang = safeString(raw[1], 32).toLowerCase();
  const type = safeString(raw[2], 32).toLowerCase();
  const label = safeString(raw[3], limits.maxItemLabel);
  const insert = safeString(raw[4], limits.maxInsertText);
  const aliases = Array.isArray(raw[5])
    ? raw[5].slice(0, limits.maxAliases).map(x => safeString(x, limits.maxAlias)).filter(Boolean)
    : [];

  if (!id || !lang || !type || !label) return null;

  // Library rows are local, but a malformed language or type still never reaches rendering or insertion.
  if (!/^[a-z0-9_-]+$/i.test(lang)) return null;
  if (!/^[a-z0-9_.:-]+$/i.test(type)) return null;

  return { id, lang, type, label, insert, aliases, source };
}

export function normalizeItem(raw, source = 'library', options = {}) {
  const safe = sanitizeLibraryRow(raw, source, options);
  if (!safe) return null;

  const labelLower = safe.label.toLowerCase();
  const insertLower = safe.insert.toLowerCase();
  const haystack = [safe.label, safe.insert, safe.type, safe.lang, ...safe.aliases].join(' ').toLowerCase();
  return { ...safe, labelLower, insertLower, haystack };
}

export function clearCompletionCache(runtimeState) {
  runtimeState?.completionCache?.clear?.();
}

export function cacheSet(runtimeState, key, value, options = {}) {
  const limits = limitsFromOptions(options);
  if (!runtimeState?.completionCache) return;
  if (runtimeState.completionCache.size >= limits.maxCacheEntries) {
    const first = runtimeState.completionCache.keys().next().value;
    runtimeState.completionCache.delete(first);
  }
  runtimeState.completionCache.set(key, value);
}

// Template rows that carry their own block delimiter (`{% if %}`, `{% set %}`). Template rows
// are offered only inside an open `{{` or `{%`, so such a row fits in two places:
//   - the typed `{%` is the whole prefix: the row replaces it and is offered as it is;
//   - a word is typed right after `{%` (`{% i`, `{%-se`): the typed `{%` stays, so the row is
//     offered without its own.
// Anywhere else (inside `{{ }}`, further into a block) it would put a second delimiter inside
// the open one, so it is left out.
function templateRowsAt(pool, ctx) {
  if (String(ctx?.prefix || '').startsWith('{%')) return pool;
  const opening = templateBlockOpening(ctx);
  const out = [];
  for (const item of pool) {
    const insert = item?.lang === 'jinja' ? String(item.insert || '') : '';
    if (!insert.startsWith('{%')) { out.push(item); continue; }
    if (!opening) continue;
    // After `{% ` the blank is typed too; after `{%` or `{%-` the row keeps its own.
    const rest = /[ \t]$/.test(opening) ? insert.replace(/^\{%\s*/, '') : insert.slice(2);
    out.push({ ...item, insert: rest, insertLower: rest.toLowerCase() });
  }
  return out;
}

export function staticLibraryProvider(options = {}) {
  const runtimeState = options?.state;
  const providerId = options?.providerId || STATIC_PROVIDER_ID;
  return {
    id: providerId,
    label: 'Static library provider',
    canHandle(ctx) {
      return !!ctx?.shouldSuggest && !!runtimeState?.index && !!runtimeState?.settings?.enabledLangs?.[ctx.lang];
    },
    provide(ctx) {
      const pool = runtimeState?.settings?.globalSearch
        ? runtimeState?.index?.all
        : (runtimeState?.index?.byLang?.[ctx.lang] || []);
      if (!Array.isArray(pool)) return [];
      return ctx?.lang === 'jinja' ? templateRowsAt(pool, ctx) : pool;
    },
  };
}

export function buildIndex(options = {}) {
  const runtimeState = options?.state;
  const registerProvider = typeof options?.registerProvider === 'function' ? options.registerProvider : null;
  const createStaticProvider = typeof options?.staticLibraryProvider === 'function'
    ? options.staticLibraryProvider
    : () => staticLibraryProvider({ state: runtimeState });
  const createSnippetProvider = typeof options?.snippetProvider === 'function' ? options.snippetProvider : null;
  const createLovelaceProvider = typeof options?.lovelaceContextProvider === 'function' ? options.lovelaceContextProvider : null;
  const createHacsCatalogProvider = typeof options?.hacsCatalogProvider === 'function' ? options.hacsCatalogProvider : hacsCatalogProvider;
  const createHaRuntimeProvider = typeof options?.haRuntimeValueProvider === 'function' ? options.haRuntimeValueProvider : null;
  const createDocumentWordProvider = typeof options?.documentWordProvider === 'function' ? options.documentWordProvider : null;
  const logIndexed = typeof options?.logIndexed === 'function' ? options.logIndexed : null;
  const ensureProviderSettings = typeof options?.ensureProviderSettings === 'function' ? options.ensureProviderSettings : null;
  const limits = limitsFromOptions(options);
  const packs = runtimeState?.library?.packs || {};
  const byLang = {};
  const all = [];
  const rejected = {};

  for (const [lang, rowsRaw] of Object.entries(packs)) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw.slice(0, limits.maxRowsPerPack) : [];
    byLang[lang] = [];

    for (const row of rows) {
      const item = normalizeItem(row, lang, { limits });
      if (item) {
        byLang[lang].push(item);
        all.push(item);
      } else {
        rejected[lang] = (rejected[lang] || 0) + 1;
      }
    }
  }

  if (!runtimeState) return { byLang, all, rejected };

  runtimeState.index = { byLang, all, rejected };
  if (ensureProviderSettings) ensureProviderSettings();
  const registeredBefore = Array.isArray(runtimeState.providers) ? runtimeState.providers : [];
  runtimeState.providers = [];
  runtimeState.providerStats = {};
  if (registerProvider) {
    registerProvider(createStaticProvider());
    if (createSnippetProvider) registerProvider(createSnippetProvider());
    if (createLovelaceProvider) registerProvider(createLovelaceProvider());
    if (createHacsCatalogProvider) registerProvider(createHacsCatalogProvider());
    if (createHaRuntimeProvider) registerProvider(createHaRuntimeProvider());
    if (createDocumentWordProvider) registerProvider(createDocumentWordProvider());
    // A provider added through the public registerProvider API before this build stays
    // registered, after the built-in ones, although the list was emptied above. An id that a
    // built-in provider uses stays built in.
    const builtInIds = new Set(runtimeState.providers.map(provider => providerDiagnosticId(provider)));
    for (const provider of registeredBefore) {
      if (provider && !builtInIds.has(providerDiagnosticId(provider))) registerProvider(provider);
    }
  }
  clearCompletionCache(runtimeState);

  if (logIndexed) {
    logIndexed({
      total: all.length,
      langs: Object.fromEntries(Object.entries(byLang).map(([k, v]) => [k, v.length])),
      rejected,
      providers: Array.isArray(runtimeState.providers) ? runtimeState.providers.map(p => p.id) : [],
    });
  }

  return runtimeState.index;
}
