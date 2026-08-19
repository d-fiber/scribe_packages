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
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const STRANGER = "22222222-2222-2222-2222-222222222222";

const open = Realtime.authenticated<Order>(`e2e_open_${RUN_ID}`, { key: "orderId" });
const closed = Realtime.granted<Order>(`e2e_closed_${RUN_ID}`, { key: "orderId" });
const everyone = Realtime.public<Order>(`e2e_public_${RUN_ID}`, { key: "orderId" });

await syncDeclaredChannels();

const ROW: Order = { orderId: "o-1", total: 42 };

async function heardWhile(
  channel: string,
  options: { token?: string; private: boolean },
  emit: () => Promise<boolean>,
): Promise<{ status: string; count: number }> {
  const listening = listenOn(channel, options);
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  await emit();
  const heard = await listening;
  return { status: heard.status, count: heard.payloads.length };
}

Deno.test("a public channel reaches a caller with no session at all", async () => {
  const heard = await heardWhile(
    everyone.all.channel,
    { private: false },
    () => everyone.all.update(ROW),
  );

  assertEquals(heard.status, "ok", "the join of a public channel consults no policy");
  assertEquals(heard.count, 1, "what a public channel sends reaches a caller without a session");
});

Deno.test("an open channel reaches a session and refuses the absence of one", async () => {
  const token = await tokenFor(STRANGER);

  const withSession = await heardWhile(
    open.all.channel,
    { token, private: true },
    () => open.all.update(ROW),
  );
  assertEquals(withSession.status, "ok", "any session hears a channel declared authenticated");
  assertEquals(withSession.count, 1, "and receives what it sends");

  const without = await listenOn(open.all.channel, { private: true, window: 3_000 });
  assertEquals(without.status, "error", "no session means no join, whatever the channel carries");
});

Deno.test("an account channel reaches that account and nobody else", async () => {
  const owner = await tokenFor(OWNER);
  const stranger = await tokenFor(STRANGER);
  const channel = closed.to(OWNER).channel;

  const heard = await heardWhile(
    channel,
    { token: owner, private: true },
    () => closed.to(OWNER).update(ROW),
  );
  assertEquals(heard.status, "ok", "the account named in the channel joins with no grant to write");
  assertEquals(heard.count, 1, "and receives what is addressed to it");

  const other = await listenOn(channel, { token: stranger, private: true, window: 3_000 });
  assertEquals(other.status, "error", "another account is refused by the subject comparison");
});

Deno.test("a topic channel reaches the accounts a grant names, and no others", async () => {
  const owner = await tokenFor(OWNER);
  const stranger = await tokenFor(STRANGER);

  await closed.topic("seller").grant(OWNER);

  const granted = await heardWhile(
    closed.topic("seller").channel,
    { token: owner, private: true },
    () => closed.topic("seller").update(ROW),
  );
  assertEquals(granted.status, "ok", "a granted account joins the topic");
  assertEquals(granted.count, 1, "and receives what the topic carries");

  const ungranted = await listenOn(closed.topic("seller").channel, {
    token: stranger,
    private: true,
    window: 3_000,
  });
  assertEquals(ungranted.status, "error", "an account nobody granted is refused at the join");
});

Deno.test("a closed broadcast refuses a session that holds no grant", async () => {
  const token = await tokenFor(STRANGER);

  const heard = await listenOn(closed.all.channel, { token, private: true, window: 3_000 });

  assertEquals(heard.status, "error", "a session is not a grant");
});

Deno.test("revoking closes the channel the account was hearing", async () => {
  const token = await tokenFor(STRANGER);

  await closed.topic("buyer").grant(STRANGER);
  const before = await listenOn(closed.topic("buyer").channel, {
    token,
    private: true,
    window: 3_000,
  });
  assertEquals(before.status, "ok", "the grant let the account in");

  await closed.topic("buyer").revoke(STRANGER);
  const after = await listenOn(closed.topic("buyer").channel, {
    token,
    private: true,
    window: 3_000,
  });
  assertEquals(after.status, "error", "revoking shuts the same account out");
});
