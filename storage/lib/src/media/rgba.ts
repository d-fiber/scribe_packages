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

/** A decoded raster image, held as raw RGBA pixels rather than an encoded file. */
export interface RgbaImage {
  /** The image's width, in pixels. */
  readonly width: number;

  /** The image's height, in pixels. */
  readonly height: number;

  /** The pixels, four bytes each in row-major order: red, green, blue, then alpha. */
  readonly data: Uint8ClampedArray;
}

/**
 * `source`'s pixels, whatever channel layout a decoder produced, folded onto four 8-bit RGBA
 * bytes per pixel.
 *
 * @remarks
 * A decoded image can carry one channel, grey, two, grey and alpha, three, RGB, or four, RGBA,
 * and each byte can be 8 or 16 bits deep. Normalizing every layout to RGBA here, once, is what
 * lets the rest of this package treat a decoded image the same regardless of which format
 * produced it. A missing alpha channel becomes fully opaque, `255`, and a 16-bit channel is
 * folded down to 8 bits by dropping its low byte, since nothing downstream needs more precision
 * than a thumbnail or a placeholder can show.
 */
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
    out[to + 3] = channels === 2 ? source[from + 1] >> shift : channels === 4 ? source[from + 3] >> shift : 255;
  }

  return out;
}

/**
 * `image`, shrunk with its aspect ratio kept so neither side exceeds `maxSize`, or `image`
 * itself, unchanged, when it already fits.
 *
 * @remarks
 * Samples the nearest source pixel for each output pixel rather than averaging or interpolating,
 * because the caller, blurhash encoding, only needs a small, roughly representative image to hash,
 * not a faithful resize, and nearest-neighbor sampling is the cheapest way to get there.
 */
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
