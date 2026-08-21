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

import type { StorageBucket } from "./transport.ts";
import { currentClient } from "@scribe/foundation/src/http/run_with_client.ts";
import type { RequestBody } from "@scribe/foundation/src/http/client.ts";
import type { Response as HttpResponse } from "@scribe/foundation/src/http/response/response.ts";

const REQUEST_TIMEOUT_MS = 30_000;

/** One bucket of the Supabase storage service, reached over HTTP with the service key. */
export class Bucket implements StorageBucket {
  readonly #name: string;
  readonly #url: string;
  readonly #serviceKey: string;

  /**
   * @param name - The bucket to write into, which the service takes in every route.
   * @param url - The root of the storage API, without a trailing slash.
   * @param serviceKey - The key that bypasses row level security, since a project's own rules
   * have already been applied by the route that called this package.
   */
  constructor(name: string, url: string, serviceKey: string) {
    this.#name = name;
    this.#url = url;
    this.#serviceKey = serviceKey;
  }

  /** Writes `body` at `path`, replacing whatever was there. */
  async upload(
    path: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<boolean> {
    const res = await this.#send("POST", `object/${this.#name}/${path}`, {
      headers: { "content-type": contentType, "x-upsert": "true" },
      body: new Uint8Array(body),
    });
    return res !== null;
  }

  /** Removes `paths` in one call. */
  async remove(paths: readonly string[]): Promise<boolean> {
    if (paths.length === 0) return true;
    const res = await this.#send("DELETE", `object/${this.#name}`, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
    return res !== null;
  }

  /**
   * Sends one request to the storage service, and answers null when it did not go through.
   *
   * @remarks
   * Every call answers null on failure and logs why, so no caller of this bucket has to tell a
   * refused upload from an unreachable storage service. The two cases are logged apart.
   */
  async #send(
    method: "POST" | "DELETE",
    route: string,
    options: { headers: Record<string, string>; body: RequestBody },
  ): Promise<HttpResponse | null> {
    const client = currentClient();
    const url = `${this.#url}/${route}`;
    const sent = {
      headers: {
        apikey: this.#serviceKey,
        Authorization: `Bearer ${this.#serviceKey}`,
        ...options.headers,
      },
      body: options.body,
      timeout: REQUEST_TIMEOUT_MS,
    };

    try {
      const res = method === "POST" ? await client.post(url, sent) : await client.delete(url, sent);
      if (res.ok) return res;

      console.error(`[storage] ${method} ${route} failed (${res.statusCode}): ${_reason(res)}`);
      return null;
    } catch (e) {
      console.error(`[storage] ${method} ${route} unreachable:`, e);
      return null;
    } finally {
      client.close();
    }
  }
}

function _reason(res: HttpResponse): string {
  try {
    const body = res.json<{ message?: string; error?: string }>();
    return body.message ?? body.error ?? "unexpected error";
  } catch {
    return "unexpected error";
  }
}
