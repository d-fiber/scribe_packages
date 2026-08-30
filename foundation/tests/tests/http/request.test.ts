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
import "@scribe/runtime/scholium/runner.ts";
import { allOf, equals, expect, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { HttpRequest } from "@scribe/alchemy/http";
import { MemoryClient } from "@scribe/alchemy/test";

Scribe.test("a request upper-cases its method and keeps the whole url", () => {
  const request = new HttpRequest("post", "https://example.test/a?b=1#c");

  expect(request.method, equals("POST"));
  expect(request.url.href, equals("https://example.test/a?b=1#c"));
  expect(request.toString(), equals("POST https://example.test/a?b=1#c"));
});

Scribe.test(
  "the three views of the body are three views of the same bytes",
  () => {
    const request = new HttpRequest("POST", "https://example.test/");

    request.bodyFields = { name: "ada", city: "lovelace lane" };

    expect(request.body, equals("name=ada&city=lovelace+lane"));
    expect(request.bodyFields, equals({ name: "ada", city: "lovelace lane" }));
    expect(new TextDecoder().decode(request.bodyBytes), equals("name=ada&city=lovelace+lane"));
  },
);

Scribe.test("setting one view replaces the other two", () => {
  const request = new HttpRequest("POST", "https://example.test/");

  request.bodyFields = { name: "ada" };
  request.bodyBytes = new Uint8Array([104, 105]);

  expect(request.body, equals("hi"));
  expect(request.contentLength, equals(2));
});

Scribe.test(
  "text gives itself a content-type, and leaves one already set alone",
  () => {
    const plain = new HttpRequest("POST", "https://example.test/");
    plain.body = "hello";

    const json = new HttpRequest("POST", "https://example.test/");
    json.headers.set("content-type", "application/json");
    json.body = "{}";

    expect(plain.headers.get("content-type"), equals("text/plain; charset=utf-8"));
    expect(json.headers.get("content-type"), equals("application/json"));
  },
);

Scribe.test("the content-type carries the encoding the request was given", () => {
  const request = new HttpRequest("POST", "https://example.test/");

  request.encoding = "latin1";
  request.body = "x";

  expect(request.headers.get("content-type"), equals("text/plain; charset=latin1"));
});

Scribe.test("reading form fields off a body that is not a form throws", () => {
  const request = new HttpRequest("POST", "https://example.test/");
  request.body = "name=ada";

  expect(
    () => request.bodyFields,
    throwsA(
      allOf(
        isA(Error),
        withMessage(
          'The body fields of a request can only be read when its content-type is "application/x-www-form-urlencoded".',
        ),
      ),
    ),
  );
});

Scribe.test("the content length counts bytes, not characters", () => {
  const request = new HttpRequest("POST", "https://example.test/");

  request.body = "héllo";

  expect(request.contentLength, equals(6));
});

Scribe.test(
  "finalize hands the body over, and refuses to do it twice",
  async () => {
    const request = new HttpRequest("POST", "https://example.test/");
    request.body = "hello";

    expect(request.finalized, equals(false));
    expect(await request.finalize().bytesToString(), equals("hello"));
    expect(request.finalized, equals(true));
    expect(
      () => request.finalize(),
      throwsA(
        allOf(isA(Error), withMessage("This request has already been sent, and a sent request cannot be changed.")),
      ),
    );
  },
);

Scribe.test("a finalized request refuses every write", () => {
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
    expect(
      write,
      throwsA(
        allOf(isA(Error), withMessage("This request has already been sent, and a sent request cannot be changed.")),
      ),
    );
  }
});

Scribe.test(
  "a request follows redirects five deep on a kept connection unless told otherwise",
  () => {
    const request = new HttpRequest("GET", "https://example.test/");

    expect(request.followRedirects, equals(true));
    expect(request.maxRedirects, equals(5));
    expect(request.persistentConnection, equals(true));
    expect(request.timeoutMs, equals(null), "no limit is the default, as it is for fetch itself");

    request.followRedirects = false;
    request.maxRedirects = 0;
    request.persistentConnection = false;

    expect(request.followRedirects, equals(false));
    expect(request.maxRedirects, equals(0));
    expect(request.persistentConnection, equals(false));
  },
);

Scribe.test("send goes through the client it is handed", async () => {
  const client = new MemoryClient({ status: 201 });
  const request = new HttpRequest("PUT", "https://example.test/a");

  const response = await request.send(client);

  expect(response.statusCode, equals(201));
  expect(client.only, equals(request));
});
