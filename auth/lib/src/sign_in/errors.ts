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
