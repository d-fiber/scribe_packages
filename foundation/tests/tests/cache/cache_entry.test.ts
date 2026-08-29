// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
import "@scribe/testing/runner.ts";
import { equals, expect, fail, isTrue, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import { decodeCacheEntry, encodeCacheEntry } from "../../../lib/src/cache/cache_entry.ts";
const NOT_YET = Date.now() + 30_000;
const TTL_MS = 60_000;

installDrivers();

Scribe.test("an entry survives the round trip with both of its numbers", () => {
  const raw = encodeCacheEntry({ name: "ada" }, NOT_YET, 42);
  const entry = decodeCacheEntry<{ name: string }>(raw, TTL_MS);

  expect(
    entry,
    equals({
      value: { name: "ada" },
      expiresAt: NOT_YET,
      computeMs: 42,
    }),
  );
});

Scribe.test("a value written before envelopes existed is read as itself", () => {
  const entry = decodeCacheEntry<{ name: string }>('{"name":"ada"}', TTL_MS);

  expect(entry?.value, equals({ name: "ada" }));
  expect(entry?.computeMs, equals(0), "a legacy entry knows nothing about the cost of a recompute");
});

Scribe.test("a legacy entry is given the ttl it would have expired with", () => {
  const before = Date.now();
  const entry = decodeCacheEntry<number>("7", TTL_MS);
  if (entry === null) fail("a legacy entry must still decode");

  expect(entry.expiresAt >= before + TTL_MS, isTrue);
  expect(entry.expiresAt <= Date.now() + TTL_MS, isTrue);
});

Scribe.test("a scalar and a null survive the round trip", () => {
  expect(decodeCacheEntry<number>(encodeCacheEntry(7, NOT_YET, 2), TTL_MS)?.value, equals(7));
  expect(decodeCacheEntry<null>(encodeCacheEntry(null, NOT_YET, 2), TTL_MS)?.value, equals(null));
  expect(decodeCacheEntry<string>(encodeCacheEntry("", NOT_YET, 2), TTL_MS)?.value, equals(""));
});

Scribe.test("an unreadable payload is a miss, not a throw", () => {
  expect(decodeCacheEntry("{not json", TTL_MS), equals(null));
});

Scribe.test("an object that merely looks like an envelope is read as a value", () => {
  const lookalike = JSON.stringify({ v: "x", e: 1, d: 2 });

  expect(
    decodeCacheEntry<Record<string, unknown>>(lookalike, TTL_MS)?.value,
    equals({ v: "x", e: 1, d: 2 }),
    "the marker is what tells an envelope from a value, and a domain object does not carry it",
  );
});
