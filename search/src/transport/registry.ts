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

import type { SearchTransport } from "../../contracts/transport.ts";

let transport: SearchTransport | null = null;

/** Where the process keeps the one transport every index and every search goes through. */
export const SearchTransports: {
  use(next: SearchTransport | null): SearchTransport | null;
} = {
  /**
   * Makes `next` the cluster of every declaration from here on, and answers the one it replaced.
   *
   * The previous transport is answered so that whoever swapped it can put it back, which is
   * what the test harness does. A process that installs its transport once at boot ignores it.
   */
  use(next: SearchTransport | null): SearchTransport | null {
    const previous = transport;
    transport = next;
    return previous;
  },
};

/**
 * The registered transport, or null when nothing was registered.
 *
 * @remarks
 * A process with no transport reports it and answers null rather than throwing. Every caller
 * here already has an answer for a cluster that cannot be reached, and a search is one part of
 * a page: failing the request that happened to run one would cost more than the section it
 * leaves empty.
 */
export function searchTransport(): SearchTransport | null {
  if (transport === null) console.error("[search] no transport registered.");
  return transport;
}
