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

/** Where the cache lives. */
export interface CacheSettings {
  /** The Redis connection string the shared client dials, credentials included. */
  readonly redisUrl: string;
}

/** Where the queue lives. */
export interface QueueSettings {
  /**
   * The NATS connection string the shared connection dials.
   *
   * Credentials travel in it, as a token or as a user and password pair, and `nats.ts` splits
   * them out of the address before handing them to the client.
   */
  readonly natsUrl: string;
}

/** Where PostgREST lives, and the two keys that reach it. */
export interface DatabaseSettings {
  /** The base address of PostgREST, which both clients are built on. */
  readonly restUrl: string;

  /**
   * The key the user-facing client presents.
   *
   * It carries no privilege of its own: what a request may read is decided by the identity
   * the caller proves, on top of this key.
   */
  readonly anonKey: string;

  /**
   * The key the service client presents, which bypasses every row level policy.
   *
   * Nothing that answers a request should reach for this one. The owner scope is what keeps
   * a caller inside their own rows, and it is applied by the query builder rather than by
   * the database.
   */
  readonly serviceRoleKey: string;
}
