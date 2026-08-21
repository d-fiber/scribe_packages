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
import type { Client } from "../client.ts";
import type { StreamedResponse } from "../response/streamed_response.ts";

/**
 * What every request has, whatever carries its body.
 *
 * A request is **sealed by its first send**: `finalize` hands the body over once and refuses
 * afterwards, and the fields stop accepting writes. Without that, a request reused after a
 * redirect or a retry would send a stream somebody has already drained.
 */
export abstract class BaseRequest {
  /** The method, upper-cased. */
  readonly method: string;

  /** Where the request goes. */
  readonly url: URL;

  readonly #headers = new Headers();

  #finalized = false;
  #followRedirects = true;
  #maxRedirects = 5;
  #persistentConnection = true;
  #timeoutMs: number | null = null;

  constructor(method: string, url: URL | string) {
    this.method = method.toUpperCase();
    this.url = typeof url === "string" ? new URL(url) : url;
  }

  /**
   * The headers this request carries.
   *
   * Unlike the settable fields, this one stays open after a send: it is the collection itself
   * that is handed out, and a subclass drawing a boundary at finalize writes into it.
   */
  get headers(): Headers {
    return this.#headers;
  }

  /** How many bytes the body holds, or `null` when that is not known ahead of time. */
  abstract get contentLength(): number | null;

  /** Whether the client should follow a redirect on this request's behalf. */
  get followRedirects(): boolean {
    return this.#followRedirects;
  }
  set followRedirects(value: boolean) {
    this.#checkFinalized();
    this.#followRedirects = value;
  }

  /** How many redirects are followed before the client gives up. */
  get maxRedirects(): number {
    return this.#maxRedirects;
  }
  set maxRedirects(value: number) {
    this.#checkFinalized();
    this.#maxRedirects = value;
  }

  /** Whether the connection is kept open for a later request. */
  get persistentConnection(): boolean {
    return this.#persistentConnection;
  }
  set persistentConnection(value: boolean) {
    this.#checkFinalized();
    this.#persistentConnection = value;
  }

  /**
   * How long the client waits for this exchange, in milliseconds, or `null` for no limit.
   *
   * It lives on the request rather than on the call so that it survives into {@link send},
   * which is the only method a client has to implement and the only place a limit can be
   * applied.
   */
  get timeoutMs(): number | null {
    return this.#timeoutMs;
  }
  set timeoutMs(value: number | null) {
    this.#checkFinalized();
    this.#timeoutMs = value;
  }

  /** Whether this request has already been handed over. */
  get finalized(): boolean {
    return this.#finalized;
  }

  /**
   * Seals the request and answers its body.
   *
   * A subclass overrides this to produce its own body, and calls `super.finalize()` first so
   * the seal is set in one place.
   */
  finalize(): ByteStream {
    this.#checkFinalized();
    this.#finalized = true;
    return ByteStream.fromBytes(new Uint8Array(0));
  }

  /** Sends this request through `client`, and answers before the body has arrived. */
  send(client: Client): Promise<StreamedResponse> {
    return client.send(this);
  }

  /** Refuses a change to a request that has already been sent. */
  protected checkFinalized(): void {
    this.#checkFinalized();
  }

  #checkFinalized(): void {
    if (!this.#finalized) return;

    throw new Error("Can't modify a finalized Request.");
  }

  toString(): string {
    return `${this.method} ${this.url}`;
  }
}
