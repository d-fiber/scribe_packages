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

interface Signature {
  readonly matches: (header: Uint8Array) => boolean;
}

function startsWith(header: Uint8Array, magic: readonly number[], at = 0): boolean {
  return magic.every((byte, i) => header[at + i] === byte);
}

function startsWithAscii(header: Uint8Array, text: string, at = 0): boolean {
  return startsWith(header, [...text].map((char) => char.charCodeAt(0)), at);
}

const PNG: Signature = { matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
const JPEG: Signature = { matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) };
const GIF: Signature = { matches: (h) => startsWithAscii(h, "GIF87a") || startsWithAscii(h, "GIF89a") };
const WEBP: Signature = { matches: (h) => startsWithAscii(h, "RIFF") && startsWithAscii(h, "WEBP", 8) };
const BMP: Signature = { matches: (h) => startsWithAscii(h, "BM") };
const ICO: Signature = { matches: (h) => startsWith(h, [0x00, 0x00, 0x01, 0x00]) };
const TIFF: Signature = {
  matches: (h) => startsWith(h, [0x49, 0x49, 0x2a, 0x00]) || startsWith(h, [0x4d, 0x4d, 0x00, 0x2a]),
};
const PDF: Signature = { matches: (h) => startsWithAscii(h, "%PDF-") };

/**
 * The signature this package knows how to check, by extension.
 *
 * @remarks
 * Only extensions with a fixed byte header live here. `apng` shares its signature with `png`,
 * since telling the two apart needs parsing chunks past the header rather than reading one.
 * Everything absent from this table, SVG, AVIF, HEIC/HEIF, and every video and audio extension
 * `mime.ts` resolves, has no fixed header cheap to check, and stays declared as its extension
 * says, exactly as before this table existed.
 */
const SIGNATURES: Readonly<Record<string, Signature>> = {
  png: PNG,
  apng: PNG,
  jpg: JPEG,
  jpeg: JPEG,
  jfif: JPEG,
  gif: GIF,
  webp: WEBP,
  bmp: BMP,
  ico: ICO,
  tif: TIFF,
  tiff: TIFF,
  pdf: PDF,
};

/** How many leading bytes {@link contentMatchesExtension} needs, whichever signature it checks. */
export const SNIFF_PREFIX_BYTES = 16;

/**
 * Whether `header` opens with the byte signature `extension` implies.
 *
 * Null when this package carries no signature for `extension`, which means its content is
 * trusted on the extension alone, the same trust every extension carried before this check
 * existed.
 */
export function contentMatchesExtension(extension: string, header: Uint8Array): boolean | null {
  const signature = SIGNATURES[extension];
  return signature === undefined ? null : signature.matches(header);
}
