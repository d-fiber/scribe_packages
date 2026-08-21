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

import type { Client, RequestBody, RequestOptions } from "./client.ts";
import { ClientException } from "./exception.ts";
import type { BaseRequest } from "./request/base_request.ts";
import { Request } from "./request/request.ts";
import { Response } from "./response/response.ts";
import type { StreamedResponse } from "./response/streamed_response.ts";

/**
 * Everything a {@link Client} does, derived from the one thing it has to implement.
 *
 * A subclass writes {@link send} and inherits the eight convenience methods, so the behaviour
 * every client shares is written once and cannot differ between two clients: how a body becomes
 * bytes, when a status is an error, how a stream becomes a whole response.
 */
export abstract class BaseClient implements Client {
  abstract send(request: BaseRequest): Promise<StreamedResponse>;

  head(url: URL | string, options: RequestOptions = {}): Promise<Response> {
    return this.#send("HEAD", url, options);
  }

  get(url: URL | string, options: RequestOptions = {}): Promise<Response> {
    return this.#send("GET", url, options);
  }

  post(url: URL | string, options: RequestOptions = {}): Promise<Response> {
    return this.#send("POST", url, options);
  }

  put(url: URL | string, options: RequestOptions = {}): Promise<Response> {
    return this.#send("PUT", url, options);
  }

  patch(url: URL | string, options: RequestOptions = {}): Promise<Response> {
    return this.#send("PATCH", url, options);
  }

  delete(url: URL | string, options: RequestOptions = {}): Promise<Response> {
    return this.#send("DELETE", url, options);
  }

  async read(url: URL | string, options: RequestOptions = {}): Promise<string> {
    const response = await this.get(url, options);
    this.#checkOk(response);
    return response.body;
  }

  async readBytes(
    url: URL | string,
    options: RequestOptions = {},
  ): Promise<Uint8Array> {
    const response = await this.get(url, options);
    this.#checkOk(response);
    return response.bodyBytes;
  }

  close(): void {}

  async #send(
    method: string,
    url: URL | string,
    options: RequestOptions,
  ): Promise<Response> {
    const request = new Request(method, url);

    if (options.headers) {
      for (const [name, value] of new Headers(options.headers)) {
        request.headers.set(name, value);
      }
    }
    if (options.encoding) request.encoding = options.encoding;
    if (options.timeout !== undefined) request.timeoutMs = options.timeout;
    _applyBody(request, options.body ?? null);

    return await Response.fromStream(await this.send(request));
  }

  /**
   * Throws when `response` carries a status the caller cannot read a body from.
   *
   * `read` and `readBytes` are the two methods that promise a body, so they are the two that
   * cannot hand back the body of an error page as if it were the answer.
   */
  #checkOk(response: Response): void {
    if (response.ok) return;

    throw new ClientException(
      `Request to ${response.request?.url} failed with status ${response.statusCode}.`,
      response.request?.url ?? null,
    );
  }
}

/**
 * Puts `body` on `request` under the encoding its own type calls for.
 *
 * A record becomes a url-encoded form, text becomes text, bytes go as they are. It is the same
 * rule package:http follows, and it is what makes `body:` mean one thing at every call.
 */
function _applyBody(request: Request, body: RequestBody): void {
  if (body === null) return;

  if (typeof body === "string") {
    request.body = body;
    return;
  }
  if (body instanceof Uint8Array) {
    request.bodyBytes = body;
    return;
  }
  request.bodyFields = body;
}
