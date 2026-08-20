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
