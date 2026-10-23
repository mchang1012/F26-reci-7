
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Generate valid intervals by choosing a start and nonnegative length.
const intervalIn = (
  min: number,
  max: number,
  maxLen: number,
): fc.Arbitrary<Interval> =>
  fc.tuple(
    fc.integer({ min, max }),
    fc.nat(maxLen),
  ).map(([s, len]) => [s, s + len]);

const interval: fc.Arbitrary<Interval> = fc.oneof(
  { weight: 4, arbitrary: intervalIn(-10, 10, 5) },
  {
    weight: 1,
    arbitrary: intervalIn(-1_000_000, 1_000_000, 1_000_000),
  },
);

const intervalList = fc.array(interval, { maxLength: 12 });

// Targeted generator: already-disjoint intervals with gaps of at least 1.
const disjointList = fc
  .tuple(
    fc.integer({ min: -20, max: 20 }),
    fc.array(
      fc.tuple(
        fc.integer({ min: 1, max: 4 }),
        fc.nat(4),
      ),
      { maxLength: 8 },
    ),
  )
  .map(([start, steps]) => {
    const out: Interval[] = [];
    let pos = start;

    for (const [gap, len] of steps) {
      out.push([pos, pos + len]);
      pos += len + gap;
    }

    return out;
  });

const shuffled = <T,>(xs: T[]) =>
  fc.shuffledSubarray(xs, {
    minLength: xs.length,
    maxLength: xs.length,
  });

// Small oracle: check whether a point is covered.
const covers = (xs: readonly Interval[], p: number) =>
  xs.some(([s, e]) => s <= p && p <= e);

// Include fractional points because gaps between integers matter.
const probePoints = (xs: readonly Interval[]) =>
  xs.flatMap(([s, e]) => [
    s - 0.5,
    s,
    s + 0.5,
    e - 0.5,
    e,
    e + 0.5,
  ]);

const copy = (xs: readonly Interval[]): Interval[] =>
  xs.map(([s, e]) => [s, e]);

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(
          ([s, e]) =>
            !out.some(([a, b]) => a <= s && e <= b),
        );
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. Output intervals are valid, sorted, and non-touching.
  it('returns sorted, valid, non-touching intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);

        for (const [s, e] of out) {
          expect(
            Number.isInteger(s) &&
            Number.isInteger(e) &&
            s <= e,
          ).toBe(true);
        }

        for (let i = 0; i + 1 < out.length; i++) {
          expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: differential. Input and output cover exactly the same real points.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);

        for (const p of probePoints([...xs, ...out])) {
          expect(covers(out, p)).toBe(covers(xs, p));
        }
      }),
    );
  });

  // Pattern: invariant. The input array and its intervals are not modified.
  it('does not modify its input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const before = copy(xs);
        mergeIntervals(xs);
        expect(xs).toEqual(before);
      }),
    );
  });

  // Pattern: metamorphic. Reordering intervals does not change the result.
  it('does not depend on input order', () => {
    fc.assert(
      fc.property(
        intervalList.chain(xs =>
          fc.tuple(fc.constant(xs), shuffled(xs)),
        ),
        ([xs, ys]) => {
          expect(mergeIntervals(ys)).toEqual(
            mergeIntervals(xs),
          );
        },
      ),
    );
  });

  // Pattern: metamorphic. Duplicating intervals does not change the result.
  it('ignores duplicates', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        expect(
          mergeIntervals([...xs, ...xs]),
        ).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: algebraic. Merging twice gives the same result as merging once.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: algebraic. Merging in stages gives the same result.
  it('can merge in stages', () => {
    fc.assert(
      fc.property(intervalList, intervalList, (a, b) => {
        expect(
          mergeIntervals([...mergeIntervals(a), ...b]),
        ).toEqual(mergeIntervals([...a, ...b]));
      }),
    );
  });

  // Pattern: conditional. Already-disjoint intervals remain unchanged except for sorting.
  it('leaves already-disjoint input alone, apart from sorting', () => {
    fc.assert(
      fc.property(
        disjointList.chain(xs =>
          fc.tuple(fc.constant(xs), shuffled(xs)),
        ),
        ([sorted, xs]) => {
          expect(mergeIntervals(xs)).toEqual(sorted);
        },
      ),
    );
  });

  // Pattern: conditional. Intervals sharing an endpoint must merge.
  it('merges intervals that touch at an endpoint', () => {
    const touching = fc
      .tuple(
        fc.integer({ min: -100, max: 100 }),
        fc.nat(10),
        fc.nat(10),
        fc.boolean(),
      )
      .map(([a, l1, l2, flip]): [Interval[], Interval] => {
        const xs: Interval[] = [
          [a, a + l1],
          [a + l1, a + l1 + l2],
        ];
        return [
          flip ? xs.reverse() : xs,
          [a, a + l1 + l2],
        ];
      });

    fc.assert(
      fc.property(touching, ([xs, expected]) => {
        expect(mergeIntervals(xs)).toEqual([expected]);
      }),
    );
  });

  // Pattern: conditional. Invalid intervals throw a RangeError.
  it('rejects invalid intervals', () => {
    const bad: fc.Arbitrary<Interval> = fc.oneof(
      fc.tuple(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 1, max: 10 }),
      ).map(([s, d]): Interval => [s, s - d]),

      fc.tuple(
        fc.integer({ min: -100, max: 100 }),
        fc.nat(5),
      ).map(([s, l]): Interval => [s + 0.5, s + l + 1]),

      fc.tuple(
        fc.integer({ min: -100, max: 100 }),
        fc.nat(5),
      ).map(([s, l]): Interval => [s, s + l + 0.5]),

      fc.constantFrom<Interval>(
        [NaN, 1],
        [0, NaN],
        [0, Infinity],
        [-Infinity, 0],
      ),
    );

    const input = fc
      .tuple(intervalList, bad, intervalList)
      .map(([a, x, b]) => [...a, x, ...b]);

    fc.assert(
      fc.property(input, xs => {
        expect(() => mergeIntervals(xs)).toThrow(RangeError);
      }),
    );
  });

  it('matches worked examples', () => {
    expect(mergeIntervals([])).toEqual([]);

    expect(
      mergeIntervals([[3, 5], [1, 3]]),
    ).toEqual([[1, 5]]);

    expect(
      mergeIntervals([[1, 2], [3, 4]]),
    ).toEqual([[1, 2], [3, 4]]);
  });
});
