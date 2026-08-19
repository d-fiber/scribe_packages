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
 * How open a channel's own broadcast is, before any grant is written.
 *
 * @remarks
 * It governs the channel that carries the bare name and nothing else. The two derived shapes
 * carry their own rule and never consult this: `<name>:<id>` is heard by the account whose
 * token says that id, and `<name>:#<topic>` is heard by the accounts a grant names.
 *
 * The value decides the Realtime mode the trigger sends with. {@link Listen.Public} sends
 * outside the private mode, so no policy is consulted at all; the other two send inside it and
 * are answered by the policies of `db/init/realtime.sql`.
 */
export enum Listen {
  /** Nobody hears the broadcast without a grant written for them. */
  Granted = "granted",

  /** Any caller holding a session hears the broadcast. */
  Authenticated = "authenticated",

  /**
   * Any caller hears the broadcast, session or not.
   *
   * What travels is as readable as what ships inside the application, because the only
   * credential in the way is the anonymous project key every client carries.
   */
  Public = "public",
}
