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

import type { BaseRequest } from "../request/base_request.ts";

/** What every response has, whatever carries its body. */
export abstract class BaseResponse {
  /** The status the server answered. */
  readonly statusCode: number;

  /** How many bytes the body holds, or `null` when the server did not say. */
  readonly contentLength: number | null;

  /** The request this answers, when the client knows it. */
  readonly request: BaseRequest | null;

  /** The headers the server answered, lower-cased by the platform. */
  readonly headers: Headers;

  /** The text beside the status, when the server sent one. */
  readonly reasonPhrase: string | null;

  /**
   * Whether the status is one the server used to say it worked.
   *
   * It is the same 2xx window `read` and `readBytes` refuse outside of, named once so that a
   * caller branching on the status does not re-derive it.
   */
  get ok(): boolean {
    return this.statusCode >= 200 && this.statusCode < 300;
  }

  /** Whether the server answered with a redirect. */
  readonly isRedirect: boolean;

  /** Whether the connection was kept open. */
  readonly persistentConnection: boolean;

  constructor(
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
    if (statusCode < 100) {
      throw new Error(`Invalid status code ${statusCode}.`);
    }

    this.statusCode = statusCode;
    this.contentLength = options.contentLength ?? null;
    this.request = options.request ?? null;
    this.headers = options.headers ?? new Headers();
    this.reasonPhrase = options.reasonPhrase ?? null;
    this.isRedirect = options.isRedirect ?? false;
    this.persistentConnection = options.persistentConnection ?? true;
  }
}
