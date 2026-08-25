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
import { ClientException } from "@scribe/alchemy/http";
import { FetchClient } from "../../../lib/src/http/fetch_client.ts";
import { HttpRequest } from "@scribe/alchemy/http";
import { assert, assertEquals, assertRejects } from "@std/assert";

const URL_UNDER_TEST = "https://example.test/a";

interface Call {
  input: URL | RequestInfo;
  init: RequestInit;
}

async function withFetch(
  answer: (call: Call) => globalThis.Response | Promise<globalThis.Response>,
  body: (calls: Call[]) => Promise<void>,
): Promise<void> {
  const calls: Call[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = ((input: URL | RequestInfo, init: RequestInit = {}) => {
    const call = { input, init };
    calls.push(call);
    return Promise.resolve(answer(call));
  }) as typeof globalThis.fetch;

  try {
    await body(calls);
  } finally {
    globalThis.fetch = original;
  }
}

function ok(): globalThis.Response {
  return new globalThis.Response("hello", { status: 200 });
}

Deno.test("a closed client refuses to send", async () => {
  const client = new FetchClient();
  client.close();

  const raised = await assertRejects(
    () => client.get(URL_UNDER_TEST),
    ClientException,
    "HTTP request failed. Client is already closed.",
  );

  assertEquals(raised.uri?.href, URL_UNDER_TEST);
});

Deno.test("every way of never reaching the server arrives as one exception", async () => {
  const cause = new TypeError("error sending request for url");
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(cause)) as typeof globalThis.fetch;

  try {
    const raised = await assertRejects(
      () => new FetchClient().get(URL_UNDER_TEST),
      ClientException,
      "HTTP request failed. error sending request for url",
    );

    assertEquals(raised.cause, cause);
    assertEquals(raised.uri?.href, URL_UNDER_TEST);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("a failure that is not an Error is still described", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject("gave up")) as typeof globalThis.fetch;

  try {
    await assertRejects(
      () => new FetchClient().get(URL_UNDER_TEST),
      ClientException,
      "HTTP request failed. gave up",
    );
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("GET and HEAD send no body and announce no length", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    const get = new HttpRequest("GET", URL_UNDER_TEST);
    get.body = "ignored";
    await client.send(get);
    await client.head(URL_UNDER_TEST);

    for (const call of calls) {
      assertEquals(
        call.init.body,
        undefined,
        "a body set on a GET is dropped, since the platform refuses to send one at all",
      );
      assertEquals(new Headers(call.init.headers).get("content-length"), null);
    }
  });
});

Deno.test("a verb that may carry a body but carries none sends nothing", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().post(URL_UNDER_TEST);

    assertEquals(calls[0].init.method, "POST");
    assertEquals(
      calls[0].init.body,
      undefined,
      "an empty body is no body, not an empty buffer",
    );
  });
});

Deno.test("a body is sent as bytes, with its length announced", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().post(URL_UNDER_TEST, { body: "héllo" });

    const [call] = calls;
    assertEquals(call.init.method, "POST");
    assertEquals(call.init.body, new TextEncoder().encode("héllo"));
    assertEquals(new Headers(call.init.headers).get("content-length"), "6");
  });
});

Deno.test("the redirect mode of the request reaches fetch, all three of them", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    await client.get(URL_UNDER_TEST);
    await client.get(URL_UNDER_TEST, { redirect: "follow" });

    const manual = new HttpRequest("GET", URL_UNDER_TEST);
    manual.redirect = "manual";
    await client.send(manual);

    assertEquals(calls.map((call) => call.init.redirect), [
      "error",
      "follow",
      "manual",
    ]);
  });
});

Deno.test("the url goes over as the URL the request parsed", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get("https://example.test/a?b=1");

    assert(calls[0].input instanceof URL);
    assertEquals(calls[0].input.href, "https://example.test/a?b=1");
  });
});

Deno.test("the answered status, reason, headers and length reach the response", async () => {
  await withFetch(
    () =>
      new globalThis.Response("nope", {
        status: 418,
        statusText: "I'm a teapot",
        headers: { "content-length": "4", "x-brew": "tea" },
      }),
    async () => {
      const response = await new FetchClient().get(URL_UNDER_TEST);

      assertEquals(response.statusCode, 418);
      assertEquals(response.reasonPhrase, "I'm a teapot");
      assertEquals(response.contentLength, 4);
      assertEquals(response.headers.get("x-brew"), "tea");
      assertEquals(response.body, "nope");
      assertEquals(response.request?.url.href, URL_UNDER_TEST);
    },
  );
});

Deno.test("a status the server sent no text for has no reason phrase", async () => {
  await withFetch(
    () => new globalThis.Response("x", { status: 200, statusText: "" }),
    async () => {
      assertEquals(
        (await new FetchClient().get(URL_UNDER_TEST)).reasonPhrase,
        null,
      );
    },
  );
});

Deno.test("an answer without a body reads as empty rather than throwing", async () => {
  await withFetch(
    () => new globalThis.Response(null, { status: 204 }),
    async () => {
      const response = await new FetchClient().get(URL_UNDER_TEST);

      assertEquals(response.statusCode, 204);
      assertEquals(response.body, "");
    },
  );
});

Deno.test("a server that says nothing about the length leaves it unknown", async () => {
  await withFetch(
    () => {
      const answered = new globalThis.Response("hello", { status: 200 });
      answered.headers.delete("content-length");
      return answered;
    },
    async () => {
      const streamed = await new FetchClient().send(
        new HttpRequest("GET", URL_UNDER_TEST),
      );

      assertEquals(
        streamed.contentLength,
        null,
        "the streamed response carries the server's claim, and the server made none: the " +
          "count of what actually arrived only exists once the stream is drained",
      );
    },
  );
});

Deno.test("a call that names no timeout still carries the default one", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get(URL_UNDER_TEST);

    assert(calls[0].init.signal instanceof AbortSignal);
  });
});

Deno.test("a timeout reaches fetch as a signal", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get(URL_UNDER_TEST, {
      timeout: Duration.seconds(5),
    });

    assert(calls[0].init.signal instanceof AbortSignal);
  });
});

Deno.test("an exchange that runs out of time names the limit it reached", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: URL | RequestInfo, init: RequestInit = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
      );
    })) as typeof globalThis.fetch;

  try {
    const raised = await assertRejects(
      () =>
        new FetchClient().get(URL_UNDER_TEST, {
          timeout: Duration.milliseconds(20),
        }),
      ClientException,
      "HTTP request failed. Timed out after 20 ms.",
    );

    assertEquals(raised.uri?.href, URL_UNDER_TEST);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("a request that answers in time is not cut short", async () => {
  await withFetch(
    () => new Promise((resolve) => setTimeout(() => resolve(ok()), 5)),
    async () => {
      assertEquals(
        (await new FetchClient().get(URL_UNDER_TEST, {
          timeout: Duration.seconds(2),
        })).body,
        "hello",
      );
    },
  );
});

Deno.test("a client that was never closed keeps sending", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    await client.get(URL_UNDER_TEST);
    await client.get(URL_UNDER_TEST);

    assertEquals(calls.length, 2);
  });
});
