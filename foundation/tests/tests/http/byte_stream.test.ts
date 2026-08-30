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
import { equals, expect, isTrue, Scribe } from "@scribe/alchemy/test";
import { ByteStream } from "@scribe/alchemy/http";

function streamOf(...chunks: string[]): ByteStream {
  const encoder = new TextEncoder();

  return new ByteStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

Scribe.test("fromBytes carries the bytes it was given and nothing else", async () => {
  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);

  expect(await ByteStream.fromBytes(bytes).toBytes(), equals(bytes));
});

Scribe.test("toBytes joins the chunks in the order they arrived", async () => {
  expect(await streamOf("ab", "cd", "ef").bytesToString(), equals("abcdef"));
});

Scribe.test("an empty stream collects to an empty buffer", async () => {
  expect(await streamOf().toBytes(), equals(new Uint8Array(0)));
});

Scribe.test("a character split across two chunks is decoded once the whole stream is in", async () => {
  const split = new ByteStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3]));
        controller.enqueue(new Uint8Array([0xa9]));
        controller.close();
      },
    }),
  );

  expect(await split.bytesToString(), equals("é"));
});

Scribe.test("bytesToString decodes utf-8 unless told otherwise", async () => {
  const latin = ByteStream.fromBytes(new Uint8Array([0xe9]));

  expect(await latin.bytesToString("latin1"), equals("é"));
});

Scribe.test("the underlying stream is handed back rather than wrapped away", async () => {
  const underlying = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });
  const wrapped = new ByteStream(underlying);

  expect(wrapped.stream === underlying, isTrue);
  expect((await wrapped.stream.getReader().read()).value, equals(new Uint8Array([1])));
});
