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

import { fakeDevice, withRequest } from "@scribe/core/testing/runtime/device.ts";
import { installTestSettings } from "@scribe/core/testing/settings.ts";
import { Channel } from "@scribe/auth/contracts/channel.ts";
import { Account } from "@scribe/auth/src/declaration/account.ts";
import { session } from "@scribe/auth/src/session.ts";
import { installAuthMock } from "@scribe/auth/testing/mock.ts";
import { installGoTrueMock } from "@scribe/auth/testing/gotrue.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";

installTestSettings();

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const DEVICE = fakeDevice().device_id;
const REFRESH = "refresh-token";

const role = Account("guard-user", {
  channels: [Channel.Email],
  signUp: () => ({}),
  get: () => ({}),
});

function renewed() {
  return {
    status: 200,
    body: {
      access_token: "access-token",
      refresh_token: "next-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: ACCOUNT, email: "a@example.com", app_metadata: { role: "guard-user" } },
    },
  };
}

function account() {
  return { id: ACCOUNT, role: "guard-user", email: "a@example.com", phone: null };
}

function device() {
  return {
    id: "row-1",
    account_id: ACCOUNT,
    device_id: DEVICE,
    os: fakeDevice().os,
    model: fakeDevice().model,
    is_physical_device: true,
    device_category: fakeDevice().device_category,
    trusted: true,
    seen_at: Date.now(),
  };
}

function stack(seed: { banned?: boolean; device?: boolean }) {
  const database = installAuthMock({
    __accounts__: [account()],
    __account_devices__: seed.device === false ? [] : [device()],
    __account_bans__: seed.banned ? [{ account_id: ACCOUNT, since: Date.now(), until: null, reason: "spam" }] : [],
  });

  const gotrue = installGoTrueMock({
    "POST /token*": () => renewed(),
    "POST /logout*": () => ({ status: 204 }),
  });

  return {
    gotrue,
    restore: () => {
      gotrue.restore();
      database.restore();
    },
  };
}

Deno.test("a refresh answers a session when nothing stands against the account", async () => {
  const installed = stack({});

  try {
    const renewal = await withRequest(fakeDevice(), () => session.refresh(REFRESH));
    assert(renewal.ok, "an account with no ban and a known device keeps its session");
    assertEquals(renewal.data.role, "guard-user");
  } finally {
    installed.restore();
  }
});

Deno.test("a banned account cannot buy a new access token", async () => {
  const installed = stack({ banned: true });

  try {
    const renewal = await withRequest(fakeDevice(), () => session.refresh(REFRESH));

    assertFalse(renewal.ok, "a ban has to stop the refresh, or the session outlives it forever");
    assert(
      installed.gotrue.paths().includes("POST /logout?scope=global"),
      "the sessions have to go with the refusal, or the access token lives out its hour",
    );
  } finally {
    installed.restore();
  }
});

Deno.test("a ban whose deadline has passed lets the refresh through", async () => {
  const database = installAuthMock({
    __accounts__: [account()],
    __account_devices__: [device()],
    __account_bans__: [{
      account_id: ACCOUNT,
      since: Date.now() - 2000,
      until: Date.now() - 1000,
      reason: null,
    }],
  });
  const gotrue = installGoTrueMock({ "POST /token*": () => renewed(), "POST /logout*": () => ({ status: 204 }) });

  try {
    assert((await withRequest(fakeDevice(), () => session.refresh(REFRESH))).ok);
  } finally {
    gotrue.restore();
    database.restore();
  }
});

Deno.test("a device that was kicked cannot buy a new access token", async () => {
  const installed = stack({ device: false });

  try {
    const renewal = await withRequest(fakeDevice(), () => session.refresh(REFRESH));

    assertFalse(renewal.ok, "a kick has to stop the refresh, or the device keeps working forever");
  } finally {
    installed.restore();
  }
});

Deno.test("a recovery is held to the same two conditions as a refresh", async () => {
  const installed = stack({ banned: true });

  try {
    assertFalse((await withRequest(fakeDevice(), () => session.recover("access-token", REFRESH))).ok);
  } finally {
    installed.restore();
  }
});

Deno.test("the role scopes a ban read, so another role's ban is not this one's", async () => {
  const database = installAuthMock({
    __accounts__: [{ id: ACCOUNT, role: "somebody-else", email: null, phone: null }],
    __account_bans__: [{ account_id: ACCOUNT, since: Date.now(), until: null, reason: "spam" }],
  });

  try {
    assertEquals(await role.bans.of(ACCOUNT), null, "this role does not answer for an account it does not hold");
  } finally {
    database.restore();
  }
});
