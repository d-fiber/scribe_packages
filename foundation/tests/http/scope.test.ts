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

import { del, get, head, patch, post, put, read, readBytes } from "@scribe/foundation/lib/src/http/mod.ts";
import { ClientException } from "@scribe/foundation/lib/src/http/exception.ts";
import { FetchClient } from "@scribe/foundation/lib/src/http/fetch_client.ts";
import { currentClient, runWithClient } from "@scribe/foundation/lib/src/http/run_with_client.ts";
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
