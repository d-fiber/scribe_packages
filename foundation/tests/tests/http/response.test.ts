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
import { allOf, equals, expect, fail, having, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { ByteStream } from "@scribe/alchemy/http";
import { ClientException } from "@scribe/alchemy/http";
import { HttpRequest } from "@scribe/alchemy/http";
import { HttpResponse } from "@scribe/alchemy/http";
import { StreamedResponse } from "@scribe/alchemy/http";

function typed(value: string): Headers {
  return new Headers({ "content-type": value });
}

/** Calls `body`, and answers what it raised. */
function caughtSync(body: () => unknown): unknown {
  try {
    body();
  } catch (raised) {
    return raised;
  }
  fail("it returned instead of raising");
}

Scribe.test("a response built from text announces its length in bytes", () => {
  const response = new HttpResponse("héllo", 200);

  expect(response.contentLength, equals(6));
  expect(response.body, equals("héllo"));
});

Scribe.test("the charset of content-type decides how the body reads", () => {
  const latin = new HttpResponse(new Uint8Array([0xe9]), 200, {
    headers: typed("text/plain; charset=latin1"),
  });
  const utf8 = new HttpResponse(new Uint8Array([0xc3, 0xa9]), 200, {
    headers: typed("text/plain"),
  });

  expect(latin.body, equals("é"));
  expect(utf8.body, equals("é"));
});

Scribe.test(
  "a charset the platform does not know falls back to utf-8 instead of throwing",
  () => {
    const response = new HttpResponse(new Uint8Array([0xc3, 0xa9]), 200, {
      headers: typed("text/plain; charset=not-a-charset"),
    });

    expect(response.body, equals("é"));
    expect(response.bodyBytes, equals(new Uint8Array([0xc3, 0xa9])));
  },
);

Scribe.test("ok is the 2xx window, and nothing else", () => {
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
    expect(new HttpResponse("", status).ok, equals(expected), `status ${status}`);
  }
});

Scribe.test("a status below 100 is refused", () => {
  expect(
    () => new HttpResponse("", 99),
    throwsA(allOf(isA(Error), withMessage("A status code is three digits from 100 to 599, and 99 is not one."))),
  );
  expect(new HttpResponse("", 100).statusCode, equals(100));
});

Scribe.test("a response says nothing it was not told", () => {
  const response = new HttpResponse("", 200);

  expect(response.request, equals(null));
  expect(response.reasonPhrase, equals(null));
  expect(response.isRedirect, equals(false));
  expect(response.persistentConnection, equals(true));
  expect([...response.headers], equals([]));
});

Scribe.test(
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

    expect(whole.body, equals("hello"));
    expect(whole.statusCode, equals(301));
    expect(whole.request, equals(request));
    expect(whole.reasonPhrase, equals("Moved Permanently"));
    expect(whole.isRedirect, equals(true));
    expect(whole.persistentConnection, equals(false));
    expect(whole.headers.get("content-type"), equals("text/plain"));
  },
);

Scribe.test("json reads the body a server announced as JSON", () => {
  const response = new HttpResponse('{"name":"ada","tags":[1,2]}', 200, {
    headers: typed("application/json"),
  });

  expect(
    response.json<{ name: string; tags: number[] }>(),
    equals({
      name: "ada",
      tags: [1, 2],
    }),
  );
});

Scribe.test("json reads a body the caller is free to have refused first", () => {
  const response = new HttpResponse('{"code":"not_found"}', 404, {
    headers: typed("application/json"),
  });

  expect(response.statusCode, equals(404));
  expect(
    response.json<{ code: string }>(),
    equals({ code: "not_found" }),
    "a refused answer still hands over its JSON error payload, which is what the " +
      "client-level readJson cannot do",
  );
});

Scribe.test("a body that is not JSON is an exception, not a value", () => {
  const request = new HttpRequest("GET", "https://example.test/a");
  const response = new HttpResponse("<html>gateway timeout</html>", 504, {
    request,
  });

  const raised = caughtSync(() => response.json());

  expect(raised, allOf(isA(ClientException), withMessage("Answer from https://example.test/a is not JSON.")));
  expect(raised, having(isA(ClientException), (r) => r.uri?.href, "uri", equals("https://example.test/a")));
});

Scribe.test(
  "a drained response announces what arrived, not what the server claimed",
  async () => {
    const streamed = new StreamedResponse(
      ByteStream.fromBytes(new TextEncoder().encode("hi")),
      200,
      { contentLength: 900 },
    );

    expect((await HttpResponse.fromStream(streamed)).contentLength, equals(2));
  },
);
