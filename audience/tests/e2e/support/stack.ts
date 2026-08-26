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

/**
 * What the containers of the rendered fragments answer on, and how a test reaches them.
 *
 * Every port is shifted into the 5xxxx range on purpose: a developer running the real stack of a
 * project keeps 5432, 6379 and 3000, and an end-to-end run must not talk to it by accident.
 */
export const STACK = {
  /** PostgREST, which is where a membership is written and read. */
  restUrl: "http://localhost:53006",

  /** Redis, where a membership answered once is kept for ten minutes. */
  redisUrl: "redis://:e2epass@localhost:56382",

  /** The secret the tokens of this stack are signed with, as `e2e.env` hands it to PostgREST. */
  jwtSecret: "e2e-jwt-secret-long-enough-for-hs256-signing",
} as const;

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * A token PostgREST accepts, carrying `role`.
 *
 * PostgREST reads the role from a signed JWT, so a plain string in `SERVICE_KEY` is
 * answered with `PGRST301`. Minting one here is what makes these tests exercise the same path a
 * deployment takes, and it is also what lets the suite come back as `anon` to check that the
 * table is closed to it.
 */
export async function tokenFor(role: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64Url(
    new TextEncoder().encode(JSON.stringify({ role, iat: now, exp: now + 3600 })),
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STACK.jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`));

  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

/**
 * Points the settings slots at the containers, and mints the token PostgREST needs.
 *
 * @remarks
 * The order of the two halves is the whole point. Settings fill their slots from the environment
 * at import, so the import has to come after the writes and not with the others at the top of the
 * file. Loaded first, every call reaches an unconfigured slot, and the cache answers a miss
 * instead of failing: the run stays green in shape and wrong in substance.
 */
export async function useStack(): Promise<void> {
  const token = await tokenFor("service_role");

  Deno.env.set("REDIS_URL", STACK.redisUrl);
  Deno.env.set("REST_INTERNAL_URL", STACK.restUrl);
  Deno.env.set("SERVICE_KEY", token);
  Deno.env.set("ANON_KEY", token);

  await import("@scribe/testing/settings.ts");
}

/**
 * Refuses to run when the stack is not up, with the command that starts it.
 *
 * A connection refused half way through a suite reads as a broken cache or a broken table. This
 * turns it into one sentence, before the first test.
 */
export async function requireStack(...urls: readonly string[]): Promise<void> {
  for (const url of urls) {
    try {
      const answered = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      await answered.body?.cancel();
    } catch (cause) {
      throw new Error(
        `The end-to-end stack is not answering on ${url}.\n` +
          "Start it with:\n" +
          "  deno task audience:e2e:up\n" +
          `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
}

/**
 * What Postgres answered a direct read of the table under `role`, as its own error code.
 *
 * @remarks
 * The package always talks as `service_role`, so the only way to see what another role is allowed
 * is to ask PostgREST without going through the package at all.
 *
 * The code is what the suite asserts on, and not the HTTP status: the same refusal reaches an
 * anonymous caller as 401 and a signed-in one as 403, because PostgREST maps a role that failed
 * to authenticate differently from one that authenticated and holds no privilege. Both are the
 * same `42501`, which is the fact the table's grants decide.
 */
export async function readAsRole(role: string): Promise<string | null> {
  const token = await tokenFor(role);
  const answered = await fetch(`${STACK.restUrl}/__audiences__?select=member&limit=1`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
  });

  const body = await answered.json();
  return answered.ok ? null : String(body.code);
}

/**
 * A suffix that makes a declaration belong to this run and no other.
 *
 * The rows of a previous run survive in the volume, and an audience is looked up by the name its
 * rows carry: a fixed name would let yesterday's members answer today's assertions.
 */
export const RUN_ID: string = crypto.randomUUID().slice(0, 8);

/**
 * An identifier that belongs to this run, and to no other.
 *
 * A listing by member crosses audiences by design, so it also crosses runs: the rows of a
 * previous one survive in the volume, and `a1` would come back holding what yesterday put there.
 * Scoping the audience name is not enough for those two calls.
 */
export function member(name: string): string {
  return `${name}-${RUN_ID}`;
}

/** How long an operation took, in milliseconds, beside whatever it answered. */
export async function timed<T>(body: () => Promise<T>): Promise<[T, number]> {
  const at = performance.now();
  const value = await body();
  return [value, performance.now() - at];
}

/** Prints one measurement, so a run reads as a report and not only as a pass. */
export function report(label: string, detail: string): void {
  console.log(`    ${label.padEnd(48)} ${detail}`);
}
