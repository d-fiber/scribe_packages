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

import { BaseClient } from "@scribe/foundation/lib/src/http/base_client.ts";
import { ByteStream } from "@scribe/foundation/lib/src/http/byte_stream.ts";
import type { BaseRequest } from "@scribe/foundation/lib/src/http/request/base_request.ts";
import { StreamedResponse } from "@scribe/foundation/lib/src/http/response/streamed_response.ts";

/** What a {@link RecordingClient} answers, and how many times it has been closed. */
export interface RecordedAnswer {
  readonly status?: number;
  readonly body?: string;
  readonly headers?: HeadersInit;
}

/**
 * A client that answers from memory and keeps every request it was handed.
 *
 * It implements `send` and nothing else, so a test that exercises the convenience methods, the
 * one-off functions or `runWithClient` exercises the real derivation rather than a copy of it.
 */
export class RecordingClient extends BaseClient {
  /** Every request this client was handed, in order. */
  readonly seen: BaseRequest[] = [];

  /** How many times this client has been closed. */
  closed = 0;

  readonly #answer: RecordedAnswer;

  constructor(answer: RecordedAnswer = {}) {
    super();
    this.#answer = answer;
  }

  /** The one request this client was handed, when a test expects exactly one. */
  get only(): BaseRequest {
    if (this.seen.length !== 1) {
      throw new Error(`Expected one request, got ${this.seen.length}.`);
    }
    return this.seen[0];
  }

  override send(request: BaseRequest): Promise<StreamedResponse> {
    this.seen.push(request);

    return Promise.resolve(
      new StreamedResponse(
        ByteStream.fromBytes(new TextEncoder().encode(this.#answer.body ?? "ok")),
        this.#answer.status ?? 200,
        { request, headers: new Headers(this.#answer.headers) },
      ),
    );
  }

  override close(): void {
    this.closed++;
  }
}
