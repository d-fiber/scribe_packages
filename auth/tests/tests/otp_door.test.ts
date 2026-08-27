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

import { fakeDevice, withRequest } from "@scribe/testing/runtime/device.ts";
import { installAuthTestSettings } from "../testing/settings.ts";
import { Channel } from "../../lib/contracts/channel.ts";
import type { AccountRole } from "../../lib/contracts/role.ts";
import { OtpChallenge, type OtpChannel } from "../../lib/src/sign_in/otp.ts";
import { OtpError } from "../../lib/src/sign_in/errors.ts";
import { AccountRevocation } from "../../lib/src/revocation.ts";
import { devices } from "../../lib/src/devices/devices.ts";
import { installAuthMock } from "../testing/mock.ts";
import { installMock } from "@scribe/testing/install.ts";
import { assert, assertEquals } from "@std/assert";

installAuthTestSettings();

const DOOR: AccountRole = "member";
const IDENTIFIER = "someone@example.test";
const ACCOUNT = "22222222-2222-2222-2222-222222222222";
const CODE = "123456";

/** A GoTrue answer for an account the identity service says holds `role`. */
function sessionFor(role: string) {
  return {
    access_token: "the-access-token",
    refresh_token: "the-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: ACCOUNT, app_metadata: { role } },
  };
}

/** A channel that sends anything and answers `answer` to a verification. */
function channelAnswering(answer: unknown): OtpChannel {
  return {
    channel: Channel.Email,
    send: () => Promise.resolve({ ok: true, data: undefined } as never),
    verify: () => Promise.resolve({ ok: true, data: answer } as never),
    roleOf: () => Promise.resolve(DOOR),
  } as unknown as OtpChannel;
}

/** Stands the door up, watching what it revokes and what it registers. */
function door(answer: unknown, registers: string | null = "the-device-token") {
  const auth = installAuthMock();
  const revoked: string[] = [];
  const mocks = [
    installMock(AccountRevocation, "session", (token: string) => {
      revoked.push(token);
      return Promise.resolve();
    }),
    installMock(devices, "register", () => Promise.resolve(registers)),
  ];

  return {
    challenge: new OtpChallenge(DOOR, channelAnswering(answer)),
    revoked,
    restore: () => {
      mocks.forEach((mock) => mock.restore());
      auth.restore();
    },
  };
}

/** Opens a challenge and answers the token it minted, inside a request that carries a device. */
function openChallenge(challenge: OtpChallenge): Promise<string> {
  return withRequest(fakeDevice(), async () => {
    const started = await challenge.start(IDENTIFIER);
    assert(
      started.ok,
      "the challenge has to open before anything can be verified",
    );
    return started.data.pendingToken;
  });
}

Deno.test("otp: a session the identity service says holds another role is refused, and revoked", async () => {
  const stand = door(sessionFor("administrator"));

  try {
    const token = await openChallenge(stand.challenge);
    const answer = await withRequest(
      fakeDevice(),
      () => stand.challenge.verify(token, CODE),
    );

    assertEquals(answer.ok, false);
    assertEquals(answer.ok ? null : answer.error, OtpError.InvalidOrExpired);
    assertEquals(
      stand.revoked,
      ["the-access-token"],
      "the session was already minted by the identity service, so refusing without revoking leaves a usable one behind",
    );
  } finally {
    stand.restore();
  }
});

Deno.test("otp: a pending token is spent once, and a second use is refused at the door", async () => {
  const stand = door(sessionFor(DOOR));

  try {
    const token = await openChallenge(stand.challenge);
    const first = await withRequest(
      fakeDevice(),
      () => stand.challenge.verify(token, CODE),
    );
    assert(first.ok, "the first exchange is the one that works");

    const second = await withRequest(
      fakeDevice(),
      () => stand.challenge.verify(token, CODE),
    );

    assertEquals(second.ok, false);
    assertEquals(second.ok ? null : second.error, OtpError.InvalidOrExpired);
    assertEquals(
      stand.revoked,
      [],
      "a spent token is refused at the door, before a second session is ever minted: there is nothing to revoke because nothing was handed out",
    );
  } finally {
    stand.restore();
  }
});

Deno.test("otp: a device that could not be registered hands over no session", async () => {
  const stand = door(sessionFor(DOOR), null);

  try {
    const token = await openChallenge(stand.challenge);
    const answer = await withRequest(
      fakeDevice(),
      () => stand.challenge.verify(token, CODE),
    );

    assertEquals(answer.ok, false);
    assertEquals(answer.ok ? null : answer.error, OtpError.Unexpected);
    assertEquals(stand.revoked, ["the-access-token"]);
  } finally {
    stand.restore();
  }
});
