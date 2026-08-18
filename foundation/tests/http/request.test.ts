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

import { Request } from "@scribe/foundation/src/http/request/request.ts";
import { assertEquals, assertThrows } from "@std/assert";
import { RecordingClient } from "./mocks/recording_client.ts";

Deno.test("a request upper-cases its method and keeps the whole url", () => {
  const request = new Request("post", "https://example.test/a?b=1#c");

  assertEquals(request.method, "POST");
  assertEquals(request.url.href, "https://example.test/a?b=1#c");
  assertEquals(request.toString(), "POST https://example.test/a?b=1#c");
});

Deno.test(
  "the three views of the body are three views of the same bytes",
  () => {
    const request = new Request("POST", "https://example.test/");

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
  const request = new Request("POST", "https://example.test/");

  request.bodyFields = { name: "ada" };
  request.bodyBytes = new Uint8Array([104, 105]);

  assertEquals(request.body, "hi");
  assertEquals(request.contentLength, 2);
});

Deno.test(
  "text gives itself a content-type, and leaves one already set alone",
  () => {
    const plain = new Request("POST", "https://example.test/");
    plain.body = "hello";

    const json = new Request("POST", "https://example.test/");
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
  const request = new Request("POST", "https://example.test/");

  request.encoding = "latin1";
  request.body = "x";

  assertEquals(
    request.headers.get("content-type"),
    "text/plain; charset=latin1",
  );
});

Deno.test("reading form fields off a body that is not a form throws", () => {
  const request = new Request("POST", "https://example.test/");
  request.body = "name=ada";

  assertThrows(
    () => request.bodyFields,
    Error,
    'Can\'t access the body fields of a Request without content-type "application/x-www-form-urlencoded".',
  );
});

Deno.test("the content length counts bytes, not characters", () => {
  const request = new Request("POST", "https://example.test/");

  request.body = "héllo";

  assertEquals(request.contentLength, 6);
});

Deno.test(
  "finalize hands the body over, and refuses to do it twice",
  async () => {
    const request = new Request("POST", "https://example.test/");
    request.body = "hello";

    assertEquals(request.finalized, false);
    assertEquals(await request.finalize().bytesToString(), "hello");
    assertEquals(request.finalized, true);
    assertThrows(
      () => request.finalize(),
      Error,
      "Can't modify a finalized Request.",
    );
  },
);

Deno.test("a finalized request refuses every write", () => {
  const request = new Request("POST", "https://example.test/");
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
    assertThrows(write, Error, "Can't modify a finalized Request.");
  }
});

Deno.test(
  "a request follows redirects five deep on a kept connection unless told otherwise",
  () => {
    const request = new Request("GET", "https://example.test/");

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
  const client = new RecordingClient({ status: 201 });
  const request = new Request("PUT", "https://example.test/a");

  const response = await request.send(client);

  assertEquals(response.statusCode, 201);
  assertEquals(client.only, request);
});
