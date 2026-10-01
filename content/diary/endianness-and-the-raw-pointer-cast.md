---
title: Endianness and the raw pointer cast trap
date: 2026-09-17
summary: Why casting a byte buffer straight to uint32_t* fails in production — byte order, alignment, strict aliasing — and the memcpy + ntohl fix.
---

When parsing a binary protocol or a network packet, this pattern shows up constantly:

```c
// Read a 32-bit integer from a raw byte buffer
uint8_t buffer[4] = { 0x00, 0x01, 0x00, 0x00 };

uint32_t val = *(uint32_t *)buffer;
```

The author expects `val` to be 65,536 (`0x00010000`). It compiles without errors and passes tests on an x86 development machine.

# Why it bites in production

**Silent data inversion.** Standard network protocols such as TCP/IP transmit data in big-endian order — most significant byte at the lowest address. x86 and most ARM cores are little-endian — least significant byte at the lowest address. Reading those four bytes via `*(uint32_t *)buffer`, the CPU treats the first byte (`0x00`) as the lowest bits and the last byte (`0x00`) as the highest. The value comes out as 256 (`0x00000100`), not 65,536.

**The undefined-behavior trap.** Casting an arbitrary buffer offset to `uint32_t *` can violate alignment requirements. On ARMv7 or SPARC, a 4-byte load from an address not divisible by 4 raises a hardware exception (`SIGBUS`); even on x86, unaligned loads that cross a cache line cost latency. Dereferencing the casted pointer also violates C's strict aliasing rules, which lets the compiler optimize away dependent memory operations.

# The fix

Avoid casting pointers over raw bytes. The standard-compliant, portable pattern is `memcpy` plus an explicit byte-order conversion:

```c
#include <string.h>
#include <arpa/inet.h> // for ntohl

uint32_t read_u32_be(const uint8_t *buf) {
    uint32_t raw;
    // memcpy handles alignment safely and avoids strict-aliasing UB
    memcpy(&raw, buf, sizeof(raw));

    // convert from network byte order (big endian) to host order
    return ntohl(raw);
}
```

Modern GCC and Clang recognize this `memcpy` + `ntohl` idiom. At `-O2` they omit the function calls entirely and compile it down to a single instruction — a direct load, or a `mov` followed by one hardware byte-swap (`bswap`).

Correct memory interpretation means respecting the physical byte layout, the alignment constraints, and the difference between host and wire formats.
