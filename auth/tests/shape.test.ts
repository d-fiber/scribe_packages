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

import type { AccountRow } from "@scribe/auth/contracts/account.ts";
import {
  compileRead,
  Optional,
  type ReadOf,
  type ReadSelector,
  readSelector,
  Required,
  type WriteOf,
  type WriteSelector,
  writeSelector,
} from "@scribe/auth/src/declaration/columns.ts";
import { assertEquals } from "@std/assert";

interface ProfileRow {
  account_id: string;
  first_name: string;
  last_name: string;
  birthday: number | null;
  avatar_url: string | null;
}

const readShape = readSelector<AccountRow>();
const writeShape = writeSelector<AccountRow>();

const read = {
  email: readShape.email,
  profile: readShape.embed("app_user_profiles", (p: ReadSelector<ProfileRow>) => ({
    firstname: p.first_name,
    avatar: p.avatar_url,
  })),
};

const write = {
  profile: writeShape.embed("app_user_profiles", (p: WriteSelector<ProfileRow>) => ({
    firstname: Required(p.first_name),
    birthday: Optional(p.birthday),
  })),
};

Deno.test("a read compiles into a selection that aliases every entry to the name it was given", () => {
  assertEquals(
    compileRead(read),
    "email:email,profile:app_user_profiles(firstname:first_name,avatar:avatar_url)",
  );
});

Deno.test("a read answers with the names the shape gave, typed by the columns behind them", () => {
  const answer: ReadOf<typeof read> = {
    email: "ada@example.com",
    profile: { firstname: "Ada", avatar: null },
  };

  assertEquals(answer.profile?.firstname, "Ada");
  assertEquals(answer.profile?.avatar, null);
});

Deno.test("a folded table that answered nothing reads as null rather than as an empty row", () => {
  const answer: ReadOf<typeof read> = { email: null, profile: null };

  assertEquals(answer.profile, null);
});

Deno.test("a sign-up asks for the required columns and lets the optional ones be left out", () => {
  const full: WriteOf<typeof write> = { profile: { firstname: "Ada", birthday: 1815 } };
  const partial: WriteOf<typeof write> = { profile: { firstname: "Ada" } };

  assertEquals(full.profile.birthday, 1815);
  assertEquals(partial.profile.birthday, undefined);
});
