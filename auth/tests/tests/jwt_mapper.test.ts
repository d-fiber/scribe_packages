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
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { AuthMapper } from "../../lib/src/gotrue/mappers.ts";
import { installAuthTestSettings } from "../testing/settings.ts";
import { authSettings } from "../../lib/src/settings.ts";

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(header: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSettings.get().jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const HOUR_AHEAD = () => Math.floor(Date.now() / 1000) + 3600;
const HOUR_AGO = () => Math.floor(Date.now() / 1000) - 3600;

async function jwt(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
): Promise<string> {
  const h = base64Url(JSON.stringify(header));
  const p = base64Url(JSON.stringify(claims));
  return `${h}.${p}.${await sign(h, p)}`;
}

installAuthTestSettings();

Scribe.test("a valid admin token resolves to the admin role", async () => {
  const token = await jwt({
    sub: "admin-1",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "admin" },
  });
  expect(await AuthMapper.jwt.accountRole(token), equals("admin"));
});

Scribe.test("a valid token without the admin claim resolves to the user role", async () => {
  const token = await jwt({
    sub: "user-1",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "user" },
  });
  expect(await AuthMapper.jwt.accountRole(token), equals("user"));
});

Scribe.test("a tampered payload is rejected: the signature no longer matches", async () => {
  const token = await jwt({
    sub: "user-1",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "user" },
  });
  const [header, , signature] = token.split(".");
  const forged = base64Url(
    JSON.stringify({ sub: "user-1", exp: HOUR_AHEAD(), app_metadata: { role: "admin" } }),
  );

  expect(await AuthMapper.jwt.accountRole(`${header}.${forged}.${signature}`), equals(null));
});

Scribe.test("the `none` algorithm is refused, signature or not", async () => {
  const header = base64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ sub: "a", exp: HOUR_AHEAD(), app_metadata: { role: "admin" } }),
  );

  expect(await AuthMapper.jwt.accountRole(`${header}.${payload}.`), equals(null));
  expect(await AuthMapper.jwt.accountRole(`${header}.${payload}.anything`), equals(null));
});

Scribe.test("an algorithm other than HS256 is refused even when correctly signed", async () => {
  const token = await jwt(
    { sub: "a", exp: HOUR_AHEAD(), app_metadata: { role: "admin" } },
    { alg: "HS512", typ: "JWT" },
  );
  expect(await AuthMapper.jwt.accountRole(token), equals(null));
});

Scribe.test("an expired token is refused", async () => {
  const token = await jwt({
    sub: "a",
    exp: HOUR_AGO(),
    app_metadata: { role: "admin" },
  });
  expect(await AuthMapper.jwt.accountRole(token), equals(null));
});

Scribe.test("a token without exp is refused", async () => {
  const token = await jwt({ sub: "a", app_metadata: { role: "admin" } });
  expect(await AuthMapper.jwt.accountRole(token), equals(null));
});

Scribe.test("a malformed token is refused without throwing", async () => {
  for (const value of ["", "abc", "a.b", "a.b.c", "..", "....."]) {
    expect(await AuthMapper.jwt.accountRole(value), equals(null), `refused: ${value}`);
  }
});

Scribe.test("a token signed with another secret is refused", async () => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("another-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ sub: "a", exp: HOUR_AHEAD(), app_metadata: { role: "admin" } }),
  );
  const raw = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  expect(await AuthMapper.jwt.accountRole(`${header}.${payload}.${signature}`), equals(null));
});

Scribe.test("expiresInUnverified never returns a negative delay", async () => {
  expect(AuthMapper.jwt.expiresInUnverified(await jwt({ exp: HOUR_AGO() })), equals(0));
  expect(AuthMapper.jwt.expiresInUnverified("garbage"), equals(0));
  const ahead = AuthMapper.jwt.expiresInUnverified(await jwt({ exp: HOUR_AHEAD() }));
  expect(ahead > 3500 && ahead <= 3600, equals(true));
});

Scribe.test("account() returns both the subject and the role", async () => {
  const token = await jwt({
    sub: "user-42",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "user" },
  });

  expect(
    await AuthMapper.jwt.account(token),
    equals({
      userId: "user-42",
      role: "user",
    }),
  );
});

Scribe.test("account() carries the admin role too", async () => {
  const token = await jwt({
    sub: "admin-7",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "admin" },
  });

  expect(
    await AuthMapper.jwt.account(token),
    equals({
      userId: "admin-7",
      role: "admin",
    }),
  );
});

Scribe.test("account() refuses a token without a subject", async () => {
  const token = await jwt({ exp: HOUR_AHEAD(), app_metadata: { role: "user" } });
  expect(await AuthMapper.jwt.account(token), equals(null));
});

Scribe.test("account() applies the same guards as accountRole", async () => {
  const expired = await jwt({ sub: "user-1", exp: HOUR_AGO() });
  const wrongAlg = await jwt(
    { sub: "user-1", exp: HOUR_AHEAD() },
    { alg: "none", typ: "JWT" },
  );

  expect(await AuthMapper.jwt.account(expired), equals(null));
  expect(await AuthMapper.jwt.account(wrongAlg), equals(null));
  expect(await AuthMapper.jwt.account("garbage"), equals(null));
});

Scribe.test("accountRole stays consistent with account()", async () => {
  const token = await jwt({
    sub: "user-9",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "admin" },
  });

  expect(await AuthMapper.jwt.accountRole(token), equals((await AuthMapper.jwt.account(token))?.role ?? null));
});
