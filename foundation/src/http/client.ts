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

import type { BaseRequest } from "./request/base_request.ts";
import type { Response } from "./response/response.ts";
import type { StreamedResponse } from "./response/streamed_response.ts";

/** What a body may be given as on a convenience method. */
export type RequestBody =
  | string
  | Uint8Array
  | Record<string, string>
  | null;

/** The options every convenience method takes. */
export interface RequestOptions {
  readonly headers?: HeadersInit;
  readonly body?: RequestBody;
  /** How the body is encoded, and how the answer is decoded. Utf-8 unless said otherwise. */
  readonly encoding?: string;
}

/**
 * Something that can send a request and keep its connections between calls.
 *
 * The interface exists so that a caller can be handed any of them without knowing which: the
 * real one, one that retries, one that logs, one a test wrote. Only {@link send} is primitive
 * — every other method is derivable from it, and {@link BaseClient} derives them once so that
 * an implementation never has to.
 *
 * A client holding connections has to be closed when it is done, or the process keeps them.
 */
export interface Client {
  /** Sends a request and answers as soon as the headers have arrived. */
  send(request: BaseRequest): Promise<StreamedResponse>;

  head(url: URL | string, options?: RequestOptions): Promise<Response>;
  get(url: URL | string, options?: RequestOptions): Promise<Response>;
  post(url: URL | string, options?: RequestOptions): Promise<Response>;
  put(url: URL | string, options?: RequestOptions): Promise<Response>;
  patch(url: URL | string, options?: RequestOptions): Promise<Response>;
  delete(url: URL | string, options?: RequestOptions): Promise<Response>;

  /** Gets `url` and answers its body as text, throwing on any status but a 2xx. */
  read(url: URL | string, options?: RequestOptions): Promise<string>;

  /** Gets `url` and answers its body as bytes, throwing on any status but a 2xx. */
  readBytes(url: URL | string, options?: RequestOptions): Promise<Uint8Array>;

  /** Releases whatever this client is holding. Sending afterwards throws. */
  close(): void;
}
