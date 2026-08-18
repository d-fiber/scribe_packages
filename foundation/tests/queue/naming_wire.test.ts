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

import {
  DEAD_STREAM,
  deadSubjectOf,
  DEDICATED_STREAM,
  sanitize,
  SHARED_CONSUMER,
  SHARED_STREAM,
  subjectOf,
} from "@scribe/foundation/src/queue/core/naming.ts";
import {
  decode,
  encode,
} from "@scribe/foundation/src/queue/core/wire.ts";
import { assertEquals, assertNotEquals } from "@std/assert";

Deno.test("sanitize keeps what NATS accepts and folds the rest", () => {
  assertEquals(sanitize("mail-send_1"), "mail-send_1");
  assertEquals(sanitize("mail.send"), "mail_send");
  assertEquals(sanitize("mail send"), "mail_send");
  assertEquals(sanitize("a>b*c"), "a_b_c");
});

Deno.test("sanitize collapses a run of forbidden characters into one separator", () => {
  assertEquals(sanitize("a...b"), "a_b");
  assertEquals(sanitize("a . * b"), "a_b");
});

Deno.test("subjectOf puts shared and dedicated queues on distinct prefixes", () => {
  assertEquals(subjectOf("mail.send", false), "q.mail_send");
  assertEquals(subjectOf("mail.send", true), "qd.mail_send");
  assertNotEquals(subjectOf("x", false), subjectOf("x", true));
});

Deno.test("deadSubjectOf never collides with a live subject", () => {
  assertEquals(deadSubjectOf("mail.send"), "dead.mail_send");
  assertNotEquals(deadSubjectOf("x"), subjectOf("x", false));
  assertNotEquals(deadSubjectOf("x"), subjectOf("x", true));
});

Deno.test("the four stream names stay distinct", () => {
  const names = [
    SHARED_STREAM,
    DEDICATED_STREAM,
    DEAD_STREAM,
    SHARED_CONSUMER,
  ];
  assertEquals(new Set(names).size, names.length);
});

Deno.test("encode then decode round-trips the payload and the attempt count", () => {
  const message = { data: { to: "a@b.c", subject: "hi" }, attempts: 2 };

  assertEquals(decode<typeof message.data>(encode(message)), message);
});

Deno.test("the wire format survives unicode and nesting", () => {
  const message = {
    data: { name: "Émile ✉️", tags: ["a", "b"], nested: { deep: true } },
    attempts: 0,
  };

  assertEquals(decode<typeof message.data>(encode(message)), message);
});
