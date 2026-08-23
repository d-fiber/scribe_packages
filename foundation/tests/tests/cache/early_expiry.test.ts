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

import "@scribe/foundation/tests/testing/settings.ts";

import { shouldRefreshEarly } from "@scribe/foundation/lib/src/cache/early_expiry.ts";
import type { CacheEntry } from "@scribe/foundation/lib/src/cache/cache_entry.ts";
import { assert, assertEquals } from "@std/assert";

function entry(computeMs: number, expiresInMs: number, now: number): CacheEntry<string> {
  return { value: "v", expiresAt: now + expiresInMs, computeMs };
}

const NOW = 1_700_000_000_000;

function refreshRate(e: CacheEntry<string>, beta = 1, draws = 4_000): number {
  let refreshed = 0;
  for (let i = 0; i < draws; i++) {
    if (shouldRefreshEarly(e, beta, NOW)) refreshed++;
  }
  return refreshed / draws;
}

Deno.test("an entry whose computation was not measured never refreshes early", () => {
  const unmeasured = 0;
  assertEquals(
    refreshRate(entry(unmeasured, 1_000, NOW)),
    0,
    "an entry written before the field existed, or too fast to time, stays out of it",
  );
});

Deno.test("beta at zero turns refresh-ahead off", () => {
  assertEquals(refreshRate(entry(500, 100, NOW), 0), 0);
});

Deno.test("an entry far from its expiry is almost never refreshed", () => {
  const anHourLeft = 3_600_000;
  assert(
    refreshRate(entry(50, anHourLeft, NOW)) < 0.01,
    "a 50ms computation an hour from its expiry pulls fewer than one reader in a hundred",
  );
});

Deno.test("an entry past its expiry is always refreshed", () => {
  assertEquals(refreshRate(entry(50, -1, NOW)), 1);
});

Deno.test("the window widens with the cost of the computation", () => {
  const remaining = 1_000;
  const cheap = refreshRate(entry(5, remaining, NOW));
  const costly = refreshRate(entry(500, remaining, NOW));

  assert(
    costly > cheap,
    `a costly value should volunteer more often (${costly} vs ${cheap})`,
  );
  assert(cheap < 0.05, "a cheap value should behave as if this did not exist");
});

Deno.test("the closer the expiry, the more readers volunteer", () => {
  const far = refreshRate(entry(200, 800, NOW));
  const near = refreshRate(entry(200, 100, NOW));

  assert(near > far, `${near} should exceed ${far}`);
});
