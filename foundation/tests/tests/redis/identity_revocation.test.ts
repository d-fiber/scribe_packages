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
import "../../testing/settings.ts";
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, isFalse, isTrue, Scribe } from "@scribe/alchemy/test";
import { IdentityRevocation } from "../../../lib/src/redis/identity_revocation.ts";
import { installFakeRedis } from "./support/redis.ts";
import { installMock } from "../../testing/install.ts";

Scribe.test("a user nobody revoked does not need a re-check", async () => {
  const redis = installFakeRedis();
  try {
    const required = await IdentityRevocation.recheckRequired("u1");
    expect(required, isFalse);
  } finally {
    redis.restore();
  }
});

Scribe.test("revoking a user marks it for a re-check", async () => {
  const redis = installFakeRedis();
  try {
    await IdentityRevocation.revoke("u1");
    const required = await IdentityRevocation.recheckRequired("u1");
    expect(required, isTrue);
  } finally {
    redis.restore();
  }
});

Scribe.test("revoking a user drops the fingerprints remembered for it", async () => {
  const redis = installFakeRedis();
  try {
    await IdentityRevocation.remember("u1", "device-a", 3_600);
    await IdentityRevocation.remember("u1", "device-b", 3_600);
    await IdentityRevocation.revoke("u1");

    expect(redis.raw("identity:jwt:device-a"), equals(null));
    expect(redis.raw("identity:jwt:device-b"), equals(null));
  } finally {
    redis.restore();
  }
});

Scribe.test("revoking a user with nothing remembered deletes no fingerprint key", async () => {
  const redis = installFakeRedis();
  try {
    await IdentityRevocation.revoke("u2");
    expect(
      redis.countOf("unlink"),
      equals(1),
      "forgetting the empty index is still one unlink, but no fingerprint key joins it",
    );
    expect(
      redis.countOf("del"),
      equals(0),
      "no fingerprint means the direct del is never reached",
    );
  } finally {
    redis.restore();
  }
});

Scribe.test("two different users do not share a re-check marker", async () => {
  const redis = installFakeRedis();
  try {
    await IdentityRevocation.revoke("u1");
    const required = await IdentityRevocation.recheckRequired("u2");
    expect(required, isFalse, "revoking u1 must not mark u2");
  } finally {
    redis.restore();
  }
});

Scribe.test("an unreachable store fails recheckRequired closed, answering true", async () => {
  const redis = installFakeRedis();
  const silenced = installMock(console, "error", () => {});
  try {
    redis.failNext("exists", new Error("ECONNREFUSED"));
    const required = await IdentityRevocation.recheckRequired("u1");
    expect(required, isTrue, "a store outage must never hide a revocation");
  } finally {
    silenced.restore();
    redis.restore();
  }
});

Scribe.test("an unreachable store does not throw out of revoke", async () => {
  const redis = installFakeRedis();
  const silenced = installMock(console, "error", () => {});
  try {
    redis.failNext("smembers", new Error("ECONNREFUSED"));
    await IdentityRevocation.revoke("u1");
    expect(
      true,
      isTrue,
      "revoke must never turn a store outage into an unhandled error",
    );
  } finally {
    silenced.restore();
    redis.restore();
  }
});
