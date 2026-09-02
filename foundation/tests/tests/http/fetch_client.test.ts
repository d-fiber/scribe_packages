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
import {
  allOf,
  caught,
  equals,
  expect,
  expectLater,
  fail,
  having,
  isA,
  isTrue,
  Scribe,
  throwsA,
  withMessage,
} from "@scribe/alchemy/test";
import { Duration } from "@scribe/alchemy";
import { BaseRequest, ByteStream, ClientException } from "@scribe/alchemy/http";
import { FetchClient } from "../../../lib/src/http/fetch_client.ts";
import { HttpRequest } from "@scribe/alchemy/http";

class LazySourceRequest extends BaseRequest {
  override get contentLength(): number | null {
    return null;
  }

  override finalize(): ByteStream {
    super.finalize();
    return new ByteStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first chunk"));
        },
        pull() {
          throw new Error("disk read failed");
        },
      }),
    );
  }
}
const URL_UNDER_TEST = "https://example.test/a";

interface Call {
  input: URL | RequestInfo;
  init: RequestInit;
}

function duplexOf(call: Call): string | undefined {
  return (call.init as RequestInit & { duplex?: string }).duplex;
}

async function bodyBytes(call: Call): Promise<Uint8Array> {
  const body = call.init.body;
  if (body === undefined || body === null) return new Uint8Array(0);
  if (body instanceof Uint8Array) return body;
  if (!(body instanceof ReadableStream)) {
    fail("a body carrying bytes must be a stream, not a " + typeof body);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as ReadableStream<Uint8Array>) {
    chunks.push(chunk);
  }

  const collected = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let at = 0;
  for (const chunk of chunks) {
    collected.set(chunk, at);
    at += chunk.length;
  }
  return collected;
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

Scribe.test("a closed client refuses to send", async () => {
  const client = new FetchClient();
  client.close();

  const raised = await caught(() => client.get(URL_UNDER_TEST));
  expect(
    raised,
    allOf(
      isA(ClientException),
      withMessage("HTTP request failed. Client is already closed."),
    ),
  );
  expect(
    raised,
    having(
      isA(ClientException),
      (r) => r.uri?.href,
      "uri",
      equals(URL_UNDER_TEST),
    ),
  );
});

Scribe.test("every way of never reaching the server arrives as one exception", async () => {
  const cause = new TypeError("error sending request for url");
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(cause)) as typeof globalThis.fetch;

  try {
    const raised = await caught(() => new FetchClient().get(URL_UNDER_TEST));
    expect(
      raised,
      allOf(
        isA(ClientException),
        withMessage("HTTP request failed. error sending request for url"),
      ),
    );
    expect(
      raised,
      having(isA(ClientException), (r) => r.cause, "cause", equals(cause)),
    );
    expect(
      raised,
      having(
        isA(ClientException),
        (r) => r.uri?.href,
        "uri",
        equals(URL_UNDER_TEST),
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});

Scribe.test("a failure that is not an Error is still described", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject("gave up")) as typeof globalThis.fetch;

  try {
    await expectLater(
      () => new FetchClient().get(URL_UNDER_TEST),
      throwsA(
        allOf(
          isA(ClientException),
          withMessage("HTTP request failed. gave up"),
        ),
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});

Scribe.test("GET and HEAD send no body and announce no length", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    const get = new HttpRequest("GET", URL_UNDER_TEST);
    get.body = "ignored";
    await client.send(get);
    await client.head(URL_UNDER_TEST);

    for (const call of calls) {
      expect(
        call.init.body,
        equals(undefined),
        "a body set on a GET is dropped, since the platform refuses to send one at all",
      );
      expect(
        new Headers(call.init.headers).get("content-length"),
        equals(null),
      );
    }
  });
});

Scribe.test("a verb that may carry a body but carries none sends nothing", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().post(URL_UNDER_TEST);

    expect(calls[0].init.method, equals("POST"));
    expect(
      calls[0].init.body,
      equals(undefined),
      "an empty body is no body, not an empty buffer",
    );
  });
});

Scribe.test("put, patch and delete carry a body and announce its length, the way post does", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    await client.put(URL_UNDER_TEST, { body: "up" });
    await client.patch(URL_UNDER_TEST, { body: "up" });
    await client.delete(URL_UNDER_TEST, { body: "up" });

    expect(
      calls.map((call) => call.init.method),
      equals(["PUT", "PATCH", "DELETE"]),
    );
    for (const call of calls) {
      expect(await bodyBytes(call), equals(new TextEncoder().encode("up")));
      expect(new Headers(call.init.headers).get("content-length"), equals("2"));
      expect(
        duplexOf(call),
        equals("half"),
        "a streamed body must tell fetch the request finishes before the response is read",
      );
    }
  });
});

Scribe.test("put, patch and delete given no body send none, the way post does", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    await client.put(URL_UNDER_TEST);
    await client.patch(URL_UNDER_TEST);
    await client.delete(URL_UNDER_TEST);

    for (const call of calls) {
      expect(
        call.init.body,
        equals(undefined),
        "an empty body is no body, not an empty buffer",
      );
    }
  });
});

Scribe.test("a body is sent as a stream, with its length announced", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().post(URL_UNDER_TEST, { body: "héllo" });

    const [call] = calls;
    expect(call.init.method, equals("POST"));
    expect(
      call.init.body instanceof ReadableStream,
      isTrue,
      "a body is handed to fetch as a stream, not collected first",
    );
    expect(await bodyBytes(call), equals(new TextEncoder().encode("héllo")));
    expect(new Headers(call.init.headers).get("content-length"), equals("6"));
  });
});

Scribe.test("a GET carries no duplex option, since it carries no body to stream", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get(URL_UNDER_TEST);

    expect(duplexOf(calls[0]), equals(undefined));
  });
});

Scribe.test("a source that fails partway through a streamed body reaches the caller as one exception", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: URL | RequestInfo, init: RequestInit = {}) => {
    for await (const _chunk of init.body as ReadableStream<Uint8Array>) {
      undefined;
    }
    return ok();
  }) as typeof globalThis.fetch;

  try {
    const raised = await caught(() => new FetchClient().send(new LazySourceRequest("POST", URL_UNDER_TEST)));
    expect(
      raised,
      allOf(
        isA(ClientException),
        withMessage("HTTP request failed. disk read failed"),
      ),
      "a source that errors while fetch drains it must still reach the caller as a ClientException, " +
        "the same shape a connection failure already takes, even though nothing here reads the " +
        "stream ahead of fetch anymore",
    );
  } finally {
    globalThis.fetch = original;
  }
});

Scribe.test("the redirect mode of the request reaches fetch, all three of them", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    await client.get(URL_UNDER_TEST);
    await client.get(URL_UNDER_TEST, { redirect: "follow" });

    const manual = new HttpRequest("GET", URL_UNDER_TEST);
    manual.redirect = "manual";
    await client.send(manual);

    expect(
      calls.map((call) => call.init.redirect),
      equals<(RequestRedirect | undefined)[]>(["error", "follow", "manual"]),
    );
  });
});

Scribe.test("the url goes over as the URL the request parsed", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get("https://example.test/a?b=1");

    if (!(calls[0].input instanceof URL)) {
      fail("the url must go over as a URL, not a string or a Request");
    }

    expect(calls[0].input.href, equals("https://example.test/a?b=1"));
  });
});

Scribe.test("the answered status, reason, headers and length reach the response", async () => {
  await withFetch(
    () =>
      new globalThis.Response("nope", {
        status: 418,
        statusText: "I'm a teapot",
        headers: { "content-length": "4", "x-brew": "tea" },
      }),
    async () => {
      const response = await new FetchClient().get(URL_UNDER_TEST);

      expect(response.statusCode, equals(418));
      expect(response.reasonPhrase, equals("I'm a teapot"));
      expect(response.contentLength, equals(4));
      expect(response.headers.get("x-brew"), equals("tea"));
      expect(response.body, equals("nope"));
      expect(response.request?.url.href, equals(URL_UNDER_TEST));
    },
  );
});

Scribe.test("a status the server sent no text for has no reason phrase", async () => {
  await withFetch(
    () => new globalThis.Response("x", { status: 200, statusText: "" }),
    async () => {
      expect(
        (await new FetchClient().get(URL_UNDER_TEST)).reasonPhrase,
        equals(null),
      );
    },
  );
});

Scribe.test("an answer without a body reads as empty rather than throwing", async () => {
  await withFetch(
    () => new globalThis.Response(null, { status: 204 }),
    async () => {
      const response = await new FetchClient().get(URL_UNDER_TEST);

      expect(response.statusCode, equals(204));
      expect(response.body, equals(""));
    },
  );
});

Scribe.test("a server that says nothing about the length leaves it unknown", async () => {
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

      expect(
        streamed.contentLength,
        equals(null),
        "the streamed response carries the server's claim, and the server made none: the " +
          "count of what actually arrived only exists once the stream is drained",
      );
    },
  );
});

Scribe.test("a call that names no timeout still carries the default one", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get(URL_UNDER_TEST);

    expect(calls[0].init.signal instanceof AbortSignal, isTrue);
  });
});

Scribe.test("a timeout reaches fetch as a signal", async () => {
  await withFetch(ok, async (calls) => {
    await new FetchClient().get(URL_UNDER_TEST, {
      timeout: Duration.seconds(5),
    });

    expect(calls[0].init.signal instanceof AbortSignal, isTrue);
  });
});

Scribe.test("an exchange that runs out of time names the limit it reached", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: URL | RequestInfo, init: RequestInit = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
      );
    })) as typeof globalThis.fetch;

  try {
    const raised = await caught(() =>
      new FetchClient().get(URL_UNDER_TEST, {
        timeout: Duration.milliseconds(20),
      })
    );
    expect(
      raised,
      allOf(
        isA(ClientException),
        withMessage("HTTP request failed. Timed out after 20 ms."),
      ),
    );
    expect(
      raised,
      having(
        isA(ClientException),
        (r) => r.uri?.href,
        "uri",
        equals(URL_UNDER_TEST),
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});

Scribe.test("a request that answers in time is not cut short", async () => {
  await withFetch(
    () => new Promise((resolve) => setTimeout(() => resolve(ok()), 5)),
    async () => {
      expect(
        (await new FetchClient().get(URL_UNDER_TEST, {
          timeout: Duration.seconds(2),
        })).body,
        equals("hello"),
      );
    },
  );
});

Scribe.test("a client that was never closed keeps sending", async () => {
  await withFetch(ok, async (calls) => {
    const client = new FetchClient();

    await client.get(URL_UNDER_TEST);
    await client.get(URL_UNDER_TEST);

    expect(calls.length, equals(2));
  });
});
