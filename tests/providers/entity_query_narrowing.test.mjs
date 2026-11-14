import test from 'node:test';
import assert from 'node:assert/strict';

import { filterEntityIdsByQuery } from '../../src/providers/haRuntimeProvider.js';

// While the user extends a query, filterEntityIdsByQuery answers from the ids that matched the
// previous query instead of reading every indexed id again. The result has to be the result of
// the full pass: the same ids in the same order. This file compares the two over a generated
// corpus. The full pass below is written out on its own and never reuses anything.

function fullPass(ids, query, names) {
  const q = String(query).trim().toLowerCase();
  if (!q) return ids;
  const inOrder = (text) => {
    let at = 0;
    for (const ch of text) if (ch === q[at]) at += 1;
    return at === q.length;
  };
  const groups = [[], [], [], []];
  for (const id of ids) {
    const low = String(id).toLowerCase();
    const friendly = names && names[id] ? String(names[id]).toLowerCase() : '';
    if (low.startsWith(q)) groups[0].push(id);
    else if (low.includes(q)) groups[1].push(id);
    else if (friendly && friendly.includes(q)) groups[2].push(id);
    else if (inOrder(low)) groups[3].push(id);
  }
  return groups.flat();
}

// A small fixed-seed generator, so every run sees the same corpus.
function generator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const DOMAINS = ['binary_sensor', 'sensor', 'light', 'switch', 'climate', 'cover', 'media_player', 'input_boolean', 'automation', 'script'];
const WORDS = ['kitchen', 'living', 'room', 'bed', 'bath', 'garage', 'door', 'window', 'lamp', 'main', 'temp', 'humidity', 'power', 'energy', 'motion', 'hue', 'bulb', 'tv', 'strip', 'fan'];

function corpus(random, count) {
  const pick = list => list[Math.floor(random() * list.length)];
  const ids = new Set();
  const names = {};
  while (ids.size < count) {
    const parts = [pick(WORDS)];
    if (random() < 0.7) parts.push(pick(WORDS));
    if (random() < 0.4) parts.push(String(Math.floor(random() * 30)));
    const id = `${pick(DOMAINS)}.${parts.join('_')}`;
    if (ids.has(id)) continue;
    ids.add(id);
    // About half of the entities have a friendly name; some names share no word with the id.
    if (random() < 0.5) names[id] = `${pick(WORDS)} ${pick(WORDS)}`.replace(/^./, ch => ch.toUpperCase());
    if (random() < 0.1) names[id] = `${pick(['Upstairs', 'Übung', 'Ground Floor'])} ${pick(WORDS)}`;
  }
  return { ids: [...ids].sort(), names };
}

// Queries a user could type: the start of an id, of a word inside one, of a friendly name, or
// characters picked in order from an id.
function typedText(random, data) {
  const id = data.ids[Math.floor(random() * data.ids.length)];
  const roll = random();
  if (roll < 0.3) return id;
  if (roll < 0.55) return id.slice(id.indexOf('.') + 1);
  if (roll < 0.75) return String(data.names[id] || id.split('.')[0]);
  if (roll < 0.9) return [...id].filter(() => random() < 0.5).join('') || id.slice(0, 2);
  return `${id.slice(0, 4).toUpperCase()}${id.slice(4)}`;
}

test('extending a query gives the result of a full pass: same ids, same order', () => {
  const random = generator(20261113);
  let compared = 0;
  let narrowedShorter = 0;
  for (let round = 0; round < 10; round += 1) {
    const data = corpus(random, 400 + round * 150);
    const useNames = round % 3 !== 0;
    const names = useNames ? data.names : null;
    for (let chain = 0; chain < 40; chain += 1) {
      const text = typedText(random, data);
      // One character at a time, as typed, on the same ids array and names object.
      for (let length = 1; length <= text.length; length += 1) {
        const query = text.slice(0, length);
        const expected = fullPass(data.ids, query, names);
        const actual = filterEntityIdsByQuery(data.ids, query, names);
        assert.deepEqual(actual, expected, `query ${JSON.stringify(query)} in round ${round}`);
        compared += 1;
        if (expected.length < data.ids.length) narrowedShorter += 1;
      }
    }
  }
  assert.ok(compared > 3000, `${compared} queries compared`);
  assert.ok(narrowedShorter > 2000);
});

test('a query that does not extend the last one, or another list or names object, runs the full pass', () => {
  const random = generator(7);
  const data = corpus(random, 900);
  const other = corpus(random, 900);
  const check = (ids, query, names) => assert.deepEqual(filterEntityIdsByQuery(ids, query, names), fullPass(ids, query, names), JSON.stringify(query));

  check(data.ids, 'kit', data.names);
  check(data.ids, 'ki', data.names);            // shorter again (a deleted character)
  check(data.ids, 'kitchen', data.names);       // several characters at once (a paste)
  check(data.ids, 'gar', data.names);           // unrelated
  check(data.ids, 'gara', null);                // same list, no names
  check(data.ids, 'garag', data.names);         // names are back
  check(other.ids, 'garage', other.names);      // another snapshot
  check(data.ids, 'garage_', data.names);
  check(data.ids, '  GARAGE_D ', data.names);   // trimmed and lowercased like the last query
  check([...data.ids], 'garage_do', data.names); // an equal copy is another list
  check(data.ids, 'sensor.', data.names);
  check(data.ids, 'sensor.', data.names);       // the same query twice
  check(data.ids, 'sensor.t', { ...data.names }); // an equal copy of the names is another object
});

test('a list that grew or shrank in place is read in full again', () => {
  const ids = ['light.kitchen', 'light.living', 'sensor.kitchen_temp'];
  assert.deepEqual(filterEntityIdsByQuery(ids, 'kit'), ['light.kitchen', 'sensor.kitchen_temp']);
  ids.push('switch.kitchen_fan');
  assert.deepEqual(filterEntityIdsByQuery(ids, 'kitc'), ['light.kitchen', 'sensor.kitchen_temp', 'switch.kitchen_fan']);
  ids.length = 1;
  assert.deepEqual(filterEntityIdsByQuery(ids, 'kitch'), ['light.kitchen']);
});

test('an extended query reads only the ids that matched the previous one', () => {
  const ids = [];
  for (let i = 0; i < 5000; i += 1) ids.push(`sensor.room_${String(i).padStart(4, '0')}`);
  ids.push('light.kitchen_main', 'light.kitchen_strip');
  ids.sort();
  let reads = 0;
  const counted = new Proxy(ids, { get(target, key, receiver) { if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1; return Reflect.get(target, key, receiver); } });
  assert.deepEqual(filterEntityIdsByQuery(counted, 'kit'), ['light.kitchen_main', 'light.kitchen_strip']);
  const fullReads = reads;
  assert.ok(fullReads >= ids.length);
  reads = 0;
  assert.deepEqual(filterEntityIdsByQuery(counted, 'kitc'), ['light.kitchen_main', 'light.kitchen_strip']);
  assert.deepEqual(filterEntityIdsByQuery(counted, 'kitchen_s'), ['light.kitchen_strip']);
  assert.equal(reads, 0, 'the two longer queries did not read the list again');
});

test('an empty query still returns the list itself and does not start a chain', () => {
  const ids = ['light.a', 'switch.b'];
  assert.equal(filterEntityIdsByQuery(ids, 'li').length, 1);
  assert.equal(filterEntityIdsByQuery(ids, ''), ids);
  assert.deepEqual(filterEntityIdsByQuery(ids, 'sw'), ['switch.b'], 'sw does not extend li');
});
