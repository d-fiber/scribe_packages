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
import { equals, expect, isNot, Scribe } from "@scribe/alchemy/test";
import { installDrivers } from "../../testing/drivers.ts";
import type { MemoryLogger } from "../../testing/logger.ts";
import { TopologyProvisioner } from "../../../lib/src/queue/topology/topology_provisioner.ts";
import { planFor, planSignature, type TopologyPlan } from "../../../lib/src/queue/topology/topology_plan.ts";
import {
  limitsFrom,
  QUEUE_DEFAULTS,
  type RegisteredQueue,
  subjectsOf,
} from "../../../lib/src/queue/queue_declaration.ts";
import { DEAD_STREAM, DEDICATED_STREAM, SHARED_CONSUMER, SHARED_STREAM } from "../../../lib/src/queue/queue_naming.ts";
import type { JetStreamManager } from "@nats-io/jetstream";
import { Duration } from "@scribe/alchemy";
const logger: MemoryLogger = installDrivers();

interface Added {
  readonly name: string;
  readonly maxPerSubject: number;
}

interface Consumer {
  readonly durable: string;
  readonly filter: string;
  readonly ackWaitNs: number;
  readonly maxDeliver: number;
}

interface Server {
  readonly streams: Map<string, number>;
  readonly consumers: Map<string, Consumer>;
  readonly added: Added[];
  readonly updates: { durable: string; widened: Record<string, number> }[];
  refuseUpdate: boolean;
}

function server(over: Partial<Pick<Server, "streams" | "consumers" | "refuseUpdate">> = {}): Server {
  return {
    streams: over.streams ?? new Map<string, number>(),
    consumers: over.consumers ?? new Map<string, Consumer>(),
    added: [],
    updates: [],
    refuseUpdate: over.refuseUpdate ?? false,
  };
}

function manager(state: Server): JetStreamManager {
  return {
    streams: {
      info: (name: string) =>
        state.streams.has(name)
          ? Promise.resolve({ config: { max_msgs_per_subject: state.streams.get(name) } })
          : Promise.reject(new Error("stream not found")),
      add: (config: { name: string; max_msgs_per_subject: number }) => {
        state.streams.set(config.name, config.max_msgs_per_subject);
        state.added.push({ name: config.name, maxPerSubject: config.max_msgs_per_subject });
        return Promise.resolve({});
      },
      update: (name: string, config: { max_msgs_per_subject: number }) => {
        state.streams.set(name, config.max_msgs_per_subject);
        return Promise.resolve({});
      },
    },
    consumers: {
      info: (stream: string, durable: string) => {
        const held = state.consumers.get(`${stream}/${durable}`);
        return held === undefined ? Promise.reject(new Error("consumer not found")) : Promise.resolve({
          config: { ack_wait: held.ackWaitNs, max_deliver: held.maxDeliver },
        });
      },
      add: (
        stream: string,
        config: {
          durable_name: string;
          filter_subject: string;
          ack_wait: number;
          max_deliver: number;
        },
      ) => {
        state.consumers.set(`${stream}/${config.durable_name}`, {
          durable: config.durable_name,
          filter: config.filter_subject,
          ackWaitNs: config.ack_wait,
          maxDeliver: config.max_deliver,
        });
        return Promise.resolve({});
      },
      update: (stream: string, durable: string, widened: Record<string, number>) => {
        if (state.refuseUpdate) return Promise.reject(new Error("consumer is locked"));
        state.updates.push({ durable, widened });
        const held = state.consumers.get(`${stream}/${durable}`);
        if (held) {
          state.consumers.set(`${stream}/${durable}`, {
            ...held,
            ackWaitNs: widened.ack_wait ?? held.ackWaitNs,
            maxDeliver: widened.max_deliver ?? held.maxDeliver,
          });
        }
        return Promise.resolve({});
      },
    },
  } as unknown as JetStreamManager;
}

function queue(over: Partial<RegisteredQueue> = {}): RegisteredQueue {
  return {
    name: "q",
    ...subjectsOf(over.name ?? "q", over.dedicated === true),
    mode: "immediate",
    dedicated: false,
    handler: () => Promise.resolve(),
    ...limitsFrom(),
    ...over,
  };
}

function provision(state: Server, plan: TopologyPlan): Promise<void> {
  return new TopologyProvisioner(manager(state)).provision(plan);
}

Scribe.test("provisioning an empty server creates the three streams and the shared consumer", async () => {
  const state = server();

  await provision(state, planFor([]));

  expect(
    state.added.map((one) => one.name),
    equals([
      SHARED_STREAM,
      DEDICATED_STREAM,
      DEAD_STREAM,
    ]),
  );
  expect(state.consumers.get(`${SHARED_STREAM}/${SHARED_CONSUMER}`)?.filter, equals("q.>"));
});

Scribe.test("provisioning twice over adds nothing the second time", async () => {
  const state = server();
  const plan = planFor([queue()]);

  await provision(state, plan);
  const afterFirst = state.added.length;
  await provision(state, plan);

  expect(state.added.length, equals(afterFirst));
  expect(state.updates, equals([]));
});

Scribe.test("two queues fighting over the ceiling both live under the larger one", async () => {
  const state = server();
  const plan = planFor([
    queue({ name: "small", maxLen: 10, maxRetries: 2, processingTimeoutMs: 1_000 }),
    queue({ name: "large", maxLen: 900_000, maxRetries: 30, processingTimeoutMs: 3_600_000 }),
  ]);

  await provision(state, plan);

  expect(state.streams.get(SHARED_STREAM), equals(900_000));
  expect(state.consumers.get(`${SHARED_STREAM}/${SHARED_CONSUMER}`)?.maxDeliver, equals(31));
  expect(state.consumers.get(`${SHARED_STREAM}/${SHARED_CONSUMER}`)?.ackWaitNs, equals(3_600_000 * 1_000_000));
});

Scribe.test("a dedicated queue declared after a shared one changes the plan that gets applied", async () => {
  const shared = queue({ name: "first" });
  const later = queue({ name: "second", dedicated: true });

  expect(planSignature(planFor([shared])), isNot(equals(planSignature(planFor([shared, later])))));

  const state = server();
  await provision(state, planFor([shared]));
  expect(state.consumers.has(`${DEDICATED_STREAM}/second`), equals(false));

  await provision(state, planFor([shared, later]));
  expect(state.consumers.get(`${DEDICATED_STREAM}/second`)?.filter, equals("qd.second"));
});

Scribe.test("a consumer an older deployment left too narrow is widened, never narrowed", async () => {
  const state = server({
    consumers: new Map([[`${SHARED_STREAM}/${SHARED_CONSUMER}`, {
      durable: SHARED_CONSUMER,
      filter: "q.>",
      ackWaitNs: 1_000 * 1_000_000,
      maxDeliver: 2,
    }]]),
  });

  await provision(state, planFor([queue({ processingTimeoutMs: 60_000, maxRetries: 9 })]));
  const widened = state.consumers.get(`${SHARED_STREAM}/${SHARED_CONSUMER}`);
  expect(widened?.maxDeliver, equals(10));
  expect(widened?.ackWaitNs, equals(QUEUE_DEFAULTS.processingTimeout.inMilliseconds * 1_000_000));

  state.updates.length = 0;
  await provision(state, planFor([queue({ processingTimeoutMs: 1, maxRetries: 1 })]));
  expect(state.updates, equals([]));
  expect(state.consumers.get(`${SHARED_STREAM}/${SHARED_CONSUMER}`)?.maxDeliver, equals(10));
});

Scribe.test("a widening the server refuses is written to the log and does not stop the run", async () => {
  logger.clear();
  const state = server({
    refuseUpdate: true,
    consumers: new Map([[`${SHARED_STREAM}/${SHARED_CONSUMER}`, {
      durable: SHARED_CONSUMER,
      filter: "q.>",
      ackWaitNs: 1,
      maxDeliver: 1,
    }]]),
  });

  await provision(state, planFor([queue()]));

  expect(logger.actions.includes("queue.widen_failed"), equals(true));
});

Scribe.test("a stream that already exists keeps the ceiling of the deployment that created it", async () => {
  const state = server({ streams: new Map([[SHARED_STREAM, 100]]) });

  await provision(state, planFor([queue({ maxLen: 900_000 })]));

  expect(
    state.streams.get(SHARED_STREAM),
    equals(900_000),
    "a stream is left entirely alone once it exists, so maxLen is read on the day the " +
      "stream is first created and never again: every declaration after that names a " +
      "ceiling the server will not honour, and nothing says so",
  );
});

Scribe.test("a stream provisioned with other settings is never reconciled with the plan", async () => {
  const state = server({ streams: new Map([[DEAD_STREAM, 5]]) });

  await provision(state, planFor([queue({ maxLen: 400_000 })]));

  expect(
    state.streams.get(DEAD_STREAM),
    equals(400_000),
    "the dead letter of a project that raised its ceiling still drops its oldest failures " +
      "at whatever the first deployment asked for",
  );
});

Scribe.test("a dedicated queue gets a consumer filtered on its own subject alone", async () => {
  const state = server();

  await provision(
    state,
    planFor([queue({ name: "mail.send", dedicated: true }), queue({ name: "other" })]),
  );

  const own = state.consumers.get(`${DEDICATED_STREAM}/mail_send`);
  expect(own?.filter, equals("qd.mail_send"));
  expect(state.consumers.has(`${DEDICATED_STREAM}/other`), equals(false));
});

Scribe.test("a processing timeout of a year keeps an ack_wait a number can still hold", async () => {
  const state = server();

  await provision(
    state,
    planFor([queue({ processingTimeoutMs: Duration.days(365).inMilliseconds })]),
  );

  const ackWaitNs = state.consumers.get(`${SHARED_STREAM}/${SHARED_CONSUMER}`)?.ackWaitNs ?? 0;
  expect(
    Number.isSafeInteger(ackWaitNs),
    equals(false),
    "the plan multiplies milliseconds by a million to reach nanoseconds, and a timeout past " +
      "about a hundred days leaves the range an integer is exact in",
  );
});
