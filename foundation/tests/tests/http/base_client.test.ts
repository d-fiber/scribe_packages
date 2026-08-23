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

import { Duration } from "@scribe/alchemy";
import { ClientException, DEFAULT_REQUEST_TIMEOUT } from "@scribe/alchemy/http";
import type { HttpRequest } from "@scribe/alchemy/http";
import { assertEquals, assertRejects } from "@std/assert";
import { MemoryClient } from "@scribe/alchemy/test";

const URL_UNDER_TEST = "https://example.test/a";

async function sent(
  options: Parameters<MemoryClient["post"]>[1],
): Promise<HttpRequest> {
  const client = new MemoryClient();
  await client.post(URL_UNDER_TEST, options);

  return client.only as HttpRequest;
}

Deno.test("each convenience method sends its own verb", async () => {
  const client = new MemoryClient();

  await client.head(URL_UNDER_TEST);
  await client.get(URL_UNDER_TEST);
  await client.post(URL_UNDER_TEST);
  await client.put(URL_UNDER_TEST);
  await client.patch(URL_UNDER_TEST);
  await client.delete(URL_UNDER_TEST);

  assertEquals(client.seen.map((request) => request.method), [
    "HEAD",
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);
});

Deno.test("no body at all is an empty body", async () => {
  const request = await sent(undefined);

  assertEquals(request.contentLength, 0);
  assertEquals(request.headers.get("content-type"), null);
});

Deno.test("a record body goes as a url-encoded form", async () => {
  const request = await sent({ body: { name: "ada", city: "lovelace lane" } });

  assertEquals(request.body, "name=ada&city=lovelace+lane");
  assertEquals(
    request.headers.get("content-type"),
    "application/x-www-form-urlencoded; charset=utf-8",
  );
});

Deno.test("text goes as text", async () => {
  const request = await sent({ body: "hello" });

  assertEquals(request.body, "hello");
  assertEquals(
    request.headers.get("content-type"),
    "text/plain; charset=utf-8",
  );
});

Deno.test("bytes go as they are, and claim no type", async () => {
  const request = await sent({ body: new Uint8Array([1, 2, 3]) });

  assertEquals(request.bodyBytes, new Uint8Array([1, 2, 3]));
  assertEquals(request.headers.get("content-type"), null);
});

Deno.test("the encoding of the call reaches the content-type of the body", async () => {
  const request = await sent({ body: "x", encoding: "latin1" });

  assertEquals(request.encoding, "latin1");
  assertEquals(
    request.headers.get("content-type"),
    "text/plain; charset=latin1",
  );
});

Deno.test("the timeout of the call reaches the request", async () => {
  assertEquals(
    (await sent({ timeout: Duration.milliseconds(2_500) })).timeoutMs,
    2_500,
  );
  assertEquals(
    (await sent({})).timeoutMs,
    DEFAULT_REQUEST_TIMEOUT.inMilliseconds,
  );
});

Deno.test("the headers of the call reach the request", async () => {
  const request = await sent({ headers: { "x-key": "value" }, body: "x" });

  assertEquals(request.headers.get("x-key"), "value");
});

Deno.test("a header given by the caller wins over the one a body would set", async () => {
  const request = await sent({
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  assertEquals(request.headers.get("content-type"), "application/json");
});

Deno.test("read and readBytes answer the body of a 2xx", async () => {
  const client = new MemoryClient({ status: 204, body: "hello" });

  assertEquals(await client.read(URL_UNDER_TEST), "hello");
  assertEquals(
    await client.readBytes(URL_UNDER_TEST),
    new TextEncoder().encode("hello"),
  );
});

Deno.test("read refuses any status but a 2xx", async () => {
  const client = new MemoryClient({
    status: 404,
    body: "<html>not found</html>",
  });

  const raised = await assertRejects(
    () => client.read(URL_UNDER_TEST),
    ClientException,
    "The call to https://example.test/a failed with status 404.",
  );

  assertEquals(raised.uri?.href, URL_UNDER_TEST);
  assertEquals(
    String(raised),
    "ClientException: The call to https://example.test/a failed with status 404., uri=https://example.test/a",
  );
});

Deno.test("readBytes refuses any status but a 2xx", async () => {
  const client = new MemoryClient({ status: 500 });

  await assertRejects(() => client.readBytes(URL_UNDER_TEST), ClientException);
});

Deno.test("a status the caller asked for is a response, not an exception", async () => {
  const client = new MemoryClient({ status: 404, body: "gone" });

  const response = await client.get(URL_UNDER_TEST);

  assertEquals(response.statusCode, 404);
  assertEquals(response.body, "gone");
  assertEquals(response.request?.url.href, URL_UNDER_TEST);
});

Deno.test("an exception with no url reads without one", () => {
  const raised = new ClientException("nothing answered");

  assertEquals(raised.uri, null);
  assertEquals(raised.name, "ClientException");
  assertEquals(String(raised), "ClientException: nothing answered");
});

Deno.test("a url given as a URL is sent as it is", async () => {
  const client = new MemoryClient();

  await client.get(new URL(URL_UNDER_TEST));

  assertEquals(client.only.url.href, URL_UNDER_TEST);
});
