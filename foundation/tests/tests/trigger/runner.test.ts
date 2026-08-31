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
import { installDrivers } from "../../testing/drivers.ts";
import type { Future } from "@scribe/alchemy";
import { type InstalledMock, installMock } from "../../testing/install.ts";
import { topology } from "../../../lib/src/queue/topology/topology.ts";
import { Trigger } from "../../../lib/src/trigger/trigger.ts";
import { TriggerRunner } from "../../../lib/src/trigger/trigger_runner.ts";
import { triggerEvents } from "../../../lib/src/trigger/trigger_tables.ts";
import type { TriggerEventRow } from "../../../lib/src/trigger/trigger_tables.ts";
import { installDatabaseFake } from "./mocks/database.ts";
import { PostgrestClients } from "../../../lib/src/database/postgrest_clients.ts";
import { FakePostgrestClient } from "../../testing/database.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";

interface OrderRow {
  id: string;
  status: string;
  meta: Record<string, unknown>;
}

const AT = "2026-08-19T10:00:00Z";
const noop = () => Promise.resolve();

const orders = Trigger.of<OrderRow>();
orders.onUpdate("orders/{orderId}", noop);
orders.onFieldChange("orders/{orderId}/status", noop);

installDrivers();

interface Wire extends InstalledMock {
  readonly published: string[];
}

function wireTopology(publish?: (msgID: string) => Future<string>): Wire {
  const published: string[] = [];
  const ensured = installMock(topology, "ensure", () => Promise.resolve());
  const publisher = installMock(
    topology,
    "publish",
    (_subject: string, _payload: Uint8Array, msgID?: string) => {
      const id = msgID ?? "";
      published.push(id);
      return publish === undefined ? Promise.resolve("1") : publish(id);
    },
  );

  return {
    published,
    restore(): void {
      publisher.restore();
      ensured.restore();
    },
  };
}

function installForgetfulDatabase(events: SeededRow[]): InstalledMock {
  const fake = new FakePostgrestClient({
    __trigger_events__: events,
    __trigger_sources__: [],
  });
  const refusing = {
    from(name: string) {
      const real = fake.from(name);
      return {
        ...real,
        delete: () => {
          const refused = {
            filter: () => refused,
            in: () => refused,
            select: () => Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } }),
          };
          return refused;
        },
      };
    },
  };

  return installMock(PostgrestClients, "service", () => refusing as unknown as PostgrestClient);
}

type SeededRow = Record<string, unknown>;

function row(over: Partial<TriggerEventRow> = {}): SeededRow {
  const built: TriggerEventRow = {
    id: 1,
    table_name: "orders",
    op: "update",
    entity_id: "order-1",
    before: { id: "order-1", status: "pending" },
    after: { id: "order-1", status: "paid" },
    occurred_at: AT,
    ...over,
  };

  return { ...built };
}

function left(): Future<number[]> {
  return triggerEvents().get().then((rows) => rows.map((one) => one.id));
}

Scribe.test("a pass publishes every declaration a row concerns, then forgets the row", async () => {
  const db = installDatabaseFake({ __trigger_events__: [row()] });
  const wire = wireTopology();
  try {
    expect(await new TriggerRunner().drain(), equals(1));
    expect(wire.published, equals(["orders:update:1", "orders:status:1:status"]));
    expect(await left(), equals([]));
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("a row nothing is declared for leaves the table rather than holding up what is behind it", async () => {
  const db = installDatabaseFake({
    __trigger_events__: [row({ id: 1, table_name: "nobody_watches" }), row({ id: 2 })],
  });
  const wire = wireTopology();
  try {
    expect(await new TriggerRunner().drain(), equals(2));
    expect(await left(), equals([]));
    expect(wire.published, equals(["orders:update:2", "orders:status:2:status"]));
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("a row whose operation cannot be read is dropped, and the batch carries on", async () => {
  const db = installDatabaseFake({
    __trigger_events__: [row({ id: 1, op: "truncate" }), row({ id: 2 })],
  });
  const wire = wireTopology();
  try {
    expect(await new TriggerRunner().drain(), equals(2));
    expect(await left(), equals([]));
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("a row the broker refused stays in the table, and nothing behind it is forgotten either", async () => {
  const db = installDatabaseFake({ __trigger_events__: [row({ id: 1 }), row({ id: 2 })] });
  const wire = wireTopology(() => Promise.reject(new Error("no stream")));
  try {
    expect(await new TriggerRunner().drain(), equals(0));
    expect(await left(), equals([1, 2]), "a pass that published nothing forgets nothing");
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("a row published twice carries the same message identifier both times", async () => {
  const db = installDatabaseFake({ __trigger_events__: [row({ id: 7 })] });
  const wire = wireTopology();
  try {
    await new TriggerRunner().drain();
    const first = [...wire.published];

    installDatabaseFake({ __trigger_events__: [row({ id: 7 })] });
    await new TriggerRunner().drain();

    expect(wire.published.slice(first.length), equals(first), "the broker needs the same id to drop the copy");
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("an empty outbox costs no provisioning call and no publish", async () => {
  const db = installDatabaseFake({ __trigger_events__: [] });
  const wire = wireTopology();
  try {
    expect(await new TriggerRunner().drain(), equals(0));
    expect(wire.published, equals([]));
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("DEFECT a row one declaration refuses republishes it to the other one at every pass", async () => {
  const db = installDatabaseFake({ __trigger_events__: [row({ id: 1 })] });
  const wire = wireTopology((msgID) =>
    msgID.startsWith("orders:status") ? Promise.reject(new Error("too large")) : Promise.resolve("1")
  );
  try {
    await new TriggerRunner().drain();
    await new TriggerRunner().drain();
    await new TriggerRunner().drain();

    expect(
      wire.published.filter((one) => one === "orders:update:1").length,
      equals(1),
      "a declaration that took the event must not be handed it again because another one refused it",
    );
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("DEFECT a declaration after the one that refused is never handed the event at all", async () => {
  const db = installDatabaseFake({ __trigger_events__: [row({ id: 1 })] });
  const wire = wireTopology((msgID) =>
    msgID.startsWith("orders:update") ? Promise.reject(new Error("too large")) : Promise.resolve("1")
  );
  try {
    await new TriggerRunner().drain();

    expect(
      wire.published.includes("orders:status:1:status"),
      equals(true),
      "one declaration refusing an event is not a reason to skip the next one",
    );
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("DEFECT a pass that could not forget what it published reports the rows as drained", async () => {
  const db = installForgetfulDatabase([row({ id: 1 })]);
  const wire = wireTopology();
  try {
    expect(
      await new TriggerRunner().drain(),
      equals(0),
      "a row still in the table at the end of the pass was not drained, whatever was published",
    );
  } finally {
    wire.restore();
    db.restore();
  }
});

Scribe.test("a row that keeps failing stays in the table, which is what bounds a pass", async () => {
  const db = installDatabaseFake({ __trigger_events__: [row({ id: 1 })] });
  const wire = wireTopology(() => Promise.reject(new Error("too large")));
  try {
    await new TriggerRunner().drain();
    await new TriggerRunner().drain();

    expect(await left(), equals([1]), "nothing published means nothing forgotten");
  } finally {
    wire.restore();
    db.restore();
  }
});
