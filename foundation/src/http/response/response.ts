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
import type { BaseRequest } from "../request/base_request.ts";
import { BaseResponse } from "./base_response.ts";
import type { StreamedResponse } from "./streamed_response.ts";

/** A response whose body is entirely in hand. */
export class Response extends BaseResponse {
  readonly bodyBytes: Uint8Array;

  constructor(
    body: string | Uint8Array,
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
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;

    super(statusCode, { contentLength: bytes.length, ...options });
    this.bodyBytes = bytes;
  }

  /**
   * The body, decoded.
   *
   * The charset of `content-type` decides, falling back to utf-8. A charset the platform does
   * not know falls back too rather than throwing: a body that arrived is worth reading
   * imperfectly, and the bytes are still on {@link bodyBytes} for a caller who disagrees.
   */
  get body(): string {
    try {
      return new TextDecoder(this.#charset()).decode(this.bodyBytes);
    } catch {
      return new TextDecoder().decode(this.bodyBytes);
    }
  }

  /** Drains a {@link StreamedResponse} into a whole one. */
  static async fromStream(response: StreamedResponse): Promise<Response> {
    const bytes = await response.stream.toBytes();

    return new Response(bytes, response.statusCode, {
      request: response.request,
      headers: response.headers,
      reasonPhrase: response.reasonPhrase,
      isRedirect: response.isRedirect,
      persistentConnection: response.persistentConnection,
    });
  }

  #charset(): string {
    const found = /charset=([^;\s]+)/i.exec(this.headers.get("content-type") ?? "");
    return found?.[1] ?? "utf-8";
  }
}

export { ByteStream };
