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
 * a project keeps 4000, 5432 and 3000, and an end-to-end run must not talk to it by accident.
 *
 * The websocket host is not `localhost`. Realtime picks its tenant from the first label of the
 * Host header, which is why a deployment names the container `realtime-dev.<something>` and
 * puts the gateway in front. A run that dialled `localhost` would reach a tenant that does not
 * exist, and every join would answer with no reply at all.
 */
export const STACK = {
  socketUrl: "ws://realtime-dev.localhost:54001/socket/websocket",
  healthUrl: "http://realtime-dev.localhost:54001/api/tenants/realtime-dev/health",
  restUrl: "http://localhost:53002",
  jwtSecret: "e2e-jwt-secret-long-enough-for-hs256-signing",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InNjcmliZSIsImlhdCI6MTc2NzIyNTYwMCwiZXhwIjo0MTAyNDQ0ODAwfQ.MwqtYvkgqU7cXxCu1ZtM4CGBL3iFpfxF-0tgx2j8x7w",
} as const;

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * A token Realtime and PostgREST both accept, for the account `sub` under `role`.
 *
 * The policies read `auth.jwt()->>'sub'`, so a plain string would leave every private join
 * refused for a reason that reads like a broken policy rather than a missing signature.
 */
export async function tokenFor(sub: string, role = "authenticated"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64Url(
    new TextEncoder().encode(JSON.stringify({ role, sub, iat: now, exp: now + 3600 })),
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STACK.jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );

  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

/** Points the settings slots at the containers, then loads the settings that read them. */
export async function useStack(): Promise<void> {
  const token = await tokenFor("00000000-0000-0000-0000-000000000000", "service_role");

  Deno.env.set("SUPABASE_REST_INTERNAL_URL", STACK.restUrl);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", token);
  Deno.env.set("SUPABASE_ANON_KEY", STACK.anonKey);

  await import("@scribe/core/testing/settings.ts");
}

/** Refuses to run when the stack is not up, with the command that starts it. */
export async function requireStack(): Promise<void> {
  for (const url of [STACK.healthUrl, `${STACK.restUrl}/`]) {
    try {
      const answered = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      await answered.body?.cancel();
    } catch (cause) {
      throw new Error(
        `The end-to-end stack is not answering on ${url}.\n` +
          "Start it with:\n" +
          "  deno task realtime:e2e:up\n" +
          `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
}

/** What one listener heard while it was subscribed. */
export interface Heard {
  /** What the join answered: `ok` when the policies let the caller in. */
  readonly status: string;

  /** The payloads that arrived, in the order Realtime delivered them. */
  readonly payloads: Record<string, unknown>[];
}

/**
 * Subscribes to `channel` and answers what it heard once `window` has passed.
 *
 * @param channel - The full channel, exactly as a `Destination` builds it.
 * @param options - `token` is the session the caller presents, absent for no session at all.
 * `private` says which of the two Realtime modes to join in, which has to match how the
 * channel was declared.
 */
export function listenOn(
  channel: string,
  options: { token?: string; private: boolean; window?: number },
): Promise<Heard> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${STACK.socketUrl}?apikey=${STACK.anonKey}&vsn=1.0.0`);
    const payloads: Record<string, unknown>[] = [];
    let status = "no reply";

    ws.onopen = () =>
      ws.send(JSON.stringify({
        topic: `realtime:${channel}`,
        event: "phx_join",
        ref: "1",
        payload: {
          config: { broadcast: { self: true }, private: options.private },
          ...(options.token ? { access_token: options.token } : {}),
        },
      }));

    ws.onerror = () => {
      status = "socket error";
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.event === "phx_reply") status = message.payload?.status ?? "unknown";
      if (message.event === "broadcast") payloads.push(message.payload?.payload ?? {});
    };

    const done = () => resolve({ status, payloads });
    ws.onclose = done;

    setTimeout(() => {
      if (ws.readyState === WebSocket.CLOSED) {
        done();
        return;
      }
      ws.close();
    }, options.window ?? 6_000);
  });
}

/** A suffix that makes a name belong to this run and no other. */
export const RUN_ID: string = crypto.randomUUID().slice(0, 8);

/** How long an operation took, in milliseconds, beside whatever it answered. */
export async function timed<T>(body: () => Promise<T>): Promise<[T, number]> {
  const at = performance.now();
  const value = await body();
  return [value, performance.now() - at];
}

/** Prints one measurement, so a run reads as a report and not only as a pass. */
export function report(label: string, detail: string): void {
  console.log(`    ${label.padEnd(46)} ${detail}`);
}

/** What one container was spending when it was sampled. */
export interface Usage {
  /** The container the sample belongs to. */
  readonly name: string;

  /** Percent of one host core, as Docker reports it. */
  readonly cpu: number;

  /** Resident memory in mebibytes. */
  readonly memory: number;
}

/**
 * Samples what every container of the stack is spending, once.
 *
 * It shells out to `docker stats` rather than reading cgroups, because the suite runs on a
 * developer machine where the containers are the only thing measurable from outside.
 */
export async function sampleUsage(): Promise<Usage[]> {
  const out = await new Deno.Command("docker", {
    args: ["stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"],
  }).output();

  return new TextDecoder().decode(out.stdout)
    .trim()
    .split("\n")
    .filter((line) => line.includes("realtime-e2e") || line.includes("realtime-dev"))
    .map((line) => {
      const [name, cpu, memory] = line.split("\t");
      return {
        name,
        cpu: Number.parseFloat(cpu.replace("%", "")),
        memory: toMebibytes(memory.split("/")[0].trim()),
      };
    });
}

function toMebibytes(value: string): number {
  const amount = Number.parseFloat(value);
  if (value.endsWith("GiB")) return amount * 1024;
  if (value.endsWith("KiB")) return amount / 1024;
  if (value.endsWith("B") && !value.endsWith("iB")) return amount / (1024 * 1024);
  return amount;
}
