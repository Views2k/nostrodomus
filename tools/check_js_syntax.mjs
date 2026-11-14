#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const explicit = [
  'src/main.js',
  'src/main.legacy.js',
  'dist/nostrodomus.js',
];
const skipDirs = new Set(['node_modules', '.git', 'reports', 'analysis', 'extract-candidates']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile() && path.endsWith('.js')) out.push(relative(root, path).replaceAll('\\\\', '/'));
  }
  return out;
}

const files = Array.from(new Set([...explicit, ...walk(join(root, 'src'))]))
  .filter((file) => existsSync(join(root, file)))
  .sort();

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`JS syntax check failed: ${file}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

if (failed) process.exit(1);
console.log(`JS syntax OK (${files.length} files)`);
