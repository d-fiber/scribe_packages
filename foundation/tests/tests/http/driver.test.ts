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

import { Caches, Crons, Databases, FileSystems, Hooks, Now, Queues, RateLimiters, Triggers } from "@scribe/alchemy";
import { Clients } from "@scribe/alchemy/http";
import { Loggers } from "@scribe/alchemy/observe";
import { FetchClient, FetchClients } from "../../../lib/src/http/fetch_client.ts";
import { scribe } from "@scribe/foundation";
import { assert, assertEquals, assertNotStrictEquals } from "@std/assert";

Deno.test("the driver opens a client that goes on the network", () => {
  const client = new FetchClients().open();

  assert(client instanceof FetchClient, "the driver of this package is the one that reaches fetch");
  client.close();
});

Deno.test("each call opens its own client, since a caller closes what it was given", () => {
  const driver = new FetchClients();

  const first = driver.open();
  const second = driver.open();

  assertNotStrictEquals(first, second, "a shared client would be closed under whoever still holds it");
  first.close();
  second.close();
});

Deno.test("wiring the package fills the slot an outbound call goes through", () => {
  Clients.clear();

  scribe.wires?.();

  assert(Clients.get().open() instanceof FetchClient, "http.get has nothing to send through until this runs");
  Clients.clear();
});

Deno.test("wiring the package answers every slot its drivers are for", () => {
  const every = [Clients, Loggers, Now, Caches, RateLimiters, Queues, Hooks, Crons, Triggers, Databases, FileSystems];
  for (const slot of every) slot.clear();

  scribe.wires?.();

  assertEquals(every.map((slot) => slot.configured), every.map(() => true));
  assertEquals(Caches.get().open({ key: "probe" }).constructor.name, "RedisCache");
});

Deno.test("wiring the package leaves standing whatever the host already put there", () => {
  class HostClock {
    millisecondsSinceEpoch(): number {
      return 42;
    }
  }
  const every = [Clients, Loggers, Now, Caches, RateLimiters, Queues, Hooks, Crons, Triggers, Databases, FileSystems];
  for (const slot of every) slot.clear();
  Now.use(new HostClock());

  scribe.wires?.();

  assertEquals(Now.get().constructor.name, "HostClock");
  assertEquals(Now.get().millisecondsSinceEpoch(), 42);
  assertEquals(Caches.configured, true, "a slot nobody filled is still filled");

  for (const slot of every) slot.clear();
});
