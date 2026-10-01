---
title: Why a 'plain' pointer broke my lock-free queue
date: 2025-12-31
summary: Exploring atomic operations and memory ordering.
---

The bug was intermittent. The data race was real.

While building a Michael–Scott concurrent queue in C, I hit a failure that didn’t show up consistently.

Rerun the test. It passes.

Run it again. Eventually, it fails.

A shared pointer exposed a gap in my understanding.

I had declared it as an ordinary pointer, even though multiple threads could read and update it without synchronization.

In C, those conflicting accesses create a data race—and a data race is undefined behavior.

The program was already incorrect, even when the tests passed.

Addressing the race meant using C11’s `_Atomic` and reviewing the memory ordering around its accesses. But changing the declaration wasn’t the whole lesson.

Three things stuck with me:

→ An atomic pointer doesn’t automatically protect the node it points to.

→ Memory ordering needs justification, not just “acquire for reads, release for writes.”

→ Reading a pointer atomically doesn’t make freed memory safe to access.

Stress testing exposed the problem. Passing afterward didn’t prove correctness.

Now I ask a different question when reviewing concurrent code:

“What guarantees this access is safe when another thread runs at exactly the wrong moment?”
