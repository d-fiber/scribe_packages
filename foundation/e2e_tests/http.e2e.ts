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

import { ClientException } from "@scribe/foundation/src/http/exception.ts";
import { FetchClient } from "@scribe/foundation/src/http/fetch_client.ts";
import { get, readBytes, runWithClient } from "@scribe/foundation/src/http/mod.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { report, requireStack, STACK, timed, useStack } from "./support/stack.ts";

await requireStack(`${STACK.natsMonitorUrl}/healthz`);
await useStack();

const HEALTH = `${STACK.natsMonitorUrl}/healthz`;
const CLOSED = "http://localhost:51999/nothing";

Deno.test(
  "http: a live endpoint answers, and its body reads as JSON",
  async () => {
    const [answer, ms] = await timed(() => get(HEALTH, { timeout: 5_000 }));

    report("one GET against NATS monitoring", `${ms.toFixed(2)} ms`);
    assertEquals(answer.statusCode, 200);
    assert(answer.ok);
    assertEquals(answer.json<{ status: string }>().status, "ok");
  },
);

Deno.test(
  "http: a status the server chose is a response, not an exception",
  async () => {
    const answer = await get(`${STACK.natsMonitorUrl}/no-such-route`, {
      timeout: 5_000,
    });

    assertEquals(answer.ok, false);
    assert(
      answer.statusCode >= 400,
      "the server answered, so there is nothing to throw about",
    );
  },
);

Deno.test(
  "http: readBytes refuses a status outside the 2xx window",
  async () => {
    await assertRejects(
      () => readBytes(`${STACK.natsMonitorUrl}/no-such-route`, { timeout: 5_000 }),
      ClientException,
    );
  },
);

Deno.test(
  "http: a connection nothing accepts arrives as one exception",
  async () => {
    const raised = await assertRejects(
      () => get(CLOSED, { timeout: 2_000 }),
      ClientException,
    );

    assertEquals(raised.uri?.href, CLOSED);
    assert(
      raised.cause !== undefined,
      "the platform error is kept, so a reader can still see it",
    );
  },
);

Deno.test(
  "http: an exchange that runs out of time says so, and how long it waited",
  async () => {
    const raised = await assertRejects(
      () => get("http://10.255.255.1:8080/", { timeout: 700 }),
      ClientException,
      "Timed out after 700 ms.",
    );

    assertEquals(raised.uri?.hostname, "10.255.255.1");
  },
);

Deno.test(
  "http: a kept client and a one-off client both work, at different costs",
  async () => {
    const count = 100;

    const kept = new FetchClient();
    const [, keptMs] = await timed(async () => {
      for (let i = 0; i < count; i++) await kept.get(HEALTH);
    });
    kept.close();

    const [, oneOffMs] = await timed(async () => {
      for (let i = 0; i < count; i++) {
        await runWithClient(
          () => get(HEALTH),
          () => new FetchClient(),
        );
      }
    });

    report(
      `${count} calls on a kept client`,
      `${(keptMs / count).toFixed(3)} ms each, or ${Math.round((count / keptMs) * 1000)} a second`,
    );
    report(
      `${count} one-off calls`,
      `${(oneOffMs / count).toFixed(3)} ms each, or ${Math.round((count / oneOffMs) * 1000)} a second`,
    );
  },
);

Deno.test("http: a closed client refuses to send again", async () => {
  const client = new FetchClient();
  await client.get(HEALTH);
  client.close();

  await assertRejects(
    () => client.get(HEALTH),
    ClientException,
    "Client is already closed.",
  );
});
