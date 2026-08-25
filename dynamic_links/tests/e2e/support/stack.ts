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
 * Every port is shifted into the 5xxxx range on purpose: a developer running the real stack of
 * a project keeps 5432, 6379, 4222 and 3000, and an end-to-end run must not talk to it by
 * accident.
 */
export const STACK = {
  /** PostgREST, which is where a link is written and read. */
  restUrl: "http://localhost:53005",

  /** Redis, where a resolved slug is kept for ten minutes. */
  redisUrl: "redis://:e2epass@localhost:56381",

  /** NATS, which carries a visit from the node that served the link to its table. */
  natsUrl: "nats://e2epass@localhost:54223",

  /** What NATS answers its health on, which is the cheapest proof the stack is up. */
  natsMonitorUrl: "http://localhost:58223",

  /** The secret the tokens of this stack are signed with, as `e2e.env` hands it to PostgREST. */
  jwtSecret: "e2e-jwt-secret-long-enough-for-hs256-signing",
} as const;

/** The name the statistics queue is declared under, which is what a drain pass is aimed at. */
export const STATISTICS_QUEUE = "dynamic-link-statistics";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * A `service_role` token PostgREST accepts.
 *
 * PostgREST reads the role from a signed JWT, so a plain string in `SUPABASE_SERVICE_ROLE_KEY`
 * is answered with `PGRST301`. Minting one here is what makes these tests exercise the same
 * path a deployment takes, rather than an anonymous one, which matters twice over for a package
 * whose tables are closed to `authenticated` and `anon`.
 */
export async function serviceToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64Url(
    new TextEncoder().encode(JSON.stringify({ role: "service_role", iat: now, exp: now + 3600 })),
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
 * The order of the two halves is the whole point. Settings fill their slots from the
 * environment at import, so the import has to come after the writes and not with the others at
 * the top of the file. Loaded first, every call reaches an unconfigured slot, and the cache
 * answers a miss instead of failing: the run stays green in shape and wrong in substance.
 */
export async function useStack(): Promise<void> {
  const token = await serviceToken();

  Deno.env.set("REDIS_URL", STACK.redisUrl);
  Deno.env.set("NATS_URL", STACK.natsUrl);
  Deno.env.set("SUPABASE_REST_INTERNAL_URL", STACK.restUrl);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", token);
  Deno.env.set("SUPABASE_ANON_KEY", token);

  await import("@scribe/testing/settings.ts");
}

/**
 * Refuses to run when the stack is not up, with the command that starts it.
 *
 * A connection refused half way through a suite reads as a broken cache or a broken queue. This
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
          "  deno task dynamic_links:e2e:up\n" +
          `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
}

/**
 * A suffix that makes a declaration belong to this run and no other.
 *
 * The rows of a previous run survive in the volume, and a declaration is looked up by the name
 * its rows carry: a fixed name would let yesterday's links resolve into today's assertions.
 */
export const RUN_ID: string = crypto.randomUUID().slice(0, 8);

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
