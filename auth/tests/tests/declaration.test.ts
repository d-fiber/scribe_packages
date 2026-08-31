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

import "@scribe/runtime/scholium/runner.ts";
import { allOf, equals, expect, fail, isA, isTrue, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { Duration } from "@scribe/alchemy";
import { Failure, okay } from "@scribe/alchemy";
import type { RequestDevice } from "@scribe/contracts/device.ts";
import { BanError } from "../../lib/src/bans.ts";
import { Account, SignInRefusal } from "../../lib/src/declaration/account.ts";
import { Channel } from "../../lib/contracts/channel.ts";
import { Optional, type ReadSelector, Required, type WriteSelector } from "../../lib/src/declaration/columns.ts";
import { installAuthMock } from "../testing/mock.ts";

interface ProfileRow {
  account_id: string;
  first_name: string;
  last_name: string;
  birthday: number | null;
  avatar_url: string | null;
}

interface SettingsRow {
  account_id: string;
  localization: string;
  theme_mode: string;
}

enum UserRefusal {
  Onboarding = "onboarding_required",
}

const user = Account("declaration-user", {
  channels: [Channel.Email, Channel.Phone],

  signUp: (s) => ({
    profile: s.embed("app_user_profiles", (p: WriteSelector<ProfileRow>) => ({
      firstname: Required(p.first_name),
      lastname: Required(p.last_name),
      birthday: Optional(p.birthday),
    })),
    settings: s.embed("app_user_settings", (t: WriteSelector<SettingsRow>) => ({
      localization: Required(t.localization),
    })),
  }),

  get: (s) => ({
    profile: s.embed("app_user_profiles", (p: ReadSelector<ProfileRow>) => ({
      firstname: p.first_name,
      avatar: p.avatar_url,
    })),
  }),

  signIn: ({ account }) => account.profile === null ? new Failure(UserRefusal.Onboarding) : okay,
});

const admin = Account("declaration-admin", {
  channels: [Channel.Email],
  autoConfirm: true,
  signUp: () => ({}),
  get: () => ({}),
});

const device = { device_id: "d1" } as unknown as RequestDevice;
const location = { city: "Paris", country: "FR" };

function seeded() {
  return installAuthMock({ app_user_profiles: [], app_user_settings: [] });
}

Scribe.test("a role answers with the channels and the creation mode it was declared with", () => {
  expect(user.channels, equals([Channel.Email, Channel.Phone]));
  expect(user.autoConfirm, equals(false), "a role that says nothing makes the holder prove what it gave");
  expect(admin.autoConfirm, equals(true));
});

Scribe.test("two roles cannot take the same name", () => {
  expect(
    () => Account("declaration-user", { channels: [Channel.Email], signUp: () => ({}), get: () => ({}) }),
    throwsA(allOf(isA(TypeError), withMessage("declared twice"))),
  );
});

Scribe.test("a sign-up writes the account and one row per declared table", async () => {
  const auth = seeded();

  try {
    const written = await user.create(
      {
        profile: { firstname: "Ada", lastname: "Lovelace", birthday: 1815 },
        settings: { localization: "en" },
      },
      { id: "a1", email: "ada@example.com" },
    );

    expect(written, isTrue);
    expect(
      auth.rows("__accounts__"),
      equals([{
        id: "a1",
        role: "declaration-user",
        email: "ada@example.com",
        phone: null,
        email_verified: false,
        phone_verified: false,
      }]),
    );
    expect(
      auth.rows("app_user_profiles"),
      equals([{
        account_id: "a1",
        first_name: "Ada",
        last_name: "Lovelace",
        birthday: 1815,
      }]),
    );
    expect(auth.rows("app_user_settings"), equals([{ account_id: "a1", localization: "en" }]));
  } finally {
    auth.restore();
  }
});

Scribe.test("a column the caller left out is not written at all", async () => {
  const auth = seeded();

  try {
    await user.create(
      { profile: { firstname: "Ada", lastname: "Lovelace" }, settings: { localization: "en" } },
      { id: "a2" },
    );

    expect(
      auth.rows("app_user_profiles"),
      equals([{
        account_id: "a2",
        first_name: "Ada",
        last_name: "Lovelace",
      }]),
      "an omitted optional column is left to whatever the table defaults it to",
    );
  } finally {
    auth.restore();
  }
});

Scribe.test("a role that declares nothing writes the account and nothing else", async () => {
  const auth = seeded();

  try {
    expect(await admin.create({}, { id: "a3", email: "root@example.com", emailVerified: true }), isTrue);
    expect(auth.rows("__accounts__").length, equals(1));
    expect(auth.rows("app_user_profiles"), equals([]));
  } finally {
    auth.restore();
  }
});

Scribe.test("a ban with no deadline stands until it is lifted", async () => {
  const auth = seeded();
  auth.seed("__accounts__", [{ id: "a1", role: "declaration-user" }]);

  try {
    expect((await user.bans.lay("a1", { reason: "spam" })).ok, isTrue);

    const ban = await user.bans.of("a1");
    expect(ban?.until, equals(null), "a ban that lifts by itself has to be asked for");
    expect(ban?.reason, equals("spam"));

    expect((await user.bans.lift("a1")).ok, isTrue);
    expect(await user.bans.of("a1"), equals(null));
  } finally {
    auth.restore();
  }
});

Scribe.test("a ban whose deadline has passed stops answering", async () => {
  const auth = seeded();
  auth.seed("__account_bans__", [{
    account_id: "a1",
    since: Date.now() - Duration.days(2).inMilliseconds,
    until: Date.now() - Duration.days(1).inMilliseconds,
    reason: null,
  }]);

  try {
    expect(await user.bans.of("a1"), equals(null));
    expect(await user.bans.standing(), equals([]));
  } finally {
    auth.restore();
  }
});

Scribe.test("banning an account no role answers for is refused", async () => {
  const auth = seeded();

  try {
    const result = await user.bans.lay("nobody");
    if (result.ok) fail("banning an account no role answers for must be refused");

    expect(result.error, equals(BanError.NotFound));
  } finally {
    auth.restore();
  }
});

Scribe.test("lifting a ban nobody laid is refused", async () => {
  const auth = seeded();

  try {
    const result = await user.bans.lift("a1");
    if (result.ok) fail("lifting a ban nobody laid must be refused");

    expect(result.error, equals(BanError.NotFound));
  } finally {
    auth.restore();
  }
});

Scribe.test("a banned account is turned away before the role's own condition is asked", async () => {
  const account = {
    id: "a1",
    role: "declaration-user",
    email: null,
    phone: null,
    emailVerified: false,
    phoneVerified: false,
    createdAt: 0,
    banned: { since: 0, until: null, reason: null },
    profile: null,
  };

  const result = await user.admits(account, device, location, Channel.Email);
  if (result.ok) fail("a banned account must be turned away");

  expect(result.error, equals(SignInRefusal.Banned), "the ban answers, not the onboarding condition");
});

Scribe.test("the role's own condition decides once no ban stands", async () => {
  const base = {
    id: "a1",
    role: "declaration-user",
    email: null,
    phone: null,
    emailVerified: false,
    phoneVerified: false,
    createdAt: 0,
    banned: null,
  };

  const refused = await user.admits({ ...base, profile: null }, device, location, Channel.Email);
  if (refused.ok) fail("an account with no profile must be refused for onboarding");

  expect(refused.error, equals(UserRefusal.Onboarding));

  const admitted = await user.admits(
    { ...base, profile: { firstname: "Ada", avatar: null } },
    device,
    location,
    Channel.Email,
  );
  expect(admitted.ok, isTrue);
});

Scribe.test("a role that declares no condition admits whatever no ban stopped", async () => {
  const account = {
    id: "a3",
    role: "declaration-admin",
    email: null,
    phone: null,
    emailVerified: false,
    phoneVerified: false,
    createdAt: 0,
    banned: null,
  };

  expect((await admin.admits(account, device, location, Channel.Email)).ok, isTrue);
});
