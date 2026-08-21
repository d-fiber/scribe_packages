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

import type { BaseRequest } from "./request/base_request.ts";
import type { Response } from "./response/response.ts";
import type { StreamedResponse } from "./response/streamed_response.ts";

/** What a body may be given as on a convenience method. */
export type RequestBody = string | Uint8Array | Record<string, string> | null;

/** The options every convenience method takes. */
export interface RequestOptions {
  /**
   * Headers to send with the request.
   *
   * A `content-type` set here is never overwritten by the one {@link body} would have
   * implied, which is how a caller sends JSON.
   */
  readonly headers?: HeadersInit;

  /**
   * What to send as the body, whose shape decides the content-type.
   *
   * A record goes out as `application/x-www-form-urlencoded`, a string as `text/plain`, and
   * bytes as they are with no type announced. A verb that cannot carry a body drops it.
   */
  readonly body?: RequestBody;

  /**
   * How the body is encoded, and what charset its content-type announces. Utf-8 unless said
   * otherwise. It says nothing about the answer, which is decoded from the charset the server
   * announced.
   */
  readonly encoding?: string;

  /**
   * How long to wait for the whole exchange, in milliseconds. No limit unless said otherwise.
   *
   * A request that runs out of time fails with a {@link ClientException} like any other
   * exchange that never happened. The caller does not have to tell an abort apart from a
   * refused connection, because there is nothing different to do about either.
   */
  readonly timeout?: number;
}

/**
 * Something that can send a request and keep its connections between calls.
 *
 * The interface exists so that a caller can be handed any of them without knowing which: the
 * real one, one that retries, one that logs, one a test wrote. Only {@link send} is primitive
 * because every other method derives from it, and {@link BaseClient} derives them once so that
 * an implementation never has to.
 *
 * A client holding connections has to be closed when it is done, or the process keeps them.
 */
export interface Client {
  /** Sends a request and answers as soon as the headers have arrived. */
  send(request: BaseRequest): Promise<StreamedResponse>;

  /** Asks for the headers of `url` alone, sending no body and announcing no length. */
  head(url: URL | string, options?: RequestOptions): Promise<Response>;

  /** Gets `url` and answers once the body has been drained. */
  get(url: URL | string, options?: RequestOptions): Promise<Response>;

  /** Posts to `url` and answers once the body has been drained. */
  post(url: URL | string, options?: RequestOptions): Promise<Response>;

  /** Puts to `url` and answers once the body has been drained. */
  put(url: URL | string, options?: RequestOptions): Promise<Response>;

  /** Patches `url` and answers once the body has been drained. */
  patch(url: URL | string, options?: RequestOptions): Promise<Response>;

  /** Deletes `url` and answers once the body has been drained. */
  delete(url: URL | string, options?: RequestOptions): Promise<Response>;

  /** Gets `url` and answers its body as text, throwing on any status but a 2xx. */
  read(url: URL | string, options?: RequestOptions): Promise<string>;

  /** Gets `url` and answers its body as bytes, throwing on any status but a 2xx. */
  readBytes(url: URL | string, options?: RequestOptions): Promise<Uint8Array>;

  /** Releases whatever this client is holding. Sending afterwards throws. */
  close(): void;
}
