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

import { ByteStream } from "../byte_stream.ts";

/** One file inside a {@link MultipartRequest}. */
export class MultipartFile {
  /** The form field this file is sent under. */
  readonly field: string;

  /** How many bytes the file holds. */
  readonly length: number;

  /** The name the server is told, or `null` to send none. */
  readonly filename: string | null;

  /** The media type the server is told. */
  readonly contentType: string;

  readonly #stream: ByteStream;
  #finalized = false;

  constructor(
    field: string,
    stream: ByteStream,
    length: number,
    options: { filename?: string | null; contentType?: string } = {},
  ) {
    this.field = field;
    this.length = length;
    this.filename = options.filename ?? null;
    this.contentType = options.contentType ?? "application/octet-stream";
    this.#stream = stream;
  }

  /** A file made of bytes already in hand. */
  static fromBytes(
    field: string,
    bytes: Uint8Array,
    options: { filename?: string | null; contentType?: string } = {},
  ): MultipartFile {
    return new MultipartFile(field, ByteStream.fromBytes(bytes), bytes.length, options);
  }

  /** A file made of text, encoded utf-8. */
  static fromString(
    field: string,
    value: string,
    options: { filename?: string | null; contentType?: string } = {},
  ): MultipartFile {
    const bytes = new TextEncoder().encode(value);
    return MultipartFile.fromBytes(field, bytes, {
      contentType: "text/plain; charset=utf-8",
      ...options,
    });
  }

  /** Hands the bytes over, once. */
  finalize(): ByteStream {
    if (this.#finalized) {
      throw new Error("Can't finalize a finalized MultipartFile.");
    }
    this.#finalized = true;
    return this.#stream;
  }
}
