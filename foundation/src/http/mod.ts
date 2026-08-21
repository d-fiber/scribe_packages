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

import type { Client, RequestOptions } from "./client.ts";
import type { Response } from "./response/response.ts";
import { currentClient } from "./run_with_client.ts";

export { BaseClient } from "./base_client.ts";
export { ByteStream } from "./byte_stream.ts";
export type { Client, RequestBody, RequestOptions } from "./client.ts";
export { ClientException } from "./exception.ts";
export { FetchClient } from "./fetch_client.ts";
export { BaseRequest } from "./request/base_request.ts";
export { MultipartFile } from "./request/multipart_file.ts";
export { MultipartRequest } from "./request/multipart_request.ts";
export { Request } from "./request/request.ts";
export { BaseResponse } from "./response/base_response.ts";
export { Response } from "./response/response.ts";
export { StreamedResponse } from "./response/streamed_response.ts";
export { runWithClient } from "./run_with_client.ts";

/**
 * Opens the current client, runs one exchange through it, and closes it.
 *
 * With `FetchClient` that costs nothing measurable, because the platform pools connections for
 * the whole process. What the shape decides is ownership rather than speed: a client that
 * really holds something, one that retries or logs or pools per instance, is worth keeping
 * across calls, and a one-off function gives it no chance to.
 */
async function _once(
  call: (client: Client) => Promise<Response>,
): Promise<Response> {
  const client = currentClient();
  try {
    return await call(client);
  } finally {
    client.close();
  }
}

/** Sends a one-off HEAD. */
export function head(url: URL | string, options?: RequestOptions): Promise<Response> {
  return _once((client) => client.head(url, options));
}

/** Sends a one-off GET. */
export function get(url: URL | string, options?: RequestOptions): Promise<Response> {
  return _once((client) => client.get(url, options));
}

/** Sends a one-off POST. */
export function post(url: URL | string, options?: RequestOptions): Promise<Response> {
  return _once((client) => client.post(url, options));
}

/** Sends a one-off PUT. */
export function put(url: URL | string, options?: RequestOptions): Promise<Response> {
  return _once((client) => client.put(url, options));
}

/** Sends a one-off PATCH. */
export function patch(url: URL | string, options?: RequestOptions): Promise<Response> {
  return _once((client) => client.patch(url, options));
}

/** Sends a one-off DELETE. */
export function del(url: URL | string, options?: RequestOptions): Promise<Response> {
  return _once((client) => client.delete(url, options));
}

/**
 * Gets `url` and answers its body as text, throwing on any status but a 2xx.
 *
 * `delete` is spelled `del` above and this is spelled `read` rather than `readString`, both
 * for the same reason: they are the names package:http uses, and one of them is a reserved
 * word here.
 */
export async function read(url: URL | string, options?: RequestOptions): Promise<string> {
  const client = currentClient();
  try {
    return await client.read(url, options);
  } finally {
    client.close();
  }
}

/** Gets `url` and answers its body as bytes, throwing on any status but a 2xx. */
export async function readBytes(
  url: URL | string,
  options?: RequestOptions,
): Promise<Uint8Array> {
  const client = currentClient();
  try {
    return await client.readBytes(url, options);
  } finally {
    client.close();
  }
}
