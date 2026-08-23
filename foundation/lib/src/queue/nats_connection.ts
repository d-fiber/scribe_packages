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

import type { Future } from "@scribe/alchemy";
import { queueSettings } from "@scribe/foundation/lib/src/queue/queue_settings.ts";
import { connect, type NatsConnection } from "@nats-io/transport-deno";
import { jetstream, type JetStreamClient, type JetStreamManager, jetstreamManager } from "@nats-io/jetstream";

let _connection: Future<NatsConnection> | null = null;

/** A server to dial, and the credentials that were written into its url. */
interface Dial {
  readonly server: string;
  readonly token?: string;
  readonly user?: string;
  readonly pass?: string;
}

/**
 * Splits the credentials out of a nats url, because the client will not read them there.
 *
 * `connect({ servers: ["nats://secret@host:4222"] })` is refused with `Authorization Violation`:
 * the JavaScript client takes credentials from the options and ignores the userinfo part of the
 * url entirely. Every deployment writes them into the url, since `NATS_URL` is the one setting
 * there is, so the split has to happen here or the queue never connects.
 *
 * `new URL` is no help either. It rejects the `nats:` scheme outright, so the userinfo is cut
 * off by hand.
 */
export function dialFrom(url: string): Dial {
  const scheme = url.indexOf("://");
  if (scheme === -1) return { server: url };

  const prefix = url.slice(0, scheme + 3);
  const rest = url.slice(scheme + 3);
  const at = rest.lastIndexOf("@");
  if (at === -1) return { server: url };

  const credentials = rest.slice(0, at);
  const server = `${prefix}${rest.slice(at + 1)}`;
  const colon = credentials.indexOf(":");

  if (colon === -1) return { server, token: decodeURIComponent(credentials) };

  return {
    server,
    user: decodeURIComponent(credentials.slice(0, colon)),
    pass: decodeURIComponent(credentials.slice(colon + 1)),
  };
}

function connection(): Future<NatsConnection> {
  if (!_connection) {
    const { server, token, user, pass } = dialFrom(queueSettings.get().natsUrl);
    _connection = connect({ servers: [server], token, user, pass });
  }
  return _connection;
}

/**
 * The one connection this process opens to NATS, made on first use.
 *
 * Connecting at import would make the URL mandatory to import anything that merely touches
 * a queue, tests included. The three accessors share the same underlying connection.
 */
export function natsConnection(): Future<NatsConnection> {
  return connection();
}

/** The JetStream client, for publishing and consuming. */
export async function js(): Future<JetStreamClient> {
  return jetstream(await connection());
}

/** The JetStream manager, for creating streams and consumers and for counting. */
export async function jsm(): Future<JetStreamManager> {
  return jetstreamManager(await connection());
}
