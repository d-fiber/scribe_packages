// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import { decodeEntry, encodeEntry } from "@scribe/foundation/src/valkery/entry.ts";
import { assert, assertEquals } from "@std/assert";

const TTL_MS = 60_000;

Deno.test("an entry survives the round trip with both of its numbers", () => {
  const raw = encodeEntry({ name: "ada" }, 1_700_000_000_000, 42);
  const entry = decodeEntry<{ name: string }>(raw, TTL_MS);

  assertEquals(entry, {
    value: { name: "ada" },
    expiresAt: 1_700_000_000_000,
    computeMs: 42,
  });
});

Deno.test("a value written before envelopes existed is read as itself", () => {
  const entry = decodeEntry<{ name: string }>('{"name":"ada"}', TTL_MS);

  assertEquals(entry?.value, { name: "ada" });
  assertEquals(
    entry?.computeMs,
    0,
    "a legacy entry knows nothing about the cost of a recompute",
  );
});

Deno.test("a legacy entry is given the ttl it would have expired with", () => {
  const before = Date.now();
  const entry = decodeEntry<number>("7", TTL_MS);

  assert(entry !== null);
  assert(entry.expiresAt >= before + TTL_MS);
  assert(entry.expiresAt <= Date.now() + TTL_MS);
});

Deno.test("a scalar and a null survive the round trip", () => {
  assertEquals(decodeEntry<number>(encodeEntry(7, 1, 2), TTL_MS)?.value, 7);
  assertEquals(decodeEntry<null>(encodeEntry(null, 1, 2), TTL_MS)?.value, null);
  assertEquals(decodeEntry<string>(encodeEntry("", 1, 2), TTL_MS)?.value, "");
});

Deno.test("an unreadable payload is a miss, not a throw", () => {
  assertEquals(decodeEntry("{not json", TTL_MS), null);
});

Deno.test("an object that merely looks like an envelope is read as a value", () => {
  const lookalike = JSON.stringify({ v: "x", e: 1, d: 2 });

  assertEquals(
    decodeEntry<Record<string, unknown>>(lookalike, TTL_MS)?.value,
    { v: "x", e: 1, d: 2 },
    "the marker is what tells an envelope from a value, and a domain object does not carry it",
  );
});
