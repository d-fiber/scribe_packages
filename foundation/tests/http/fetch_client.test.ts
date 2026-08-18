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
import { Request } from "@scribe/foundation/src/http/request/request.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";

const URL_UNDER_TEST = "https://example.test/a";

interface Call {
  input: URL | RequestInfo;
  init: RequestInit;
}

/**
 * Runs `body` with `fetch` answering from `answer`, and hands back every call it received.
 *
 * The platform's `fetch` is the one thing this client is written against, so it is the one
 * thing a test has to stand in for. Nothing here goes on the network.
 */
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

    // A body set on a GET is the caller's mistake, and the platform refuses to send one at all.
    const get = new Request("GET", URL_UNDER_TEST);
    get.body = "ignored";
    await client.send(get);
    await client.head(URL_UNDER_TEST);

    for (const call of calls) {
      assertEquals(call.init.body, undefined);
      assertEquals(new Headers(call.init.headers).get("content-length"), null);
    }
  });
});

Deno.test("a verb that may carry a body but carries none sends nothing", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().post(URL_UNDER_TEST);

    assertEquals(calls[0].init.method, "POST");
    assertEquals(calls[0].init.body, undefined, "an empty body is no body, not an empty buffer");
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

Deno.test("followRedirects decides the redirect mode", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    await client.get(URL_UNDER_TEST);

    const manual = new Request("GET", URL_UNDER_TEST);
    manual.followRedirects = false;
    await client.send(manual);

    assertEquals(calls.map((call) => call.init.redirect), ["follow", "manual"]);
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
      assertEquals((await new FetchClient().get(URL_UNDER_TEST)).reasonPhrase, null);
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
      // The streamed response is the one that carries the server's claim; the drained one
      // counts what actually arrived, so this has to be read before `Response.fromStream`.
      const streamed = await new FetchClient().send(new Request("GET", URL_UNDER_TEST));

      assertEquals(streamed.contentLength, null);
    },
  );
});

Deno.test("no timeout is asked for unless the call asks for one", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get(URL_UNDER_TEST);

    assertEquals(calls[0].init.signal, undefined);
  });
});

Deno.test("a timeout reaches fetch as a signal", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get(URL_UNDER_TEST, { timeout: 5_000 });

    assert(calls[0].init.signal instanceof AbortSignal);
  });
});

Deno.test("an exchange that runs out of time names the limit it reached", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: URL | RequestInfo, init: RequestInit = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })) as typeof globalThis.fetch;

  try {
    const raised = await assertRejects(
      () => new FetchClient().get(URL_UNDER_TEST, { timeout: 20 }),
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
      assertEquals((await new FetchClient().get(URL_UNDER_TEST, { timeout: 2_000 })).body, "hello");
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
