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
