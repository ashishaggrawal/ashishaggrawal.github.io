---
title: Why abs(INT_MIN) returns a negative number
date: 2026-09-10
summary: Two's complement is asymmetric — TMin has no positive counterpart, and negating it is undefined behavior.
---

What is the absolute value of the smallest 32-bit integer? If your answer is 2,147,483,648, your program just triggered Undefined Behavior — or returned a negative number.

```c
int safe_abs(int x) {
    if (x < 0) return -x;
    return x;
}

printf("%d\n", safe_abs(INT_MIN)); // Prints: -2147483648
```

This bug comes straight out of the math of two's complement asymmetry.

# The range imbalance

For a `w`-bit signed integer, the representable range is `-2^(w-1)` to `2^(w-1) - 1`. For 32 bits:

- `TMin` (smallest value) = -2,147,483,648
- `TMax` (largest value) = +2,147,483,647

Because zero uses one of the non-negative bit patterns, there is one more negative number than positive number. `TMin` has no positive counterpart.

# Why -TMin == TMin

In hardware, negating a two's complement integer isn't a sign-bit flip. It follows the identity `-x = ~x + 1` — bitwise NOT, then add one. Watch what happens when we negate 32-bit `TMin` (`0x80000000`):

```text
  TMin  = 1000 0000 0000 0000 0000 0000 0000 0000
~ TMin  = 0111 1111 1111 1111 1111 1111 1111 1111   (this is TMax)
    + 1 = 1000 0000 0000 0000 0000 0000 0000 0000   (back to TMin)
```

The carry ripples all the way across and wraps the number straight back to `TMin`.

# The practical impact

In the C standard, negating `INT_MIN` is signed integer overflow — Undefined Behavior. On standard x86-64 hardware, the standard library's `abs(INT_MIN)` typically just returns `INT_MIN`: a negative result from an absolute-value function.

Naive validation like `if (abs(id) > MAX_LIMIT)` can be bypassed entirely by an attacker who supplies `INT_MIN`.

# Takeaway

Never assume the set of negative integers mirrors the positive ones. At the hardware boundary, the edge cases lurk at the extremes.
