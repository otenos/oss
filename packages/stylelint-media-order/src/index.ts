/**
 * `@otenos/media-order`: a declaration inside `@media` that a later base rule
 * overrides.
 *
 * `@media` adds no specificity. The same selector inside and outside a media
 * block has equal weight, so the rule that comes later wins. When the media
 * block sits above the base rule, the narrow-screen declaration is written
 * correctly and never applied. Nothing warns: the page simply looks like the
 * desktop layout on a phone.
 *
 * The rule reports the media declaration and names the later rule that
 * shadows it: a base rule, or a later media block whose query matches every
 * screen the first one does (`(max-width: 900px)` after `(max-width: 600px)`).
 * It only compares rules of equal specificity (the same selector text) in the
 * same cascade context (the same `@supports`, `@layer` or `@container`
 * ancestors), so a stronger selector inside the media block is not reported.
 */
import stylelint from 'stylelint';
import type { AtRule, Container, Declaration, Rule as CssRule } from 'postcss';
import { covers, parseQuery, type Query } from './media.js';

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

export const ruleName = '@otenos/media-order';

export const messages = ruleMessages(ruleName, {
  rejected: (property: string, selector: string, media: string, line: number) =>
    `"${property}" for "${selector}" in @media ${media} is overridden by the base rule at line ${line}; @media adds no specificity, so move the media block below it`,
  covered: (property: string, selector: string, media: string, later: string, line: number) =>
    `"${property}" for "${selector}" in @media ${media} is overridden by @media ${later} at line ${line}, which matches every screen the first one does; put the narrower block last`,
  repeated: (property: string, selector: string, media: string, line: number) =>
    `"${property}" for "${selector}" in @media ${media} is overridden by the same selector under the same query at line ${line}`,
});

const meta = {
  url: 'https://github.com/otenos/oss/tree/main/packages/stylelint-media-order#readme',
};

/**
 * Shorthands whose longhands share their name as a prefix. A later `padding`
 * overrides an earlier `padding-top`; `all` overrides everything.
 */
const SHORTHANDS = new Set([
  'animation',
  'background',
  'border',
  'border-block',
  'border-bottom',
  'border-inline',
  'border-left',
  'border-right',
  'border-top',
  'columns',
  'flex',
  'font',
  'grid',
  'grid-template',
  'inset',
  'list-style',
  'margin',
  'outline',
  'overflow',
  'padding',
  'text-decoration',
  'transition',
]);

/** Does a later declaration of `later` override an earlier declaration of `earlier`? */
export function overrides(later: string, earlier: string): boolean {
  if (later === earlier || later === 'all') return true;
  return SHORTHANDS.has(later) && earlier.startsWith(`${later}-`);
}

interface MediaEntry {
  readonly declaration: Declaration;
  readonly selector: string;
  readonly media: string;
  /** The query as read by `parseQuery`; `null` when it is not a simple shape. */
  readonly query: Query | null;
}

const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** Ancestors that decide the cascade context, outermost first. `null` when the rule is nested in another rule. */
function ancestry(rule: CssRule): { context: string; media: string[] } | null {
  const context: string[] = [];
  const media: string[] = [];
  let parent: Container | undefined = rule.parent;
  while (parent !== undefined && parent.type !== 'root' && parent.type !== 'document') {
    if (parent.type !== 'atrule') return null;
    const at = parent as AtRule;
    const name = at.name.toLowerCase();
    if (name.endsWith('keyframes')) return null;
    if (name === 'media') media.unshift(normalize(at.params));
    else context.unshift(`@${name} ${normalize(at.params)}`);
    parent = at.parent;
  }
  return { context: context.join(' / '), media };
}

const ruleFunction: stylelint.Rule = (primary) => (root, result) => {
  if (!validateOptions(result, ruleName, { actual: primary, possible: [true] })) return;

  /** Media declarations seen so far, by context and selector. */
  const seen = new Map<string, MediaEntry[]>();
  const reported = new Set<Declaration>();

  root.walkRules((rule) => {
    const place = ancestry(rule);
    if (place === null) return;
    const declarations = (rule.nodes ?? []).filter((node): node is Declaration => node.type === 'decl');
    if (declarations.length === 0) return;

    for (const selector of rule.selectors.map(normalize)) {
      const key = `${place.context}\u0000${selector}`;

      const entries = seen.get(key) ?? [];
      const media = place.media.join(' and ');
      const query = place.media.length > 0 ? parseQuery(place.media) : null;

      for (const entry of entries) {
        if (reported.has(entry.declaration)) continue;
        // A later media block shadows only when it provably matches every screen the earlier one does.
        const same = entry.media === media;
        if (place.media.length > 0 && !same) {
          if (entry.query === null || query === null || !covers(query, entry.query)) continue;
        }
        const earlier = entry.declaration.prop.toLowerCase();
        const shadow = declarations.find(
          (later) =>
            overrides(later.prop.toLowerCase(), earlier) && (later.important || !entry.declaration.important),
        );
        if (shadow === undefined) continue;
        reported.add(entry.declaration);
        const line = shadow.source?.start?.line ?? 0;
        const { prop } = entry.declaration;
        report({
          result,
          ruleName,
          node: entry.declaration,
          message:
            place.media.length === 0
              ? messages.rejected(prop, entry.selector, entry.media, line)
              : same
                ? messages.repeated(prop, entry.selector, entry.media, line)
                : messages.covered(prop, entry.selector, entry.media, media, line),
        });
      }

      if (place.media.length > 0) {
        for (const declaration of declarations) entries.push({ declaration, selector, media, query });
        seen.set(key, entries);
      }
    }
  });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default createPlugin(ruleName, ruleFunction);
