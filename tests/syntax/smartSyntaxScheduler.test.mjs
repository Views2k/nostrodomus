import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS,
  sourceClassSmartSyntaxMinInterval,
  sourceClassSmartSyntaxObserverReady,
  sourceClassSmartSyntaxPendingReasonUpdate,
  sourceClassSmartSyntaxReasonIsUrgent,
  sourceClassSmartSyntaxWaitMs,
  sourceClassSyntaxInstallForceRefresh,
  sourceClassSyntaxInstallReasonForcesRefresh,
  sourceClassSyntaxRefreshReasonUpdate,
} from "../../src/syntax/smartSyntaxScheduler.js";

test("source-class smart syntax urgent reason helper preserves legacy token matching", () => {
  assert.deepEqual(SOURCE_CLASS_SMART_SYNTAX_URGENT_REASON_TOKENS, [
    "settings",
    "option-change",
    "range-change",
    "toggle",
    "reset",
    "restore",
    "open",
    "install",
    "syntax-theme",
  ]);

  for (const reason of [
    "settings-save",
    "card-option-change",
    "editor-range-change",
    "syntax-toggle",
    "reset-defaults",
    "restore-settings",
    "dialog-open",
    "install-source-class",
    "syntax-theme-change",
  ]) {
    assert.equal(sourceClassSmartSyntaxReasonIsUrgent(reason), true, reason);
  }
});

test("source-class smart syntax urgent reason helper preserves string coercion and case-insensitivity", () => {
  assert.equal(sourceClassSmartSyntaxReasonIsUrgent("SETTINGS-PANEL"), true);
  assert.equal(
    sourceClassSmartSyntaxReasonIsUrgent({ toString: () => "range-change-from-object" }),
    true,
  );
  assert.equal(sourceClassSmartSyntaxReasonIsUrgent(null), false);
  assert.equal(sourceClassSmartSyntaxReasonIsUrgent(undefined), false);
  assert.equal(sourceClassSmartSyntaxReasonIsUrgent("typing"), false);
});


test("source-class install force-refresh helper preserves urgent reason matching", () => {
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("settings-save"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("card-option-change"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("editor-range-change"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("syntax-toggle"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("reset-defaults"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("restore-settings"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("dialog-open"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("install-source-class"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("syntax-theme-change"), true);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("typing"), false);
});

test("source-class install force-refresh helper preserves coercion and custom token behavior", () => {
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("SETTINGS-PANEL"), true);
  assert.equal(
    sourceClassSyntaxInstallReasonForcesRefresh({ toString: () => "range-change-from-object" }),
    true,
  );
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh(null), false);
  assert.equal(sourceClassSyntaxInstallReasonForcesRefresh("custom-refresh", ["custom"]), true);
});

test("source-class install force-refresh decision helper preserves legacy boolean expression", () => {
  assert.equal(sourceClassSyntaxInstallForceRefresh(true, true, "typing"), true);
  assert.equal(sourceClassSyntaxInstallForceRefresh(false, false, "typing"), true);
  assert.equal(sourceClassSyntaxInstallForceRefresh(false, true, "settings-save"), true);
  assert.equal(sourceClassSyntaxInstallForceRefresh(false, true, "syntax-theme-change"), true);
  assert.equal(sourceClassSyntaxInstallForceRefresh(false, true, "typing"), false);
});

test("source-class install force-refresh decision helper preserves custom tokens and coercion", () => {
  assert.equal(sourceClassSyntaxInstallForceRefresh(1, true, "typing"), true);
  assert.equal(sourceClassSyntaxInstallForceRefresh(false, 0, "typing"), true);
  assert.equal(sourceClassSyntaxInstallForceRefresh(false, true, "custom-refresh", ["custom"]), true);
  assert.equal(
    sourceClassSyntaxInstallForceRefresh(false, true, { toString: () => "range-change-from-object" }),
    true,
  );
});

test("source-class smart syntax min interval preserves urgent zero and default debounce behavior", () => {
  assert.equal(sourceClassSmartSyntaxMinInterval("settings"), 0);
  assert.equal(sourceClassSmartSyntaxMinInterval("syntax-theme"), 0);
  assert.equal(sourceClassSmartSyntaxMinInterval("typing"), 90);
  assert.equal(sourceClassSmartSyntaxMinInterval("typing", 125, 5), 125);
  assert.equal(sourceClassSmartSyntaxMinInterval("custom-urgent", 125, 5, ["custom"]), 5);
});

test("source-class smart syntax wait helper preserves elapsed debounce behavior", () => {
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", 1000, 1000), 90);
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", 1045, 1000), 45);
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", 1090, 1000), 0);
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", 1125, 1000), 0);
});

test("source-class smart syntax wait helper preserves urgent zero-delay behavior", () => {
  assert.equal(sourceClassSmartSyntaxWaitMs("settings-save", 1000, 1000), 0);
  assert.equal(sourceClassSmartSyntaxWaitMs("syntax-theme-change", 1045, 1000), 0);
  assert.equal(sourceClassSmartSyntaxWaitMs("custom", 1000, 1000, 125, 5, ["custom"]), 5);
  assert.equal(sourceClassSmartSyntaxWaitMs("custom", 1007, 1000, 125, 5, ["custom"]), 0);
});

test("source-class smart syntax wait helper preserves numeric coercion and fallback behavior", () => {
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", "1050", "1000"), 40);
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", null, null), 90);
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", Number.NaN, Number.NaN), 90);
  assert.equal(sourceClassSmartSyntaxWaitMs("typing", 1000, 1100), 190);
});

test("source-class smart syntax pending reason helper preserves new reason append behavior", () => {
  assert.deepEqual(sourceClassSmartSyntaxPendingReasonUpdate("", "typing"), {
    clean: "typing",
    duplicate: false,
    parts: ["typing"],
    pendingReason: "typing",
    count: 1,
  });

  assert.deepEqual(sourceClassSmartSyntaxPendingReasonUpdate("typing", "settings"), {
    clean: "settings",
    duplicate: false,
    parts: ["typing", "settings"],
    pendingReason: "typing+settings",
    count: 2,
  });
});

test("source-class smart syntax pending reason helper preserves duplicate coalescing behavior", () => {
  assert.deepEqual(sourceClassSmartSyntaxPendingReasonUpdate("typing+settings", "typing"), {
    clean: "typing",
    duplicate: true,
    parts: ["typing", "settings"],
    pendingReason: "typing+settings",
    count: 2,
  });
});

test("source-class smart syntax pending reason helper preserves fallback and string coercion behavior", () => {
  assert.deepEqual(sourceClassSmartSyntaxPendingReasonUpdate(null, null), {
    clean: "smart-source-syntax",
    duplicate: false,
    parts: ["smart-source-syntax"],
    pendingReason: "smart-source-syntax",
    count: 1,
  });

  assert.deepEqual(
    sourceClassSmartSyntaxPendingReasonUpdate(
      { toString: () => "first+second" },
      { toString: () => "third" },
    ),
    {
      clean: "third",
      duplicate: false,
      parts: ["first", "second", "third"],
      pendingReason: "first+second+third",
      count: 3,
    },
  );
});



test("source-class syntax refresh reason helper preserves append behavior", () => {
  assert.deepEqual(sourceClassSyntaxRefreshReasonUpdate("", "settings"), {
    clean: "settings",
    duplicate: false,
    parts: ["settings"],
    pendingReason: "settings",
    count: 1,
  });

  assert.deepEqual(sourceClassSyntaxRefreshReasonUpdate("typing", "settings"), {
    clean: "settings",
    duplicate: false,
    parts: ["typing", "settings"],
    pendingReason: "typing+settings",
    count: 2,
  });
});

test("source-class syntax refresh reason helper preserves duplicate coalescing and coercion", () => {
  assert.deepEqual(sourceClassSyntaxRefreshReasonUpdate("typing+settings", "typing"), {
    clean: "typing",
    duplicate: true,
    parts: ["typing", "settings"],
    pendingReason: "typing+settings",
    count: 2,
  });

  assert.deepEqual(sourceClassSyntaxRefreshReasonUpdate(null, null), {
    clean: "source-class-refresh",
    duplicate: false,
    parts: ["source-class-refresh"],
    pendingReason: "source-class-refresh",
    count: 1,
  });

  assert.deepEqual(
    sourceClassSyntaxRefreshReasonUpdate(
      { toString: () => "first+second" },
      { toString: () => "third" },
    ),
    {
      clean: "third",
      duplicate: false,
      parts: ["first", "second", "third"],
      pendingReason: "first+second+third",
      count: 3,
    },
  );
});

test("source-class smart syntax observer readiness helper preserves base observer matching", () => {
  const observer = { disconnect() {} };
  const content = { nodeType: 1 };

  assert.equal(
    sourceClassSmartSyntaxObserverReady(observer, "editor-a", content, "editor-a", content),
    true,
  );
  assert.equal(
    sourceClassSmartSyntaxObserverReady(null, "editor-a", content, "editor-a", content),
    false,
  );
  assert.equal(
    sourceClassSmartSyntaxObserverReady(observer, "editor-a", content, "editor-b", content),
    false,
  );
  assert.equal(
    sourceClassSmartSyntaxObserverReady(observer, "editor-a", content, "editor-a", { nodeType: 1 }),
    false,
  );
});

test("source-class smart syntax observer readiness helper preserves source-class content ownership checks", () => {
  const observer = { disconnect() {} };
  const content = { nodeType: 1 };

  assert.equal(
    sourceClassSmartSyntaxObserverReady(
      observer,
      "editor-a",
      content,
      "editor-a",
      content,
      "source-class",
      "editor-a",
      content,
      true,
    ),
    true,
  );
  assert.equal(
    sourceClassSmartSyntaxObserverReady(
      observer,
      "editor-a",
      content,
      "editor-a",
      content,
      "inline",
      "editor-a",
      content,
      true,
    ),
    false,
  );
  assert.equal(
    sourceClassSmartSyntaxObserverReady(
      observer,
      "editor-a",
      content,
      "editor-a",
      content,
      "source-class",
      "editor-b",
      content,
      true,
    ),
    false,
  );
  assert.equal(
    sourceClassSmartSyntaxObserverReady(
      observer,
      "editor-a",
      content,
      "editor-a",
      content,
      "source-class",
      "editor-a",
      { nodeType: 1 },
      true,
    ),
    false,
  );
});

test("source-class smart syntax scheduler extraction keeps scheduler delegates out of main legacy", () => {
  const main = readFileSync(new URL("../../src/main.legacy.js", import.meta.url), "utf8");
  assert.equal(main.includes("function sourceClassSmartSyntaxReasonIsUrgent("), false);
  assert.equal(main.includes("function sourceClassSmartSyntaxMinInterval("), false);
  assert.equal(main.includes("function sourceClassSmartSyntaxPendingReasonUpdate("), false);
  assert.equal(main.includes("function sourceClassSmartSyntaxWaitMs("), false);
  const runtime = ["smartSyntaxLifecycle.js", "sourceClassLifecycle.js", "syntaxContentObservers.js"]
    .map(file => readFileSync(new URL(`../../src/syntax/${file}`, import.meta.url), "utf8"))
    .join("\n");
  assert.equal(
    runtime.includes(
      "sourceClassSmartSyntaxWaitMs(reason, now, state.sourceClassSmartSyntaxLastRunAt || 0, rangeMode ? 32 : 90)",
    ),
    true,
  );
  assert.equal(
    runtime.includes(
      "sourceClassSmartSyntaxPendingReasonUpdate(state.sourceClassSmartSyntaxPendingReason",
    ),
    true,
  );
  assert.equal(main.includes("function sourceClassSmartSyntaxObserverReady("), false);
  assert.equal(main.includes("function sourceClassSyntaxInstallReasonForcesRefresh("), false);
  assert.equal(main.includes("function sourceClassSyntaxInstallForceRefresh("), false);
  assert.equal(main.includes("function sourceClassSyntaxRefreshReasonUpdate("), false);
  assert.equal(
    runtime.includes("sourceClassSmartSyntaxObserverReady(state.sourceClassSmartSyntaxObserver"),
    true,
  );
  assert.equal(
    runtime.includes("sourceClassSyntaxInstallForceRefresh(styleChanged, sourceAlreadyActive, reason)"),
    true,
  );
  assert.equal(main.includes("sourceClassSyntaxInstallReasonForcesRefresh(reason)"), false);
  assert.equal(
    runtime.includes("sourceClassSyntaxRefreshReasonUpdate(state.sourceClassSyntaxRefreshReason"),
    true,
  );
});

test('the routine repaint reason "apply-text-color-preset" is not urgent', () => {
  assert.equal(sourceClassSmartSyntaxReasonIsUrgent('apply-text-color-preset'), false);
  assert.equal(sourceClassSmartSyntaxReasonIsUrgent('settings-reset'), true);
  assert.equal(sourceClassSmartSyntaxReasonIsUrgent('preset-toggle'), true);
});
