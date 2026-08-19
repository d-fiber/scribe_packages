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

/** One emission, addressed and ready to be written wherever the transport writes. */
export interface RealtimeRow {
  /** The full channel this emission is addressed to, which decides who hears it. */
  readonly channel: string;

  /** What happened, as the declaration named it. */
  readonly action: string;

  /** The identifier of the row this is about, taken from the payload's declared key. */
  readonly entityId: string;

  /** What travels, as the declaration's type describes it. */
  readonly payload: Record<string, unknown>;
}

/**
 * Where an emission goes once it has been addressed.
 *
 * @remarks
 * The port exists so that the channel is replaceable. `SyncEventsTransport` writes a row and
 * lets Postgres broadcast it, which is what a mounted package does by default; a project that
 * would rather push into a queue or towards a third party swaps the implementation and leaves
 * every declaration alone.
 */
export interface RealtimeTransport {
  /** Sends `row`, and answers whether it left. */
  send(row: RealtimeRow): Promise<boolean>;
}
