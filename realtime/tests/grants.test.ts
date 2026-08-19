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

import { assertEquals } from "@std/assert";
import { Realtime } from "@scribe/realtime/mod.ts";
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
