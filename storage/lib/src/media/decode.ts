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

import decodeWebp from "@jsquash/webp/decode";
import { decode as decodePng } from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";
import { type RgbaImage, toRgba } from "./rgba.ts";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes: Uint8Array, magic: readonly number[], at = 0): boolean {
  return magic.every((byte, i) => bytes[at + i] === byte);
}

const DECODERS: ReadonlyArray<{
  readonly matches: (bytes: Uint8Array) => boolean;
  readonly decode: (bytes: Uint8Array) => RgbaImage | Promise<RgbaImage>;
}> = [
  {
    matches: (bytes) => startsWith(bytes, PNG_MAGIC),
    decode: (bytes) => {
      const png = decodePng(bytes);
      return {
        width: png.width,
        height: png.height,
        data: toRgba(png.data, png.width, png.height, png.channels, png.depth),
      };
    },
  },
  {
    matches: (bytes) => startsWith(bytes, JPEG_MAGIC),
    decode: (bytes) => {
      const jpeg = decodeJpeg(bytes, { useTArray: true });
      return {
        width: jpeg.width,
        height: jpeg.height,
        data: new Uint8ClampedArray(jpeg.data.buffer, jpeg.data.byteOffset, jpeg.data.length),
      };
    },
  },
  {
    matches: (bytes) => startsWith(bytes, RIFF_MAGIC) && startsWith(bytes, WEBP_MAGIC, 8),
    decode: async (bytes) => {
      const webp = await decodeWebp(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
      return {
        width: webp.width,
        height: webp.height,
        data: webp.data as Uint8ClampedArray<ArrayBuffer>,
      };
    },
  },
];

export async function decodeImage(bytes: Uint8Array): Promise<RgbaImage | null> {
  const decoder = DECODERS.find((candidate) => candidate.matches(bytes));
  if (!decoder) {
    console.error("[media] unsupported image format, cannot decode.");
    return null;
  }

  try {
    return await decoder.decode(bytes);
  } catch (error) {
    console.error("[media] image decoding failed:", error);
    return null;
  }
}
