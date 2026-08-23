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
    await motd.set("loud", { ttl: Duration.minutes(5) });
    assertEquals(await motd.get(), "loud");

    await motd.ttl(null);
    assertEquals(await motd.get(), "loud", "the value must survive the retiming");
  } finally {
    database.restore();
  }
});
