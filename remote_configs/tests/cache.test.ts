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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { RemoteConfig } from "@scribe/remote_configs/src/core/declaration.ts";
import { forgetValue } from "@scribe/remote_configs/src/runtime/cache.ts";
import { installRemoteConfigsMock } from "@scribe/remote_configs/testing/mock.ts";
import { assertEquals } from "@std/assert";

const motd = RemoteConfig.of<string>("cache-motd", { default: "quiet" });

Deno.test("a config read once is answered from the cache until something drops it", async () => {
  const database = installRemoteConfigsMock();

  try {
    assertEquals(await motd.get(), "quiet");

    database.seed([{ name: "cache-motd", value: "loud", created_at: 1, updated_at: 1, expires_at: null }]);
    assertEquals(await motd.get(), "quiet", "a row written behind the package must not be seen at once");

    await forgetValue("cache-motd");
    assertEquals(await motd.get(), "loud");
  } finally {
    database.restore();
  }
});

Deno.test("writing a value that was already read is seen by the next read", async () => {
  const database = installRemoteConfigsMock();

  try {
    assertEquals(await motd.get(), "quiet");

    await motd.set("loud");
    assertEquals(await motd.get(), "loud", "writing must drop what the cache holds");
  } finally {
    database.restore();
  }
});

Deno.test("deleting a value that was already read is seen by the next read", async () => {
  const database = installRemoteConfigsMock();

  try {
    await motd.set("loud");
    assertEquals(await motd.get(), "loud");

    await motd.delete();
    assertEquals(await motd.get(), "quiet");
  } finally {
    database.restore();
  }
});

Deno.test("retiming a value that was already read is seen by the next read", async () => {
  const database = installRemoteConfigsMock();

  try {
    await motd.set("loud", { ttl: Time.minutes(5) });
    assertEquals(await motd.get(), "loud");

    await motd.ttl(null);
    assertEquals(await motd.get(), "loud", "the value must survive the retiming");
  } finally {
    database.restore();
  }
});
