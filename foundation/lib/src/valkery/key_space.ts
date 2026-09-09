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

/**
 * Derives the Redis keys of one cache from its namespace.
 *
 * Every key a cache touches is built here, which is what keeps two caches from colliding
 * on the same id and what makes a namespace sweepable in one glob.
 */
export class KeySpace {
  readonly #prefix: string;

  constructor(prefix: string) {
    this.#prefix = _unnestable(prefix);
  }

  /** The key an entry is stored under. */
  keyOf(id: string): string {
    return `${this.#prefix}/${id}`;
  }

  /**
   * The key the lock for an entry is stored under.
   *
   * It is deliberately outside the namespace, under its own `lock:` prefix, so that a
   * {@link matching} sweep never removes a lock a replica is currently holding.
   */
  lockKeyOf(id: string): string {
    return `lock:${this.keyOf(id)}`;
  }

  /**
   * The glob that selects this namespace, or a subset of it.
   *
   * The argument is a **glob, not a prefix**: `matching("u1")` selects one exact key and
   * `matching("u1:*")` selects a subtree. Naming it a prefix would make the signature lie
   * about what callers actually pass.
   */
  matching(pattern?: string): string {
    return `${_asGlobbed(this.#prefix)}/${pattern ?? "*"}`;
  }
}

/**
 * A namespace with the separator neutralised inside it, so no two of them can nest.
 *
 * @remarks
 * The namespace and the id are joined by a slash and not by a colon, which is what keeps the two
 * apart: a namespace is written with colons, `auth:device`, so joining on one would let the cache
 * named `auth` reading `device:d1` and the cache named `auth:device` reading `d1` build the same
 * key. One declaration would read and overwrite another's entries and clearing either would sweep
 * both, and neither declaration ever heard of the other.
 *
 * A namespace holding a slash of its own is escaped here for the same reason, and pays a
 * backslash in its keys that a namespace written with colons never does.
 */
function _unnestable(prefix: string): string {
  return prefix.includes("\\") || prefix.includes("/")
    ? prefix.replaceAll("\\", "\\\\").replaceAll("/", "\\/")
    : prefix;
}

/**
 * A literal read as itself by the pattern matcher of a store, rather than as a pattern.
 *
 * @remarks
 * A namespace holding a backslash, which is what {@link _unnestable} writes, would otherwise be
 * read as an escape by the glob and select the keys of a namespace that does not exist.
 */
function _asGlobbed(literal: string): string {
  return /[\\*?[\]]/.test(literal) ? literal.replaceAll(/([\\*?[\]])/g, "\\$1") : literal;
}
