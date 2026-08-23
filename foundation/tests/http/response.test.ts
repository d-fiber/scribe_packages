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

import { ByteStream } from "@scribe/alchemy/http";
import { ClientException } from "@scribe/alchemy/http";
import { HttpRequest } from "@scribe/alchemy/http";
import { HttpResponse } from "@scribe/alchemy/http";
import { StreamedResponse } from "@scribe/alchemy/http";
import { assertEquals, assertThrows } from "@std/assert";

function typed(value: string): Headers {
  return new Headers({ "content-type": value });
}

Deno.test("a response built from text announces its length in bytes", () => {
  const response = new HttpResponse("héllo", 200);

  assertEquals(response.contentLength, 6);
  assertEquals(response.body, "héllo");
});

Deno.test("the charset of content-type decides how the body reads", () => {
  const latin = new HttpResponse(new Uint8Array([0xe9]), 200, {
    headers: typed("text/plain; charset=latin1"),
  });
  const utf8 = new HttpResponse(new Uint8Array([0xc3, 0xa9]), 200, {
    headers: typed("text/plain"),
  });

  assertEquals(latin.body, "é");
  assertEquals(utf8.body, "é");
});

Deno.test(
  "a charset the platform does not know falls back to utf-8 instead of throwing",
  () => {
    const response = new HttpResponse(new Uint8Array([0xc3, 0xa9]), 200, {
      headers: typed("text/plain; charset=not-a-charset"),
    });

    assertEquals(response.body, "é");
    assertEquals(response.bodyBytes, new Uint8Array([0xc3, 0xa9]));
  },
);

Deno.test("ok is the 2xx window, and nothing else", () => {
  const statuses: Array<[number, boolean]> = [
    [199, false],
    [200, true],
    [204, true],
    [299, true],
    [300, false],
    [404, false],
    [500, false],
  ];

  for (const [status, expected] of statuses) {
    assertEquals(new HttpResponse("", status).ok, expected, `status ${status}`);
  }
});

Deno.test("a status below 100 is refused", () => {
  assertThrows(
    () => new HttpResponse("", 99),
    Error,
    "A status code is three digits from 100 to 599, and 99 is not one.",
  );
  assertEquals(new HttpResponse("", 100).statusCode, 100);
});

Deno.test("a response says nothing it was not told", () => {
  const response = new HttpResponse("", 200);

  assertEquals(response.request, null);
  assertEquals(response.reasonPhrase, null);
  assertEquals(response.isRedirect, false);
  assertEquals(response.persistentConnection, true);
  assertEquals([...response.headers], []);
});

Deno.test(
  "fromStream drains the body and keeps everything the headers said",
  async () => {
    const request = new HttpRequest("GET", "https://example.test/a");
    const streamed = new StreamedResponse(
      ByteStream.fromBytes(new TextEncoder().encode("hello")),
      301,
      {
        request,
        headers: typed("text/plain"),
        reasonPhrase: "Moved Permanently",
        isRedirect: true,
        persistentConnection: false,
      },
    );

    const whole = await HttpResponse.fromStream(streamed);

    assertEquals(whole.body, "hello");
    assertEquals(whole.statusCode, 301);
    assertEquals(whole.request, request);
    assertEquals(whole.reasonPhrase, "Moved Permanently");
    assertEquals(whole.isRedirect, true);
    assertEquals(whole.persistentConnection, false);
    assertEquals(whole.headers.get("content-type"), "text/plain");
  },
);

Deno.test("json reads the body a server announced as JSON", () => {
  const response = new HttpResponse('{"name":"ada","tags":[1,2]}', 200, {
    headers: typed("application/json"),
  });

  assertEquals(response.json<{ name: string; tags: number[] }>(), {
    name: "ada",
    tags: [1, 2],
  });
});

Deno.test("json reads a body the caller is free to have refused first", () => {
  const response = new HttpResponse('{"code":"not_found"}', 404, {
    headers: typed("application/json"),
  });

  assertEquals(response.statusCode, 404);
  assertEquals(
    response.json<{ code: string }>(),
    { code: "not_found" },
    "a refused answer still hands over its JSON error payload, which is what the " +
      "client-level readJson cannot do",
  );
});

Deno.test("a body that is not JSON is an exception, not a value", () => {
  const request = new HttpRequest("GET", "https://example.test/a");
  const response = new HttpResponse("<html>gateway timeout</html>", 504, {
    request,
  });

  const raised = assertThrows(
    () => response.json(),
    ClientException,
    "Answer from https://example.test/a is not JSON.",
  ) as ClientException;

  assertEquals(raised.uri?.href, "https://example.test/a");
});

Deno.test(
  "a drained response announces what arrived, not what the server claimed",
  async () => {
    const streamed = new StreamedResponse(
      ByteStream.fromBytes(new TextEncoder().encode("hi")),
      200,
      { contentLength: 900 },
    );

    assertEquals((await HttpResponse.fromStream(streamed)).contentLength, 2);
  },
);
