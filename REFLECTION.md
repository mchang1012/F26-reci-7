
# Reflection

**Name / Andrew ID:** Marianne Chang / mariannc

**Recitation group members (Task 2):** NA

---

### 1. Valid but weak

The Wordle invariant "returns exactly five colors" kills none of the public mutants by itself. Each mutant still returns five colors, but the bugs affect which colors are assigned.

The property is still valid because the specification requires five colors, one per guess position. It could catch an off-by-one bug that returns six colors or an implementation that accidentally returns an empty array for a correct guess.

### 2. A generator problem, not a property problem

The `singlePass` mutant was initially flaky because generating words from the full A-Z alphabet made repeated letters uncommon. The property checking that a letter is never credited more times than it appears in the secret was correct, but the generator rarely produced inputs that exposed the bug.

Before:

```text
~ singlePass flaky: killed in 4/5 runs
Counterexample: ["AOAAA","OOAAA"]
Mutation score: 4/5 killed (80%)
```

I improved the generator by generating the secret and guess together using the same alphabet, selected from `ABC`, `XYZ`, or the full A-Z alphabet. Small alphabets make repeated letters and shared letters more common, while the full alphabet still allows letter-specific bugs to be detected.

After:

```text
✔ singlePass killed
Counterexample: [["XXXYX","XXXXX"]]
AssertionError: expected 5 to be less than or equal to 4

Mutation score: 5/5 killed (100%)
```

The same issue can occur with intervals. A generator using only a wide range of endpoints rarely produces intervals that touch or have a gap of exactly one. Using a narrow range (-10 to 10) with lengths from 0 to 5 makes these boundary cases more common.

### 3. Reading a counterexample

```text
✔ mergesIntegerNeighbors killed
Counterexample: [[[0,0],[-1,-1]]]
AssertionError: expected true to be false
```

The specification says the output must cover exactly the same real-number points as the input. In this example, `[-1,-1]` and `[0,0]` are separate intervals, leaving all real numbers between -1 and 0 uncovered.

The mutant incorrectly merges them into `[-1,0]`, which covers points such as -0.5 that were not covered by the original input.

Therefore, `covers(out, -0.5)` is true while `covers(xs, -0.5)` is false. Checking only integer points would miss this bug because the original and incorrectly merged intervals cover the same integers.

### 4. Your project

One function from my Classic Creamery project is the time-clock service, which manages employee clock-in and clock-out times.

**Property 1 — Invariant:** A completed shift must have an end time greater than or equal to its start time. This ensures that recorded shift durations are never negative.

**Property 2 — Conditional:** If an employee is already clocked into a shift, attempting to clock in again should not create another active time-clock entry.

**Generator:** I would generate valid employee IDs, shifts, and clock-in/clock-out timestamps. For completed shifts, I would construct the end time by adding a nonnegative duration to the start time. For the conditional property, I would specifically generate shifts with an existing active clock-in record.

A naive generator might produce invalid timestamps or rarely generate employees who are already clocked in. This would cause the tests to fail on invalid inputs or miss the duplicate clock-in scenario.
