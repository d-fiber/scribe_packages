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
