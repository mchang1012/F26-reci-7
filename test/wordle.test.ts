
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

// Generate secret and guess from the same alphabet.
// Smaller alphabets make repeated letters more common.
const pair = fc
  .constantFrom('ABC', 'XYZ', ALPHABET)
  .chain(letters =>
    fc.tuple(wordFrom(letters), wordFrom(letters))
  );

// Count occurrences of a letter in a word.
const count = (w: string, letter: string) =>
  [...w].filter(c => c === letter).length;

// Generate a one-to-one renaming of all 26 letters.
const renaming = fc
  .shuffledSubarray([...ALPHABET], {
    minLength: 26,
    maxLength: 26,
  })
  .map(perm =>
    new Map([...ALPHABET].map((c, i) => [c, perm[i]]))
  );

const rename = (w: string, m: Map<string, string>) =>
  [...w].map(c => m.get(c)!).join('');

// Generate words that violate the input requirements.
const invalidWord = fc.oneof(
  fc.array(fc.constantFrom(...ALPHABET), {
    maxLength: 10,
  })
    .map(cs => cs.join(''))
    .filter(w => w.length !== 5),

  fc.tuple(wordFrom(ALPHABET), fc.nat(4))
    .map(([w, i]) =>
      w.slice(0, i) + w[i].toLowerCase() + w.slice(i + 1)
    ),

  fc.tuple(
    wordFrom(ALPHABET),
    fc.nat(4),
    fc.constantFrom('1', ' ', '@', '[', 'É')
  ).map(([w, i, c]) =>
    w.slice(0, i) + c + w.slice(i + 1)
  ),
);

describe('matchGuess', () => {

  // Pattern: invariant. The result always has exactly five colors.
  it('returns exactly five colors', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        expect(matchGuess(secret, guess)).toHaveLength(5);
      }),
    );
  });

  // Pattern: invariant. Every result contains only G, Y, or B.
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

  // Pattern: conditional. Guessing the secret gives all greens.
  it('guessing the secret gives all greens', () => {
    fc.assert(
      fc.property(word, w => {
        expect(matchGuess(w, w)).toEqual([
          'G', 'G', 'G', 'G', 'G'
        ]);
      }),
    );
  });

  // Pattern: invariant. A letter cannot receive more credits than the secret contains.
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

  // Pattern: invariant. Green positions correspond exactly to matching letters.
  it('is green exactly where the letters match', () => {
    fc.assert(
      fc.property(pair, ([secret, guess]) => {
        const result = matchGuess(secret, guess);

        for (let i = 0; i < 5; i++) {
          expect(result[i] === 'G').toBe(
            guess[i] === secret[i]
          );
        }
      }),
    );
  });

  // Pattern: differential. A letter receives the minimum of its two counts.
  it('credits each letter min(#guess, #secret) times', () => {
    fc.assert(
      fc.property(pair, ([secret, guess]) => {
        const result = matchGuess(secret, guess);

        for (const letter of new Set(guess)) {
          const credited = [...guess].filter(
            (c, i) => c === letter && result[i] !== 'B'
          ).length;

          expect(credited).toBe(
            Math.min(
              count(guess, letter),
              count(secret, letter)
            )
          );
        }
      }),
    );
  });

  // Pattern: conditional. If no guess letters appear in the secret, all are black.
  it('colors letters absent from the secret black', () => {
    const disjoint = fc.tuple(
      wordFrom('ABCDEFGHIJKLM'),
      wordFrom('NOPQRSTUVWXYZ')
    );

    fc.assert(
      fc.property(disjoint, ([secret, guess]) => {
        expect(matchGuess(secret, guess)).toEqual([
          'B', 'B', 'B', 'B', 'B'
        ]);
      }),
    );
  });

  // Pattern: invariant. Non-green copies of a letter receive yellows before blacks.
  it('assigns yellows left to right', () => {
    fc.assert(
      fc.property(pair, ([secret, guess]) => {
        const result = matchGuess(secret, guess);

        for (const letter of new Set(guess)) {
          const colors = [...guess]
            .map((c, i) =>
              c === letter && result[i] !== 'G'
                ? result[i]
                : null
            )
            .filter(c => c !== null)
            .join('');

          expect(colors).toMatch(/^Y*B*$/);
        }
      }),
    );
  });

  // Pattern: metamorphic. Consistently renaming letters preserves the result.
  it('does not depend on which letters are used', () => {
    fc.assert(
      fc.property(pair, renaming, ([secret, guess], m) => {
        expect(
          matchGuess(
            rename(secret, m),
            rename(guess, m)
          )
        ).toEqual(matchGuess(secret, guess));
      }),
    );
  });

  // Pattern: metamorphic. Replacing a non-green letter with an absent
  // letter makes it black without changing earlier positions.
  it('replacing a letter with an unused one only blackens it', () => {
    const input = fc
      .tuple(
        wordFrom('ABCDE'),
        wordFrom('ABCDE'),
        fc.nat(4),
        fc.constantFrom(...'VWXYZ')
      )
      .chain(([secret, guess, i, fresh]) =>
        fc.constantFrom(
          ...[...'ABCDE'].filter(c => c !== secret[i])
        ).map(c => [
          secret,
          guess.slice(0, i) + c + guess.slice(i + 1),
          i,
          fresh
        ] as const)
      );

    fc.assert(
      fc.property(input, ([secret, guess, i, fresh]) => {
        const before = matchGuess(secret, guess);

        const changed =
          guess.slice(0, i) +
          fresh +
          guess.slice(i + 1);

        const after = matchGuess(secret, changed);

        expect(after[i]).toBe('B');
        expect(after.slice(0, i)).toEqual(
          before.slice(0, i)
        );
      }),
    );
  });

  // Pattern: conditional. Invalid words must throw RangeError.
  it('rejects malformed words', () => {
    fc.assert(
      fc.property(
        invalidWord,
        word,
        fc.boolean(),
        (bad, good, badIsSecret) => {
          const [secret, guess] = badIsSecret
            ? [bad, good]
            : [good, bad];

          expect(() =>
            matchGuess(secret, guess)
          ).toThrow(RangeError);
        },
      ),
    );
  });

  // Original worked examples are preserved above.
});
