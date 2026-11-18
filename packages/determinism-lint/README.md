# @otenos/determinism-lint

Find the code that makes the same input give different results: the clock, unseeded randomness, locale data, environment globals, and the floating-point functions JavaScript engines are allowed to round differently.

```
src/battle.ts:41:17   random           Math.random is not seeded; pass a seeded generator in
src/round.ts:12:24    time             Date.now reads the clock; pass the time in as a parameter
src/terrain.ts:88:9   approximateMath  Math.sin is implementation-approximated, so engines may differ in the last bits

3 findings in 107 files.
```

## Why we built it

[Otenos](https://otenos.com), our browser strategy game, keeps every game rule in one pure module. The same code runs on the server, in the player's browser and in a simulation we use to tune the game, and it has to agree with itself in all three: the same seed must give the same world, down to the same SHA-256 hash, so any result can be recomputed later.

Determinism is lost silently. A `Date.now()` in a rule breaks no test. A `localeCompare` sorts the same on your machine and differently on a server with other locale data. Weeks later the hash no longer matches, and finding the commit that broke it takes days. So we guard the module with a scan that fails the build instead.

Our first guard stripped comments with a regular expression and searched what was left. Extracting it into this package, we found it was wrong both ways: in `const url = 'https://otenos.com'; const t = Date.now();` the `//` inside the string looked like a comment, so the call after it was never seen; and the word `crypto` in a string counted as the global. This package reads tokens instead, so comments, strings, template text and regular expressions never count, and code inside `${...}` always does.

It also looks for something a plain search does not: the ECMAScript specification lets engines approximate `Math.sin`, `Math.pow`, `**` and their relatives, so V8 and JavaScriptCore may return different last bits for the same input. If your code runs on Node and in Safari, they can disagree.

## Install

```sh
npm install --save-dev @otenos/determinism-lint
```

No dependencies. Node 22.12 or newer.

## Use it in a test

```ts
import { formatFindings, scanDirectory } from '@otenos/determinism-lint';
import { expect, it } from 'vitest';

it('the rules module is deterministic', () => {
  const { files, findings } = scanDirectory('packages/rules/src', {
    imports: 'relative',
    rules: { floats: true },
  });
  expect(files).toBeGreaterThan(0); // an emptied or moved directory must not pass
  expect(findings, formatFindings(findings)).toEqual([]);
});
```

## Use it from the command line

```sh
npx determinism-lint packages/rules/src --relative-imports --floats
```

Exit code 0 when clean, 1 when something was found, 2 on a usage error.

## Rules

| Rule | Reports | Default |
|---|---|---|
| `time` | `Date.now`, `new Date`, `Date()`, `performance.now`. `Date` as a type and `Date.UTC` are fine. | on |
| `random` | `Math.random`, `crypto` | on |
| `locale` | `localeCompare`, `toLocaleString` and the other `toLocale*` methods, `Intl` | on |
| `environment` | `process`, `navigator`, `Deno`, `Bun` | on |
| `approximateMath` | `**`, `**=`, and the `Math` functions the specification calls implementation-approximated: `sin`, `cos`, `tan`, `exp`, `log`, `pow`, `hypot`, `cbrt` and their relatives. `Math.sqrt`, `Math.floor` and `Math.round` are exact. | on |
| `floats` | Fractional number literals (`0.5`, `1e-3`), for code that keeps amounts in integer units | off |
| `imports` | Imports outside an allowed set: `'relative'` allows only `./` and `../`, or pass a function. Covers `import`, `export ... from`, `import()` and `require()`. | off |

Turn a rule off with `rules: { approximateMath: false }`, on with `rules: { floats: true }`.

`scanDirectory` reads `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts` files, skips tests (`.test.`, `.spec.`), declaration files, `node_modules` and dot directories. Pass `include: (file) => boolean` to choose differently.

## API

```ts
scanSource(source: string, options?: Options): Finding[]
scanDirectory(directory: string, options?: ScanOptions): { files: number; findings: Finding[] }
listFiles(directory: string, include?: (file: string) => boolean): string[]
formatFindings(findings: Finding[]): string
tokenize(source: string): Token[]
```

`Finding` is `{ rule, file, line, column, message }`, sorted by position.

## What it does not catch

- **Renamed globals.** `const now = Date.now; now()` is reported once, at `Date.now`. `globalThis['Date']` and other computed access are not seen. Neither is a value passed in from outside: the scan checks this code, not its callers.
- **Shadowing.** A local variable named `Date` or `crypto` is reported anyway. Rename it; do not add exceptions.
- **Order you build yourself.** Iterating a `Set` or `Map` in insertion order is deterministic, but sorting by a key with ties is only as deterministic as your comparator. Spell out the tie-breaker.
- **Floating-point arithmetic.** `+`, `-`, `*`, `/` and `Math.sqrt` are exact and the same everywhere; `floats` only helps if you want integers throughout.
- **JSX text** is not tokenized.

## License

MIT. Made for [Otenos](https://otenos.com), a free browser strategy MMO: build your holding, raise an army, forge alliances and win the mightiest buildings by sealed bid.
