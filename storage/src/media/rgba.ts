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

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export function toRgba(
  source: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
  depth: number,
): Uint8ClampedArray {
  const shift = depth === 16 ? 8 : 0;
  const out = new Uint8ClampedArray(width * height * 4);

  for (let pixel = 0; pixel < width * height; pixel++) {
    const from = pixel * channels;
    const to = pixel * 4;
    const grey = channels < 3;

    out[to] = source[from] >> shift;
    out[to + 1] = (grey ? source[from] : source[from + 1]) >> shift;
    out[to + 2] = (grey ? source[from] : source[from + 2]) >> shift;
    out[to + 3] = channels === 2
      ? source[from + 1] >> shift
      : channels === 4
      ? source[from + 3] >> shift
      : 255;
  }

  return out;
}

export function downsample(image: RgbaImage, maxSize: number): RgbaImage {
  const { width, height } = image;
  if (width <= maxSize && height <= maxSize) return image;

  const scale = Math.min(maxSize / width, maxSize / height);
  const target = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };

  const out = new Uint8ClampedArray(target.width * target.height * 4);
  for (let y = 0; y < target.height; y++) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < target.width; x++) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale));
      const from = (sourceY * width + sourceX) * 4;
      const to = (y * target.width + x) * 4;
      out[to] = image.data[from];
      out[to + 1] = image.data[from + 1];
      out[to + 2] = image.data[from + 2];
      out[to + 3] = image.data[from + 3];
    }
  }

  return { width: target.width, height: target.height, data: out };
}
