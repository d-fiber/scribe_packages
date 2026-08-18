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

/**
 * Collapses concurrent computations of the same key inside one process.
 *
 * This is the first of the two tiers a cache needs. The Redis lock coordinates replicas
 * with each other and costs two round trips to do it; this one costs a `Map` lookup and
 * covers the case that dominates in practice — the same client, or the same page, asking
 * for the same key several times while the first answer is still in flight.
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

    // The entry has to be removed by whoever settles it, and `finally` runs for both
    // outcomes. Deleting on the value alone would leak the key on every rejection.
    const started = compute().finally(() => this.#inFlight.delete(key));

    this.#inFlight.set(key, started);
    return started;
  }
}
