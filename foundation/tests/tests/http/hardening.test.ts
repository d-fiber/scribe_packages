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

import { Bytes } from "@scribe/alchemy";
import { BaseRequest, ByteStream, ClientException, HttpRequest } from "@scribe/alchemy/http";
import { FetchClient, FetchClients } from "@scribe/foundation/lib/src/http/fetch_client.ts";
import { assert, assertEquals, assertNotStrictEquals, assertRejects, assertStrictEquals } from "@std/assert";

const SOMEWHERE = "https://example.test/a";

interface Call {
  readonly input: URL | RequestInfo;
  readonly init: RequestInit;
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

class RefusingBody extends BaseRequest {
  override get contentLength(): number {
    return 3;
  }

  override finalize(): ByteStream {
    super.finalize();
    return new ByteStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("the body could not be produced"));
        },
      }),
    );
  }
}

class UnknownLength extends BaseRequest {
  override get contentLength(): number | null {
    return null;
  }

  override finalize(): ByteStream {
    super.finalize();
    return ByteStream.fromBytes(new TextEncoder().encode("abc"));
  }
}

Deno.test("two exchanges in flight on one client both answer", async () => {
  await withFetch(
    (call) => new globalThis.Response(String((call.input as URL).searchParams.get("n")), { status: 200 }),
    async (calls) => {
      const client = new FetchClient();

      const answered = await Promise.all([
        client.send(new HttpRequest("GET", `${SOMEWHERE}?n=1`)),
        client.send(new HttpRequest("GET", `${SOMEWHERE}?n=2`)),
      ]);

      assertEquals(calls.length, 2);
      assertEquals(await Promise.all(answered.map((one) => one.stream.bytesToString())), ["1", "2"]);
      client.close();
    },
  );
});

Deno.test("a hundred exchanges in flight all answer, and none is answered twice", async () => {
  await withFetch(
    (call) => new globalThis.Response(String((call.input as URL).searchParams.get("n")), { status: 200 }),
    async () => {
      const client = new FetchClient();

      const answered = await Promise.all(
        Array.from({ length: 100 }, (_, at) => client.send(new HttpRequest("GET", `${SOMEWHERE}?n=${at}`))),
      );
      const read = await Promise.all(answered.map((one) => one.stream.bytesToString()));

      assertEquals(new Set(read).size, 100);
      client.close();
    },
  );
});

Deno.test("a client closed while an exchange is in flight still answers that exchange", async () => {
  let settle: ((answer: globalThis.Response) => void) | null = null;

  await withFetch(
    () =>
      new Promise<globalThis.Response>((resolve) => {
        settle = resolve;
      }),
    async () => {
      const client = new FetchClient();
      const flight = client.send(new HttpRequest("GET", SOMEWHERE));

      client.close();
      assert(settle !== null);
      (settle as (answer: globalThis.Response) => void)(new globalThis.Response("late", { status: 200 }));

      assertEquals(await (await flight).stream.bytesToString(), "late");
      await assertRejects(() => client.send(new HttpRequest("GET", SOMEWHERE)), ClientException, "already closed");
    },
  );
});

Deno.test("closing a client twice is closing it once", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async (calls) => {
    const client = new FetchClient();
    client.close();
    client.close();

    await assertRejects(() => client.send(new HttpRequest("GET", SOMEWHERE)), ClientException);
    assertEquals(calls.length, 0, "a closed client must not reach the network");
  });
});

Deno.test("the driver opens a client of its own every time, so closing one leaves the others sending", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async () => {
    const driver = new FetchClients();
    const first = driver.open();
    const second = driver.open();

    assertNotStrictEquals(first, second);
    first.close();

    assertEquals((await second.send(new HttpRequest("GET", SOMEWHERE))).statusCode, 200);
    second.close();
  });
});

Deno.test("a url of ten thousand characters reaches the network whole", async () => {
  const long = `${SOMEWHERE}?q=${"x".repeat(10_000)}`;

  await withFetch(() => new globalThis.Response("x", { status: 200 }), async (calls) => {
    const client = new FetchClient();
    await client.send(new HttpRequest("GET", long));

    assertEquals(String(calls[0].input), long);
    client.close();
  });
});

Deno.test("a header the caller set survives the one the client adds", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async (calls) => {
    const client = new FetchClient();
    const request = new HttpRequest("POST", SOMEWHERE);
    request.headers.set("x-trace", "abc");
    request.body = "hello";

    await client.send(request);

    const sent = calls[0].init.headers as Headers;
    assertEquals(sent.get("x-trace"), "abc");
    assertEquals(sent.get("content-length"), "5");
    client.close();
  });
});

Deno.test("a request whose length is not known ahead of time announces none and still sends its bytes", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async (calls) => {
    const client = new FetchClient();

    await client.send(new UnknownLength("POST", SOMEWHERE));

    assertEquals((calls[0].init.headers as Headers).get("content-length"), null);
    assertEquals(new TextDecoder().decode(calls[0].init.body as Uint8Array), "abc");
    client.close();
  });
});

Deno.test("an answer carrying no body at all reads as empty rather than refusing", async () => {
  await withFetch(() => new globalThis.Response(null, { status: 204 }), async () => {
    const client = new FetchClient();
    const answered = await client.send(new HttpRequest("GET", SOMEWHERE));

    assertEquals(answered.statusCode, 204);
    assertEquals(await answered.stream.toBytes(), new Uint8Array(0));
    client.close();
  });
});

Deno.test("an answer longer than the cap the caller reads with is refused as a client exception", async () => {
  await withFetch(() => new globalThis.Response("abcdefghij", { status: 200 }), async () => {
    const client = new FetchClient();
    const answered = await client.send(new HttpRequest("GET", SOMEWHERE));

    await assertRejects(() => answered.stream.toBytes(Bytes.of(3)), ClientException);
    client.close();
  });
});

Deno.test("a limit of zero milliseconds is a limit, not the absence of one", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async (calls) => {
    const client = new FetchClient();
    const request = new HttpRequest("GET", SOMEWHERE);
    request.timeoutMs = 0;

    await client.send(request);
    const signal = calls[0].init.signal as AbortSignal;

    assert(signal !== undefined, "zero must not be read as no limit at all");
    await new Promise((settle) => setTimeout(settle, 5));
    assertEquals(signal.aborted, true);
    client.close();
  });
});

Deno.test("a limit the platform refuses arrives as one client exception like every other failure", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async (calls) => {
    const client = new FetchClient();
    const request = new HttpRequest("GET", SOMEWHERE);
    request.timeoutMs = -1;

    await assertRejects(() => client.send(request), ClientException);
    assertEquals(calls.length, 0);
    client.close();
  });
});

Deno.test("a limit that is not a number arrives as one client exception too", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async () => {
    const client = new FetchClient();
    const request = new HttpRequest("GET", SOMEWHERE);
    request.timeoutMs = Number.NaN;

    await assertRejects(() => client.send(request), ClientException);
    client.close();
  });
});

Deno.test("a client answers what the server sent, whatever the caller asked for", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 418, statusText: "I am a teapot" }), async () => {
    const client = new FetchClient();
    const answered = await client.send(new HttpRequest("GET", SOMEWHERE));

    assertEquals(answered.statusCode, 418);
    assertEquals(answered.reasonPhrase, "I am a teapot");
    assertEquals(answered.ok, false);
    client.close();
  });
});

Deno.test("the request the answer names is the one that was sent", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async () => {
    const client = new FetchClient();
    const request = new HttpRequest("GET", SOMEWHERE);

    assertStrictEquals((await client.send(request)).request, request);
    client.close();
  });
});

Deno.test({
  name: "a request sent twice is refused as a client exception, where today the seal escapes as something else",
  async fn() {
    await withFetch(() => new globalThis.Response("x", { status: 200 }), async () => {
      const client = new FetchClient();
      const request = new HttpRequest("GET", SOMEWHERE);
      await client.send(request);

      await assertRejects(() => client.send(request), ClientException);
      client.close();
    });
  },
});

Deno.test({
  name: "a body that cannot be produced is refused as a client exception, where today it escapes untranslated",
  async fn() {
    await withFetch(() => new globalThis.Response("x", { status: 200 }), async () => {
      const client = new FetchClient();

      await assertRejects(() => client.send(new RefusingBody("POST", SOMEWHERE)), ClientException);
      client.close();
    });
  },
});

Deno.test({
  name:
    "a length the server wrote as something other than a number is read as unknown, not as a number that is not one",
  async fn() {
    await withFetch(
      () => new globalThis.Response("hello", { status: 200, headers: { "content-length": "not a number" } }),
      async () => {
        const client = new FetchClient();
        const answered = await client.send(new HttpRequest("GET", SOMEWHERE));

        assertEquals(answered.contentLength, null);
        client.close();
      },
    );
  },
});

Deno.test({
  name: "a length the server wrote as an empty string is read as unknown, not as zero bytes",
  async fn() {
    await withFetch(
      () => new globalThis.Response("hello", { status: 200, headers: { "content-length": "" } }),
      async () => {
        const client = new FetchClient();
        const answered = await client.send(new HttpRequest("GET", SOMEWHERE));

        assertEquals(answered.contentLength, null);
        client.close();
      },
    );
  },
});

Deno.test("a network that refuses arrives as one client exception naming the address", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new TypeError("connection refused"))) as typeof globalThis.fetch;

  try {
    const client = new FetchClient();
    const raised = await assertRejects(() => client.send(new HttpRequest("GET", SOMEWHERE)), ClientException);

    assert(raised.message.includes("connection refused"));
    client.close();
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("a driver opened a thousand times hands out a thousand clients and keeps none", async () => {
  await withFetch(() => new globalThis.Response("x", { status: 200 }), async () => {
    const driver = new FetchClients();
    const opened = Array.from({ length: 1_000 }, () => driver.open());

    assertEquals(new Set(opened).size, 1_000);
    for (const one of opened) one.close();

    const after = driver.open();
    assertEquals((await after.send(new HttpRequest("GET", SOMEWHERE))).statusCode, 200);
    after.close();
  });
});
