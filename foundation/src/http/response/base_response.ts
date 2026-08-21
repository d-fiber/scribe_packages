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
