import { describe, expect, it } from 'vitest';
import { covers, parseQuery } from './media.js';

const q = (...params: string[]) => {
  const query = parseQuery(params);
  if (query === null) throw new Error(`unreadable: ${params.join(' / ')}`);
  return query;
};

describe('parseQuery', () => {
  it('reads types, min/max features and range syntax', () => {
    expect(q('screen and (min-width: 40em) and (max-width: 60em)')).toEqual({
      type: 'screen',
      unit: 'em',
      ranges: { width: { min: { value: 40, inclusive: true }, max: { value: 60, inclusive: true } }, height: {} },
    });
    expect(q('(width < 600px)').ranges.width).toEqual({ max: { value: 600, inclusive: false } });
    expect(q('only screen and (max-height: 500px)').type).toBe('screen');
  });

  it('joins nested blocks and keeps the tighter bound', () => {
    expect(q('(max-width: 900px)', '(max-width: 600px)').ranges.width.max).toEqual({ value: 600, inclusive: true });
  });

  it('gives up on anything it cannot prove', () => {
    for (const params of [
      '(max-width: 600px), print',
      'not screen',
      '(orientation: landscape)',
      '(max-width: calc(600px + 1em))',
      '(min-width: 10em) and (max-width: 600px)',
      'screen or print',
      'screen and print',
    ]) {
      expect(parseQuery([params]), params).toBeNull();
    }
  });
});

describe('covers', () => {
  it('a wider max-width covers a narrower one, not the other way', () => {
    expect(covers(q('(max-width: 900px)'), q('(max-width: 600px)'))).toBe(true);
    expect(covers(q('(max-width: 600px)'), q('(max-width: 900px)'))).toBe(false);
  });

  it('a smaller min-width covers a larger one', () => {
    expect(covers(q('(min-width: 600px)'), q('(min-width: 900px)'))).toBe(true);
    expect(covers(q('(min-width: 900px)'), q('(min-width: 600px)'))).toBe(false);
  });

  it('respects exclusive bounds', () => {
    expect(covers(q('(width <= 600px)'), q('(width < 600px)'))).toBe(true);
    expect(covers(q('(width < 600px)'), q('(width <= 600px)'))).toBe(false);
    expect(covers(q('(max-width: 600px)'), q('(width <= 600px)'))).toBe(true);
  });

  it('does not compare different units or dimensions', () => {
    expect(covers(q('(max-width: 60em)'), q('(max-width: 600px)'))).toBe(false);
    expect(covers(q('(max-width: 900px)'), q('(max-height: 600px)'))).toBe(false);
  });

  it('a query without bounds covers every query of its type', () => {
    expect(covers(q('screen'), q('screen and (max-width: 600px)'))).toBe(true);
    expect(covers(q('all'), q('print and (max-width: 600px)'))).toBe(true);
    expect(covers(q('print'), q('screen'))).toBe(false);
    expect(covers(q('screen'), q('(max-width: 600px)'))).toBe(false);
  });
});
