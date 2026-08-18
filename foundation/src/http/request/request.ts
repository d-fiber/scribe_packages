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
