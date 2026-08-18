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

// Each of these opens a client, sends one request and closes it.
//
// With `FetchClient` that costs nothing measurable: the platform pools connections for the
// whole process, so two hundred one-off calls and two hundred on a kept client come out within
// noise of each other. What the shape decides is not speed but ownership — a client that really
// holds something, one that retries or logs or pools per instance, is worth keeping across
// calls, and these functions give it no chance to.
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
