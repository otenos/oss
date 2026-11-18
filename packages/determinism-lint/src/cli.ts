#!/usr/bin/env node
/**
 * `determinism-lint <dir>... [--floats] [--relative-imports] [--no-approximate-math]`
 *
 * Scans every JavaScript and TypeScript source under each directory (tests and
 * declaration files skipped). Exit code 0 when clean, 1 when something was
 * found, 2 on a usage error.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { formatFindings, scanDirectory, type Finding } from './index.js';

const USAGE = `Usage: determinism-lint <dir>... [options]

Reports code that makes the same input give different results: the clock,
unseeded randomness, locale data, environment globals and floating-point
functions engines may round differently.

Options:
      --floats               Also report fractional number literals
      --relative-imports     Report imports that are not ./ or ../
      --no-approximate-math  Allow Math.sin, Math.pow, ** and the like
  -h, --help                 Show this help`;

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      floats: { type: 'boolean' },
      'relative-imports': { type: 'boolean' },
      'no-approximate-math': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (error) {
  fail((error as Error).message);
}

const { values, positionals } = parsed;
if (values.help === true) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
if (positionals.length === 0) fail('Expected at least one directory.');
for (const dir of positionals) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`Not a directory: ${dir}`);
}

let files = 0;
const findings: Finding[] = [];
for (const dir of positionals) {
  const result = scanDirectory(dir, {
    rules: { floats: values.floats === true, approximateMath: values['no-approximate-math'] !== true },
    ...(values['relative-imports'] === true ? { imports: 'relative' as const } : {}),
  });
  files += result.files;
  findings.push(...result.findings.map((finding) => ({ ...finding, file: join(dir, finding.file) })));
}

if (files === 0) fail('No source files found.');
const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
if (findings.length === 0) {
  process.stdout.write(`${count(files, 'file')}, nothing found.\n`);
  process.exit(0);
}
process.stdout.write(`${formatFindings(findings)}\n\n${count(findings.length, 'finding')} in ${count(files, 'file')}.\n`);
process.exit(1);
