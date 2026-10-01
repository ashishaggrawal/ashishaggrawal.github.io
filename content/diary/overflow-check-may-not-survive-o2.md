---
title: Your signed-overflow check may not survive -O2
date: 2026-08-13
summary: GCC and Clang can legally delete a post-addition signed-overflow check. Test the operands before the operation.
---

You write an overflow check in C. It looks correct, compiles clean, and passes every test.

```c
int check_overflow(int x, int y) {
    int sum = x + y;
    if (x > 0 && y > 0 && sum < 0) {
        return 1; // Overflowed!
    }
    return 0;
}
```

You ship it, confident it's protecting your code from a classic integer overflow bug.

Here's what you don't know: compile this under GCC or Clang with `-O2` or `-O3`, and the compiler is allowed to delete the entire `if` block. Not because it's buggy — because the C standard says it can.

# The reasoning

- You wrote `x > 0` and `y > 0`.
- In pure math, two positive numbers always sum to something positive.
- Signed integer overflow is Undefined Behavior, and the standard says the compiler may assume UB never happens in valid code.
- So `sum < 0` is, by definition, logically impossible. Dead code. Deleted.

There is no warning and no error. The binary just silently ships without the check you wrote, tested, and trusted. This isn't a rare compiler edge case — it's standard, expected `-O2` behavior on GCC and Clang today. If you're validating untrusted input with a post-addition check like this, the validation may not exist in your release build at all.

# The fix: check before the operation

Stop trusting arithmetic that has already happened. Check before it runs:

```c
int sadd_ok(int x, int y) {
    if (x > 0 && y > INT_MAX - x) return 0; // would overflow
    if (x < 0 && y < INT_MIN - x) return 0; // would underflow
    return 1;
}
```

This works because the check itself never triggers UB — it only ever compares values that are already valid, before the risky addition runs.

Or skip the manual bounds math and use a compiler built-in, which compiles directly to the hardware's carry/overflow flag:

```c
if (__builtin_add_overflow(x, y, &result)) {
    // handle overflow
}
```

Unsigned integers don't have this trap: the standard guarantees they wrap modulo `2^w`, so a post-addition check like `sum >= x` is legal and safe there. It's specifically signed overflow that's UB.

# Takeaway

In C, a check placed on the wrong side of the operation isn't a weaker check. It's not a check at all — and the compiler will prove that to you, silently, in production.
