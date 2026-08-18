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

import { BaseClient } from "@scribe/foundation/src/http/base_client.ts";
import { ByteStream } from "@scribe/foundation/src/http/byte_stream.ts";
import type { BaseRequest } from "@scribe/foundation/src/http/request/base_request.ts";
import { StreamedResponse } from "@scribe/foundation/src/http/response/streamed_response.ts";

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
