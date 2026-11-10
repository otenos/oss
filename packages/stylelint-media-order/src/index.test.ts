import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import plugin, { overrides, ruleName } from './index.js';

async function warnings(code: string, customSyntax?: string): Promise<string[]> {
  const { results } = await stylelint.lint({
    code,
    ...(customSyntax === undefined ? {} : { customSyntax }),
    config: { plugins: [plugin], rules: { [ruleName]: true } },
  });
  return (results[0]?.warnings ?? []).map((warning) => `${warning.line}: ${warning.text}`);
}

describe(ruleName, () => {
  it('reports a media declaration that a later base rule overrides', async () => {
    const found = await warnings(
      ['@media (max-width: 640px) {', '  .res { display: inline; }', '}', '.res { display: none; }'].join('\n'),
    );
    expect(found).toEqual([
      `2: "display" for ".res" in @media (max-width: 640px) is overridden by the base rule at line 4; @media adds no specificity, so move the media block below it (${ruleName})`,
    ]);
  });

  it('accepts the media block after the base rule', async () => {
    expect(
      await warnings('.res { display: none; }\n@media (max-width: 640px) { .res { display: inline; } }'),
    ).toEqual([]);
  });

  it('ignores a later base rule that sets other properties', async () => {
    expect(await warnings('@media (max-width: 640px) { .res { display: inline; } }\n.res { color: red; }')).toEqual([]);
  });

  it('ignores a stronger selector inside the media block', async () => {
    expect(
      await warnings('@media (max-width: 640px) { .bar .res { display: inline; } }\n.res { display: none; }'),
    ).toEqual([]);
  });

  it('sees through selector lists and whitespace', async () => {
    const found = await warnings('@media (max-width: 640px) { .a,  .b { gap: 0; } }\n.c, .b { gap: 8px; }');
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('"gap" for ".b"');
  });

  it('treats a later shorthand as an override of an earlier longhand', async () => {
    const found = await warnings('@media (max-width: 640px) { .p { padding-top: 0; } }\n.p { padding: 8px; }');
    expect(found).toHaveLength(1);
  });

  it('respects !important on the media side', async () => {
    expect(
      await warnings('@media (max-width: 640px) { .p { margin: 0 !important; } }\n.p { margin: 8px; }'),
    ).toEqual([]);
    expect(
      await warnings('@media (max-width: 640px) { .p { margin: 0 !important; } }\n.p { margin: 8px !important; }'),
    ).toHaveLength(1);
  });

  it('compares only rules in the same cascade context', async () => {
    expect(
      await warnings(
        '@layer base { @media (max-width: 640px) { .p { margin: 0; } } }\n@layer overrides { .p { margin: 8px; } }',
      ),
    ).toEqual([]);
    expect(
      await warnings('@layer base { @media (max-width: 640px) { .p { margin: 0; } } .p { margin: 8px; } }'),
    ).toHaveLength(1);
  });

  it('reads nested media blocks', async () => {
    const found = await warnings(
      '@media screen { @media (max-width: 640px) { .p { margin: 0; } } }\n.p { margin: 8px; }',
    );
    expect(found[0]).toContain('in @media screen and (max-width: 640px)');
  });

  it('skips keyframes and rules nested in rules', async () => {
    expect(
      await warnings(
        '@media (max-width: 640px) { @keyframes spin { from { opacity: 0; } } }\n.from { opacity: 1; }',
      ),
    ).toEqual([]);
  });

  it('works in Vue single-file components through postcss-html', async () => {
    const vue = [
      '<template><div class="res" /></template>',
      '<style scoped>',
      '@media (max-width: 640px) {',
      '  .res { display: inline; }',
      '}',
      '.res { display: none; }',
      '</style>',
    ].join('\n');
    const found = await warnings(vue, 'postcss-html');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^4: .*base rule at line 6/);
  });

  it('rejects options other than true', async () => {
    const { results } = await stylelint.lint({
      code: '.a {}',
      config: { plugins: [plugin], rules: { [ruleName]: 'yes' } },
    });
    expect(results[0]?.invalidOptionWarnings.length).toBeGreaterThan(0);
  });
});

describe('overrides', () => {
  it('matches equal properties, shorthands and all', () => {
    expect(overrides('display', 'display')).toBe(true);
    expect(overrides('border', 'border-top-width')).toBe(true);
    expect(overrides('all', 'color')).toBe(true);
    expect(overrides('padding-top', 'padding')).toBe(false);
    expect(overrides('color', 'colors')).toBe(false);
  });
});
