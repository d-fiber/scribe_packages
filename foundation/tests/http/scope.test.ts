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

import { del, get, head, patch, post, put, read, readBytes } from "@scribe/foundation/src/http/mod.ts";
import { ClientException } from "@scribe/foundation/src/http/exception.ts";
import { FetchClient } from "@scribe/foundation/src/http/fetch_client.ts";
import { currentClient, runWithClient } from "@scribe/foundation/src/http/run_with_client.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { RecordingClient } from "./mocks/recording_client.ts";

const URL_UNDER_TEST = "https://example.test/a";

Deno.test("outside a scope the client is a real one", () => {
  const client = currentClient();

  assert(client instanceof FetchClient);
  client.close();
});

Deno.test("inside a scope the client is the one the scope made", () => {
  const client = new RecordingClient();

  assertEquals(runWithClient(() => currentClient(), () => client), client);
});

Deno.test("the substitution follows the asynchronous call tree", async () => {
  const client = new RecordingClient();

  const [inside, outside] = await runWithClient(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const seen = currentClient();
    return [seen, null];
  }, () => client);

  assertEquals(inside, client);
  assertEquals(outside, null);
  assert(currentClient() instanceof FetchClient, "the scope does not outlive its body");
});

Deno.test("each top-level verb sends its own, through the client in scope", async () => {
  const client = new RecordingClient();

  await runWithClient(async () => {
    await head(URL_UNDER_TEST);
    await get(URL_UNDER_TEST);
    await post(URL_UNDER_TEST, { body: "x" });
    await put(URL_UNDER_TEST);
    await patch(URL_UNDER_TEST);
    await del(URL_UNDER_TEST);
  }, () => client);

  assertEquals(client.seen.map((request) => request.method), [
    "HEAD",
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);
});

Deno.test("a one-off call closes the client it opened", async () => {
  const client = new RecordingClient();

  await runWithClient(async () => {
    await get(URL_UNDER_TEST);
    await get(URL_UNDER_TEST);
  }, () => client);

  assertEquals(client.closed, 2, "one close per call is what makes these calls one-off");
});

Deno.test("read and readBytes answer through the client in scope, and close it", async () => {
  const client = new RecordingClient({ body: "hello" });

  const [text, bytes] = await runWithClient(
    async () => [await read(URL_UNDER_TEST), await readBytes(URL_UNDER_TEST)] as const,
    () => client,
  );

  assertEquals(text, "hello");
  assertEquals(bytes, new TextEncoder().encode("hello"));
  assertEquals(client.closed, 2);
});

Deno.test("a one-off call closes its client even when the call fails", async () => {
  const client = new RecordingClient({ status: 500 });

  await runWithClient(
    () => assertRejects(() => read(URL_UNDER_TEST), ClientException),
    () => client,
  );

  assertEquals(client.closed, 1);
});

Deno.test("the factory is called once per scope, not once per call", async () => {
  let made = 0;

  await runWithClient(async () => {
    await get(URL_UNDER_TEST);
    await get(URL_UNDER_TEST);
  }, () => {
    made++;
    return new RecordingClient();
  });

  assertEquals(made, 1);
});
