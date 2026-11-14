import test from 'node:test';
import assert from 'node:assert/strict';

import * as adapter from '../../src/yaml/runtimeContextAdapter.js';
import * as classifier from '../../src/yaml/yamlContextClassifier.js';

// The runtime keeps SIX duplicated context-classifier functions across the adapter (whose copies the live
// eager paths call) and the classifier. The registry value lane was DEAD on 0.1.262 because a branch was
// added to the classifier's yamlValueKind but not the adapter's, so it never fired live. Every one of
// these duplicated functions carries the same risk. This pins ALL of them equivalent across a broad
// matrix, so any future (or existing) divergence — a branch added to one copy only — fails here instead
// of silently shipping a dead lane. Retire per-function as the duplication is consolidated.
const KEYS = [
  '', 'entity', 'entity_id', 'entities', 'my_entity', 'sensor_entity_id',
  'area_id', 'area', 'device_id', 'floor_id', 'label_id',
  'service', 'service_name', 'perform_action', 'action', 'type', 'trigger', 'condition',
  'icon', 'my_icon', 'theme', 'mode',
  'enabled', 'show_state', 'show_name', 'show_icon', 'show_label', 'state_color', 'square', 'full_width',
  'brightness_pct', 'random_key', 'target', 'card_mod', 'style', 'styles', 'color',
];
const PATHS = [
  [], ['triggers', 'trigger'], ['conditions', 'condition'], ['choose', 'if'],
  ['actions', 'action', 'target'], ['tap_action', 'target'], ['data'], ['entities'],
  ['service_data'], ['target'], ['card_mod'], ['styles'],
];
const ROLES = ['value', 'list-key', 'key', 'blank'];
const FLAGS = [true, false];
const VALUE_KINDS = ['', 'entity', 'service', 'area', 'boolean', 'card-type', 'scalar', 'number'];
const LANGS = ['yaml', 'css', 'jinja'];

// The five ctx-shaped duplicated functions (the sixth, isScalarValueKind(kind), takes a kind string).
const CTX_FNS = ['yamlValueKind', 'yamlScalarValueKind', 'isScalarConfigContext', 'yamlFocusKind', 'yamlBlockValueKeyKind'];

test('adapter/classifier copies agree for every ctx-shaped duplicated classifier function', () => {
  const mismatches = [];
  let cases = 0;
  for (const yamlKey of KEYS) {
    for (const yamlPath of PATHS) {
      for (const yamlRole of ROLES) {
        for (const registryLaneEnabled of FLAGS) {
          // vary a couple of extra fields lightly so focus/block/scalar branches are exercised too
          for (const valueKind of ['', VALUE_KINDS[(yamlKey.length + yamlPath.length) % VALUE_KINDS.length]]) {
            for (const lang of ['yaml', LANGS[yamlRole.length % LANGS.length]]) {
              const ctx = { yamlKey, yamlPath, yamlRole, registryLaneEnabled, valueKind, lang };
              for (const fn of CTX_FNS) {
                cases += 1;
                let a; let c;
                try { a = adapter[fn](ctx); } catch (e) { a = `THROW:${e.message}`; }
                try { c = classifier[fn](ctx); } catch (e) { c = `THROW:${e.message}`; }
                if (a !== c) {
                  mismatches.push(`${fn}(key=${JSON.stringify(yamlKey)} path=${JSON.stringify(yamlPath)} role=${yamlRole} reg=${registryLaneEnabled} vk=${JSON.stringify(valueKind)} lang=${lang}): adapter=${JSON.stringify(a)} classifier=${JSON.stringify(c)}`);
                }
              }
            }
          }
        }
      }
    }
  }
  assert.equal(mismatches.length, 0, `duplicated classifier functions diverged in ${mismatches.length}/${cases} cases (a branch added to one copy only — the registry-class dead-lane bug):\n${mismatches.slice(0, 25).join('\n')}`);
});

test('adapter/classifier isScalarValueKind(kind) agree for every value kind', () => {
  const KINDS = ['', 'entity', 'service', 'area', 'device', 'floor', 'label', 'boolean', 'number', 'card-type', 'trigger-type', 'condition-type', 'icon', 'theme', 'automation-mode', 'scalar', 'string', 'nonsense'];
  const mismatches = KINDS.filter((k) => adapter.isScalarValueKind(k) !== classifier.isScalarValueKind(k))
    .map((k) => `isScalarValueKind(${JSON.stringify(k)}): adapter=${adapter.isScalarValueKind(k)} classifier=${classifier.isScalarValueKind(k)}`);
  assert.equal(mismatches.length, 0, `isScalarValueKind copies diverged:\n${mismatches.join('\n')}`);
});
