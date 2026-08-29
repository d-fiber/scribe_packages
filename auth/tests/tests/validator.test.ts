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
import "@scribe/testing/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import {
  AuthValidator,
  EmailCheckStatus,
  PasswordCheckStatus,
  PasswordPresenceStatus,
  PhoneCheckStatus,
} from "../../lib/src/validator.ts";
Scribe.test("presence() does not apply the policy: a weak password gets through", () => {
  expect(AuthValidator.password.presence("abc"), equals(PasswordPresenceStatus.Ok));
  expect(AuthValidator.password.presence("motdepasse"), equals(PasswordPresenceStatus.Ok));
});

Scribe.test("presence() refuses empty input and whitespace only", () => {
  expect(AuthValidator.password.presence(""), equals(PasswordPresenceStatus.Empty));
  expect(AuthValidator.password.presence("   "), equals(PasswordPresenceStatus.Empty));
});

Scribe.test("presence() bounds the length so bcrypt never gets a huge input", () => {
  expect(AuthValidator.password.presence("x".repeat(128)), equals(PasswordPresenceStatus.Ok));
  expect(AuthValidator.password.presence("x".repeat(129)), equals(PasswordPresenceStatus.TooLong));
});

Scribe.test("check() does apply the policy, and stays reserved for sign-up", () => {
  expect(AuthValidator.password.check("abc").status, equals(PasswordCheckStatus.Invalid));
  expect(AuthValidator.password.check("password1").status, equals(PasswordCheckStatus.Invalid));
  expect(AuthValidator.password.check("PASSWORD1").status, equals(PasswordCheckStatus.Invalid));
  expect(AuthValidator.password.check("Password").status, equals(PasswordCheckStatus.Invalid));
  expect(AuthValidator.password.check("Soleil2Alpha").status, equals(PasswordCheckStatus.Ok));
});

Scribe.test("check() rejects a common word dressed up to pass composition", () => {
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
    expect(
      AuthValidator.password.check(weak).status,
      equals(PasswordCheckStatus.Invalid),
      `"${weak}" is a common base with a numeric tail`,
    );
  }
});

Scribe.test("check() keeps a common word that is only a fragment", () => {
  for (
    const strong of [
      "Soleil2Alpha",
      "Welcome7Harbour",
      "Qwerty4Meridian",
    ]
  ) {
    expect(
      AuthValidator.password.check(strong).status,
      equals(PasswordCheckStatus.Ok),
      `"${strong}" carries real material past the common word`,
    );
  }
});

Scribe.test("check() enforces the 10 character floor", () => {
  expect(
    AuthValidator.password.check("Kavr7Nuq").status,
    equals(PasswordCheckStatus.Invalid),
    "eight characters is below the floor, however well composed",
  );
  expect(AuthValidator.password.check("Kavr7Nuqel").status, equals(PasswordCheckStatus.Ok));
});

Scribe.test("check() rejects known-bad passwords even when well formed", () => {
  for (
    const banned of ["Password123", "Azerty123", "Welcome123", "Qwerty123"]
  ) {
    expect(
      AuthValidator.password.check(banned).status,
      equals(PasswordCheckStatus.Invalid),
      `${banned} satisfies the character classes but is a top-list password`,
    );
  }
});

Scribe.test("check() rejects repeated and sequential runs", () => {
  expect(
    AuthValidator.password.check("Aaaaa1bcdX").status,
    equals(PasswordCheckStatus.Invalid),
    "four identical characters in a row",
  );
  expect(
    AuthValidator.password.check("Xy1abcdePq").status,
    equals(PasswordCheckStatus.Invalid),
    "four ascending characters in a row",
  );
  expect(
    AuthValidator.password.check("Xy1dcbaePq").status,
    equals(PasswordCheckStatus.Invalid),
    "four descending characters in a row",
  );
  expect(
    AuthValidator.password.check("Xy1abXdePq").status,
    equals(PasswordCheckStatus.Ok),
    "three in a row stays acceptable, the rule targets runs of four",
  );
});

Scribe.test("email: lowercased and trimmed", () => {
  const result = AuthValidator.email.check("  U1@Example.COM ");
  expect(result.status, equals(EmailCheckStatus.Ok));
  expect(result.value, equals("u1@example.com"));
});

Scribe.test("email: invalid forms refused", () => {
  for (const value of ["", "   "]) {
    expect(AuthValidator.email.check(value).status, equals(EmailCheckStatus.Empty));
  }
  for (const value of ["u1", "u1@", "@example.com", "u1@example", "a b@c.d"]) {
    expect(AuthValidator.email.check(value).status, equals(EmailCheckStatus.Invalid), `expected invalid : ${value}`);
  }
});

Scribe.test("email: length bounded to 254", () => {
  const long = "a".repeat(250) + "@e.fr";
  expect(AuthValidator.email.check(long).status, equals(EmailCheckStatus.Invalid));
});

Scribe.test("inbox() does not merge two genuinely distinct mailboxes", () => {
  expect(AuthValidator.email.inbox("a.b@example.com"), equals("a.b@example.com"));
  expect(AuthValidator.email.inbox("a+x@example.com"), equals("a@example.com"));
  expect(AuthValidator.email.inbox("a@b+c.com"), equals("a@b+c.com"));
});

Scribe.test("phone: international format and equivalent variants", () => {
  const expected = AuthValidator.phone.check("+33612345678");
  expect(expected.status, equals(PhoneCheckStatus.Ok));
  for (
    const value of ["+33 6 12 34 56 78", "+33-6-12-34-56-78", "0033612345678"]
  ) {
    expect(AuthValidator.phone.check(value).value, equals(expected.value), `variant not normalized : ${value}`);
  }
});

Scribe.test("phone: empty and invalid are distinguished", () => {
  expect(AuthValidator.phone.check("").status, equals(PhoneCheckStatus.Empty));
  expect(AuthValidator.phone.check("   ").status, equals(PhoneCheckStatus.Empty));
  expect(AuthValidator.phone.check("123").status, equals(PhoneCheckStatus.Invalid));
});
