# @otenos/i18n-catalog-lint

Lint translation catalogs against each other: missing keys, renamed placeholders, empty strings, duplicate JSON keys, banned characters, and the vue-i18n syntax traps that pass every other check and break on screen.

```
de  menu.bids    [placeholders] placeholders differ: en has {n}, de has {count}
pt  shop.title   [keys] missing (present in en)
en  help.mail    [syntax] "@" starts a linked message in vue-i18n ("Invalid linked format"); write {'@'} for a literal @

3 issues in 5 catalogs.
```

## Why we built it

[Otenos](https://otenos.com), our browser strategy game, ships in five languages from a single English source. A translation cannot be checked by someone who does not read the language, but a broken catalog can, and every mistake below reached us in a language we were not looking at:

- **A missing key** shows the raw key (`shop.title`) on screen, to German players only.
- **A renamed placeholder** (`{count} bids` translated as `{n} Gebote`) is a correct translation that renders a literal `{n}`.
- **A duplicate key** in the same section is not an error in JSON or JavaScript: the later one silently wins, and the screen using the first one shows the wrong sentence. Key parity cannot see it, because the key set does not change.
- **ICU plurals** (`{n, plural, one {# bid} other {# bids}}`) look standard, but vue-i18n's message compiler does not parse them.
- **An email address** in a support answer (`write to support@example.com`) took a whole page down with "Invalid linked format": in vue-i18n, `@` starts a linked message.

The vue-i18n checks are tested against vue-i18n's own message compiler: everything the rule rejects fails to compile there, and everything it accepts compiles.

## Install

```sh
npm install --save-dev @otenos/i18n-catalog-lint
```

No dependencies. Node 22.12 or newer.

## Use it in a test

Import your catalogs, whatever format they live in, and assert there are no issues. This works with any test runner.

```ts
import { formatIssues, lintCatalogs } from '@otenos/i18n-catalog-lint';
import { expect, it } from 'vitest';
import { de, en, es, pt } from '../src/locales';

it('catalogs are consistent', () => {
  const issues = lintCatalogs(
    { en, de, es, pt },
    {
      reference: 'en',
      syntax: 'vue-i18n',
      forbidden: [{ pattern: '—', reason: 'no em dash in UI copy' }],
    },
  );
  expect(issues, formatIssues(issues)).toEqual([]);
});
```

## Use it from the command line

For a directory of `<locale>.json` files:

```sh
npx i18n-catalog-lint src/locales --reference en --syntax vue-i18n --forbid "—"
```

The CLI also reports duplicate keys, which only the source text can show. Exit code 0 when clean, 1 when issues were found, 2 on a usage error.

## Rules

| Rule | Reports | Default |
|---|---|---|
| `keys` | Keys missing from a catalog, or present only in it. A message in one catalog and a subtree in another count as both. | on |
| `placeholders` | A message whose placeholder names differ from the reference's (`{count}`, `{0}`, `{amount, number}`; vue-i18n literals like `{'@'}` are text). | on |
| `empty` | A message that is empty or only whitespace, in any catalog. | on |
| `syntax` | With `syntax: 'vue-i18n'`: ICU `plural`/`select`/`selectordinal`, placeholders vue-i18n cannot parse (`{a.b}`, `{amount, number}`), an `@` that is not a linked message, unbalanced or nested braces. | when `syntax` is set |
| `forbidden` | Any text from `forbidden`, optionally limited to some locales. | when `forbidden` is set |

Turn a rule off with `rules: { empty: false }`.

## API

```ts
lintCatalogs(catalogs: Record<string, Tree>, options: Options): Issue[]
formatIssues(issues: Issue[]): string
findDuplicateKeys(json: string): { key: string; line: number }[]
vueI18nProblems(message: string): string[]
placeholders(message: string): string[]
```

`Issue` is `{ rule, locale, key, message }`, sorted by locale, then key. Catalogs are nested objects; arrays are read by index (`steps.0`).

## What it does not do

It does not judge translations, and it does not compile messages for formats other than vue-i18n. Catalogs written as TypeScript objects are linted through the API; duplicate keys in TypeScript are already reported by `tsc`.

## License

MIT. Made for [Otenos](https://otenos.com), a free browser strategy MMO: build your holding, raise an army, forge alliances and win the mightiest buildings by sealed bid.
