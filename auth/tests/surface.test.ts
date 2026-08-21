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

import { Account } from "@scribe/auth/src/declaration/account.ts";
import { Channel } from "@scribe/auth/contracts/channel.ts";
import { Optional, type ReadSelector, Required, type WriteSelector } from "@scribe/auth/src/declaration/columns.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";

interface ProfileRow {
  account_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

const user = Account("surface-user", {
  channels: [Channel.Email, Channel.Phone, Channel.Google],
  signUp: (s) => ({
    profile: s.embed("app_user_profiles", (p: WriteSelector<ProfileRow>) => ({
      firstname: Required(p.first_name),
      lastname: Optional(p.last_name),
    })),
  }),
  get: (s) => ({
    profile: s.embed("app_user_profiles", (p: ReadSelector<ProfileRow>) => ({ avatar: p.avatar_url })),
  }),
});

const operator = Account("surface-operator", {
  channels: [Channel.Email],
  autoConfirm: true,
  signUp: () => ({}),
  get: () => ({}),
});

function doors(surface: object): string[] {
  return Object.keys(surface).sort();
}

Deno.test("a sign-up offers exactly the doors the role declared", () => {
  assertEquals(doors(user.signUp), ["email", "google", "phone"]);
  assertEquals(doors(operator.signUp), ["email"]);
});

Deno.test("a sign-in offers exactly the doors the role declared", () => {
  assertEquals(doors(user.signIn), ["email", "google", "phone"]);
  assertEquals(doors(operator.signIn), ["email"]);
});

Deno.test("only the doors that send a code carry the code exchange", () => {
  assert("verify" in user.signIn.email, "an address is proven by a code when the device is new");
  assert("resend" in user.signIn.phone, "a number is proven by a code");
  assertFalse("verify" in user.signIn.google, "an identity another provider vouched for needs no code");
});

Deno.test("a role carries its own reset, and shares the session and the password", () => {
  assertEquals(typeof user.resetPassword.complete, "function");
  assertEquals(typeof user.session.refresh, "function");
  assertEquals(typeof user.password.update, "function");
  assertEquals(typeof user.identifier.email, "function");
});

Deno.test("a role that auto-confirms serves without a proof coming back", () => {
  assertEquals(operator.autoConfirm, true);
  assertEquals(user.autoConfirm, false);
});
