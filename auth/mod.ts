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

export type { AccountIdentity, AccountRow, Ban, BanOptions, BanRow, SignInContext } from "./contracts/account.ts";
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
