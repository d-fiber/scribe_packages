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

/** The Compose project `tool/e2e/up.sh storage` starts, which is how its containers are found again. */
const PROJECT = "scribe-storage-e2e";

/**
 * The host port Docker gave `service` for the port `inside` its container.
 *
 * Nothing here publishes a fixed number, because a fixed number belongs to the whole machine
 * rather than to one run: two harnesses, or a harness and a project stack, end up fighting over
 * it. Docker takes a free one at start instead, so the running project is the only place it can
 * be read back from.
 */
async function hostPort(service: string, inside: number): Promise<number> {
  const shown = await new Deno.Command("docker", {
    args: ["compose", "--project-name", PROJECT, "port", service, String(inside)],
    stdout: "piped",
    stderr: "piped",
  }).output();

  const line = new TextDecoder().decode(shown.stdout).trim().split("\n").at(-1) ?? "";
  const port = Number.parseInt(line.slice(line.lastIndexOf(":") + 1), 10);

  if (!shown.success || !Number.isInteger(port)) {
    throw new Error(
      `Docker does not say which host port ${PROJECT}/${service} publishes ${inside} on.\n` +
        "Start the stack with:\n" +
        "  bash tool/e2e/up.sh storage\n" +
        `Cause: ${new TextDecoder().decode(shown.stderr).trim() || line || "no output at all"}`,
    );
  }

  return port;
}

/** Where the storage service answers on the host, which three of the slots below share. */
const STORAGE_URL = `http://localhost:${await hostPort("storage", 5000)}`;

/**
 * What the containers of the rendered fragments answer on, and how a test reaches them.
 *
 * No port is written down here. Each one is asked of Docker at import, because the harness
 * publishes on whatever the machine has free rather than on a number a project stack, or a
 * second harness, would want as well.
 */
export const STACK = {
  /** The storage service, reached the way the package reaches it, without the gateway prefix. */
  storageUrl: STORAGE_URL,

  /** PostgREST, which is where the index is written and read. */
  restUrl: `http://localhost:${await hostPort("rest", 3000)}`,

  /** The bucket a declaration named `public` writes to. */
  publicBucket: "public_bucket",

  /** The bucket a declaration named `private` writes to. */
  privateBucket: "private_bucket",

  /** The key that bypasses row level security, which is what the package presents. */
  serviceKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic2NyaWJlIiwiaWF0IjoxNzY3MjI1NjAwLCJleHAiOjQxMDI0NDQ4MDB9.VkEdDfE9pIwi1dbxkqUzR17ngZuNTSvhX0dYLPaWEuE",

  /** A session whose token carries the admin role the private policy demands. */
  adminKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsImlzcyI6InNjcmliZSIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDBhMSIsImFwcF9tZXRhZGF0YSI6eyJyb2xlIjoiYWRtaW4ifSwiaWF0IjoxNzY3MjI1NjAwLCJleHAiOjQxMDI0NDQ4MDB9.JOjxsP2RVX9oR9O_khkOPdJw9qefR9JLSqp3lSO8JRI",

  /** A session whose token carries no admin role, which is what the private policy refuses. */
  userKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsImlzcyI6InNjcmliZSIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDBiMSIsImFwcF9tZXRhZGF0YSI6eyJyb2xlIjoidXNlciJ9LCJpYXQiOjE3NjcyMjU2MDAsImV4cCI6NDEwMjQ0NDgwMH0.16MaVIEt_CI2938ukqBZ5mFiDBUXX_QR-zQ-uDDfj7M",

  /** Where a public object is served from, as the package builds the URL. */
  appUrl: STORAGE_URL,

  /** Where a private object is served from, as the package builds the URL. */
  adminUrl: STORAGE_URL,
} as const;

/** Points the settings slots at the containers, then loads the settings that read them. */
export async function useStack(): Promise<void> {
  Deno.env.set("REST_INTERNAL_URL", STACK.restUrl);
  Deno.env.set("STORAGE_INTERNAL_URL", STACK.storageUrl);
  Deno.env.set("SERVICE_KEY", STACK.serviceKey);
  Deno.env.set("APP_URL", STACK.appUrl);
  Deno.env.set("ADMIN_URL", STACK.adminUrl);

  await import("@scribe/testing/settings.ts");

  const { StorageTransports } = await import("../../../lib/src/bucket/registry.ts");
  const { SupabaseStorageTransport } = await import("../../../lib/src/bucket/supabase.ts");
  StorageTransports.use(new SupabaseStorageTransport());
}

/** Refuses to run when the stack is not up, with the command that starts it. */
export async function requireStack(): Promise<void> {
  for (const url of [`${STACK.storageUrl}/status`, `${STACK.restUrl}/`]) {
    try {
      const answered = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      await answered.body?.cancel();
    } catch (cause) {
      throw new Error(
        `The end-to-end stack is not answering on ${url}.\n` +
          "Start it with:\n" +
          "  deno task storage:e2e:up\n" +
          `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
}

/** What one read of an object over HTTP answered. */
export interface Fetched {
  /** The status the storage service replied with. */
  readonly status: number;

  /** What the body held, empty when the service answered without one. */
  readonly body: string;
}

/**
 * Reads `path` out of `bucket` the way a client would, and answers what came back.
 *
 * @param options - `token` is the session presented, absent for a caller holding nothing but the
 * address. `open` reads through the unauthenticated route a public bucket is served on, which is
 * the one an `<img>` uses.
 */
export async function fetchObject(
  bucket: string,
  path: string,
  options: { token?: string; open?: boolean } = {},
): Promise<Fetched> {
  const route = options.open ? `object/public/${bucket}/${path}` : `object/${bucket}/${path}`;
  const answered = await fetch(`${STACK.storageUrl}/${route}`, {
    headers: options.token ? { apikey: options.token, Authorization: `Bearer ${options.token}` } : {},
    signal: AbortSignal.timeout(10_000),
  });

  return { status: answered.status, body: await answered.text() };
}

/** A suffix that makes a path belong to this run and no other. */
export const RUN_ID: string = crypto.randomUUID().slice(0, 8);

/** Prints one measurement, so a run reads as a report and not only as a pass. */
export function report(label: string, detail: string): void {
  console.log(`    ${label.padEnd(46)} ${detail}`);
}
