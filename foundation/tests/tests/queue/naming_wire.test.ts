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
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
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
Scribe.test("sanitize keeps what NATS accepts and folds the rest", () => {
  expect(sanitize("mail-send_1"), equals("mail-send_1"));
  expect(sanitize("mail.send"), equals("mail_send"));
  expect(sanitize("mail send"), equals("mail_send"));
  expect(sanitize("a>b*c"), equals("a_b_c"));
});

Scribe.test("sanitize collapses a run of forbidden characters into one separator", () => {
  expect(sanitize("a...b"), equals("a_b"));
  expect(sanitize("a . * b"), equals("a_b"));
});

Scribe.test("subjectOf puts shared and dedicated queues on distinct prefixes", () => {
  expect(subjectOf("mail.send", false), equals("q.mail_send"));
  expect(subjectOf("mail.send", true), equals("qd.mail_send"));
  expect(subjectOf("x", false), isNot(equals(subjectOf("x", true))));
});

Scribe.test("deadSubjectOf never collides with a live subject", () => {
  expect(deadSubjectOf("mail.send"), equals("dead.mail_send"));
  expect(deadSubjectOf("x"), isNot(equals(subjectOf("x", false))));
  expect(deadSubjectOf("x"), isNot(equals(subjectOf("x", true))));
});

Scribe.test("the four stream names stay distinct", () => {
  const names = [
    SHARED_STREAM,
    DEDICATED_STREAM,
    DEAD_STREAM,
    SHARED_CONSUMER,
  ];
  expect(new Set(names).size, equals(names.length));
});

Scribe.test("encode then decode round-trips the payload and the attempt count", () => {
  const message = { data: { to: "a@b.c", subject: "hi" }, attempts: 2 };

  expect(decode<typeof message.data>(encode(message)), equals(message));
});

Scribe.test("the wire format survives unicode and nesting", () => {
  const message = {
    data: { name: "Émile ✉️", tags: ["a", "b"], nested: { deep: true } },
    attempts: 0,
  };

  expect(decode<typeof message.data>(encode(message)), equals(message));
});
