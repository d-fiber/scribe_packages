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
// LICENSE file, the LICENSE file governs.

import "@scribe/core/testing/settings.ts";
import { assertEquals } from "@std/assert";
import {
  extractPosterFrame,
  FRAME_SIZE,
  pickPosterFrame,
} from "@scribe/storage/src/media/video_frame.ts";

const FRAME_BYTES = FRAME_SIZE * FRAME_SIZE * 4;

function frame(grey: number): Uint8Array {
  const pixels = new Uint8Array(FRAME_BYTES);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = grey;
    pixels[i + 1] = grey;
    pixels[i + 2] = grey;
    pixels[i + 3] = 255;
  }
  return pixels;
}

function stream(...frames: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(frames.length * FRAME_BYTES);
  frames.forEach((one, index) => out.set(one, index * FRAME_BYTES));
  return out;
}

Deno.test("poster frame: a lit opening frame is kept as is", () => {
  const picked = pickPosterFrame(stream(frame(200), frame(10), frame(255)));

  assertEquals(picked![0], 200);
});

Deno.test("poster frame: an opening fade to black is skipped", () => {
  const picked = pickPosterFrame(
    stream(frame(0), frame(0), frame(180), frame(90)),
  );

  assertEquals(picked![0], 180);
});

Deno.test("poster frame: a video that is dark throughout still yields its lightest frame", () => {
  const picked = pickPosterFrame(stream(frame(0), frame(4), frame(2)));

  assertEquals(picked![0], 4);
});

Deno.test("poster frame: an empty stream yields null, never a throw", () => {
  assertEquals(pickPosterFrame(new Uint8Array(0)), null);
});

Deno.test("poster frame: a truncated frame is not decoded as a whole one", () => {
  assertEquals(pickPosterFrame(new Uint8Array(FRAME_BYTES - 1)), null);
});

Deno.test("video frame: a runtime that cannot spawn ffmpeg yields null, never a failed upload", async () => {
  const runnable = await Deno.permissions.query({
    name: "run",
    command: "ffmpeg",
  });
  if (runnable.state === "granted") return;

  const clip = new File([new Uint8Array(64)], "clip.mp4", {
    type: "video/mp4",
  });

  assertEquals(await extractPosterFrame(clip), null);
});
