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

import type { AccountRow } from "../../lib/contracts/account.ts";
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
} from "../../lib/src/declaration/columns.ts";
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
  profile: readShape.embed(
    "app_user_profiles",
    (p: ReadSelector<ProfileRow>) => ({
      firstname: p.first_name,
      avatar: p.avatar_url,
    }),
  ),
};

const write = {
  profile: writeShape.embed(
    "app_user_profiles",
    (p: WriteSelector<ProfileRow>) => ({
      firstname: Required(p.first_name),
      birthday: Optional(p.birthday),
    }),
  ),
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
  const full: WriteOf<typeof write> = {
    profile: { firstname: "Ada", birthday: 1815 },
  };
  const partial: WriteOf<typeof write> = { profile: { firstname: "Ada" } };

  assertEquals(full.profile.birthday, 1815);
  assertEquals(partial.profile.birthday, undefined);
});
