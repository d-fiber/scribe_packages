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

import { assertEquals } from "@std/assert";
import { Realtime } from "@scribe/realtime/lib/realtime.ts";
import { installDatabaseFake } from "./mocks/database.ts";

interface Order {
  orderId: string;
  total: number;
}

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const order = Realtime.granted<Order>("grant_order", { key: "orderId" });

Deno.test("a grant makes the account a listener of that channel", async () => {
  const db = installDatabaseFake();

  assertEquals(await order.topic("seller").grant(ACCOUNT), true);
  assertEquals(await order.topic("seller").allows(ACCOUNT), true);
  db.restore();
});

Deno.test("granting twice leaves one grant behind", async () => {
  const db = installDatabaseFake();

  await order.topic("seller").grant(ACCOUNT);
  await order.topic("seller").grant(ACCOUNT);

  assertEquals(await order.topic("seller").grants(), [ACCOUNT]);
  db.restore();
});

Deno.test("an account nobody granted is not a listener", async () => {
  const db = installDatabaseFake();

  await order.topic("seller").grant(ACCOUNT);

  assertEquals(await order.topic("seller").allows(OTHER), false);
  db.restore();
});

Deno.test("a grant opens one channel and not its neighbours", async () => {
  const db = installDatabaseFake();

  await order.topic("seller").grant(ACCOUNT);

  assertEquals(await order.topic("buyer").allows(ACCOUNT), false);
  assertEquals(await order.all.allows(ACCOUNT), false);
  db.restore();
});

Deno.test("revoking takes the listener back off", async () => {
  const db = installDatabaseFake();

  await order.topic("seller").grant(ACCOUNT);

  assertEquals(await order.topic("seller").revoke(ACCOUNT), true);
  assertEquals(await order.topic("seller").allows(ACCOUNT), false);
  db.restore();
});

Deno.test("revoking an account that was never granted changes nothing", async () => {
  const db = installDatabaseFake();

  assertEquals(await order.topic("seller").revoke(ACCOUNT), false);
  db.restore();
});

Deno.test("revoking everyone empties the channel and leaves the others alone", async () => {
  const db = installDatabaseFake();

  await order.topic("seller").grant(ACCOUNT);
  await order.topic("seller").grant(OTHER);
  await order.topic("buyer").grant(ACCOUNT);

  await order.topic("seller").revokeAll();

  assertEquals(await order.topic("seller").grants(), []);
  assertEquals(await order.topic("buyer").grants(), [ACCOUNT]);
  db.restore();
});

Deno.test("the listing answers the accounts that were granted", async () => {
  const db = installDatabaseFake();

  await order.topic("seller").grant(ACCOUNT);
  await order.topic("seller").grant(OTHER);

  assertEquals((await order.topic("seller").grants()).sort(), [ACCOUNT, OTHER].sort());
  db.restore();
});

Deno.test("the broadcast channel of a closed declaration takes grants too", async () => {
  const db = installDatabaseFake();

  await order.all.grant(ACCOUNT);

  assertEquals(await order.all.allows(ACCOUNT), true);
  assertEquals(await order.topic("seller").allows(ACCOUNT), false);
  db.restore();
});
