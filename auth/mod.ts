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

export { SignOutScope } from "./contracts/account.ts";
export type {
  AccountIdentity,
  AccountRow,
  Ban,
  BanOptions,
  BanRow,
  Session,
  SignInContext,
} from "./contracts/account.ts";
export { Channel } from "./contracts/channel.ts";
export type { AccountDevice } from "./contracts/device.ts";
export type { AccountRole } from "./contracts/role.ts";
export type { AuthSettings } from "./contracts/settings.ts";

export {
  Account,
  ACCOUNT_FOREIGN_KEY,
  AccountDeclaration,
  RoleDevices,
  SignInRefusal,
} from "./src/declaration/account.ts";
export type { AccountOptions, AnyAccount } from "./src/declaration/account.ts";
export { Optional, Required } from "./src/declaration/columns.ts";
export type {
  Column,
  Embedded,
  OptionalValue,
  ReadOf,
  ReadSelector,
  ReadShape,
  RequiredValue,
  WriteOf,
  WriteSelector,
  WriteShape,
  Written,
} from "./src/declaration/columns.ts";
export { accountNamed, AUTH_EXTENSION, declaredAccounts } from "./src/declaration/registry.ts";

export { SignUpError } from "./src/sign_up/errors.ts";
export type { EmailSignUpError, PhoneSignUpError, SocialSignUpError } from "./src/sign_up/errors.ts";
export type { SignedUp, SignUpResult } from "./src/sign_up/runner.ts";
export type { SignUpSurface } from "./src/sign_up/surface.ts";

export type { EmailCredentials, PhoneCredentials, SocialCredentials } from "./src/sign_in/doors.ts";
export { ConfirmError, OtpError, SignInError } from "./src/sign_in/errors.ts";
export type { OtpSession, OtpStarted } from "./src/sign_in/otp.ts";
export type { SignedIn, SignedInSession } from "./src/sign_in/runner.ts";
export type { SignInSurface } from "./src/sign_in/surface.ts";

export { ResetPassword, ResetPasswordError } from "./src/reset_password.ts";
export type { ResetPasswordPending, ResetPasswordResult } from "./src/reset_password.ts";

export { AccountSession, SessionError } from "./src/session.ts";
export type { SessionResult, SessionTokens } from "./src/session.ts";

export { AccountIdentifier, IdentifierError } from "./src/identifier.ts";
export type { IdentifierResult } from "./src/identifier.ts";
export { AccountPassword, PasswordError } from "./src/password.ts";
export type { PasswordResult } from "./src/password.ts";

export { BanError, Bans } from "./src/bans.ts";
export type { ListedBan } from "./src/bans.ts";

export { DeviceCheck } from "./src/devices/devices.ts";
export type { DeviceOrigin } from "./src/devices/repository.ts";

export { SmsIntent } from "./src/sms_intent.ts";
