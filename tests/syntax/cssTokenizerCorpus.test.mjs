import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  smartSyntaxCssTokenKind,
  smartSyntaxTokenizeCssLine,
} from "../../src/syntax/smartSyntaxTokenizers.js";

// Frozen corpus snapshot (senior-finish P5B). The CSS tokenizers are pure functions;
// their token output over this corpus is pinned byte-for-byte. If this test fails,
// tokenizer behavior changed — reconcile the change deliberately and regenerate the
// fixture in the same commit with an explanation, never as a side effect.
const CORPUS = JSON.parse(
  readFileSync(new URL("../fixtures/syntax/css_tokenizer_corpus.json", import.meta.url), "utf8"),
);

test("CSS tokenizer output is identical over the frozen corpus", () => {
  assert.ok(CORPUS.entries.length >= 200, "corpus did not load");
  for (const entry of CORPUS.entries) {
    const tokens = smartSyntaxTokenizeCssLine(entry.text, entry.lineKind);
    assert.deepEqual(
      tokens,
      entry.tokens,
      `smartSyntaxTokenizeCssLine drifted for ${JSON.stringify(entry.text)} (${entry.lineKind})`,
    );
    const tokenKinds = tokens.map((token) =>
      smartSyntaxCssTokenKind(
        entry.text.slice(token.start, token.end),
        entry.text,
        entry.lineKind,
        token.start,
        token.end,
      ),
    );
    assert.deepEqual(
      tokenKinds,
      entry.tokenKinds,
      `smartSyntaxCssTokenKind drifted for ${JSON.stringify(entry.text)} (${entry.lineKind})`,
    );
  }
});

test("corpus tokens are well-formed ranges", () => {
  for (const entry of CORPUS.entries) {
    let previousEnd = -1;
    for (const token of entry.tokens) {
      assert.ok(token.end > token.start, "token range is non-empty");
      assert.ok(token.start >= previousEnd, "tokens are ordered and non-overlapping");
      assert.ok(token.end <= entry.text.length, "token stays inside the line");
      previousEnd = token.end;
    }
  }
});
