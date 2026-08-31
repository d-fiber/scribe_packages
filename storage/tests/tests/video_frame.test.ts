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

import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, MemoryCommands, MemoryFileSystemDriver, Scribe } from "@scribe/alchemy/test";
import { Commands, FileSystems } from "@scribe/alchemy";
import type { CommandAnswer } from "@scribe/alchemy/test";
import { installStorageTestSettings } from "../testing/settings.ts";

installStorageTestSettings();
import { extractPosterFrame, FRAME_SIZE, pickPosterFrame } from "../../lib/src/media/video_frame.ts";

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

Scribe.test("poster frame: a lit opening frame is kept as is", () => {
  const picked = pickPosterFrame(stream(frame(200), frame(10), frame(255)));

  expect(picked![0], equals(200));
});

Scribe.test("poster frame: an opening fade to black is skipped", () => {
  const picked = pickPosterFrame(
    stream(frame(0), frame(0), frame(180), frame(90)),
  );

  expect(picked![0], equals(180));
});

Scribe.test("poster frame: a video that is dark throughout still yields its lightest frame", () => {
  const picked = pickPosterFrame(stream(frame(0), frame(4), frame(2)));

  expect(picked![0], equals(4));
});

Scribe.test("poster frame: an empty stream yields null, never a throw", () => {
  expect(pickPosterFrame(new Uint8Array(0)), equals(null));
});

Scribe.test("poster frame: a truncated frame is not decoded as a whole one", () => {
  expect(pickPosterFrame(new Uint8Array(FRAME_BYTES - 1)), equals(null));
});

async function withPoster<T>(answer: CommandAnswer, body: () => Promise<T>): Promise<T> {
  const heldCommands = Commands.configured ? Commands.get() : null;
  const heldFiles = FileSystems.configured ? FileSystems.get() : null;

  Commands.use(new MemoryCommands(answer));
  FileSystems.use(new MemoryFileSystemDriver());

  try {
    return await body();
  } finally {
    if (heldCommands === null) Commands.clear();
    else Commands.use(heldCommands);
    if (heldFiles === null) FileSystems.clear();
    else FileSystems.use(heldFiles);
  }
}

Scribe.test("video frame: ffmpeg failing on both passes yields null, never a failed upload", async () => {
  const clip = new File([new Uint8Array(64)], "clip.mp4", { type: "video/mp4" });

  const poster = await withPoster(
    { code: 1, stderr: new TextEncoder().encode("Invalid data found when processing input") },
    () => extractPosterFrame(clip),
  );

  expect(poster, equals(null));
});

Scribe.test("video frame: ffmpeg that cannot start yields null, never a throw", async () => {
  const clip = new File([new Uint8Array(64)], "clip.mp4", { type: "video/mp4" });

  const poster = await withPoster(
    () => {
      throw new Error("ffmpeg: command not found");
    },
    () => extractPosterFrame(clip),
  );

  expect(poster, equals(null));
});

Scribe.test("video frame: a lit frame from ffmpeg becomes the poster", async () => {
  const clip = new File([new Uint8Array(64)], "clip.mp4", { type: "video/mp4" });

  const poster = await withPoster(
    { code: 0, stdout: frame(200) },
    () => extractPosterFrame(clip),
  );

  expect(poster?.width, equals(FRAME_SIZE));
  expect(poster?.data[0], equals(200));
});
