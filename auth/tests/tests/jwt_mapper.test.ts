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

import { AuthMapper } from "../../lib/src/gotrue/mappers.ts";
import { installAuthTestSettings } from "../testing/settings.ts";
import { authSettings } from "../../lib/src/settings.ts";
import { assertEquals } from "@std/assert";

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

Deno.test("a valid admin token resolves to the admin role", async () => {
  const token = await jwt({
    sub: "admin-1",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "admin" },
  });
  assertEquals(await AuthMapper.jwt.accountRole(token), "admin");
});

Deno.test("a valid token without the admin claim resolves to the user role", async () => {
  const token = await jwt({
    sub: "user-1",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "user" },
  });
  assertEquals(await AuthMapper.jwt.accountRole(token), "user");
});

Deno.test("a tampered payload is rejected: the signature no longer matches", async () => {
  const token = await jwt({
    sub: "user-1",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "user" },
  });
  const [header, , signature] = token.split(".");
  const forged = base64Url(
    JSON.stringify({ sub: "user-1", exp: HOUR_AHEAD(), app_metadata: { role: "admin" } }),
  );

  assertEquals(await AuthMapper.jwt.accountRole(`${header}.${forged}.${signature}`), null);
});

Deno.test("the `none` algorithm is refused, signature or not", async () => {
  const header = base64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ sub: "a", exp: HOUR_AHEAD(), app_metadata: { role: "admin" } }),
  );

  assertEquals(await AuthMapper.jwt.accountRole(`${header}.${payload}.`), null);
  assertEquals(await AuthMapper.jwt.accountRole(`${header}.${payload}.anything`), null);
});

Deno.test("an algorithm other than HS256 is refused even when correctly signed", async () => {
  const token = await jwt(
    { sub: "a", exp: HOUR_AHEAD(), app_metadata: { role: "admin" } },
    { alg: "HS512", typ: "JWT" },
  );
  assertEquals(await AuthMapper.jwt.accountRole(token), null);
});

Deno.test("an expired token is refused", async () => {
  const token = await jwt({
    sub: "a",
    exp: HOUR_AGO(),
    app_metadata: { role: "admin" },
  });
  assertEquals(await AuthMapper.jwt.accountRole(token), null);
});

Deno.test("a token without exp is refused", async () => {
  const token = await jwt({ sub: "a", app_metadata: { role: "admin" } });
  assertEquals(await AuthMapper.jwt.accountRole(token), null);
});

Deno.test("a malformed token is refused without throwing", async () => {
  for (const value of ["", "abc", "a.b", "a.b.c", "..", "....."]) {
    assertEquals(await AuthMapper.jwt.accountRole(value), null, `refused: ${value}`);
  }
});

Deno.test("a token signed with another secret is refused", async () => {
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

  assertEquals(await AuthMapper.jwt.accountRole(`${header}.${payload}.${signature}`), null);
});

Deno.test("expiresInUnverified never returns a negative delay", async () => {
  assertEquals(AuthMapper.jwt.expiresInUnverified(await jwt({ exp: HOUR_AGO() })), 0);
  assertEquals(AuthMapper.jwt.expiresInUnverified("garbage"), 0);
  const ahead = AuthMapper.jwt.expiresInUnverified(await jwt({ exp: HOUR_AHEAD() }));
  assertEquals(ahead > 3500 && ahead <= 3600, true);
});

Deno.test("account() returns both the subject and the role", async () => {
  const token = await jwt({
    sub: "user-42",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "user" },
  });

  assertEquals(await AuthMapper.jwt.account(token), {
    userId: "user-42",
    role: "user",
  });
});

Deno.test("account() carries the admin role too", async () => {
  const token = await jwt({
    sub: "admin-7",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "admin" },
  });

  assertEquals(await AuthMapper.jwt.account(token), {
    userId: "admin-7",
    role: "admin",
  });
});

Deno.test("account() refuses a token without a subject", async () => {
  const token = await jwt({ exp: HOUR_AHEAD(), app_metadata: { role: "user" } });
  assertEquals(await AuthMapper.jwt.account(token), null);
});

Deno.test("account() applies the same guards as accountRole", async () => {
  const expired = await jwt({ sub: "user-1", exp: HOUR_AGO() });
  const wrongAlg = await jwt(
    { sub: "user-1", exp: HOUR_AHEAD() },
    { alg: "none", typ: "JWT" },
  );

  assertEquals(await AuthMapper.jwt.account(expired), null);
  assertEquals(await AuthMapper.jwt.account(wrongAlg), null);
  assertEquals(await AuthMapper.jwt.account("garbage"), null);
});

Deno.test("accountRole stays consistent with account()", async () => {
  const token = await jwt({
    sub: "user-9",
    exp: HOUR_AHEAD(),
    app_metadata: { role: "admin" },
  });

  assertEquals(
    await AuthMapper.jwt.accountRole(token),
    (await AuthMapper.jwt.account(token))?.role,
  );
});
