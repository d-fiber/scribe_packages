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
import "../../testing/settings.ts";
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, isTrue, Scribe } from "@scribe/alchemy/test";
import { KeyIndex } from "../../../lib/src/redis/key_index.ts";
import { installFakeRedis } from "./support/redis.ts";
import { installMock } from "../../testing/install.ts";

Scribe.test("keyOf joins the prefix and the subject with a colon", () => {
  const index = new KeyIndex("cache:user", 300, "test");
  expect(index.keyOf("u1"), equals("cache:user:u1"));
});

Scribe.test("remembering an entry adds it to the subject's set", async () => {
  const redis = installFakeRedis();
  try {
    const index = new KeyIndex("cache:user", 300, "test");
    await index.remember("u1", "session:a");
    const members = await index.members("u1");
    expect(members, equals(["session:a"]));
  } finally {
    redis.restore();
  }
});

Scribe.test("remembering a second entry keeps the first one indexed too", async () => {
  const redis = installFakeRedis();
  try {
    const index = new KeyIndex("cache:user", 300, "test");
    await index.remember("u1", "session:a");
    await index.remember("u1", "session:b");
    const members = await index.members("u1");
    expect(new Set(members), equals(new Set(["session:a", "session:b"])));
  } finally {
    redis.restore();
  }
});

Scribe.test("the expiry is re-armed on every write", async () => {
  const redis = installFakeRedis();
  try {
    const index = new KeyIndex("cache:user", 300, "test");
    await index.remember("u1", "session:a");
    expect(redis.ttlOf(index.keyOf("u1")), equals(300));

    redis.forget();
    await index.remember("u1", "session:b");
    expect(
      redis.countOf("expire"),
      equals(1),
      "each write re-arms the expiry once",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("a subject nothing was remembered for reads as an empty index", async () => {
  const redis = installFakeRedis();
  try {
    const index = new KeyIndex("cache:user", 300, "test");
    const members = await index.members("nobody");
    expect(members, equals([]));
  } finally {
    redis.restore();
  }
});

Scribe.test("forgetting a subject drops what was indexed for it", async () => {
  const redis = installFakeRedis();
  try {
    const index = new KeyIndex("cache:user", 300, "test");
    await index.remember("u1", "session:a");
    await index.forget("u1");
    const members = await index.members("u1");
    expect(members, equals([]));
  } finally {
    redis.restore();
  }
});

Scribe.test("a store that cannot be reached fails remember softly, returning false", async () => {
  const redis = installFakeRedis();
  const silenced = installMock(console, "error", () => {});
  try {
    redis.failNext("sadd", new Error("ECONNREFUSED"));
    const index = new KeyIndex("cache:user", 300, "test");
    const ok = await index.remember("u1", "session:a");
    expect(ok, equals(false));
  } finally {
    silenced.restore();
    redis.restore();
  }
});

Scribe.test("a store that cannot be reached fails members softly, answering nothing", async () => {
  const redis = installFakeRedis();
  const silenced = installMock(console, "error", () => {});
  try {
    redis.failNext("smembers", new Error("ECONNREFUSED"));
    const index = new KeyIndex("cache:user", 300, "test");
    const members = await index.members("u1");
    expect(members, equals([]));
  } finally {
    silenced.restore();
    redis.restore();
  }
});

Scribe.test("a store that cannot be reached fails forget softly, without throwing", async () => {
  const redis = installFakeRedis();
  const silenced = installMock(console, "error", () => {});
  try {
    redis.failNext("unlink", new Error("ECONNREFUSED"));
    const index = new KeyIndex("cache:user", 300, "test");
    await index.forget("u1");
    expect(
      true,
      isTrue,
      "forget must not throw when the store refuses the delete",
    );
  } finally {
    silenced.restore();
    redis.restore();
  }
});

Scribe.test("a failure is logged under the scope the index was built with", async () => {
  const redis = installFakeRedis();
  const messages: unknown[][] = [];
  const silenced = installMock(console, "error", (...args: unknown[]) => {
    messages.push(args);
  });
  try {
    redis.failNext("sadd", new Error("ECONNREFUSED"));
    const index = new KeyIndex("cache:user", 300, "identity-revocation");
    await index.remember("u1", "session:a");
    expect(messages.length, equals(1));
    expect(String(messages[0][0]).includes("identity-revocation"), isTrue);
  } finally {
    silenced.restore();
    redis.restore();
  }
});
