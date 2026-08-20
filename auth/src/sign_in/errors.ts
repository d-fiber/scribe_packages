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

/** Why a sign-in was turned away, whatever door it came through. */
export enum SignInError {
  /** No address was given. */
  EmailRequired = "email_required",

  /** No number was given. */
  PhoneRequired = "phone_required",

  /** No password was given. */
  PasswordRequired = "password_required",

  /** The credentials do not open any account, or open one of another role. */
  InvalidCredentials = "invalid_credentials",

  /** The address is right but has never been proven, so the account does not serve yet. */
  EmailNotConfirmed = "email_not_confirmed",

  /** The number is right but has never been proven. */
  PhoneNotConfirmed = "phone_not_confirmed",

  /** The channel is declared but the process has no credentials for its provider. */
  ProviderNotConfigured = "provider_not_configured",

  /** The caller, or the account it is aiming at, has been tried too often. */
  TooManyRequests = "too_many_requests",

  /** Something failed that the caller can do nothing about. */
  Unexpected = "unexpected",
}

/** Why a code could not be exchanged for a session. */
export enum OtpError {
  /** The pending token or the code is wrong, spent, or was minted for another device. */
  InvalidOrExpired = "invalid_or_expired",

  /** The code has been tried too often, on this challenge or against this account. */
  TooManyRequests = "too_many_requests",

  /** Something failed that the caller can do nothing about. */
  Unexpected = "unexpected",
}

/** Why a link sent by mail could not be confirmed. */
export enum ConfirmError {
  /** The link was valid but is past its deadline. */
  Expired = "expired",

  /** The link does not open anything. */
  Failed = "failed",
}
