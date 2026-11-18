import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenize.js';

const shape = (source: string): string[] => tokenize(source).map((token) => `${token.type}:${token.value}`);

describe('tokenize', () => {
  it('skips comments and keeps strings whole', () => {
    expect(shape("const u = 'https://example.com'; // Date.now()\n/* Math.random() */ x")).toEqual([
      'name:const',
      'name:u',
      'punct:=',
      "string:'https://example.com'",
      'punct:;',
      'name:x',
    ]);
  });

  it('keeps an opening comment inside a string from swallowing code', () => {
    expect(shape("const a = '/*'; Date; const b = '*/';")).toContain('name:Date');
  });

  it('reads code inside template substitutions, including nested braces', () => {
    expect(shape('`a ${ {k: Date}.k } b ${`inner ${x}`} c`')).toEqual([
      'template:`a ${',
      'punct:{',
      'name:k',
      'punct::',
      'name:Date',
      'punct:}',
      'punct:.',
      'name:k',
      'template:} b ${',
      'template:`inner ${',
      'name:x',
      'template:}`',
      'template:} c`',
    ]);
  });

  it('tells a regular expression from a division', () => {
    expect(shape('a / b / c')).toEqual(['name:a', 'punct:/', 'name:b', 'punct:/', 'name:c']);
    expect(shape("x = /'[/]Date/g.test(y)")).toEqual([
      'name:x',
      'punct:=',
      "regex:/'[/]Date/g",
      'punct:.',
      'name:test',
      'punct:(',
      'name:y',
      'punct:)',
    ]);
    expect(shape('return /a/')).toEqual(['name:return', 'regex:/a/']);
  });

  it('reads numbers in every notation', () => {
    expect(shape('1 1.5 .5 1e3 1e-3 0x1F 1_000n 2.')).toEqual([
      'number:1',
      'number:1.5',
      'number:.5',
      'number:1e3',
      'number:1e-3',
      'number:0x1F',
      'number:1_000n',
      'number:2.',
    ]);
  });

  it('reports 1-based lines and columns', () => {
    const [, second] = tokenize('a\n  /* x\n */ b');
    expect(second).toMatchObject({ value: 'b', line: 3, column: 5 });
  });

  it('skips a hashbang and reads private names', () => {
    expect(shape('#!/usr/bin/env node\nthis.#seed')).toEqual(['name:this', 'punct:.', 'name:#seed']);
  });
});
