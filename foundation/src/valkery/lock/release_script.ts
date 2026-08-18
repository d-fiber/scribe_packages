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

import { kv } from "@scribe/core/runtime/redis/mod.ts";

/** The Redis client, once the release script has been registered on it. */
export interface LockCommands {
  releaseLock(key: string, token: string): Promise<number>;
}

// Comparing the token and removing the key have to happen without anything running in
// between: read-then-delete from the client would let an expired holder delete the lock its
// successor has just taken. A script is the only way Redis offers to make the pair atomic.
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * The Redis client with `releaseLock` available on it.
 *
 * Registration happens on first use rather than at import, and only when the command is
 * missing. The guard is not defensive: tests install their fakes before anything calls
 * this, and registering unconditionally would overwrite the stub they just put in place.
 */
export function lockCommands(): LockCommands {
  const client = kv();
  const commands = client as unknown as Partial<LockCommands>;

  if (typeof commands.releaseLock !== "function") {
    client.defineCommand("releaseLock", {
      numberOfKeys: 1,
      lua: RELEASE_LOCK_SCRIPT,
    });
  }

  return client as unknown as LockCommands;
}
