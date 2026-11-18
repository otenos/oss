import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatFindings, listFiles, scanDirectory, scanSource, type Options } from './index.js';

const rules = (source: string, options?: Options): string[] =>
  scanSource(source, options).map((finding) => `${finding.rule}@${finding.line}:${finding.column}`);

describe('scanSource', () => {
  it('reports the clock', () => {
    expect(rules('const a = Date.now();\nconst b = new Date();\nconst c = Date();\nperformance.now();')).toEqual([
      'time@1:11',
      'time@2:15',
      'time@3:11',
      'time@4:1',
    ]);
  });

  it('accepts Date as a type and its pure statics', () => {
    expect(rules('function f(at: Date): number { return Date.UTC(2026, 0, 1); }')).toEqual([]);
  });

  it('reports unseeded randomness', () => {
    expect(rules('Math.random(); crypto.randomUUID(); globalThis.crypto;')).toEqual(['random@1:1', 'random@1:16']);
  });

  it('reports locale data', () => {
    expect(rules("a.localeCompare(b); n.toLocaleString(); new Intl.NumberFormat('en');")).toEqual([
      'locale@1:3',
      'locale@1:23',
      'locale@1:45',
    ]);
  });

  it('reports environment globals, not keys of the same name', () => {
    expect(rules('process.env.SEED; navigator.language;')).toEqual(['environment@1:1', 'environment@1:19']);
    expect(rules('const o = { process: 1 }; interface I { a: 1; process: string }; o.process;')).toEqual([]);
  });

  it('reports implementation-approximated math, not the exact functions', () => {
    expect(rules('Math.sin(x); Math.pow(2, 3); x ** 2; y **= 2; Math.sqrt(x); Math.floor(x); Math.hypot(a, b);')).toEqual([
      'approximateMath@1:1',
      'approximateMath@1:14',
      'approximateMath@1:32',
      'approximateMath@1:40',
      'approximateMath@1:76',
    ]);
    expect(rules('Math.sin(x); x ** 2;', { rules: { approximateMath: false } })).toEqual([]);
  });

  it('reports fractional literals only when asked', () => {
    const source = 'const a = 0.5; const b = 1e-3; const c = 1e3; const d = 0x10; const e = 2;';
    expect(rules(source)).toEqual([]);
    expect(rules(source, { rules: { floats: true } })).toEqual(['floats@1:11', 'floats@1:26']);
  });

  it('never counts comments, strings, templates or regular expressions', () => {
    const source = [
      "const url = 'https://otenos.com'; const t = Date.now();",
      '// Math.random()',
      '/* new Date() */',
      "const label = 'crypto process Intl';",
      'const text = `Date.now() ${x} Math.random()`;',
      'const pattern = /Date.now/;',
    ].join('\n');
    expect(rules(source)).toEqual(['time@1:45']);
  });

  it('reads code inside template substitutions', () => {
    expect(rules('const s = `seed ${Math.random()}`;')).toEqual(['random@1:19']);
  });

  it('can be silenced rule by rule', () => {
    expect(rules('Date.now(); Math.random();', { rules: { time: false } })).toEqual(['random@1:13']);
  });

  it('checks imports against the allowed set', () => {
    const source = [
      "import { a } from './a.js';",
      "import type { B } from '../b.js';",
      "import fs from 'node:fs';",
      "import 'side-effect';",
      "export { c } from 'lodash';",
      "export * from './d.js';",
      "const e = await import('chalk');",
      "const f = require('./f.cjs');",
      'export const g = 1;',
    ].join('\n');
    expect(rules(source, { imports: 'relative' })).toEqual(['imports@3:16', 'imports@4:8', 'imports@5:19', 'imports@7:24']);
    expect(rules(source, { imports: (specifier) => specifier !== 'lodash' })).toEqual(['imports@5:19']);
    expect(rules(source)).toEqual([]);
  });

  it('names the problem and the fix', () => {
    expect(scanSource('Math.random()')[0]?.message).toBe('Math.random is not seeded; pass a seeded generator in');
  });
});

describe('scanDirectory', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function tree(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'determinism-lint-'));
    roots.push(root);
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), text);
    }
    return root;
  }

  it('skips tests, declarations, node_modules and dot directories', () => {
    const root = tree({
      'a.ts': '',
      'nested/b.mjs': '',
      'a.test.ts': '',
      'b.spec.js': '',
      'types.d.ts': '',
      'node_modules/x/index.js': '',
      '.cache/c.ts': '',
      'README.md': '',
    });
    expect(listFiles(root)).toEqual(['a.ts', 'nested/b.mjs']);
  });

  it('reports findings by file', () => {
    const root = tree({ 'clock.ts': '\nexport const now = () => Date.now();', 'pure.ts': 'export const one = 1;' });
    const { files, findings } = scanDirectory(root);
    expect(files).toBe(2);
    expect(formatFindings(findings)).toBe('clock.ts:2:26  time  Date.now reads the clock; pass the time in as a parameter');
  });
});
