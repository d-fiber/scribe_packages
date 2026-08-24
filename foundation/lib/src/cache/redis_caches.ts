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

import type { Cache, CacheDriver, CacheOptions } from "@scribe/alchemy";
import { log } from "@scribe/alchemy/observe";
import { RedisCache } from "./redis_cache.ts";

/**
 * What opens a {@link RedisCache} for a package that asked the port for one.
 *
 * @remarks
 * A store is kept per key, because the port promises that opening one key twice answers one
 * store, and because two instances of a key each carry their own in-process flight: the tier
 * that costs a map lookup would be defeated, and the coordination would fall back on the tier
 * that costs two round trips.
 *
 * The options are handed on whole. What the port declares is what the store is opened with, so
 * a field the port gains arrives here without this file being touched.
 */
export class RedisCaches implements CacheDriver {
  /** The store `options` names, opened on the first ask and kept from then on. */
  open<T>(options: CacheOptions): Cache<T> {
    const held = _opened.get(options.key);
    if (held !== undefined) {
      _reconcile(options, held as RedisCache<unknown>);
      return held as Cache<T>;
    }

    const opened = new RedisCache<T>(options);
    _opened.set(options.key, opened as Cache<unknown>);
    return opened;
  }
}

/**
 * One store per key, so opening twice answers the one already opened.
 *
 * @remarks
 * It lives beside the class and not inside an instance, because what a declaration writes to is
 * process-global: a host that clears the slot and wires a second driver would meet a registry
 * that already holds the first driver's keys, and every declaration made before the clear would
 * be refused as a duplicate.
 */
const _opened: Map<string, Cache<unknown>> = new Map();

/**
 * Takes the newest declaration of a key already opened, and records that there were two.
 *
 * @remarks
 * One key is one store, so the two policies cannot both hold. The newest one is taken because a
 * declaration that changed nothing is the common case and a declaration nobody reads is the
 * defect: a package asking for thirty days and being handed five minutes would expire its
 * entries early forever, with nothing anywhere saying why.
 *
 * Taking the newest is not the safe answer either, since it can stretch a lifetime a package
 * meant to keep short. That is what the record is for: whichever of the two is wrong, the line
 * names both and the key they were declared under.
 */
function _reconcile(asked: CacheOptions, inForce: RedisCache<unknown>): void {
  const wanted = asked.ttl;
  if (wanted === undefined || wanted.inMilliseconds === inForce.ttl.inMilliseconds) return;

  log.error("cache.key_declared_twice", {
    metadata: {
      key: asked.key,
      askedSeconds: wanted.inSeconds,
      replacedSeconds: inForce.ttl.inSeconds,
      consequence: "the newest declaration is taken",
    },
  });
  inForce.ttl = wanted;
}
