import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCodeMirrorNativeHighlightSpec,
  codeMirrorNativeHighlightAvailable,
  installCodeMirrorNativeHighlightExtension,
} from '../../src/syntax/codeMirrorNativeHighlight.js';

test('buildCodeMirrorNativeHighlightSpec maps CodeMirror tags to Nostrodomus syntax roles', () => {
  const tags = {
    comment: { name: 'comment' },
    keyword: { name: 'keyword' },
    string: { name: 'string' },
    number: { name: 'number' },
    bool: { name: 'bool' },
    variableName: { name: 'variableName' },
    propertyName: { name: 'propertyName' },
    operator: { name: 'operator' },
    punctuation: { name: 'punctuation' },
  };
  const spec = buildCodeMirrorNativeHighlightSpec({ tags }, (kind) => `color-${kind}`);

  assert.ok(spec.entries.length >= 8);
  assert.ok(spec.labels.includes('comment'));
  assert.ok(spec.kinds.includes('keyword'));
  assert.equal(spec.entries.find((entry) => entry.tag === tags.comment).color, 'color-comment');
});

test('installCodeMirrorNativeHighlightExtension appends then reconfigures a CM6 HighlightStyle compartment', () => {
  const dispatched = [];
  const view = {
    state: { installedCompartments: new Map() },
    dispatch(payload) {
      dispatched.push(payload.effects);
      if (payload.effects?.type === 'appendConfig') {
        view.state.installedCompartments.set(payload.effects.compartment, payload.effects.extension);
      }
      if (payload.effects?.type === 'reconfigure') {
        view.state.installedCompartments.set(payload.effects.compartment, payload.effects.extension);
      }
    },
  };

  class FakeCompartment {
    of(extension) {
      return { compartment: this, extension };
    }
    reconfigure(extension) {
      return { type: 'reconfigure', compartment: this, extension };
    }
    get(state) {
      return state.installedCompartments.get(this);
    }
  }

  const tags = {
    comment: { name: 'comment' },
    keyword: { name: 'keyword' },
    string: { name: 'string' },
  };
  const cm = {
    tags,
    HighlightStyle: {
      define(entries) {
        return { entries };
      },
    },
    syntaxHighlighting(style, options) {
      return { style, options };
    },
    Compartment: FakeCompartment,
    StateEffect: {
      appendConfig: {
        of(value) {
          return { type: 'appendConfig', ...value };
        },
      },
    },
  };
  const host = {};
  const parts = { cm, view, tags, host };
  const syntax = { presetKey: 'vscodeDarkPlus', themeOpacity: 1, themeSaturation: 1, active: true };

  assert.equal(codeMirrorNativeHighlightAvailable(parts), true);

  const first = installCodeMirrorNativeHighlightExtension(parts, syntax, (kind) => `color-${kind}`, { version: 'test-v1' });
  assert.equal(first.installed, true);
  assert.equal(first.nativeHighlight, true);
  assert.equal(first.dispatch, 'appendConfig');
  assert.equal(dispatched.at(-1).type, 'appendConfig');

  const second = installCodeMirrorNativeHighlightExtension(parts, { ...syntax, themeOpacity: 0.9 }, (kind) => `color-${kind}`, { version: 'test-v2' });
  assert.equal(second.installed, true);
  assert.equal(second.nativeHighlight, true);
  assert.equal(second.dispatch, 'reconfigure');
  assert.equal(dispatched.at(-1).type, 'reconfigure');
});
