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

export const BINARY_MIME = "application/octet-stream";

const INLINE_SAFE_PREFIXES = ["image/", "video/", "audio/"] as const;

const INLINE_SAFE_TYPES: ReadonlySet<string> = new Set(["application/pdf"]);

const SVG_TYPES: ReadonlySet<string> = new Set(["image/svg+xml", "image/svg"]);

/**
 * The type each extension is served as.
 *
 * @remarks
 * It is a table this package carries rather than a lookup from a library, because the only types
 * {@link mimeTypeOf} ever hands back are the ones a browser shows inline: image, video, audio and
 * PDF. A full media-type database would be a thousand entries thrown away to reach the forty that
 * matter, and a dependency on the runtime's standard library for it. What is not here resolves to
 * {@link BINARY_MIME}, which is the answer for everything outside this set anyway.
 */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  apng: "image/apng",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  ico: "image/vnd.microsoft.icon",
  jfif: "image/jpeg",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  ogv: "video/ogg",
  webm: "video/webm",
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  pdf: "application/pdf",
};

function canServeInline(type: string): boolean {
  if (SVG_TYPES.has(type)) return false;
  if (INLINE_SAFE_TYPES.has(type)) return true;
  return INLINE_SAFE_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export function mimeTypeOf(extension: string | null): string {
  if (!extension) return BINARY_MIME;

  const resolved = EXTENSION_TYPES[extension.toLowerCase()];
  if (!resolved) return BINARY_MIME;

  return canServeInline(resolved) ? resolved : BINARY_MIME;
}
