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
