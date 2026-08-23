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
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "@scribe/foundation/tests/e2e/support/stack.ts";
import { assert, assertEquals } from "@std/assert";

await requireStack(`${STACK.natsMonitorUrl}/healthz`);
await useStack();

const { Queue } = await import("@scribe/foundation/lib/src/queue/queue.ts");
const { queueRunner } = await import("@scribe/foundation/lib/src/queue/runner/queue_runner.ts");

const ISOLATED = { dedicated: true } as const;

const KEEPS_A_CONNECTION = { sanitizeOps: false, sanitizeResources: false } as const;

async function drain(name: string, expected: number): Promise<number> {
  let moved = 0;

  for (let pass = 0; pass < 10 && moved < expected; pass++) {
    const result = await queueRunner.runOne(name, 200);
    const step = (result?.done ?? 0) + (result?.retried ?? 0) + (result?.dead ?? 0);
    if (step === 0) break;
    moved += step;
  }
  return moved;
}

Deno.test({
  name: "queue: the connection is authenticated and JetStream is running",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const queue = new Queue<{ id: string }>({ name: `e2e-auth-${RUN_ID}`, ...ISOLATED }, () => Promise.resolve());

    const id = await queue.push({ id: "first" });

    assert(
      typeof id === "string" && id.length > 0,
      "a push answers the id JetStream gave it, which takes both the credentials compose.yaml "
        + "requires and a running JetStream to create the stream",
    );
    assertEquals(await drain(`e2e-auth-${RUN_ID}`, 1), 1, "and the message comes back out");
  },
});

Deno.test({
  name: "queue: what goes in is what the handler is called with",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const seen: Array<{ id: string; n: number }> = [];
    const queue = new Queue<{ id: string; n: number }>({ name: `e2e-payload-${RUN_ID}`, ...ISOLATED }, (data) => {
      seen.push(data);
      return Promise.resolve();
    });

    await queue.push({ id: "a", n: 1 });
    await queue.pushMany([{ id: "b", n: 2 }, { id: "c", n: 3 }]);
    await drain(`e2e-payload-${RUN_ID}`, 3);

    assertEquals(seen.length, 3);
    assertEquals(new Set(seen.map((job) => job.id)), new Set(["a", "b", "c"]));
    assertEquals(seen.find((job) => job.id === "b")?.n, 2, "the payload crosses the wire whole");
  },
});

Deno.test({
  name: "queue: a job the handler refuses is retried, never counted as done",
  ...KEEPS_A_CONNECTION,
  async fn() {
    let attempts = 0;
    const queue = new Queue<{ id: string }>({ name: `e2e-failure-${RUN_ID}`, ...ISOLATED }, () => {
      attempts++;
      return Promise.reject(new Error("the handler says no"));
    });

    await queue.push({ id: "doomed" });
    const result = await queueRunner.runOne(`e2e-failure-${RUN_ID}`, 10);

    assert(attempts > 0, "the handler was reached");
    assertEquals(result?.done, 0);
    assertEquals((result?.retried ?? 0) + (result?.dead ?? 0), 1, "a refused job is retried or buried, never dropped");
  },
});

Deno.test({
  name: "queue: a pull that finds nothing waits its whole window",
  ...KEEPS_A_CONNECTION,
  async fn() {
    new Queue<{ id: string }>({ name: `e2e-empty-${RUN_ID}`, ...ISOLATED }, () => Promise.resolve());

    const [result, ms] = await timed(() => queueRunner.runOne(`e2e-empty-${RUN_ID}`, 10));

    report("a pull against an empty queue", `${(ms / 1000).toFixed(1)} s`);
    assertEquals(result?.done, 0);
    assert(
      ms > 4_000,
      "the window is five seconds, so an empty pull cannot come back sooner: a fetch holds "
        + "the request open until a message lands, and a loop that drains speculatively pays "
        + "that wait every turn",
    );
  },
});

Deno.test({
  name: "queue: a queue nobody declared answers null rather than throwing",
  ...KEEPS_A_CONNECTION,
  async fn() {
    assertEquals(await queueRunner.runOne("e2e-never-declared", 1), null);
  },
});

Deno.test({
  name: "queue: a backlog is pushed and drained at a measured rate",
  ...KEEPS_A_CONNECTION,
  async fn() {
    const count = 200;
    let handled = 0;
    const queue = new Queue<{ n: number }>({ name: `e2e-throughput-${RUN_ID}`, ...ISOLATED }, () => {
      handled++;
      return Promise.resolve();
    });

    const [, pushMs] = await timed(() => queue.pushMany(Array.from({ length: count }, (_, n) => ({ n }))));
    report(
      `${count} pushes`,
      `${(pushMs / count).toFixed(3)} ms each, or ${Math.round(count / pushMs * 1000)} a second`,
    );

    const [drained, drainMs] = await timed(() => drain(`e2e-throughput-${RUN_ID}`, count));
    report(
      `${count} drained`,
      `${(drainMs / count).toFixed(3)} ms each, or ${Math.round(count / drainMs * 1000)} a second`,
    );

    assertEquals(drained, count);
    assertEquals(handled, count);
  },
});
