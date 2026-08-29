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
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import { installAuthTestSettings } from "../testing/settings.ts";
import { PendingToken } from "../../lib/src/pending_token.ts";
import { forgeToken } from "../testing/pending_token.ts";

const token = new PendingToken();

installAuthTestSettings();

Scribe.test("the pending token carries the device that triggered the challenge", async () => {
  const raw = await forgeToken("a@example.com", "user", { deviceId: "device-1" });
  const payload = await token.payload(raw);

  expect(payload?.identifier, equals("a@example.com"));
  expect(payload?.role, equals("user"));
  expect(payload?.deviceId, equals("device-1"));
});

Scribe.test("a challenge without a device explicitly carries null", async () => {
  const raw = await forgeToken("a@example.com", "user");
  expect((await token.payload(raw))?.deviceId, equals(null));
});

Scribe.test("the device is covered by the signature: altering it invalidates the token", async () => {
  const raw = await forgeToken("a@example.com", "user", { deviceId: "device-1" });
  const [payloadB64, signature] = raw.split(".");

  const decoded = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
  decoded.deviceId = "device-de-lattaquant";
  const forgedPayload = btoa(JSON.stringify(decoded));

  expect(forgedPayload, isNot(equals(payloadB64)));
  expect(await token.payload(`${forgedPayload}.${signature}`), equals(null));
});

Scribe.test("an expired token is refused", async () => {
  const raw = await forgeToken("a@example.com", "user", { deviceId: "device-1" });
  const [payloadB64, signature] = raw.split(".");
  const decoded = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
  decoded.exp = Date.now() - 1;

  expect(await token.payload(`${btoa(JSON.stringify(decoded))}.${signature}`), equals(null));
});
