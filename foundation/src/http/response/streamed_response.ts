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

import type { ByteStream } from "../byte_stream.ts";
import type { BaseRequest } from "../request/base_request.ts";
import { BaseResponse } from "./base_response.ts";

/**
 * A response whose body arrives after its headers.
 *
 * This is what a {@link Client} answers, because it is the shape that lets a caller start
 * reading a large body without holding all of it. {@link Response.fromStream} is the other
 * side of that choice, for callers who would rather have the whole thing.
 */
export class StreamedResponse extends BaseResponse {
  /** The body, still arriving. */
  readonly stream: ByteStream;

  constructor(
    stream: ByteStream,
    statusCode: number,
    options: {
      contentLength?: number | null;
      request?: BaseRequest | null;
      headers?: Headers;
      reasonPhrase?: string | null;
      isRedirect?: boolean;
      persistentConnection?: boolean;
    } = {},
  ) {
    super(statusCode, options);
    this.stream = stream;
  }
}
