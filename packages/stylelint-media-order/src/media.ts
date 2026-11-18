/**
 * Just enough media query reading to prove that one query covers another.
 *
 * Two media blocks in the wrong order fail the same way a media block above a
 * base rule does: `(max-width: 600px)` followed by `(max-width: 900px)` means
 * every phone also matches the wider block, which comes later and wins. The
 * narrow rule is dead.
 *
 * The rule only reports what it can prove, so this reads only the simple,
 * common shapes: an optional media type and width or height bounds
 * (`min-width`, `max-width`, or range syntax such as `width <= 600px`) joined
 * by `and`, compared only when they use the same unit. Anything else (`or`,
 * lists, `not`, `orientation`, `calc()`) makes the query unreadable, and an
 * unreadable query is never reported.
 */

interface Bound {
  readonly value: number;
  readonly inclusive: boolean;
}

interface Range {
  min?: Bound;
  max?: Bound;
}

export interface Query {
  readonly type: string;
  readonly unit: string | null;
  readonly ranges: Readonly<Record<'width' | 'height', Range>>;
}

const LENGTH = /^(-?\d*\.?\d+)(px|em|rem)$/;
const TYPES = new Set(['all', 'screen', 'print']);

function length(text: string, unit: { value: string | null }): number | null {
  const match = LENGTH.exec(text.trim().toLowerCase());
  if (match === null) return null;
  const found = match[2] as string;
  if (unit.value !== null && unit.value !== found) return null;
  unit.value = found;
  return Number(match[1]);
}

/** The tighter of two lower bounds (or upper bounds when `upper`). */
function tighter(a: Bound | undefined, b: Bound, upper: boolean): Bound {
  if (a === undefined) return b;
  if (a.value === b.value) return { value: a.value, inclusive: a.inclusive && b.inclusive };
  return upper === a.value < b.value ? a : b;
}

function limit(range: Range, side: 'min' | 'max', bound: Bound): void {
  range[side] = tighter(range[side], bound, side === 'max');
}

/** Reads `@media` params, several joined as nested blocks. `null` when the query is not one of the simple shapes. */
export function parseQuery(params: readonly string[]): Query | null {
  const ranges: Record<'width' | 'height', Range> = { width: {}, height: {} };
  const unit = { value: null as string | null };
  let type = 'all';

  for (const param of params) {
    const text = param.trim().toLowerCase().replace(/^only\s+/, '');
    if (text.includes(',') || /\b(or|not|only)\b/.test(text)) return null;
    for (const part of text.split(/\s+and\s+/)) {
      if (TYPES.has(part)) {
        if (type !== 'all' && part !== 'all' && part !== type) return null;
        if (part !== 'all') type = part;
        continue;
      }
      const feature = /^\(\s*(min|max)-(width|height)\s*:\s*([^)]+)\)$/.exec(part);
      if (feature !== null) {
        const value = length(feature[3] as string, unit);
        if (value === null) return null;
        limit(ranges[feature[2] as 'width' | 'height'], feature[1] as 'min' | 'max', { value, inclusive: true });
        continue;
      }
      const range = /^\(\s*(width|height)\s*(<=|>=|<|>)\s*([^)]+)\)$/.exec(part);
      if (range !== null) {
        const value = length(range[3] as string, unit);
        if (value === null) return null;
        const op = range[2] as string;
        limit(ranges[range[1] as 'width' | 'height'], op.startsWith('<') ? 'max' : 'min', {
          value,
          inclusive: op.endsWith('='),
        });
        continue;
      }
      return null;
    }
  }

  return { type, unit: unit.value, ranges };
}

/** Is `inner` at least as tight as `outer` on this side? A missing bound is infinitely loose. */
function within(inner: Bound | undefined, outer: Bound | undefined, side: 'min' | 'max'): boolean {
  if (outer === undefined) return true;
  if (inner === undefined) return false;
  if (inner.value === outer.value) return outer.inclusive || !inner.inclusive;
  return side === 'max' ? inner.value < outer.value : inner.value > outer.value;
}

/** Does every screen that matches `inner` also match `outer`? */
export function covers(outer: Query, inner: Query): boolean {
  if (outer.type !== 'all' && outer.type !== inner.type) return false;
  const bounded = (query: Query): boolean => query.unit !== null;
  if (bounded(outer) && bounded(inner) && outer.unit !== inner.unit) return false;
  return (['width', 'height'] as const).every(
    (dimension) =>
      within(inner.ranges[dimension].min, outer.ranges[dimension].min, 'min') &&
      within(inner.ranges[dimension].max, outer.ranges[dimension].max, 'max'),
  );
}
