---
title: Floating-point addition is not associative
date: 2026-08-10
summary: Finite precision breaks (a + b) - b, and that's why a compiler can't freely reorder or vectorize float sums.
---

In basic mathematics, addition is associative: `(A + B) + C == A + (B + C)`.

In systems programming under IEEE 754 — the standard defining how virtually all modern hardware represents and computes binary floating-point — that property does not hold:

```c
#include <stdio.h>

int main(void) {
    float a = 3.14f;
    float b = 1e20f;

    float res1 = (a + b) - b;
    float res2 = a + (b - b);

    printf("res1: %f\n", res1); // Prints: 0.000000
    printf("res2: %f\n", res2); // Prints: 3.140000
    return 0;
}
```

The identity fails completely, dropping 3.14 down to 0.0. This is not a compiler flaw — it's a fundamental constraint of finite precision.

# Where the digits go

In single-precision IEEE 754, a `float` has only 23 explicit fraction bits (the mantissa) — roughly 7 decimal digits of precision.

When computing `a + b` (3.14 + 10^20), the floating-point unit must align the binary points by shifting the smaller number's mantissa to the right. Because 10^20 needs far more than 23 bits of range compared to 3.14, the bits representing 3.14 are shifted entirely out of the register and discarded during rounding.

So `3.14f + 1e20f` evaluates to exactly `1e20f`, and subtracting `1e20f` leaves `0.0f`.

# The production impact

Because floating-point addition is non-associative, a C compiler cannot arbitrarily reorder arithmetic expressions. When you write a loop summing an array of floats, GCC cannot vectorize it with SIMD lanes — Single Instruction, Multiple Data — or parallelize it across threads without changing the numeric output.

Flags like `-ffast-math` let the compiler assume associativity and enable auto-vectorization, at the cost of breaking strict IEEE 754 compliance and introducing non-deterministic drift across hardware platforms.

# Working with floating-point

- Never use floating-point types for discrete values. Use scaled integers or fixed-point for currency and exact bounds.
- Sort before accumulating. Summing from smallest to largest magnitude reduces the risk of small values being absorbed into large exponents — though it isn't a guaranteed fix for every distribution.
- Use compensated summation. Algorithms like Kahan summation track the lost low-order bits in a separate error accumulator and give a bounded-error guarantee that sorting alone doesn't.

Computers represent real numbers as finite, logarithmic approximations. Assuming algebraic equivalence leads straight to precision loss and non-deterministic systems.
