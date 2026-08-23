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
import { kv } from "@scribe/foundation/lib/src/redis/kv.ts";

/** The Redis client, once the release script has been registered on it. */
export interface LockCommands {
  /**
   * Removes the lock at `key`, and answers one when it was removed and zero otherwise.
   *
   * Zero means another holder owns the lock now, which is the normal answer for a caller
   * whose lease expired while it was working.
   */
  releaseLock(key: string, token: string): Future<number>;
}

/**
 * The Lua that compares the token and removes the key in one step.
 *
 * The two have to happen without anything running in between: a read then a delete issued
 * from the client would let a holder whose lease has expired delete the lock its successor
 * has just taken. A script is the only way Redis offers to make the pair atomic.
 */
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
