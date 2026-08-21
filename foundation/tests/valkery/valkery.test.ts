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
// LICENSE file, the LICENSE file governs.

import "@scribe/core/testing/settings.ts";

import { Time } from "@scribe/core/contracts/common/time.ts";
import { kv } from "@scribe/foundation/lib/src/redis/mod.ts";
import { installValkeryMock } from "@scribe/foundation/tests/testing/valkery.ts";
import { encodeEntry } from "@scribe/foundation/lib/src/valkery/entry.ts";
import { Valkery } from "@scribe/foundation/lib/src/valkery/valkery.ts";
import { assert, assertEquals } from "@std/assert";
import { spy, stub } from "@std/testing/mock";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function seed(key: string, value: unknown, expiresInMs: number, computeMs: number) {
  return kv().setex(
    key,
    300,
    encodeEntry(value, Date.now() + expiresInMs, computeMs),
  );
}

Deno.test("upsert computes once and serves the cached value afterwards", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<number>({ key: "test", ttl: Time.minutes(5) });
  let computed = 0;

  try {
    const compute = () => Promise.resolve(++computed);

    assertEquals(await cache.upsert("k", compute), 1);
    assertEquals(await cache.upsert("k", compute), 1);
    assertEquals(computed, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("upsert collapses concurrent callers before it touches Redis", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<string>({ key: "test", ttl: Time.minutes(5) });
  const gate = deferred<string>();
  const get = spy(kv(), "get");
  let computed = 0;

  try {
    const compute = () => {
      computed++;
      return gate.promise;
    };

    const all = Promise.all([
      cache.upsert("k", compute),
      cache.upsert("k", compute),
      cache.upsert("k", compute),
      cache.upsert("k", compute),
    ]);

    gate.resolve("value");
    assertEquals(await all, ["value", "value", "value", "value"]);
    assertEquals(computed, 1, "four callers of one key must produce one computation");
    assertEquals(
      get.calls.length,
      1,
      "four callers of one key must cost one read: the distributed lock alone would have "
        + "collapsed them too, but only after a read and a poll each",
    );
  } finally {
    get.restore();
    mock.restore();
  }
});

Deno.test("upsert refreshes ahead of the expiry and returns the fresh value", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<string>({ key: "test", ttl: Time.minutes(5) });

  try {
    const oneMillisecondLeft = 1;
    const costlyToProduce = 1_000_000;
    await seed("test:k", "stale", oneMillisecondLeft, costlyToProduce);

    assertEquals(
      await cache.upsert("k", () => Promise.resolve("fresh")),
      "fresh",
      "an entry that costs a lot and expires in a millisecond makes every reader volunteer",
    );
    assertEquals(await cache.get("k"), "fresh", "and the refreshed value was written back");
  } finally {
    mock.restore();
  }
});

Deno.test("upsert serves the cached value rather than recomputing far from the expiry", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<string>({ key: "test", ttl: Time.minutes(5) });
  let computed = 0;

  try {
    await seed("test:k", "cached", 1_000_000_000, 1);

    assertEquals(
      await cache.upsert("k", () => {
        computed++;
        return Promise.resolve("recomputed");
      }),
      "cached",
    );
    assertEquals(computed, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("a refresh that throws still serves the value the cache already holds", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<string>({ key: "test", ttl: Time.minutes(5) });

  try {
    await seed("test:k", "stale", 1, 1_000_000);

    assertEquals(
      await cache.upsert("k", () => Promise.reject(new Error("origin down"))),
      "stale",
      "a flaky origin must not turn into an error when an answer is in hand",
    );
  } finally {
    mock.restore();
  }
});

Deno.test("getMany reads every id in a single round trip", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<number>({ key: "test", ttl: Time.minutes(5) });
  const mget = spy(kv(), "mget");

  try {
    await cache.add("a", 1);
    await cache.add("c", 3);

    assertEquals(await cache.getMany(["a", "b", "c"]), [1, null, 3]);
    assertEquals(mget.calls.length, 1, "three ids must cost one call");
    assertEquals([...mget.calls[0].args], ["test:a", "test:b", "test:c"]);
  } finally {
    mget.restore();
    mock.restore();
  }
});

Deno.test("getMany on an empty list does not touch Redis at all", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<string>({ key: "test", ttl: Time.minutes(5) });
  const mget = spy(kv(), "mget");

  try {
    assertEquals(await cache.getMany([]), []);
    assertEquals(mget.calls.length, 0);
  } finally {
    mget.restore();
    mock.restore();
  }
});

Deno.test("clear removes a namespace with UNLINK, never DEL", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<number>({ key: "test", ttl: Time.minutes(5) });
  const unlink = spy(kv(), "unlink");
  const del = spy(kv(), "del");

  try {
    await cache.add("a", 1);
    await cache.add("b", 2);
    await cache.clear();

    assertEquals(await cache.get("a"), null);
    assertEquals(await cache.get("b"), null);
    assert(unlink.calls.length > 0, "the sweep must unlink");
    assertEquals(del.calls.length, 0, "DEL holds the single Redis thread");
  } finally {
    del.restore();
    unlink.restore();
    mock.restore();
  }
});

Deno.test("delete removes a single entry with UNLINK", async () => {
  const mock = installValkeryMock();
  const cache = new Valkery<number>({ key: "test", ttl: Time.minutes(5) });
  const unlink = spy(kv(), "unlink");

  try {
    await cache.add("a", 1);
    await cache.delete("a");

    assertEquals(await cache.get("a"), null);
    assertEquals([...unlink.calls[0].args], ["test:a"]);
  } finally {
    unlink.restore();
    mock.restore();
  }
});

Deno.test("a cache stays usable when Redis is down", async () => {
  const cache = new Valkery<string>({ key: "test", ttl: Time.minutes(5) });
  const reported: string[] = [];
  const broken = stub(kv(), "get", () => Promise.reject(new Error("no redis")));
  const reporter = stub(console, "error", (...args: unknown[]) => {
    reported.push(String(args[0]));
  });

  try {
    assertEquals(await cache.get("k"), null, "an unreachable cache reads as a miss");
    assert(reported.some((line) => line.includes("[valkery:test] get failed")));
  } finally {
    reporter.restore();
    broken.restore();
  }
});
