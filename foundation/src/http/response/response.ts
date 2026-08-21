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

import { ByteStream } from "../byte_stream.ts";
import { ClientException } from "../exception.ts";
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

  /**
   * The body, read as JSON.
   *
   * Every caller of this package decodes a JSON body, and half of them also branch on the
   * status, so this sits on the response rather than on the client: `readJson` would have to
   * refuse a 404 that most of them want to read.
   *
   * @throws {ClientException} When the body is not JSON. A payload that cannot be parsed is
   * an exchange that did not deliver what it announced, not a value the caller can inspect.
   */
  json<T>(): T {
    try {
      return JSON.parse(this.body) as T;
    } catch (cause) {
      throw new ClientException(
        `Answer from ${this.request?.url ?? "the server"} is not JSON.`,
        this.request?.url ?? null,
        { cause },
      );
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
    const found = /charset=([^;\s]+)/i.exec(
      this.headers.get("content-type") ?? "",
    );
    return found?.[1] ?? "utf-8";
  }
}

export { ByteStream };
