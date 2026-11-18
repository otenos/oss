# @otenos/stylelint-media-order

## 1.1.1

### Patch Changes

- c3d36f7: Describe the media block check in the package description, so npm search shows both cases the rule reports.

## 1.1.0

### Minor Changes

- 23deadf: Report a media declaration that a later media block overrides: a wider block below a narrower one (`(max-width: 900px)` after `(max-width: 600px)`), or the same selector repeated under the same query. Queries are compared only when the rule can prove the later one matches every screen the earlier one does; anything else is left alone. Existing projects may see new warnings, each one a declaration that never applies.
