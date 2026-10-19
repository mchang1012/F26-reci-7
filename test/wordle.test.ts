import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { matchGuess } from '../src/wordle';
import { AsyncLocalStorage } from 'node:async_hooks';

// Recitation Part 1: follow along with your TA, filling in the todos below.
// Problem set Task 1: keep adding properties until `npm run mutants:wordle`
// kills every mutant. Read the spec in src/wordle/matchGuess.ts.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The result always has exactly five colors.
// (invariant, algebraic, metamorphic, differential, or conditional)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const wordFrom = (letters: string) =>
    fc.array(fc.constantFrom(...letters), {minLength: 5, maxLength: 5}).map(cs => cs.join(''));
const word = wordFrom(ALPHABET);



describe('matchGuess', () => {
  it('returns exactly five colors', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        expect(matchGuess(secret, guess)).toHaveLength(5);
      }),
    );
  });

  it('only uses the colors G, Y, B', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        const result = matchGuess(secret, guess);
        result.forEach(color => {
          expect(['G', 'Y', 'B']).toContain(color);
        });
      }),
    );
  });

  it('guessing the secret gives all greens', () => {
    fc.assert(
      fc.property(word, w => {
        expect(matchGuess(w, w)).toEqual([
          'G', 'G', 'G', 'G', 'G'
        ]);
      }),
    );
  });

  it('never credits a letter more times than the secret contains it', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        const result = matchGuess(secret, guess);

        for (const letter of ALPHABET) {
          const available = [...secret].filter(c => c === letter).length;
          const credited = [...guess].filter(
            (c, i) => c === letter && result[i] !== 'B'
          ).length;

          expect(credited).toBeLessThanOrEqual(available);
        }
      }),
    );

    // Misplaced letters must be yellow.
    expect(matchGuess('ABCDE', 'BCDEA')).toEqual([
      'Y', 'Y', 'Y', 'Y', 'Y'
    ]);

    // Greens must take priority over yellows.
    expect(matchGuess('AAABA', 'BAAAB')).toEqual([
      'Y', 'G', 'G', 'Y', 'B'
    ]);
  });
});


