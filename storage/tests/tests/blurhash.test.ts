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
import "@scribe/testing/runner.ts";
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import { installStorageTestSettings } from "../testing/settings.ts";

installStorageTestSettings();
import encodeWebp from "@jsquash/webp/encode";
import { encode as encodePng } from "fast-png";
import { encode as encodeJpeg } from "jpeg-js";
import { blurhash } from "../../lib/src/media/blurhash.ts";
import { decodeImage } from "../../lib/src/media/decode.ts";
import { downsample } from "../../lib/src/media/rgba.ts";

function gradient(w: number, h: number): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = (x * 4) & 255;
      rgba[i + 1] = (y * 4) & 255;
      rgba[i + 2] = 128;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

const png = (w = 64, h = 64): Uint8Array<ArrayBuffer> =>
  new Uint8Array(encodePng({ width: w, height: h, data: gradient(w, h), channels: 4, depth: 8 }));
const jpeg = (w = 64, h = 64): Uint8Array<ArrayBuffer> =>
  new Uint8Array(encodeJpeg({ width: w, height: h, data: gradient(w, h) }, 90).data);
const webp = async (w = 64, h = 64): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    await encodeWebp({
      width: w,
      height: h,
      data: new Uint8ClampedArray(gradient(w, h)),
      colorSpace: "srgb",
      pixelFormat: "rgba-unorm8",
    }),
  );

Scribe.test("blurhash: a PNG yields a hash, never null", async () => {
  const hash = await blurhash.fromImage(new File([png()], "a.png"));

  expect(hash, isNot(equals(null)));
  expect(typeof hash, equals("string"));
  expect(hash!.length > 6, equals(true));
});

Scribe.test("blurhash: a JPEG yields a hash too", async () => {
  const hash = await blurhash.fromImage(new File([jpeg()], "a.jpg"));
  expect(hash, isNot(equals(null)));
});

Scribe.test("blurhash: a WebP yields a hash, it is no longer dropped as unsupported", async () => {
  const hash = await blurhash.fromImage(new File([await webp()], "a.webp"));

  expect(hash, isNot(equals(null)));
  expect(typeof hash, equals("string"));
});

Scribe.test("blurhash: the same picture yields the same hash whatever the container", async () => {
  const fromPng = await blurhash.fromImage(new File([png()], "a.png"));
  const fromJpeg = await blurhash.fromImage(new File([jpeg()], "a.jpg"));

  expect(fromPng!.slice(0, 4), equals(fromJpeg!.slice(0, 4)));
});

Scribe.test("blurhash: two different pictures never share a hash", async () => {
  const flat = new Uint8Array(64 * 64 * 4).fill(255);
  const plain = new Uint8Array(
    encodePng({ width: 64, height: 64, data: flat, channels: 4, depth: 8 }),
  );

  expect(
    await blurhash.fromImage(new File([png()], "a.png")),
    isNot(equals(await blurhash.fromImage(new File([plain], "b.png")))),
  );
});

Scribe.test("blurhash: bytes that are not an image yield null, never a throw", async () => {
  const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(await blurhash.fromImage(new File([garbage], "a.png")), equals(null));
});

Scribe.test("blurhash: a truncated PNG yields null, never a throw", async () => {
  const truncated = png().slice(0, 20);
  expect(await blurhash.fromImage(new File([truncated], "a.png")), equals(null));
});

Scribe.test("decode: the format is read from the bytes, not the file name", async () => {
  expect(await decodeImage(png()), isNot(equals(null)));
  expect(await decodeImage(jpeg()), isNot(equals(null)));
  expect(await decodeImage(await webp()), isNot(equals(null)));
  expect(await decodeImage(new Uint8Array([0, 1, 2, 3])), equals(null));
});

Scribe.test("decode: a greyscale PNG is expanded to RGBA", async () => {
  const grey = new Uint8Array(4 * 4).fill(120);
  const encoded = new Uint8Array(
    encodePng({ width: 4, height: 4, data: grey, channels: 1, depth: 8 }),
  );

  const decoded = (await decodeImage(encoded))!;

  expect(decoded.data.length, equals(4 * 4 * 4));
  expect([...decoded.data.slice(0, 4)], equals([120, 120, 120, 255]));
});

Scribe.test("downsample: a big picture is reduced, a small one is left alone", async () => {
  const big = (await decodeImage(png(128, 64)))!;
  const small = downsample(big, 32);

  expect(small.width, equals(32));
  expect(small.height, equals(16));
  expect(small.data.length, equals(32 * 16 * 4));

  const tiny = (await decodeImage(png(8, 8)))!;
  expect(downsample(tiny, 32), equals(tiny));
});

Scribe.test("blurhash: no network is ever needed", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("blurhash reached for the network");
  };

  try {
    expect(await blurhash.fromImage(new File([png()], "a.png")), isNot(equals(null)));
  } finally {
    globalThis.fetch = realFetch;
  }
});
