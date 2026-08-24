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

import {
  Caches,
  Crons,
  Databases,
  Duration,
  FileSystems,
  Hooks,
  Now,
  Queues,
  RateLimiters,
  Triggers,
} from "@scribe/alchemy";
import { Clients } from "@scribe/alchemy/http";
import { Loggers } from "@scribe/alchemy/observe";
import type { Slot } from "@scribe/alchemy";
import { scribe } from "@scribe/foundation/lib/foundation.ts";
import { cacheSettings } from "@scribe/foundation/lib/src/cache/cache_settings.ts";
import { databaseSettings } from "@scribe/foundation/lib/src/database/database_settings.ts";
import { queueSettings } from "@scribe/foundation/lib/src/queue/queue_settings.ts";
import { installMock } from "@scribe/foundation/tests/testing/install.ts";
import { assert, assertEquals, assertStrictEquals, assertThrows } from "@std/assert";

const PORTS: readonly Slot<unknown>[] = [
  Clients,
  Loggers,
  Now,
  Caches,
  RateLimiters,
  Queues,
  Hooks,
  Crons,
  Triggers,
  Databases,
  FileSystems,
];

const NAMES: readonly string[] = [
  "Clients",
  "Loggers",
  "Now",
  "Caches",
  "RateLimiters",
  "Queues",
  "Hooks",
  "Crons",
  "Triggers",
  "Databases",
  "FileSystems",
];

function held(): (unknown | null)[] {
  return PORTS.map((slot) => (slot.configured ? slot.get() : null));
}

function restore(before: (unknown | null)[]): void {
  PORTS.forEach((slot, at) => {
    const value = before[at];
    if (value === null) slot.clear();
    else slot.use(value);
  });
}

function mount<T>(body: () => T): T {
  const before = held();
  for (const slot of PORTS) slot.clear();
  try {
    return body();
  } finally {
    restore(before);
  }
}

Deno.test("wiring twice settles on the same driver in every slot", () => {
  mount(() => {
    scribe.wires?.();
    const first = held();

    scribe.wires?.();

    assertEquals(held(), first, "a second mount must not replace what the first put there");
  });
});

Deno.test("a slot the host filled is left standing, one slot at a time", () => {
  const stand = { stood: true };

  PORTS.forEach((slot, at) => {
    mount(() => {
      slot.use(stand as never);
      scribe.wires?.();

      assertStrictEquals(slot.get(), stand, `${NAMES[at]} was written over`);
      assertEquals(
        PORTS.every((one) => one.configured),
        true,
        `the ten slots beside ${NAMES[at]} were left empty`,
      );
    });
  });
});

Deno.test("a partial clear refills only what was cleared", () => {
  mount(() => {
    scribe.wires?.();
    const first = held();

    Caches.clear();
    Queues.clear();
    scribe.wires?.();

    const after = held();
    PORTS.forEach((slot, at) => {
      assert(slot.configured, `${NAMES[at]} was left empty by the second mount`);
      if (slot === Caches || slot === Queues) return;
      assertStrictEquals(after[at], first[at], `${NAMES[at]} was untouched and should have been left alone`);
    });
  });
});

Deno.test("two mounts racing over a microtask boundary still leave one driver per slot", async () => {
  await mount(async () => {
    const both = [
      Promise.resolve().then(() => scribe.wires?.()),
      Promise.resolve().then(() => scribe.wires?.()),
    ];
    await Promise.all(both);

    assertEquals(PORTS.map((slot) => slot.configured), PORTS.map(() => true));
    const settled = held();
    scribe.wires?.();
    assertEquals(held(), settled);
  });
});

Deno.test("mounting reads no setting and opens no connection", () => {
  const settings = [cacheSettings, queueSettings, databaseSettings] as const;
  const kept = settings.map((slot) => (slot.configured ? slot.get() : null));
  let dialled = 0;
  const refuse = () => {
    dialled++;
    return Promise.reject(new Error("nothing may dial while the package is being mounted"));
  };
  const connect = installMock(Deno, "connect", refuse as unknown as typeof Deno.connect);
  const connectTls = installMock(Deno, "connectTls", refuse as unknown as typeof Deno.connectTls);

  try {
    for (const slot of settings) slot.clear();

    mount(() => {
      scribe.wires?.();

      assertEquals(dialled, 0, "a driver that dials while it is being built makes the port untestable");
      for (const slot of settings) {
        assertEquals(slot.configured, false, "mounting must not fill a settings slot either");
      }
    });
  } finally {
    connect.restore();
    connectTls.restore();
    settings.forEach((slot, at) => {
      const value = kept[at];
      if (value === null) slot.clear();
      else slot.use(value as never);
    });
  }
});

Deno.test("every mounted driver answers the members its port declares", () => {
  mount(() => {
    scribe.wires?.();

    const members: Record<string, readonly string[]> = {
      Clients: ["open"],
      Caches: ["open"],
      RateLimiters: ["open"],
      Queues: ["open", "consume"],
      Hooks: ["open"],
      Crons: ["schedule"],
      Triggers: ["watch"],
      Databases: ["table"],
      FileSystems: ["open"],
    };

    PORTS.forEach((slot, at) => {
      const wanted = members[NAMES[at]];
      if (wanted === undefined) return;
      const driver = slot.get() as Record<string, unknown>;
      for (const name of wanted) {
        assertEquals(typeof driver[name], "function", `${NAMES[at]} answers no ${name}`);
      }
    });
  });
});

Deno.test("the file system driver hands out one disk however often it is asked", () => {
  mount(() => {
    scribe.wires?.();
    const driver = FileSystems.get();

    assertStrictEquals(driver.open(), driver.open());
  });
});

Deno.test({
  name: "re-wiring after a clear refuses the cron key the driver it replaced had already declared",
  fn() {
    mount(() => {
      scribe.wires?.();
      Crons.get().schedule({ key: "wiring:cron", schedule: { every: Duration.minutes(1) }, run: () => {} });

      Crons.clear();
      scribe.wires?.();

      Crons.get().schedule({ key: "wiring:cron", schedule: { every: Duration.minutes(1) }, run: () => {} });
    });
  },
});

Deno.test({
  name: "re-wiring after a clear refuses the queue key the driver it replaced had already opened",
  fn() {
    mount(() => {
      scribe.wires?.();
      Queues.get().open({ key: "wiring:queue" });

      Queues.clear();
      scribe.wires?.();

      Queues.get().open({ key: "wiring:queue" });
    });
  },
});

Deno.test({
  name: "re-wiring after a clear refuses the hook event the driver it replaced had already opened",
  fn() {
    mount(() => {
      scribe.wires?.();
      Hooks.get().open({ event: "wiring.event" });

      Hooks.clear();
      scribe.wires?.();

      Hooks.get().open({ event: "wiring.event" });
    });
  },
});

Deno.test({
  name: "a mount that follows a clear still answers the store its predecessor opened, rather than a second one",
  fn() {
    mount(() => {
      scribe.wires?.();
      const opened = Caches.get().open({ key: "wiring:cache" });

      Caches.clear();
      scribe.wires?.();

      assertStrictEquals(
        Caches.get().open({ key: "wiring:cache" }),
        opened,
        "the port promises one store per key, and a rebuilt driver hands out a second",
      );
    });
  },
});

Deno.test("declaring the same cron key twice through one driver answers the same run rather than firing twice", () => {
  mount(() => {
    scribe.wires?.();
    const driver = Crons.get();

    const first = driver.schedule({ key: "wiring:once", schedule: { every: Duration.minutes(1) }, run: () => {} });
    const second = driver.schedule({ key: "wiring:once", schedule: { every: Duration.minutes(1) }, run: () => {} });

    assertStrictEquals(first, second);
    assert(first.key === "wiring:once");
  });
});

Deno.test("a schedule naming none of the three shapes is refused where it is written", () => {
  mount(() => {
    scribe.wires?.();

    assertThrows(
      () => Crons.get().schedule({ key: "wiring:bad", schedule: {} as never, run: () => {} }),
      Error,
      "a schedule names an interval",
    );
  });
});
