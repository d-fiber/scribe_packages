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

import type { ClaimDriver, ClaimOptions } from "@scribe/alchemy";
import { kv } from "./kv.ts";

/**
 * The claim driver a host running against Redis fills {@link Claims} with.
 *
 * @remarks
 * A claim is `SET key NX EX ttl`: the store answers `OK` to the first caller and
 * nothing to every other one until the key runs out. Nothing else is written, so
 * two callers racing on the same key cannot both be told they took it.
 */
export class RedisClaims implements ClaimDriver {
  /**
   * The {@link ClaimDriver.claim} implementation: `SET key NX EX ttlSeconds`, `true` only for the
   * caller Redis answers `OK` to. Falls back to `options.whenUnavailable === "allow"` when the
   * store cannot be reached, rather than deciding the claim by default.
   */
  async claim(key: string, ttlSeconds: number, options: ClaimOptions): Promise<boolean> {
    try {
      return await kv().set(key, "1", "EX", ttlSeconds, "NX") === "OK";
    } catch (raised) {
      console.error(`[claim:${options.scope}] the store refused a claim on ${key}.`, raised);
      return options.whenUnavailable === "allow";
    }
  }
}
