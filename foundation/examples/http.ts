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

import { Duration, type Future, type UnmodifiableList } from "@scribe/alchemy";
import { ClientException, http } from "@scribe/alchemy/http";
import type { HttpResponse } from "@scribe/alchemy/http";

/** The shape the rates endpoint answers with. */
interface Rates {
  /** One rate per currency code. */
  readonly rates: Record<string, number>;
}

/**
 * A one-off exchange, which opens a client, sends, and closes it again.
 *
 * What sends is whatever fills the `Clients` slot. This package fills it with the client that
 * reaches `fetch`, and a test fills it with one that answers without a socket, so nothing here
 * takes a client as a parameter.
 */
export function ping(url: string): Future<HttpResponse> {
  return http.get(url, { timeout: Duration.seconds(2) });
}

/**
 * A record body goes out as a form, a string as text, and bytes as they are.
 *
 * A `content-type` given in the headers is never overwritten by the one the body would have
 * implied, which is how a caller sends JSON.
 */
export function publish(url: string, event: object): Future<HttpResponse> {
  return http.post(url, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

/** Reads a body as text, which throws on any status but a 2xx. */
export async function rates(url: string): Future<Rates | null> {
  try {
    return JSON.parse(await http.read(url)) as Rates;
  } catch (error) {
    if (error instanceof ClientException) return null;
    throw error;
  }
}

/**
 * Several exchanges over one client, which the caller owns and has to close.
 *
 * It is what the one-off verbs are not for: calls that should share whatever the client holds,
 * and a streamed answer, which outlives the call that started it and would be cut off by a
 * client closed underneath it.
 */
export async function report(urls: UnmodifiableList<string>): Future<UnmodifiableList<string>> {
  const client = http.open();
  try {
    return await Promise.all(urls.map((url) => client.read(url)));
  } finally {
    client.close();
  }
}
