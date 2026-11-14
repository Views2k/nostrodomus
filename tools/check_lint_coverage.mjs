// Lint-coverage guard (anti-regression for the lint gate).
//
// Proves the lint step actually inspected every shipping src module, so an
// incorrect/collapsed file glob can never again silently leave files unlinted
// while the gate still reports green.
//
// Background: an unquoted `src/**/*.js` glob is expanded by the POSIX shell
// (/bin/sh -> dash, no globstar) as a single `*`, matching only one directory
// level -- which skipped 10 src files (including the composition root
// src/main.legacy.js) and hid real no-undef errors behind a false-green gate.
// The lint scripts now pass directories so eslint resolves recursion via its own
// `files` patterns; this guard fails the gate if any non-ignored src module is
// still missing from eslint's coverage. It re-derives the expected file set with
// a filesystem walk (shell-independent), so it cannot be fooled by the same bug.

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

// No shipping src module may be lint-exempt: an ignore-list entry shrinks BOTH
// sides of the coverage comparison below, so without this allowlist check the
// guard would self-shrink and report 0 gaps for an ignored module.
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
  console.error(`lint coverage gap: ${ignoredSrc.length} src module(s) are lint-IGNORED without an allowlist entry:`);
  for (const rel of ignoredSrc) console.error(`  - ${rel}`);
  process.exit(1);
}

const results = await eslint.lintFiles(["src"]);
const linted = new Set(results.map((result) => path.resolve(result.filePath)));

const missing = expected.filter((file) => !linted.has(file));
if (missing.length > 0) {
  console.error(`lint coverage gap: ${missing.length} src module(s) were NOT linted (collapsed glob?):`);
  for (const file of missing) console.error(`  - ${path.relative(ROOT, file)}`);
  process.exit(1);
}

console.log(`lint coverage OK: ${linted.size} src modules linted, ${expected.length} expected, 0 gaps`);
