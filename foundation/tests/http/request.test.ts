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

import { HttpRequest } from "@scribe/alchemy/http";
import { assertEquals, assertThrows } from "@std/assert";
import { MemoryClient } from "@scribe/alchemy/test";

Deno.test("a request upper-cases its method and keeps the whole url", () => {
  const request = new HttpRequest("post", "https://example.test/a?b=1#c");

  assertEquals(request.method, "POST");
  assertEquals(request.url.href, "https://example.test/a?b=1#c");
  assertEquals(request.toString(), "POST https://example.test/a?b=1#c");
});

Deno.test(
  "the three views of the body are three views of the same bytes",
  () => {
    const request = new HttpRequest("POST", "https://example.test/");

    request.bodyFields = { name: "ada", city: "lovelace lane" };

    assertEquals(request.body, "name=ada&city=lovelace+lane");
    assertEquals(request.bodyFields, { name: "ada", city: "lovelace lane" });
    assertEquals(
      new TextDecoder().decode(request.bodyBytes),
      "name=ada&city=lovelace+lane",
    );
  },
);

Deno.test("setting one view replaces the other two", () => {
  const request = new HttpRequest("POST", "https://example.test/");

  request.bodyFields = { name: "ada" };
  request.bodyBytes = new Uint8Array([104, 105]);

  assertEquals(request.body, "hi");
  assertEquals(request.contentLength, 2);
});

Deno.test(
  "text gives itself a content-type, and leaves one already set alone",
  () => {
    const plain = new HttpRequest("POST", "https://example.test/");
    plain.body = "hello";

    const json = new HttpRequest("POST", "https://example.test/");
    json.headers.set("content-type", "application/json");
    json.body = "{}";

    assertEquals(
      plain.headers.get("content-type"),
      "text/plain; charset=utf-8",
    );
    assertEquals(json.headers.get("content-type"), "application/json");
  },
);

Deno.test("the content-type carries the encoding the request was given", () => {
  const request = new HttpRequest("POST", "https://example.test/");

  request.encoding = "latin1";
  request.body = "x";

  assertEquals(
    request.headers.get("content-type"),
    "text/plain; charset=latin1",
  );
});

Deno.test("reading form fields off a body that is not a form throws", () => {
  const request = new HttpRequest("POST", "https://example.test/");
  request.body = "name=ada";

  assertThrows(
    () => request.bodyFields,
    Error,
    'The body fields of a request can only be read when its content-type is "application/x-www-form-urlencoded".',
  );
});

Deno.test("the content length counts bytes, not characters", () => {
  const request = new HttpRequest("POST", "https://example.test/");

  request.body = "héllo";

  assertEquals(request.contentLength, 6);
});

Deno.test(
  "finalize hands the body over, and refuses to do it twice",
  async () => {
    const request = new HttpRequest("POST", "https://example.test/");
    request.body = "hello";

    assertEquals(request.finalized, false);
    assertEquals(await request.finalize().bytesToString(), "hello");
    assertEquals(request.finalized, true);
    assertThrows(
      () => request.finalize(),
      Error,
      "This request has already been sent, and a sent request cannot be changed.",
    );
  },
);

Deno.test("a finalized request refuses every write", () => {
  const request = new HttpRequest("POST", "https://example.test/");
  request.finalize();

  for (
    const write of [
      () => (request.body = "x"),
      () => (request.bodyBytes = new Uint8Array(1)),
      () => (request.bodyFields = { a: "1" }),
      () => (request.encoding = "latin1"),
      () => (request.followRedirects = false),
      () => (request.maxRedirects = 1),
      () => (request.persistentConnection = false),
      () => (request.timeoutMs = 1_000),
    ]
  ) {
    assertThrows(
      write,
      Error,
      "This request has already been sent, and a sent request cannot be changed.",
    );
  }
});

Deno.test(
  "a request follows redirects five deep on a kept connection unless told otherwise",
  () => {
    const request = new HttpRequest("GET", "https://example.test/");

    assertEquals(request.followRedirects, true);
    assertEquals(request.maxRedirects, 5);
    assertEquals(request.persistentConnection, true);
    assertEquals(
      request.timeoutMs,
      null,
      "no limit is the default, as it is for fetch itself",
    );

    request.followRedirects = false;
    request.maxRedirects = 0;
    request.persistentConnection = false;

    assertEquals(request.followRedirects, false);
    assertEquals(request.maxRedirects, 0);
    assertEquals(request.persistentConnection, false);
  },
);

Deno.test("send goes through the client it is handed", async () => {
  const client = new MemoryClient({ status: 201 });
  const request = new HttpRequest("PUT", "https://example.test/a");

  const response = await request.send(client);

  assertEquals(response.statusCode, 201);
  assertEquals(client.only, request);
});
