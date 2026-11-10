import { baseCompile } from '@intlify/message-compiler';
import { describe, expect, it } from 'vitest';
import { findDuplicateKeys, formatIssues, leaves, lintCatalogs, placeholders, vueI18nProblems } from './index.js';

describe('lintCatalogs', () => {
  const en = { menu: { title: 'Menu', bids: '{n} bid | {n} bids' }, empty: 'Nothing here' };

  it('is clean when every catalog matches the reference', () => {
    const de = { menu: { title: 'Menü', bids: '{n} Gebot | {n} Gebote' }, empty: 'Hier ist nichts' };
    expect(lintCatalogs({ en, de }, { reference: 'en' })).toEqual([]);
  });

  it('reports missing and extra keys', () => {
    const de = { menu: { title: 'Menü', bid: '{n} Gebot' }, empty: 'Hier ist nichts' };
    expect(lintCatalogs({ en, de }, { reference: 'en' })).toEqual([
      { rule: 'keys', locale: 'de', key: 'menu.bid', message: 'extra (absent from en)' },
      { rule: 'keys', locale: 'de', key: 'menu.bids', message: 'missing (present in en)' },
    ]);
  });

  it('reports a subtree where the reference has a message', () => {
    const de = { menu: { title: { short: 'Menü' }, bids: '{n} Gebote' }, empty: 'Hier ist nichts' };
    const keys = lintCatalogs({ en, de }, { reference: 'en' }).map((issue) => `${issue.key} ${issue.message}`);
    expect(keys).toEqual(['menu.title missing (present in en)', 'menu.title.short extra (absent from en)']);
  });

  it('reports a renamed placeholder', () => {
    const de = { menu: { title: 'Menü', bids: '{count} Gebote' }, empty: 'Hier ist nichts' };
    expect(lintCatalogs({ en, de }, { reference: 'en' })).toEqual([
      {
        rule: 'placeholders',
        locale: 'de',
        key: 'menu.bids',
        message: 'placeholders differ: en has {n}, de has {count}',
      },
    ]);
  });

  it('reports empty messages, in the reference too', () => {
    const issues = lintCatalogs({ en: { a: ' ' }, de: { a: '' } }, { reference: 'en' });
    expect(issues.map((issue) => `${issue.locale} ${issue.rule}`)).toEqual(['de empty', 'en empty']);
  });

  it('applies forbidden text, optionally per locale', () => {
    const catalogs = { en: { a: 'Wait — then go' }, de: { a: 'Warte — dann geh' } };
    const issues = lintCatalogs(catalogs, {
      reference: 'en',
      forbidden: [{ pattern: '—', reason: 'no em dash in UI copy', locales: ['de'] }, { pattern: /\bthen\b/g, reason: 'style' }],
    });
    expect(formatIssues(issues)).toBe(
      ['de  a  [forbidden] contains —: no em dash in UI copy', 'en  a  [forbidden] contains /\\bthen\\b/g: style'].join('\n'),
    );
  });

  it('turns rules off', () => {
    const de = { menu: { title: '' } };
    expect(lintCatalogs({ en, de }, { reference: 'en', rules: { keys: false, empty: false } })).toEqual([]);
  });

  it('checks vue-i18n syntax only when asked', () => {
    const catalogs = { en: { mail: 'Write to support@example.com' } };
    expect(lintCatalogs(catalogs, { reference: 'en' })).toEqual([]);
    expect(lintCatalogs(catalogs, { reference: 'en', syntax: 'vue-i18n' }).map((issue) => issue.rule)).toEqual(['syntax']);
  });

  it('throws on an unknown reference locale', () => {
    expect(() => lintCatalogs({ en }, { reference: 'fr' })).toThrow('reference locale "fr"');
  });
});

describe('placeholders', () => {
  it('reads names and indices, ignores literals', () => {
    expect(placeholders("{b} and {a}, {0}, {a} {'@'} {amount, number} {item-count}")).toEqual(['0', 'a', 'amount', 'b', 'item-count']);
  });
});

describe('leaves', () => {
  it('reads arrays by index', () => {
    expect(leaves({ steps: ['one', 'two'] })).toEqual([
      ['steps.0', 'one'],
      ['steps.1', 'two'],
    ]);
  });
});

/**
 * The syntax rule is checked against vue-i18n's own compiler: everything it
 * reports must fail to compile, and everything it accepts must compile. A rule
 * that only agrees with itself protects nothing.
 */
describe('vueI18nProblems agrees with the vue-i18n compiler', () => {
  const compiles = (text: string): boolean => {
    const errors: unknown[] = [];
    baseCompile(text, { onError: (error) => errors.push(error) });
    return errors.length === 0;
  };

  const rejected = [
    '{n, plural, one {# bid} other {# bids}}',
    '{gender, select, male {he} other {they}}',
    '{amount, number}',
    'Write to support@example.com',
    'a { b',
    'a } b',
    '{a {b}}',
    '{}',
    '{a.b}',
    '{1a}',
    '{ä}',
  ];
  const accepted = [
    'Plain text',
    '{n} bid | {n} bids',
    '{ count } left',
    'x {0} y',
    '{item-count} left',
    "Write to support{'@'}example.com",
    "A literal {'{'} brace",
    'See @:menu.title',
    'See @.lower:menu.title',
    'See @:(menu.title)',
  ];

  for (const text of rejected) {
    it(`rejects ${JSON.stringify(text)}`, () => {
      expect(compiles(text)).toBe(false);
      expect(vueI18nProblems(text)).not.toEqual([]);
    });
  }
  for (const text of accepted) {
    it(`accepts ${JSON.stringify(text)}`, () => {
      expect(compiles(text)).toBe(true);
      expect(vueI18nProblems(text)).toEqual([]);
    });
  }
});

describe('findDuplicateKeys', () => {
  it('finds a key repeated in the same object, with its line', () => {
    const json = '{\n  "menu": {\n    "title": "a",\n    "title": "b"\n  },\n  "title": "c"\n}';
    expect(findDuplicateKeys(json)).toEqual([{ key: 'menu.title', line: 4 }]);
  });

  it('tracks paths through arrays and escaped strings', () => {
    const json = '{"list": [{"a": 1}, {"a": 2, "a": 3}], "q\\"k": "x\\"y", "q\\"k": 1}';
    expect(findDuplicateKeys(json)).toEqual([
      { key: 'list.1.a', line: 1 },
      { key: 'q"k', line: 1 },
    ]);
  });

  it('is quiet on clean JSON', () => {
    expect(findDuplicateKeys('{"a": {"b": 1}, "b": {"a": [1, {"b": 2}]}}')).toEqual([]);
  });
});
