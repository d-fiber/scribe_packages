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
import { report, requireStack, RUN_ID, STACK, timed, useStack } from "./support/stack.ts";
import { assert, assertEquals } from "@std/assert";

await requireStack(`${STACK.natsMonitorUrl}/healthz`);
await useStack();

const { Queue, queueRunner } = await import("@scribe/foundation/src/queue/mod.ts");

/**
 * Every queue here asks for isolation, and it is not decoration.
 *
 * A queue that does not ask shares one consumer with every other shared queue, so a pass aimed
 * at one of them takes whatever was waiting across all of them, and two tests in the same
 * process eat each other's jobs.
 */
const ISOLATED = { dedicated: true } as const;

/**
 * The process keeps one NATS connection on purpose, so the sanitizers have to be told.
 *
 * Deno reads a socket that outlives a test as a leak. Here it is the design: `nats.ts` opens one
 * connection on first use and every queue shares it, exactly as a running host does.
 */
const KEEPS_A_CONNECTION = { sanitizeOps: false, sanitizeResources: false } as const;

/**
 * Drains until `expected` jobs have moved, or until a pass comes back empty.
 *
 * A pass that finds nothing costs the full five second pull window, so this stops as soon as
 * the count is reached rather than confirming with one more empty pass.
 */
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
    // `--auth` in compose.yaml refuses an unauthenticated connection, and without JetStream the
    // stream this queue needs cannot be created. A push that answers an id proves both, and it
    // is also what catches credentials the client drops on the floor.
    const queue = new Queue<{ id: string }>({ name: `e2e-auth-${RUN_ID}`, ...ISOLATED }, () => Promise.resolve());

    const id = await queue.push({ id: "first" });

    assert(typeof id === "string" && id.length > 0, "a push answers the id JetStream gave it");
    assertEquals(await drain(`e2e-auth-${RUN_ID}`, 1), 1);
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
    // This is JetStream's pull contract, not a fault: a fetch holds the request open until a
    // message lands or the window closes. It is the number that decides how a runner is paced,
    // because a loop that drains speculatively pays it every turn.
    new Queue<{ id: string }>({ name: `e2e-empty-${RUN_ID}`, ...ISOLATED }, () => Promise.resolve());

    const [result, ms] = await timed(() => queueRunner.runOne(`e2e-empty-${RUN_ID}`, 10));

    report("a pull against an empty queue", `${(ms / 1000).toFixed(1)} s`);
    assertEquals(result?.done, 0);
    assert(ms > 4_000, "the window is five seconds, so an empty pull cannot come back sooner");
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
