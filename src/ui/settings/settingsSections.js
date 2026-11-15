// The tab sections and help cards of the settings panel, and the wrappers that let the panel
// open when one section fails to build: the error is recorded once (recordRuntimeErrorOnce) and
// a card saying the section is unavailable takes its place.

export function createSettingsSections(deps = {}) {
  const {
    createSettingsElement,
    settingsCard,
    recordRuntimeErrorOnce,
  } = deps;

  function sectionPanel(name, activeTab, children = []) {
    const active = activeTab === name;
    return createSettingsElement("section", {
      className: `nostrodomus-section ${active ? "active" : ""}`,
      id: `nostrodomus-tabpanel-${name}`,
      dataset: { section: name },
      attrs: { role: "tabpanel", "aria-hidden": active ? "false" : "true", "aria-labelledby": `nostrodomus-tab-${name}` },
    }, children);
  }

  function helpCard(title, lines = []) {
    const card = createSettingsElement("div", { className: "nostrodomus-help-card" });
    card.appendChild(createSettingsElement("b", { text: title }));
    const commands = lines.filter(line => line?.code);
    const notes = lines.filter(line => !line?.code);
    for (const note of notes) {
      card.appendChild(createSettingsElement("div", {
        text: String(note?.text ?? note ?? ""),
        style: "opacity:.7;line-height:1.36;margin-top:6px",
      }));
    }
    commands.forEach((line, index) => {
      const label = commands.length > 1 ? `${title} #${index + 1}` : title;
      card.appendChild(createSettingsElement("button", {
        className: "nostrodomus-help-copy-card",
        dataset: { copyCommand: line.code, copyLabel: label },
        attrs: { type: "button", title: "Copy command to clipboard", "aria-label": `Copy ${label} console command` },
      }, [
        createSettingsElement("span", { className: "nostrodomus-help-copy-title", text: label }),
        createSettingsElement("code", { text: line.code }),
        createSettingsElement("span", { className: "nostrodomus-help-copy-hint", text: "Click this whole command card to copy" }),
      ]));
    });
    return card;
  }

  function settingsRuntimeFallbackCard(title, message, detail = "") {
    return settingsCard([
      createSettingsElement("b", { text: title }),
      createSettingsElement("div", {
        text: message,
        style: "opacity:.72;line-height:1.36;margin-top:4px",
      }),
      detail ? createSettingsElement("code", {
        text: detail,
        style: "display:block;margin-top:8px;white-space:pre-wrap;word-break:break-word;opacity:.75",
      }) : null,
    ].filter(Boolean), "nostrodomus-settings-runtime-fallback-card");
  }

  function safeSettingsRuntimeNode(label, build) {
    try {
      const node = build?.();
      return node || settingsRuntimeFallbackCard("Unavailable", `${label} returned no content.`);
    } catch (err) {
      try { recordRuntimeErrorOnce(`settings:${label}`, err, { phase: "openSettings", section: label }); } catch { /* diagnostics must not throw */ }
      return settingsRuntimeFallbackCard(
        "Section temporarily unavailable",
        `The ${label.replace(/-/g, " ")} section failed to render, but Settings can still open.`,
        String(err?.message || err).slice(0, 220),
      );
    }
  }

  function safeSettingsRuntimeNodes(label, build) {
    try {
      const nodes = build?.();
      if (Array.isArray(nodes)) return nodes.filter(Boolean);
      return nodes ? [nodes] : [settingsRuntimeFallbackCard("Unavailable", `${label} returned no content.`)];
    } catch (err) {
      try { recordRuntimeErrorOnce(`settings:${label}`, err, { phase: "openSettings", section: label }); } catch { /* diagnostics must not throw */ }
      return [settingsRuntimeFallbackCard(
        "Section temporarily unavailable",
        `The ${label.replace(/-/g, " ")} section failed to render, but Settings can still open.`,
        String(err?.message || err).slice(0, 220),
      )];
    }
  }

  function safeSettingsRuntimeCall(label, fn) {
    try { return fn?.(); }
    catch (err) {
      try { recordRuntimeErrorOnce(`settings:${label}`, err, { phase: "openSettings", section: label }); } catch { /* diagnostics must not throw */ }
      return null;
    }
  }

  return {
    sectionPanel,
    helpCard,
    settingsRuntimeFallbackCard,
    safeSettingsRuntimeNode,
    safeSettingsRuntimeNodes,
    safeSettingsRuntimeCall,
  };
}
