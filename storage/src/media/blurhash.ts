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

import { encode } from "blurhash";
import { decodeImage } from "./decode.ts";
import { downsample, type RgbaImage } from "./rgba.ts";
import { extractPosterFrame } from "./video_frame.ts";

const COMPONENT_X = 4;
const COMPONENT_Y = 4;
const MAX_SIZE = 32;

function fromPixels(image: RgbaImage | null): string | null {
  if (image === null) return null;

  const small = downsample(image, MAX_SIZE);

  try {
    return encode(small.data, small.width, small.height, COMPONENT_X, COMPONENT_Y);
  } catch (error) {
    console.error("[blurhash] failed to compute:", error);
    return null;
  }
}

export const blurhash = {
  async fromImage(file: File): Promise<string | null> {
    return fromPixels(await decodeImage(new Uint8Array(await file.arrayBuffer())));
  },

  async fromVideo(file: File): Promise<string | null> {
    return fromPixels(await extractPosterFrame(file));
  },
};
