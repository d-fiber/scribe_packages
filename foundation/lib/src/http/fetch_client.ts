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

import {
  BaseClient,
  type BaseRequest,
  ByteStream,
  ClientException,
  StreamedResponse,
} from "@scribe/alchemy/http";

/**
 * The client that actually goes on the network, over the platform's `fetch`.
 *
 * It is the only file of this package that knows a network exists. Everything else works
 * against {@link Client}, which is what lets a test, a retry or a log take its place without
 * any of them re-deriving the eight convenience methods.
 */
export class FetchClient extends BaseClient {
  #closed = false;

  /**
   * Sends `request` over the platform's `fetch` and hands the answer back as a stream.
   *
   * @remarks
   * A body of zero bytes is left out rather than drained, because draining one costs a turn of
   * the event loop and that turn is observable by a caller that sends without awaiting.
   * Everything that can go wrong before a status arrives as a different type, and all of them
   * leave here as one {@link ClientException}.
   */
  override async send(request: BaseRequest): Promise<StreamedResponse> {
    if (this.#closed) {
      throw new ClientException(
        "HTTP request failed. Client is already closed.",
        request.url,
      );
    }

    const body = request.finalize();
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    if (request.contentLength !== null && hasBody) {
      request.headers.set("content-length", String(request.contentLength));
    }

    const carriesBytes = hasBody && request.contentLength !== 0;
    const payload: BodyInit | undefined = carriesBytes
      ? (await body.toBytes()) as BodyInit
      : undefined;

    const timeoutMs = request.timeoutMs;

    let answered: globalThis.Response;
    try {
      answered = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: payload,
        redirect: request.redirect,
        signal: timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new ClientException(
        `HTTP request failed. ${_describe(cause, timeoutMs)}`,
        request.url,
        { cause },
      );
    }

    const length = answered.headers.get("content-length");

    return new StreamedResponse(
      new ByteStream(
        answered.body ?? ByteStream.fromBytes(new Uint8Array(0)).stream,
      ),
      answered.status,
      {
        contentLength: length === null ? null : Number(length),
        request,
        headers: answered.headers,
        reasonPhrase: answered.statusText === "" ? null : answered.statusText,
        isRedirect: answered.redirected,
        persistentConnection: request.persistentConnection,
      },
    );
  }

  /**
   * Marks this client as done.
   *
   * The platform pools connections for the whole process rather than per client, so there is
   * nothing to hand back. What this does is refuse a later send, which is the part of the
   * contract a caller can actually rely on.
   */
  override close(): void {
    this.#closed = true;
  }
}

/**
 * Says why an exchange never produced a status, in a sentence a reader can act on.
 *
 * A signal that fires arrives as a `DOMException` whose message says only that a signal timed
 * out, which leaves the reader guessing which limit was reached. The number is the whole point
 * of the report.
 */
function _describe(cause: unknown, timeoutMs: number | null): string {
  if (
    timeoutMs !== null && cause instanceof DOMException &&
    cause.name === "TimeoutError"
  ) {
    return `Timed out after ${timeoutMs} ms.`;
  }
  return cause instanceof Error ? cause.message : String(cause);
}
