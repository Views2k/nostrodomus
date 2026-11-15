// Checks that the lint step inspected every src module.
//
// The lint scripts pass directories, not globs: /bin/sh has no globstar and expands an unquoted
// `src/**/*.js` one directory level deep, which leaves files unlinted without an error. This
// check lists src/ with a filesystem walk, which does not depend on the shell, and fails when
// eslint ignored or skipped one of those files.

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

function walkJsFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) found.push(path.resolve(full));
  }
  return found;
}

const eslint = new ESLint({ cwd: ROOT });

// No src module may be exempt from lint. An ignore entry would remove the file from both sides
// of the comparison below, so an ignored module is rejected here unless ALLOWED_IGNORED_SRC lists it.
const ALLOWED_IGNORED_SRC = new Set();

const expected = [];
const ignoredSrc = [];
for (const file of walkJsFiles(SRC)) {
  if (await eslint.isPathIgnored(file)) {
    const rel = path.relative(ROOT, file);
    if (!ALLOWED_IGNORED_SRC.has(rel)) ignoredSrc.push(rel);
  } else {
    expected.push(file);
  }
}

if (ignoredSrc.length > 0) {
  console.error(`lint coverage gap: ${ignoredSrc.length} src module(s) are ignored by eslint without an allowlist entry:`);
  for (const rel of ignoredSrc) console.error(`  - ${rel}`);
  process.exit(1);
}

const results = await eslint.lintFiles(["src"]);
const linted = new Set(results.map((result) => path.resolve(result.filePath)));

const missing = expected.filter((file) => !linted.has(file));
if (missing.length > 0) {
  console.error(`lint coverage gap: ${missing.length} src module(s) were not linted:`);
  for (const file of missing) console.error(`  - ${path.relative(ROOT, file)}`);
  process.exit(1);
}

console.log(`lint coverage OK: ${linted.size} src modules linted, ${expected.length} expected, 0 gaps`);
