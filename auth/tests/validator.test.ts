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

import {
  AuthValidator,
  EmailCheckStatus,
  PasswordCheckStatus,
  PasswordPresenceStatus,
  PhoneCheckStatus,
} from "@scribe/auth/src/validator.ts";
import { assertEquals } from "@std/assert";

Deno.test("presence() does not apply the policy: a weak password gets through", () => {
  assertEquals(AuthValidator.password.presence("abc"), PasswordPresenceStatus.Ok);
  assertEquals(AuthValidator.password.presence("motdepasse"), PasswordPresenceStatus.Ok);
});

Deno.test("presence() refuses empty input and whitespace only", () => {
  assertEquals(AuthValidator.password.presence(""), PasswordPresenceStatus.Empty);
  assertEquals(AuthValidator.password.presence("   "), PasswordPresenceStatus.Empty);
});

Deno.test("presence() bounds the length so bcrypt never gets a huge input", () => {
  assertEquals(AuthValidator.password.presence("x".repeat(128)), PasswordPresenceStatus.Ok);
  assertEquals(AuthValidator.password.presence("x".repeat(129)), PasswordPresenceStatus.TooLong);
});

Deno.test("check() does apply the policy, and stays reserved for sign-up", () => {
  assertEquals(AuthValidator.password.check("abc").status, PasswordCheckStatus.Invalid);
  assertEquals(AuthValidator.password.check("password1").status, PasswordCheckStatus.Invalid);
  assertEquals(AuthValidator.password.check("PASSWORD1").status, PasswordCheckStatus.Invalid);
  assertEquals(AuthValidator.password.check("Password").status, PasswordCheckStatus.Invalid);
  assertEquals(AuthValidator.password.check("Poppin2Alpha").status, PasswordCheckStatus.Ok);
});

Deno.test("check() rejects a common word dressed up to pass composition", () => {
  for (
    const weak of [
      "Password123",
      "Passw0rd123",
      "Welcome2024",
      "Qwerty12345",
      "Motdepasse1!",
      "Sunshine007",
      "Azertyuiop1",
      "P@ssword123",
    ]
  ) {
    assertEquals(
      AuthValidator.password.check(weak).status,
      PasswordCheckStatus.Invalid,
      `"${weak}" is a common base with a numeric tail`,
    );
  }
});

Deno.test("check() keeps a common word that is only a fragment", () => {
  for (
    const strong of [
      "Poppin2Alpha",
      "Welcome7Harbour",
      "Qwerty4Meridian",
    ]
  ) {
    assertEquals(
      AuthValidator.password.check(strong).status,
      PasswordCheckStatus.Ok,
      `"${strong}" carries real material past the common word`,
    );
  }
});

Deno.test("check() enforces the 10 character floor", () => {
  assertEquals(
    AuthValidator.password.check("Kavr7Nuq").status,
    PasswordCheckStatus.Invalid,
    "eight characters is below the floor, however well composed",
  );
  assertEquals(
    AuthValidator.password.check("Kavr7Nuqel").status,
    PasswordCheckStatus.Ok,
  );
});

Deno.test("check() rejects known-bad passwords even when well formed", () => {
  for (const banned of ["Password123", "Azerty123", "Welcome123", "Qwerty123"]) {
    assertEquals(
      AuthValidator.password.check(banned).status,
      PasswordCheckStatus.Invalid,
      `${banned} satisfies the character classes but is a top-list password`,
    );
  }
});

Deno.test("check() rejects repeated and sequential runs", () => {
  assertEquals(
    AuthValidator.password.check("Aaaaa1bcdX").status,
    PasswordCheckStatus.Invalid,
    "four identical characters in a row",
  );
  assertEquals(
    AuthValidator.password.check("Xy1abcdePq").status,
    PasswordCheckStatus.Invalid,
    "four ascending characters in a row",
  );
  assertEquals(
    AuthValidator.password.check("Xy1dcbaePq").status,
    PasswordCheckStatus.Invalid,
    "four descending characters in a row",
  );
  assertEquals(
    AuthValidator.password.check("Xy1abXdePq").status,
    PasswordCheckStatus.Ok,
    "three in a row stays acceptable, the rule targets runs of four",
  );
});

Deno.test("email: lowercased and trimmed", () => {
  const result = AuthValidator.email.check("  U1@Example.COM ");
  assertEquals(result.status, EmailCheckStatus.Ok);
  assertEquals(result.value, "u1@example.com");
});

Deno.test("email: invalid forms refused", () => {
  for (const value of ["", "   "]) {
    assertEquals(AuthValidator.email.check(value).status, EmailCheckStatus.Empty);
  }
  for (const value of ["u1", "u1@", "@example.com", "u1@example", "a b@c.d"]) {
    assertEquals(
      AuthValidator.email.check(value).status,
      EmailCheckStatus.Invalid,
      `expected invalid : ${value}`,
    );
  }
});

Deno.test("email: length bounded to 254", () => {
  const long = "a".repeat(250) + "@e.fr";
  assertEquals(AuthValidator.email.check(long).status, EmailCheckStatus.Invalid);
});

Deno.test("inbox() does not merge two genuinely distinct mailboxes", () => {
  assertEquals(AuthValidator.email.inbox("a.b@example.com"), "a.b@example.com");
  assertEquals(AuthValidator.email.inbox("a+x@example.com"), "a@example.com");
  assertEquals(AuthValidator.email.inbox("a@b+c.com"), "a@b+c.com");
});

Deno.test("phone: international format and equivalent variants", () => {
  const expected = AuthValidator.phone.check("+33612345678");
  assertEquals(expected.status, PhoneCheckStatus.Ok);
  for (const value of ["+33 6 12 34 56 78", "+33-6-12-34-56-78", "0033612345678"]) {
    assertEquals(
      AuthValidator.phone.check(value).value,
      expected.value,
      `variant not normalized : ${value}`,
    );
  }
});

Deno.test("phone: empty and invalid are distinguished", () => {
  assertEquals(AuthValidator.phone.check("").status, PhoneCheckStatus.Empty);
  assertEquals(AuthValidator.phone.check("   ").status, PhoneCheckStatus.Empty);
  assertEquals(AuthValidator.phone.check("123").status, PhoneCheckStatus.Invalid);
});
