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

import { assertEquals, assertExists } from "@std/assert";
import { listenOn, requireStack, RUN_ID, tokenFor, useStack } from "./support/stack.ts";

await useStack();
await requireStack();

const { EventLogTransport, Realtime, RealtimeTransports, syncDeclaredChannels } = await import(
  "@scribe/realtime"
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
