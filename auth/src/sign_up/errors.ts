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

/** Why a sign-up was turned away, whatever door it came through. */
export enum SignUpError {
  /** No address was given. */
  EmailRequired = "email_required",

  /** The address is not one. */
  InvalidEmail = "invalid_email",

  /** An account already signs in with that address. */
  EmailAlreadyExists = "email_already_exists",

  /** No number was given. */
  PhoneRequired = "phone_required",

  /** The number is not one. */
  InvalidPhone = "invalid_phone",

  /** An account already signs in with that number. */
  PhoneAlreadyExists = "phone_already_exists",

  /** No password was given. */
  PasswordRequired = "password_required",

  /** The password is too weak for what the identity provider accepts. */
  InvalidPassword = "invalid_password",

  /** The identity the provider vouched for already holds an account. */
  AccountAlreadyExists = "account_already_exists",

  /** The token or the nonce the caller sent is missing or malformed. */
  InvalidCredentials = "invalid_credentials",

  /** The channel is declared but the process has no credentials for its provider. */
  ProviderNotConfigured = "provider_not_configured",

  /** The caller, or the address it is aiming at, has been tried too often. */
  TooManyRequests = "too_many_requests",

  /** Something failed that the caller can do nothing about. */
  Unexpected = "unexpected",
}

/** What can go wrong on the way in through an address. */
export type EmailSignUpError =
  | SignUpError.EmailRequired
  | SignUpError.InvalidEmail
  | SignUpError.EmailAlreadyExists
  | SignUpError.PasswordRequired
  | SignUpError.InvalidPassword
  | SignUpError.TooManyRequests
  | SignUpError.Unexpected;

/** What can go wrong on the way in through a number. */
export type PhoneSignUpError =
  | SignUpError.PhoneRequired
  | SignUpError.InvalidPhone
  | SignUpError.PhoneAlreadyExists
  | SignUpError.PasswordRequired
  | SignUpError.InvalidPassword
  | SignUpError.ProviderNotConfigured
  | SignUpError.TooManyRequests
  | SignUpError.Unexpected;

/** What can go wrong on the way in through an identity another provider vouched for. */
export type SocialSignUpError =
  | SignUpError.AccountAlreadyExists
  | SignUpError.InvalidCredentials
  | SignUpError.ProviderNotConfigured
  | SignUpError.TooManyRequests
  | SignUpError.Unexpected;
