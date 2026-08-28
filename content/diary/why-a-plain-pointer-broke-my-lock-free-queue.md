---
title: Why a 'plain' pointer broke my lock-free queue
date: 2025-12-31
summary: Exploring atomic operations and memory ordering.
---

While building my lock-free concurrent queue in C, I ran into a problem that had nothing to do with the algorithm itself and everything to do with a single variable declaration.

## The problem

The Michael & Scott algorithm relies on `compare_exchange_strong` — an atomic operation that checks whether a value is still what you expect it to be, and only updates it if so, all in one indivisible step. This is what lets multiple threads fight over the same pointer without corrupting it.

I had a shared pointer that multiple threads needed to read and update concurrently. My first instinct was to declare it as a plain pointer type and add locking around it later if tests failed. That instinct was wrong, and the failure wasn't obvious — it didn't crash immediately. It showed up as an intermittent test failure, roughly 1 in every few hundred runs, exactly the kind of bug that's easy to dismiss as "flaky" and re-run away.

## What I learned

The fix wasn't a different algorithm — it was declaring the shared pointer using C11's `_Atomic` qualifier, paired with explicit memory ordering on every access (`memory_order_acquire` for reads, `memory_order_release` for writes). Without this, the compiler is free to reorder instructions and cache values in ways that are perfectly legal for single-threaded code but break the guarantees my algorithm depended on across threads.

The specific insight: a "plain" pointer and an "atomic" pointer aren't just a style choice. They compile to different instructions and carry different guarantees about visibility across CPU cores. Two threads can each have their own cached copy of a plain variable's value in their core's cache — an atomic type with the right memory ordering forces that value to actually be synchronized across cores at the right moment.

## Why it matters

This is the difference between code that works on your machine and code that fails under real concurrent load. My test suite eventually caught this because I ran it across 32+ threads specifically to stress this exact class of bug — a smaller thread count might never have surfaced it. It's also exactly the kind of failure that's hardest to debug after the fact, since it doesn't reproduce reliably.

The broader lesson: in concurrent systems programming, the type you choose for a shared variable isn't a detail — it's part of your correctness guarantee, not just your data model.
