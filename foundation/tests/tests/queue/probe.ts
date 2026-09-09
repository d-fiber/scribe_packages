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

import type { JsMsg } from "@nats-io/jetstream";
import { topology } from "../../../lib/src/queue/topology/topology.ts";
import "../../testing/hand_backs.ts";
import { safeDecode } from "../../../lib/src/queue/wire_message.ts";
import { DrainTally } from "../../../lib/src/queue/runner/drain_tally.ts";
import { MessageDispatcher } from "../../../lib/src/queue/runner/message_dispatcher.ts";
import type { DrainResult } from "../../../lib/src/queue/queue_options.ts";
import { installMock } from "../../testing/install.ts";

const encoder = new TextEncoder();

/** What a handler under test did with a {@link Probe}: acked, termed, or negatively acknowledged. */
export interface Answers {
  /** Whether the handler under test called `ack()` on this message. */
  acked: boolean;

  /** Whether the handler under test called `term()` on this message. */
  termed: boolean;

  /** The delay `nak(millis)` was last called with, or null when `nak` was never called. */
  nakedAfter: number | null;

  /** How many times `nak()` was called. */
  naks: number;
}

export type Probe = JsMsg & Answers;

/** What building a {@link Probe} with {@link probe} takes: its subject and body, and how it should behave. */
export interface ProbeOptions {
  /** The subject the probe answers `msg.subject` with. */
  readonly subject: string;

  /** The value JSON-encoded into the probe's body, ignored when `raw` is given instead. */
  readonly data?: unknown;

  /** The exact body bytes to encode, overriding `data`, for a probe whose payload isn't JSON. */
  readonly raw?: string;

  /** The redelivery count the probe reports, defaulting to a first delivery. */
  readonly deliveryCount?: number;

  /** The stream sequence number the probe reports, defaulting to `1`. */
  readonly seq?: number;

  /**
   * A counter the probe increments every time its `data` getter is read, for asserting how many
   * times a handler decoded the body.
   */
  readonly reads?: { count: number };

  /** Whether calling `ack()` on this probe throws, as if the connection had already closed. */
  readonly refuseAck?: boolean;
}

/**
 * A fake `JsMsg`, standing in for a NATS message so a handler can be exercised without a live
 * JetStream connection.
 *
 * @remarks
 * `ack`, `term` and `nak` only record what was called rather than acting on a real stream, which
 * is what lets a test assert on a handler's answer instead of asserting on network side effects it
 * cannot observe directly.
 */
export function probe(options: ProbeOptions): Probe {
  const state: Answers = {
    acked: false,
    termed: false,
    nakedAfter: null,
    naks: 0,
  };

  const body = options.raw === undefined ? JSON.stringify({ data: options.data }) : options.raw;

  const bytes = encoder.encode(body);
  const counter = options.reads;

  const one = Object.assign(state, {
    subject: options.subject,
    seq: options.seq ?? 1,
    info: { deliveryCount: options.deliveryCount ?? 1 },
    ack: () => {
      state.acked = true;
      if (options.refuseAck) throw new Error("the connection is closed");
    },
    term: () => {
      state.termed = true;
    },
    nak: (millis?: number) => {
      state.naks++;
      state.nakedAfter = millis ?? 0;
    },
  });

  Object.defineProperty(one, "data", {
    configurable: true,
    enumerable: true,
    get: (): Uint8Array => {
      if (counter) counter.count++;
      return bytes;
    },
  });

  return one as unknown as Probe;
}

/**
 * Whether a handler left `one` with no answer at all, neither acked, termed, nor naked.
 *
 * @remarks
 * A message left this way is not a passing case: JetStream redelivers it once `ack_wait` elapses,
 * silently, with nothing in the test output pointing at the handler that forgot to answer. This is
 * the assertion that catches it.
 */
export function unanswered(one: Answers): boolean {
  return !one.acked && !one.termed && one.nakedAfter === null;
}

/** One message {@link dispatchProbes} recorded a handler as having published while draining a batch. */
export interface Published {
  /** The subject the message was published to. */
  readonly subject: string;

  /** The decoded payload the dispatcher published, or null when the body carried no `data`. */
  readonly data: unknown;
}

/** What {@link dispatchProbes} answers once a batch of probes has drained. */
export interface DispatchReport {
  /** What `DrainTally` counted across the batch: how many probes acked, termed or were left open. */
  readonly result: DrainResult;

  /** Every message the dispatcher published while draining the batch, in publish order. */
  readonly published: Published[];

  /** The error `dispatch` threw, or null when the batch drained without one. */
  readonly rejected: unknown;
}

/** What {@link dispatchProbes} takes beyond the messages themselves. */
export interface DispatchOptions {
  /** Replaces the topology's own `publish`, called with the subject after the fake has recorded it. */
  publish?: (subject: string) => Promise<string>;
}

/**
 * Runs the real {@link MessageDispatcher} and {@link DrainTally} over `messages`, and reports what
 * happened.
 *
 * @remarks
 * `topology.publish` is patched for the duration of the call, because dispatching a batch can
 * publish to the dead letter or a retry subject, and neither exists without a live JetStream
 * connection. Patching it here, rather than in every test, is what lets a test exercise the real
 * dispatch and tally logic while only faking the one call that would otherwise need a server.
 */
export async function dispatchProbes(
  messages: readonly Probe[],
  options: DispatchOptions = {},
): Promise<DispatchReport> {
  const published: Published[] = [];
  const mock = installMock(
    topology,
    "publish",
    (subject: string, payload: Uint8Array) => {
      published.push({ subject, data: safeDecode<unknown>(payload)?.data ?? null });
      return options.publish?.(subject) ?? Promise.resolve("1");
    },
  );

  const tally = new DrainTally();
  let rejected: unknown = null;

  try {
    await new MessageDispatcher().dispatch(messages as unknown as readonly JsMsg[], tally);
  } catch (error) {
    rejected = error;
  } finally {
    mock.restore();
  }

  return { result: tally.toResult(), published, rejected };
}
