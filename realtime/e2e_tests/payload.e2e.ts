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

import { assertEquals, assertExists } from "@std/assert";
import { listenOn, requireStack, RUN_ID, tokenFor, useStack } from "./support/stack.ts";

await useStack();
await requireStack();

const { EventLogTransport, Realtime, RealtimeTransports, syncDeclaredChannels } = await import(
  "@scribe/realtime/mod.ts"
);

RealtimeTransports.use(new EventLogTransport());

interface Order {
  orderId: string;
  total: number;
  label: string;
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const order = Realtime.granted<Order>(`e2e_payload_${RUN_ID}`, { key: "orderId" });

await syncDeclaredChannels();

const ROW: Order = { orderId: "o-7", total: 42, label: "a whole payload" };

async function heard(action: () => Promise<boolean>): Promise<Record<string, unknown>[]> {
  const token = await tokenFor(OWNER);
  const listening = listenOn(order.to(OWNER).channel, { token, private: true });
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  await action();
  return (await listening).payloads;
}

Deno.test("every field of the declared type reaches the listener", async () => {
  const payloads = await heard(() => order.to(OWNER).update(ROW));

  assertEquals(payloads.length, 1, "one emission arrives once");
  assertEquals(payloads[0].orderId, "o-7", "the identifier travels");
  assertEquals(payloads[0].total, 42, "so does a number the type declares");
  assertEquals(payloads[0].label, "a whole payload", "and so does a string");
});

Deno.test("the action and the moment travel beside the payload", async () => {
  const payloads = await heard(() => order.to(OWNER).emit("shipped", ROW));

  assertEquals(payloads[0].action, "shipped", "a client dispatches on the action it was sent");
  assertExists(payloads[0].at, "the moment is carried so a client can order what it receives");
});

Deno.test("a delete carries the values the row had before it went", async () => {
  const payloads = await heard(() => order.to(OWNER).delete(ROW));

  assertEquals(payloads[0].action, "delete", "the action says the row is gone");
  assertEquals(payloads[0].label, "a whole payload", "and the payload still describes it");
});
