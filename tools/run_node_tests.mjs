#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// Preflight: on too-old Node the suite fails as a wall of syntax errors.
// Fail with one clear line instead. The Node floor is two-tier by design:
// package.json "engines" (>= 22) is the supported product/e2e toolchain floor,
// while this preflight enforces the proven unit-suite floor -- the suite is
// verified green on Node 20.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) {
  console.error(`Node ${process.versions.node} is too old to run this test suite; use Node >= 20 (>= 22 for the full product/e2e toolchain).`);
  process.exit(1);
}

const root = process.cwd();
const testsRoot = join(root, 'tests');
const perfRoot = join(testsRoot, 'perf');

// Perf-sensitive tests (wall-clock budget assertions) live under tests/perf/
// and run only via `npm run test:perf`. The default `npm test` walk excludes
// them by construction so the required gate stays timing-flake-free.
const perfMode = process.argv.includes('--perf');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!perfMode && path === perfRoot) continue;
      walk(path, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      out.push(relative(root, path).replaceAll('\\\\', '/'));
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
