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

import { parsePhoneNumberFromString } from "libphonenumber-js";

export enum EmailCheckStatus {
  Empty = "empty",
  Invalid = "invalid",
  Ok = "ok",
}

export interface EmailFormatResult {
  value: string;
  status: EmailCheckStatus;
}

const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const MAX_EMAIL_LOCAL_LENGTH = 64;

class EmailValidator {
  static isValid(email: string): boolean {
    if (!email) return false;
    if (email.length > 254) return false;
    if (email.includes("..")) return false;

    const at = email.lastIndexOf("@");
    if (at === -1 || at > MAX_EMAIL_LOCAL_LENGTH) return false;

    return EMAIL_PATTERN.test(email);
  }

  static inbox(email: string): string {
    const at = email.lastIndexOf("@");
    if (at === -1) return email;
    const local = email.slice(0, at);
    const plus = local.indexOf("+");
    return (plus === -1 ? local : local.slice(0, plus)) + email.slice(at);
  }

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

export interface PhoneCheckResult {
  value: string;
  status: PhoneCheckStatus;
}

export enum PasswordCheckStatus {
  Empty = "empty",
  Invalid = "invalid",
  Ok = "ok",
}

export interface PasswordCheckResult {
  value: string;
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
  "poppin",
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

function passwordBase(password: string): string {
  const withoutTrailingSuffix = password.replace(/[^A-Za-zÀ-ÿ]+$/, "");
  const folded = [...withoutTrailingSuffix.toLowerCase()]
    .map((char) => LEET_FOLDING.get(char) ?? char)
    .join("");
  return folded.replace(/[^a-zà-ÿ]/g, "");
}

function isCommonPassword(password: string): boolean {
  const base = passwordBase(password);
  return base.length === 0 || COMMON_BASES.has(base);
}

function hasRepeatedRun(password: string): boolean {
  return /(.)\1{3,}/.test(password);
}

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

class PasswordValidator {
  static presence(password: string): PasswordPresenceStatus {
    if (password.trim().length === 0) return PasswordPresenceStatus.Empty;
    if (password.length > MAX_PASSWORD_LENGTH) {
      return PasswordPresenceStatus.TooLong;
    }
    return PasswordPresenceStatus.Ok;
  }

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

class PhoneValidator {
  static format(phone: string): string {
    const normalized = phone.replace(/[\s\-().]/g, "").replace(/^00/, "+");
    return parsePhoneNumberFromString(normalized)?.number ?? normalized;
  }

  static isValid(phone: string): boolean {
    if (!phone) return false;
    return (
      parsePhoneNumberFromString(PhoneValidator.format(phone))?.isValid() ??
        false
    );
  }

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

export class AuthValidator {
  static readonly email = EmailValidator;
  static readonly password = PasswordValidator;
  static readonly phone = PhoneValidator;
}
