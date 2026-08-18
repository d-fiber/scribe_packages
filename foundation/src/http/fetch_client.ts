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

import { BaseClient } from "./base_client.ts";
import { ByteStream } from "./byte_stream.ts";
import { ClientException } from "./exception.ts";
import type { BaseRequest } from "./request/base_request.ts";
import { StreamedResponse } from "./response/streamed_response.ts";

/**
 * The client that actually goes on the network, over the platform's `fetch`.
 *
 * It is the only file of this package that knows a network exists. Everything else works
 * against {@link Client}, which is what lets a test, a retry or a log take its place without
 * any of them re-deriving the eight convenience methods.
 */
export class FetchClient extends BaseClient {
  #closed = false;

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

    // A `Uint8Array` is a `BufferSource`, so it is a body the platform accepts. Whether the
    // type system agrees depends on which lib resolves the buffer generic, and the answer
    // differs between a machine's global cache and the lockfile CI pins — the annotation is
    // what makes the two agree.
    const payload: BodyInit | undefined = hasBody ? (await body.toBytes()) as BodyInit : undefined;

    let answered: globalThis.Response;
    try {
      answered = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: payload,
        redirect: request.followRedirects ? "follow" : "manual",
      });
    } catch (cause) {
      // Every way the exchange can fail before a status — a refused connection, a name that
      // does not resolve, a timeout — arrives here as a different type. One is enough.
      throw new ClientException(
        `HTTP request failed. ${_describe(cause)}`,
        request.url,
        { cause },
      );
    }

    const length = answered.headers.get("content-length");

    return new StreamedResponse(
      new ByteStream(answered.body ?? ByteStream.fromBytes(new Uint8Array(0)).stream),
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
   * nothing to hand back — what this does is refuse a later send, which is the part of the
   * contract a caller can actually rely on.
   */
  override close(): void {
    this.#closed = true;
  }
}

function _describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
