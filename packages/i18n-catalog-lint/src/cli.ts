#!/usr/bin/env node
/**
 * `i18n-catalog-lint <dir> --reference en [--syntax vue-i18n] [--forbid <text>]...`
 *
 * Reads every `<locale>.json` in the directory, lints them against the
 * reference and checks each file for duplicate keys. Exit code 0 when clean,
 * 1 when issues were found, 2 on a usage error.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { findDuplicateKeys, formatIssues, lintCatalogs, type Catalogs, type Issue, type Tree } from './index.js';

const USAGE = `Usage: i18n-catalog-lint <dir> --reference <locale> [options]

Reads every <locale>.json in <dir> and lints them against the reference.

Options:
  -r, --reference <locale>  Source locale every catalog must match (required)
      --syntax vue-i18n     Report sentences vue-i18n cannot parse
      --forbid <text>       Ban a string in every message (repeatable)
      --no-empty            Allow empty messages
  -h, --help                Show this help`;

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      reference: { type: 'string', short: 'r' },
      syntax: { type: 'string' },
      forbid: { type: 'string', multiple: true },
      'no-empty': { type: 'boolean' },
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

const dir = positionals[0];
if (dir === undefined || positionals.length > 1) fail('Expected exactly one directory.');
if (values.reference === undefined) fail('Missing --reference.');
if (values.syntax !== undefined && values.syntax !== 'vue-i18n') fail(`Unknown --syntax "${values.syntax}".`);

const files = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .toSorted();
if (files.length === 0) fail(`No .json files in ${dir}.`);

const catalogs: Record<string, Tree> = {};
const duplicates: Issue[] = [];
for (const file of files) {
  const locale = basename(file, '.json');
  const text = readFileSync(join(dir, file), 'utf8');
  try {
    catalogs[locale] = JSON.parse(text) as Tree;
  } catch (error) {
    fail(`${file}: ${(error as Error).message}`);
  }
  for (const { key, line } of findDuplicateKeys(text)) {
    duplicates.push({ rule: 'keys', locale, key, message: `duplicate key at ${file}:${line}; the last one silently wins` });
  }
}

let issues: Issue[];
try {
  issues = lintCatalogs(catalogs as Catalogs, {
    reference: values.reference,
    ...(values.syntax === 'vue-i18n' ? { syntax: 'vue-i18n' as const } : {}),
    forbidden: (values.forbid ?? []).map((pattern) => ({ pattern, reason: 'banned by --forbid' })),
    rules: { empty: values['no-empty'] !== true },
  });
} catch (error) {
  fail((error as Error).message);
}

const all = [...duplicates, ...issues];
if (all.length === 0) {
  process.stdout.write(`${files.length} catalogs, no issues.\n`);
  process.exit(0);
}
process.stdout.write(`${formatIssues(all)}\n\n${all.length} ${all.length === 1 ? 'issue' : 'issues'} in ${files.length} catalogs.\n`);
process.exit(1);
