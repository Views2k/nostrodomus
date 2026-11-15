#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// On a Node version that is too old the suite fails with a wall of syntax errors; fail with one
// line instead. The unit tests run on Node 20. package.json asks for Node 22, the version CI uses,
// and the browser test scripts need it for the global WebSocket client.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) {
  console.error(`Node ${process.versions.node} is too old to run this test suite; use Node 20 or newer (22 or newer for the browser tests).`);
  process.exit(1);
}

const root = process.cwd();
const testsRoot = join(root, 'tests');
const perfRoot = join(testsRoot, 'perf');

// The wall-clock budget tests under tests/perf/ run only with `npm run test:perf`, so that
// `npm test` does not depend on the speed of the machine.
const perfMode = process.argv.includes('--perf');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!perfMode && path === perfRoot) continue;
      walk(path, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      out.push(relative(root, path));
    }
  }
  return out;
}

const files = walk(perfMode ? perfRoot : testsRoot).sort();
if (!files.length) {
  console.error(perfMode
    ? 'No perf Node tests found under tests/perf/**/*.test.mjs'
    : 'No executed Node tests found under tests/**/*.test.mjs');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
