# @otenos/stylelint-media-order

A [Stylelint](https://stylelint.io) rule that catches `@media` declarations silently overridden by a later base rule.

```css
@media (max-width: 640px) {
  .resources { display: flex; }   /* ✗ never applies */
}

.resources { display: none; }     /* wins on every screen */
```

## Why we built it

`@media` adds no specificity. A selector inside a media block weighs exactly as much as the same selector outside it, so whichever rule comes **later** wins. Put the media block above the base rule and the narrow-screen declaration is correct, valid and dead.

Nothing warns you. The build passes, the desktop layout is fine, and the phone simply looks like a squeezed desktop. We found this in [Otenos](https://otenos.com), our browser strategy game, only by opening it on a real phone: the top bar's media rule showed the resource counters, a base rule thirty lines further down hid them again, and on mobile none of the four resources were visible. The same trap was waiting in two more components.

Stylelint's built-in `no-descending-specificity` looks at selector specificity, not at media blocks, so it does not see this. This rule does.

## Install

```sh
npm install --save-dev stylelint @otenos/stylelint-media-order
```

Supports Stylelint 16, 17 and 18, and Node 22.12 or newer.

## Use

```js
// stylelint.config.js
export default {
  plugins: ['@otenos/stylelint-media-order'],
  rules: {
    '@otenos/media-order': true,
  },
};
```

For Vue, Svelte or HTML files, add [`postcss-html`](https://github.com/ota-meshi/postcss-html) as the custom syntax for those files, as usual with Stylelint:

```js
export default {
  plugins: ['@otenos/stylelint-media-order'],
  overrides: [{ files: ['**/*.vue'], customSyntax: 'postcss-html' }],
  rules: { '@otenos/media-order': true },
};
```

## What it reports

```
4:3  "display" for ".resources" in @media (max-width: 640px) is overridden by the base rule at line 7;
     @media adds no specificity, so move the media block below it  @otenos/media-order
```

The warning sits on the dead declaration and names the line that shadows it. A declaration is reported when a later rule outside any media block

- has the **same selector** (after normalizing whitespace; each selector of a list is checked on its own),
- in the **same cascade context** (the same `@layer`, `@supports` and `@container` ancestors),
- and sets the **same property**, a shorthand that covers it (`padding` over `padding-top`, `border` over `border-left-color`), or `all`.

It stays quiet when

- the media block comes after the base rule (the fix),
- the selector inside the media block is stronger (`.bar .resources`), since specificity then decides, not order,
- the media declaration is `!important` and the later one is not,
- the rules sit in different layers, or inside `@keyframes`.

## Limits

- Selectors are compared as text. `.a.b` and `.b.a` are equal in the browser but different here, so the rule can miss a shadow; it does not invent one.
- Only base rules are checked as the overriding side. Two media blocks in the wrong order (`max-width: 900px` after `max-width: 600px`) are a related trap that this rule does not cover yet.
- Rules nested inside other rules (CSS nesting) are skipped.

## License

MIT. Made for [Otenos](https://otenos.com), a free browser strategy MMO: build your holding, raise an army, forge alliances and win the mightiest buildings by sealed bid.
