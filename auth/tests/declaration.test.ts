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

import { Time } from "@scribe/core/contracts/common/time.ts";
import { Failure, OK } from "@scribe/core/contracts/result.ts";
import type { RequestDevice } from "@scribe/core/contracts/device.ts";
import { BanError } from "@scribe/auth/src/bans.ts";
import { Account, SignInRefusal } from "@scribe/auth/src/declaration/account.ts";
import { Channel } from "@scribe/auth/contracts/channel.ts";
import { Optional, type ReadSelector, Required, type WriteSelector } from "@scribe/auth/src/declaration/columns.ts";
import { installAuthMock } from "@scribe/auth/testing/mock.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

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

  signIn: ({ account }) => account.profile === null ? new Failure(UserRefusal.Onboarding) : new OK(),
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

Deno.test("a role answers with the channels and the creation mode it was declared with", () => {
  assertEquals(user.channels, [Channel.Email, Channel.Phone]);
  assertEquals(user.autoConfirm, false, "a role that says nothing makes the holder prove what it gave");
  assertEquals(admin.autoConfirm, true);
});

Deno.test("two roles cannot take the same name", () => {
  assertThrows(
    () => Account("declaration-user", { channels: [Channel.Email], signUp: () => ({}), get: () => ({}) }),
    TypeError,
    "declared twice",
  );
});

Deno.test("a sign-up writes the account and one row per declared table", async () => {
  const auth = seeded();

  try {
    const written = await user.create(
      {
        profile: { firstname: "Ada", lastname: "Lovelace", birthday: 1815 },
        settings: { localization: "en" },
      },
      { id: "a1", email: "ada@example.com" },
    );

    assert(written);
    assertEquals(auth.rows("__accounts__"), [{
      id: "a1",
      role: "declaration-user",
      email: "ada@example.com",
      phone: null,
      email_verified: false,
      phone_verified: false,
    }]);
    assertEquals(auth.rows("app_user_profiles"), [{
      account_id: "a1",
      first_name: "Ada",
      last_name: "Lovelace",
      birthday: 1815,
    }]);
    assertEquals(auth.rows("app_user_settings"), [{ account_id: "a1", localization: "en" }]);
  } finally {
    auth.restore();
  }
});

Deno.test("a column the caller left out is not written at all", async () => {
  const auth = seeded();

  try {
    await user.create(
      { profile: { firstname: "Ada", lastname: "Lovelace" }, settings: { localization: "en" } },
      { id: "a2" },
    );

    assertEquals(auth.rows("app_user_profiles"), [{
      account_id: "a2",
      first_name: "Ada",
      last_name: "Lovelace",
    }], "an omitted optional column is left to whatever the table defaults it to");
  } finally {
    auth.restore();
  }
});

Deno.test("a role that declares nothing writes the account and nothing else", async () => {
  const auth = seeded();

  try {
    assert(await admin.create({}, { id: "a3", email: "root@example.com", emailVerified: true }));
    assertEquals(auth.rows("__accounts__").length, 1);
    assertEquals(auth.rows("app_user_profiles"), []);
  } finally {
    auth.restore();
  }
});

Deno.test("a ban with no deadline stands until it is lifted", async () => {
  const auth = seeded();
  auth.seed("__accounts__", [{ id: "a1", role: "declaration-user" }]);

  try {
    assert((await user.bans.lay("a1", { reason: "spam" })).ok);

    const ban = await user.bans.of("a1");
    assertEquals(ban?.until, null, "a ban that lifts by itself has to be asked for");
    assertEquals(ban?.reason, "spam");

    assert((await user.bans.lift("a1")).ok);
    assertEquals(await user.bans.of("a1"), null);
  } finally {
    auth.restore();
  }
});

Deno.test("a ban whose deadline has passed stops answering", async () => {
  const auth = seeded();
  auth.seed("__account_bans__", [{
    account_id: "a1",
    since: Date.now() - Time.days(2).ms,
    until: Date.now() - Time.days(1).ms,
    reason: null,
  }]);

  try {
    assertEquals(await user.bans.of("a1"), null);
    assertEquals(await user.bans.standing(), []);
  } finally {
    auth.restore();
  }
});

Deno.test("banning an account no role answers for is refused", async () => {
  const auth = seeded();

  try {
    const result = await user.bans.lay("nobody");
    assert(!result.ok);
    assertEquals(result.error, BanError.NotFound);
  } finally {
    auth.restore();
  }
});

Deno.test("lifting a ban nobody laid is refused", async () => {
  const auth = seeded();

  try {
    const result = await user.bans.lift("a1");
    assert(!result.ok);
    assertEquals(result.error, BanError.NotFound);
  } finally {
    auth.restore();
  }
});

Deno.test("a banned account is turned away before the role's own condition is asked", async () => {
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

  assert(!result.ok);
  assertEquals(result.error, SignInRefusal.Banned, "the ban answers, not the onboarding condition");
});

Deno.test("the role's own condition decides once no ban stands", async () => {
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
  assert(!refused.ok);
  assertEquals(refused.error, UserRefusal.Onboarding);

  const admitted = await user.admits(
    { ...base, profile: { firstname: "Ada", avatar: null } },
    device,
    location,
    Channel.Email,
  );
  assert(admitted.ok);
});

Deno.test("a role that declares no condition admits whatever no ban stopped", async () => {
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

  assert((await admin.admits(account, device, location, Channel.Email)).ok);
});
