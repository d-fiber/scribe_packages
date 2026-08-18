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

import { AsyncLocalStorage } from "node:async_hooks";
import type { Client } from "./client.ts";
import { FetchClient } from "./fetch_client.ts";

const _current = new AsyncLocalStorage<Client>();

/**
 * Runs `body` with `client` as the one the top-level functions use.
 *
 * It is how a test replaces the network without any code under test taking a client as a
 * parameter: the substitution follows the asynchronous call tree, so everything `body` awaits
 * sees it and nothing outside does.
 *
 * ```ts
 * await runWithClient(() => signIn(), () => new FakeClient());
 * ```
 */
export function runWithClient<T>(
  body: () => T,
  clientFactory: () => Client,
): T {
  return _current.run(clientFactory(), body);
}

/** The client the top-level functions use here: the one in scope, or a fresh real one. */
export function currentClient(): Client {
  return _current.getStore() ?? new FetchClient();
}
