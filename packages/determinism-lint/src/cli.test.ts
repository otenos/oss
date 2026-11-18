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
  const dir = mkdtempSync(join(tmpdir(), 'determinism-lint-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const result = spawnSync(process.execPath, [CLI, dir, ...args], { encoding: 'utf8' });
  return { status: result.status, out: result.stdout.replaceAll(dir, '<dir>'), err: result.stderr };
}

describe('cli', () => {
  it('is built', () => {
    expect(existsSync(CLI), 'run `pnpm build` before the tests').toBe(true);
  });

  it('exits 0 on clean source', () => {
    expect(run({ 'a.ts': 'export const a = 1;' })).toMatchObject({ status: 0, out: '1 file, nothing found.\n' });
  });

  it('exits 1 and lists findings', () => {
    const result = run({ 'a.ts': 'const r = Math.random();\nconst x = 0.5;' }, '--floats');
    expect(result.status).toBe(1);
    expect(result.out).toBe(
      [
        '<dir>/a.ts:1:11  random  Math.random is not seeded; pass a seeded generator in',
        '<dir>/a.ts:2:11  floats  0.5 is a fractional number; keep amounts in integer units (per-mille, cents)',
        '',
        '2 findings in 1 file.',
        '',
      ].join('\n'),
    );
  });

  it('checks imports and math on request', () => {
    expect(run({ 'a.ts': "import fs from 'node:fs';" }, '--relative-imports').status).toBe(1);
    expect(run({ 'a.ts': 'const y = x ** 2;' }, '--no-approximate-math').status).toBe(0);
  });

  it('exits 2 on a usage error', () => {
    expect(run({ 'a.ts': '' }, '--nope').status).toBe(2);
    expect(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status).toBe(2);
  });
});
