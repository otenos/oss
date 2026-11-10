import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/** The CLI is tested as shipped: run `pnpm build` first. */
const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function run(files: Record<string, string>, ...args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-catalog-lint-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const result = spawnSync(process.execPath, [CLI, dir, ...args], { encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe('cli', () => {
  it('is built', () => {
    expect(existsSync(CLI), 'run `pnpm build` before the tests').toBe(true);
  });

  it('exits 0 on clean catalogs', () => {
    const result = run({ 'en.json': '{"a": "A"}', 'de.json': '{"a": "Ä"}' }, '--reference', 'en');
    expect(result).toMatchObject({ status: 0, out: '2 catalogs, no issues.\n' });
  });

  it('exits 1 and lists issues, duplicates included', () => {
    const result = run(
      { 'en.json': '{"a": "Mail us@example.com", "b": "B"}', 'de.json': '{"a": "Ä",\n "a": "{n}"}' },
      '-r',
      'en',
      '--syntax',
      'vue-i18n',
    );
    expect(result.status).toBe(1);
    expect(result.out).toBe(
      [
        'de  a  [keys] duplicate key at de.json:2; the last one silently wins',
        'de  a  [placeholders] placeholders differ: en has none, de has {n}',
        'de  b  [keys] missing (present in en)',
        `en  a  [syntax] "@" starts a linked message in vue-i18n ("Invalid linked format"); write {'@'} for a literal @`,
        '',
        '4 issues in 2 catalogs.',
        '',
      ].join('\n'),
    );
  });

  it('exits 2 on a usage error', () => {
    expect(run({ 'en.json': '{}' }).status).toBe(2);
    expect(run({ 'en.json': '{}' }, '-r', 'fr').err).toContain('reference locale "fr"');
    expect(run({ 'en.json': '{' }, '-r', 'en').status).toBe(2);
  });
});
