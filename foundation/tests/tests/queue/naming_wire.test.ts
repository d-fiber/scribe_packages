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

import "../../testing/settings.ts";

import {
  DEAD_STREAM,
  deadSubjectOf,
  DEDICATED_STREAM,
  sanitize,
  SHARED_CONSUMER,
  SHARED_STREAM,
  subjectOf,
} from "../../../lib/src/queue/queue_naming.ts";
import { decode, encode } from "../../../lib/src/queue/wire_message.ts";
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
