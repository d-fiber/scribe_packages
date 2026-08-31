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

import { parsePhoneNumberFromString } from "libphonenumber-js";

export enum EmailCheckStatus {
  Empty = "empty",
  Invalid = "invalid",
  Ok = "ok",
}

/** What checking an email address answers: its canonical form, or why it did not pass. */
export interface EmailFormatResult {
  /** The address in its checked, canonical form, or the empty string when it did not pass. */
  value: string;

  /** Why `value` is empty, or `EmailCheckStatus.Ok` when it is not. */
  status: EmailCheckStatus;
}

const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const MAX_EMAIL_LOCAL_LENGTH = 64;

/** The email half of {@link AuthValidator}. */
class EmailValidator {
  /**
   * Whether `email` is a syntactically valid address short enough for this package to store.
   *
   * @remarks
   * Refuses a local part past {@link MAX_EMAIL_LOCAL_LENGTH} and two dots in a row before ever
   * reaching the pattern, because those are cheap to reject and the regular expression alone would
   * otherwise spend backtracking on an input built to be long or ambiguous.
   */
  static isValid(email: string): boolean {
    if (!email) return false;
    if (email.length > 254) return false;
    if (email.includes("..")) return false;

    const at = email.lastIndexOf("@");
    if (at === -1 || at > MAX_EMAIL_LOCAL_LENGTH) return false;

    return EMAIL_PATTERN.test(email);
  }

  /**
   * `email` with any `+tag` suffix on the local part removed.
   *
   * @remarks
   * A provider that honors plus addressing treats `name+anything@host` as the same inbox as
   * `name@host`, so this is what a caller uses to compare two addresses for the underlying account
   * they actually reach, such as refusing a second signup that only differs by its tag.
   */
  static inbox(email: string): string {
    const at = email.lastIndexOf("@");
    if (at === -1) return email;
    const local = email.slice(0, at);
    const plus = local.indexOf("+");
    return (plus === -1 ? local : local.slice(0, plus)) + email.slice(at);
  }

  /** Trims and lowercases `email`, then reports whether the result passes {@link isValid}. */
  static check(email: string): EmailFormatResult {
    const value = email.trim().toLowerCase();
    if (value.length === 0) return { value, status: EmailCheckStatus.Empty };
    if (value.length > 254 || !EmailValidator.isValid(value)) {
      return { value, status: EmailCheckStatus.Invalid };
    }
    return { value, status: EmailCheckStatus.Ok };
  }
}

export enum PhoneCheckStatus {
  Empty = "empty",
  Invalid = "invalid",
  Ok = "ok",
}

/** What checking a phone number answers: its canonical form, or why it did not pass. */
export interface PhoneCheckResult {
  /** The number in its checked, canonical form, or the empty string when it did not pass. */
  value: string;

  /** Why `value` is empty, or `PhoneCheckStatus.Ok` when it is not. */
  status: PhoneCheckStatus;
}

export enum PasswordCheckStatus {
  Empty = "empty",
  Invalid = "invalid",
  Ok = "ok",
}

/** What checking a password answers: the password as given, or why it did not pass. */
export interface PasswordCheckResult {
  /** The password as given, or the empty string when it did not pass. */
  value: string;

  /** Why `value` is empty, or `PasswordCheckStatus.Ok` when it is not. */
  status: PasswordCheckStatus;
}

export enum PasswordPresenceStatus {
  Empty = "empty",
  TooLong = "too_long",
  Ok = "ok",
}

const MAX_PASSWORD_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 10;

const LEET_FOLDING: ReadonlyMap<string, string> = new Map([
  ["0", "o"],
  ["1", "i"],
  ["3", "e"],
  ["4", "a"],
  ["5", "s"],
  ["7", "t"],
  ["8", "b"],
  ["@", "a"],
  ["$", "s"],
  ["!", "i"],
]);

const COMMON_BASES: ReadonlySet<string> = new Set([
  "abc",
  "abcd",
  "abcdef",
  "access",
  "admin",
  "administrator",
  "azerty",
  "azertyuiop",
  "bonjour",
  "changeme",
  "cheese",
  "chocolat",
  "computer",
  "dragon",
  "family",
  "football",
  "freedom",
  "hello",
  "iloveyou",
  "internet",
  "jesus",
  "letmein",
  "liverpool",
  "login",
  "manager",
  "master",
  "monkey",
  "motdepasse",
  "mustang",
  "nintendo",
  "pass",
  "passe",
  "password",
  "princess",
  "purple",
  "qazwsx",
  "qwerty",
  "qwertyuiop",
  "sample",
  "secret",
  "shadow",
  "soleil",
  "starwars",
  "sunshine",
  "superman",
  "test",
  "trustno",
  "welcome",
  "whatever",
  "wxcvbn",
]);

/**
 * `password` with its trailing digits or punctuation, casing and leetspeak substitutions all
 * stripped, so it can be compared against {@link COMMON_BASES}.
 *
 * @remarks
 * `Password1!` and `p4ssw0rd` both reduce to `password`. Checking the complexity rules alone
 * would let both through, since each satisfies the letter, digit and length requirements on its
 * own, so a dictionary check that only matched the literal string would miss the common password
 * hiding under a cosmetic substitution.
 */
function passwordBase(password: string): string {
  const withoutTrailingSuffix = password.replace(/[^A-Za-zÀ-ÿ]+$/, "");
  const folded = [...withoutTrailingSuffix.toLowerCase()]
    .map((char) => LEET_FOLDING.get(char) ?? char)
    .join("");
  return folded.replace(/[^a-zà-ÿ]/g, "");
}

/** Whether `password` folds down to one of {@link COMMON_BASES}, by {@link passwordBase}. */
function isCommonPassword(password: string): boolean {
  const base = passwordBase(password);
  return base.length === 0 || COMMON_BASES.has(base);
}

/** Whether `password` repeats the same character four or more times in a row, like `aaaa1`. */
function hasRepeatedRun(password: string): boolean {
  return /(.)\1{3,}/.test(password);
}

/** Whether `password` contains four characters in a row that ascend or descend by one code point, like `abcd` or `4321`. */
function hasSequentialRun(password: string): boolean {
  const lower = password.toLowerCase();
  for (let i = 0; i + 4 <= lower.length; i++) {
    const slice = lower.slice(i, i + 4);

    let ascending = true;
    let descending = true;
    for (let j = 1; j < slice.length; j++) {
      const delta = slice.charCodeAt(j) - slice.charCodeAt(j - 1);
      if (delta !== 1) ascending = false;
      if (delta !== -1) descending = false;
    }
    if (ascending || descending) return true;
  }
  return false;
}

/** The password half of {@link AuthValidator}. */
class PasswordValidator {
  /**
   * Whether `password` is empty, longer than {@link MAX_PASSWORD_LENGTH}, or neither.
   *
   * @remarks
   * Kept separate from {@link isValid}, whose refusal reasons all collapse into `false`, because
   * a length past the maximum is a cost the request itself should refuse before hashing the
   * password at all, while the complexity rules `isValid` checks are a signup decision, not a
   * request-size one.
   */
  static presence(password: string): PasswordPresenceStatus {
    if (password.trim().length === 0) return PasswordPresenceStatus.Empty;
    if (password.length > MAX_PASSWORD_LENGTH) {
      return PasswordPresenceStatus.TooLong;
    }
    return PasswordPresenceStatus.Ok;
  }

  /**
   * Whether `password` meets this package's complexity rules: long enough, an upper, a lower and
   * a digit, not a known common password even folded, and free of a repeated or sequential run.
   */
  static isValid(password: string): boolean {
    if (password.trim().length === 0) return false;
    if (password.length < MIN_PASSWORD_LENGTH) return false;
    if (password.length > MAX_PASSWORD_LENGTH) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (isCommonPassword(password)) return false;
    if (hasRepeatedRun(password)) return false;
    if (hasSequentialRun(password)) return false;
    return true;
  }

  /** Reports whether `password` is empty or passes {@link isValid}, without altering it either way. */
  static check(password: string): PasswordCheckResult {
    if (password.trim().length === 0) {
      return { value: password, status: PasswordCheckStatus.Empty };
    }
    if (!this.isValid(password)) {
      return { value: password, status: PasswordCheckStatus.Invalid };
    }
    return { value: password, status: PasswordCheckStatus.Ok };
  }
}

/** The phone half of {@link AuthValidator}. */
class PhoneValidator {
  /**
   * `phone` in E.164 form, once `libphonenumber-js` can parse it, or `phone` with its separators
   * stripped and a leading `00` turned into `+` when it cannot.
   *
   * @remarks
   * The `00` prefix is the international dialing code used outside of North America; folding it to
   * `+` before parsing is what lets a number typed the way a caller's own country writes it still
   * resolve to the same E.164 form GoTrue expects.
   */
  static format(phone: string): string {
    const normalized = phone.replace(/[\s\-().]/g, "").replace(/^00/, "+");
    return parsePhoneNumberFromString(normalized)?.number ?? normalized;
  }

  /** Whether `phone`, once formatted by {@link format}, is a number `libphonenumber-js` recognizes as valid. */
  static isValid(phone: string): boolean {
    if (!phone) return false;
    return (
      parsePhoneNumberFromString(PhoneValidator.format(phone))?.isValid() ??
        false
    );
  }

  /** Formats `phone` and reports whether the result passes {@link isValid}. */
  static check(phone: string): PhoneCheckResult {
    const trimmed = phone.trim();
    if (trimmed.length === 0) {
      return { value: "", status: PhoneCheckStatus.Empty };
    }

    const value = PhoneValidator.format(trimmed);
    if (!PhoneValidator.isValid(value)) {
      return { value: "", status: PhoneCheckStatus.Invalid };
    }
    return { value, status: PhoneCheckStatus.Ok };
  }
}

/** This package's whole validation surface: an email, a password and a phone number, each checked and formatted. */
export class AuthValidator {
  /** Checks and formats an email address. */
  static readonly email = EmailValidator;

  /** Checks a password against the package's own rules. */
  static readonly password = PasswordValidator;

  /** Checks and formats a phone number. */
  static readonly phone = PhoneValidator;
}
