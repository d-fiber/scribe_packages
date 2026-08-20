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

/** The secrets and provider credentials this package needs, filled when the module is mounted. */
export interface AuthSettings {
  /** The key the identity provider signs its tokens with, used to verify one. */
  readonly jwtSecret: string;

  /** The key a pending token is signed with, which is what makes one impossible to forge. */
  readonly pendingTokenSecret: string;

  /** The OAuth client identifier Google issued, empty when that channel is not configured. */
  readonly googleClientId: string;

  /** The OAuth client secret Google issued, empty when that channel is not configured. */
  readonly googleClientSecret: string;

  /** The OAuth client identifier Apple issued, empty when that channel is not configured. */
  readonly appleClientId: string;

  /** The OAuth client secret Apple issued, empty when that channel is not configured. */
  readonly appleClientSecret: string;

  /** The Twilio account the text messages are sent from, empty when the phone channel is not configured. */
  readonly twilioAccountSid: string;

  /** The Twilio token that authenticates the account, empty when the phone channel is not configured. */
  readonly twilioAuthToken: string;

  /** The Twilio messaging service the codes go out through, empty when the phone channel is not configured. */
  readonly twilioMessageServiceSid: string;
}
