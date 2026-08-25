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

import { Duration } from "@scribe/alchemy";
import { ConfigError } from "../../lib/contracts/config.ts";
import { RemoteConfig } from "../../lib/src/core/declaration.ts";
import { installRemoteConfigsMock } from "../testing/mock.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

interface Example {
  readonly firstname: string;
  readonly lastname: string;
}

const BLANK: Example = { firstname: "", lastname: "" };
const ADA: Example = { firstname: "Ada", lastname: "Lovelace" };

const key1 = RemoteConfig.of<Example>("declaration-key1", { default: BLANK, ttl: Duration.hours(2) });
const key2 = RemoteConfig.of<string>("declaration-key2", { ttl: Duration.hours(2) });
const key3 = RemoteConfig.of<Example>("declaration-key3");
const forever = RemoteConfig.of<number>("declaration-forever");

Deno.test("a config nothing was written to answers its declared value, or null", async () => {
  const database = installRemoteConfigsMock();

  try {
    assertEquals(await key1.get(), BLANK);
    assertEquals(await key2.get(), null);
    assertEquals(await key3.get(), null);
    assertEquals(database.values().length, 0, "reading must write nothing");
  } finally {
    database.restore();
  }
});

Deno.test("set writes the value, and reading it back answers it", async () => {
  const database = installRemoteConfigsMock();

  try {
    const written = await key1.set(ADA);

    assert(written.ok, "writing must succeed against a table that accepts the insert");
    assertEquals(await key1.get(), ADA);
    assertEquals(database.values().length, 1);
    assertEquals(database.values()[0].name, "declaration-key1");
  } finally {
    database.restore();
  }
});

Deno.test("set called twice updates the row instead of writing a second one", async () => {
  const database = installRemoteConfigsMock();

  try {
    await key1.set(ADA);
    await key1.set({ firstname: "Grace", lastname: "Hopper" });

    assertEquals(database.values().length, 1, "a second write on the same name must be an update");
    assertEquals(await key1.get(), { firstname: "Grace", lastname: "Hopper" });
  } finally {
    database.restore();
  }
});

Deno.test("delete takes the value away, and the declared value comes back", async () => {
  const database = installRemoteConfigsMock();

  try {
    await key1.set(ADA);
    const removed = await key1.delete();

    assert(removed.ok);
    assertEquals(await key1.get(), BLANK);
    assertEquals(await key3.get(), null, "a config with no declared value answers null once emptied");
    assertEquals(database.values().length, 0);
  } finally {
    database.restore();
  }
});

Deno.test("deleting a config that holds nothing is not a failure", async () => {
  const database = installRemoteConfigsMock();

  try {
    const removed = await key2.delete();

    assert(removed.ok, "there is no name to get wrong, so there is nothing to report");
  } finally {
    database.restore();
  }
});

Deno.test("a value written past its ttl answers as an empty table does", async () => {
  const database = installRemoteConfigsMock({
    __remote_configs__: [{
      name: "declaration-key1",
      value: ADA,
      created_at: 1,
      updated_at: 1,
      expires_at: Date.now() - 1,
    }],
  });

  try {
    assertEquals(await key1.get(), BLANK);
  } finally {
    database.restore();
  }
});

Deno.test("a declaration ttl decides how long a written value lives", async () => {
  const database = installRemoteConfigsMock();

  try {
    const before = Date.now();
    await key1.set(ADA);

    const written = database.values()[0].expires_at as number;
    assert(written >= before + Duration.hours(2).inMilliseconds, `the declared ttl must be carried: ${written}`);
  } finally {
    database.restore();
  }
});

Deno.test("a config declared with no ttl holds its value forever", async () => {
  const database = installRemoteConfigsMock();

  try {
    await forever.set(25);

    assertEquals(database.values()[0].expires_at, null);
  } finally {
    database.restore();
  }
});

Deno.test("set names its own ttl over the declaration's, and null outlives it", async () => {
  const database = installRemoteConfigsMock();

  try {
    await key1.set(ADA, { ttl: Duration.minutes(5) });
    const short = database.values()[0].expires_at as number;
    assert(short < Date.now() + Duration.hours(1).inMilliseconds, `the caller's ttl must win: ${short}`);

    await key1.set(ADA, { ttl: null });
    assertEquals(database.values()[0].expires_at, null);
  } finally {
    database.restore();
  }
});

Deno.test("ttl moves when a value is dropped without touching the value", async () => {
  const database = installRemoteConfigsMock();

  try {
    await key1.set(ADA, { ttl: Duration.minutes(5) });
    const before = database.values()[0].expires_at as number;

    const retimed = await key1.ttl(Duration.hours(5));

    assert(retimed.ok);
    const after = database.values()[0].expires_at as number;
    assert(after > before, `retiming must push the expiry out: ${before} then ${after}`);
    assertEquals(await key1.get(), ADA, "the value must be left alone");
  } finally {
    database.restore();
  }
});

Deno.test("ttl null makes a value that was expiring stop expiring", async () => {
  const database = installRemoteConfigsMock();

  try {
    await key1.set(ADA, { ttl: Duration.minutes(5) });
    await key1.ttl(null);

    assertEquals(database.values()[0].expires_at, null);
  } finally {
    database.restore();
  }
});

Deno.test("retiming a config that holds nothing answers not found", async () => {
  const database = installRemoteConfigsMock();

  try {
    const retimed = await key2.ttl(Duration.hours(5));

    assert(!retimed.ok);
    assertEquals(retimed.error, ConfigError.NotFound);
  } finally {
    database.restore();
  }
});

Deno.test("two declarations taking the same name refuse to load", () => {
  RemoteConfig.of<string>("declaration-twice");

  assertThrows(
    () => RemoteConfig.of<number>("declaration-twice"),
    TypeError,
    "declaration-twice",
  );
});
