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

import { assertEquals, assertGreater } from "@std/assert";
import { listenOn, report, requireStack, RUN_ID, sampleUsage, timed, tokenFor, useStack } from "./support/stack.ts";

await useStack();
await requireStack();

const { EventLogTransport, Realtime, RealtimeTransports, syncDeclaredChannels } = await import(
  "@scribe/realtime/mod.ts"
);

RealtimeTransports.use(new EventLogTransport());

interface Item {
  id: string;
  label: string;
}

const OWNER = "11111111-1111-1111-1111-111111111111";

const burst = Realtime.granted<Item>(`e2e_load_${RUN_ID}`, { key: "id" });
const fanout = Realtime.public<Item>(`e2e_fanout_${RUN_ID}`, { key: "id" });

await syncDeclaredChannels();

const EMISSIONS = 300;
const LISTENERS = 40;

function row(index: number): Item {
  return { id: `i-${index}`, label: "x".repeat(200) };
}

function printUsage(title: string, usage: Awaited<ReturnType<typeof sampleUsage>>): void {
  for (const one of usage) {
    report(`${title}, ${one.name}`, `${one.cpu.toFixed(1)}% cpu, ${one.memory.toFixed(0)} MiB`);
  }
}

Deno.test("a burst of emissions is written and delivered whole", async () => {
  const token = await tokenFor(OWNER);
  const idle = await sampleUsage();
  printUsage("idle", idle);

  const listening = listenOn(burst.to(OWNER).channel, { token, private: true, window: 25_000 });
  await new Promise((resolve) => setTimeout(resolve, 2_500));

  const [, sequential] = await timed(async () => {
    for (let index = 0; index < 20; index++) await burst.to(OWNER).update(row(index));
  });
  report("one emission, written and broadcast", `${(sequential / 20).toFixed(1)} ms`);

  const [, parallel] = await timed(async () => {
    const pending: Promise<boolean>[] = [];
    for (let index = 20; index < EMISSIONS; index++) pending.push(burst.to(OWNER).update(row(index)));
    await Promise.all(pending);
  });

  const emitted = EMISSIONS - 20;
  report(
    `${emitted} emissions at once`,
    `${parallel.toFixed(0)} ms, ${(emitted / (parallel / 1000)).toFixed(0)} per second`,
  );

  const busy = await sampleUsage();
  printUsage("under load", busy);

  const heard = await listening;
  assertEquals(heard.status, "ok", "the listener stayed subscribed for the whole burst");
  assertGreater(heard.payloads.length, EMISSIONS * 0.9, "nine emissions out of ten reach the listener");
  report("delivered", `${heard.payloads.length} of ${EMISSIONS}`);
});

Deno.test("one emission reaches many listeners at once", async () => {
  const listeners = Array.from(
    { length: LISTENERS },
    () => listenOn(fanout.all.channel, { private: false, window: 15_000 }),
  );
  await new Promise((resolve) => setTimeout(resolve, 4_000));

  const joined = await sampleUsage();
  printUsage(`${LISTENERS} listeners joined`, joined);

  for (let index = 0; index < 20; index++) await fanout.all.update(row(index));

  const heard = await Promise.all(listeners);
  const missing = heard.filter((one) => one.payloads.length < 20).length;

  report(`${LISTENERS} listeners`, `${missing} received fewer than the 20 sent`);
  assertEquals(heard.every((one) => one.status === "ok"), true, "every listener joined");
  assertEquals(missing, 0, "every listener received every emission");

  const after = await sampleUsage();
  printUsage("after fan out", after);
});
