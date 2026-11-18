# Otenos open source

Tools we built while making [Otenos](https://otenos.com), a free browser strategy MMO, and use in it every day. Each one exists because of a real bug we found in our own game.

| Package | What it catches |
|---|---|
| [`@otenos/stylelint-media-order`](packages/stylelint-media-order) | `@media` declarations silently overridden by a later base rule or a wider media block |
| [`@otenos/i18n-catalog-lint`](packages/i18n-catalog-lint) | Missing keys, renamed placeholders, duplicate JSON keys, banned text and vue-i18n syntax traps across translation catalogs |
| [`@otenos/determinism-lint`](packages/determinism-lint) | The clock, unseeded randomness, locale data and engine-dependent math in code that must give the same result everywhere |

## Principles

- **Born in production.** A package is published only after it has guarded our own game. The game installs these packages from npm, like you do.
- **Small and dependency-free** wherever possible.
- **Honest limits.** Every README says what the tool does not catch.

## Working on this repository

```sh
pnpm install
pnpm check      # build, typecheck, lint, test
pnpm changeset  # describe a change for the next release
```

Releases are automated: merging the "Version packages" pull request publishes to npm from GitHub Actions, with provenance.

## License

[MIT](LICENSE)
