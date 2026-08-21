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
import { BaseRequest } from "./base_request.ts";

const _FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

/**
 * A request whose body is known before it is sent.
 *
 * The body can be given three ways, and they are three views of the same bytes: {@link bodyBytes}
 * is the raw one, {@link body} decodes them as text, and {@link bodyFields} reads them as a form.
 * Setting any of the three replaces the other two.
 */
export class Request extends BaseRequest {
  #bodyBytes: Uint8Array = new Uint8Array(0);
  #encoding = "utf-8";

  constructor(method: string, url: URL | string) {
    super(method, url);
  }

  /** How the body is decoded to and from text. */
  get encoding(): string {
    return this.#encoding;
  }
  set encoding(value: string) {
    this.checkFinalized();
    this.#encoding = value;
  }

  override get contentLength(): number {
    return this.#bodyBytes.length;
  }

  /** The body, as bytes. */
  get bodyBytes(): Uint8Array {
    return this.#bodyBytes;
  }
  set bodyBytes(value: Uint8Array) {
    this.checkFinalized();
    this.#bodyBytes = value;
  }

  /** The body, as text in this request's {@link encoding}. */
  get body(): string {
    return new TextDecoder(this.#encoding).decode(this.#bodyBytes);
  }
  set body(value: string) {
    this.checkFinalized();
    this.#bodyBytes = new TextEncoder().encode(value);
    if (!this.headers.has("content-type")) {
      this.headers.set("content-type", `text/plain; charset=${this.#encoding}`);
    }
  }

  /**
   * The body, read as a url-encoded form.
   *
   * Reading it on a request whose content type says otherwise throws: the fields would be
   * whatever the parser made of bytes that were never a form.
   */
  get bodyFields(): Record<string, string> {
    const type = this.headers.get("content-type") ?? "";
    if (!type.startsWith(_FORM_CONTENT_TYPE)) {
      throw new Error("Can't access the body fields of a Request without content-type \"" + _FORM_CONTENT_TYPE + '".');
    }

    const fields: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(this.body)) fields[key] = value;
    return fields;
  }
  set bodyFields(value: Record<string, string>) {
    this.checkFinalized();
    this.headers.set("content-type", `${_FORM_CONTENT_TYPE}; charset=${this.#encoding}`);
    this.#bodyBytes = new TextEncoder().encode(
      new URLSearchParams(value).toString(),
    );
  }

  override finalize(): ByteStream {
    super.finalize();
    return ByteStream.fromBytes(this.#bodyBytes);
  }
}
