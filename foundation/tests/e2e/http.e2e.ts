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

import { ClientException } from "@scribe/foundation/lib/src/http/exception.ts";
import { FetchClient } from "@scribe/foundation/lib/src/http/fetch_client.ts";
import { get, readBytes, runWithClient } from "@scribe/foundation/lib/src/http/mod.ts";
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
