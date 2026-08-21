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
 * Collapses concurrent computations of the same key inside one process.
 *
 * This is the first of the two tiers a cache needs. The Redis lock coordinates replicas
 * with each other and costs two round trips to do it; this one costs a `Map` lookup and
 * covers the case that dominates in practice: the same client, or the same page, asking for
 * the same key several times while the first answer is still in flight.
 *
 * Nothing here is a cache: an entry lives exactly as long as the computation it stands for,
 * so a caller never reads a value this class kept.
 */
export class LocalFlight {
  readonly #inFlight = new Map<string, Promise<unknown>>();

  /** How many computations are running right now. Exists for tests and for reporting. */
  get size(): number {
    return this.#inFlight.size;
  }

  /**
   * Runs `compute` for `key`, or joins the run already under way for it.
   *
   * A rejection is shared by every joiner, then forgotten: the next caller retries rather
   * than inheriting a failure it did not cause.
   */
  run<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const running = this.#inFlight.get(key);
    if (running) return running as Promise<T>;

    const started = compute().finally(() => this.#inFlight.delete(key));

    this.#inFlight.set(key, started);
    return started;
  }
}
