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
import { topology } from "@scribe/foundation/lib/src/queue/topology/topology.ts";
import "@scribe/foundation/tests/testing/hand_backs.ts";
import { safeDecode } from "@scribe/foundation/lib/src/queue/wire_message.ts";
import { DrainTally } from "@scribe/foundation/lib/src/queue/runner/drain_tally.ts";
import { MessageDispatcher } from "@scribe/foundation/lib/src/queue/runner/message_dispatcher.ts";
import type { DrainResult } from "@scribe/foundation/lib/src/queue/queue_options.ts";
import { installMock } from "@scribe/foundation/tests/testing/install.ts";

const encoder = new TextEncoder();

export interface Answers {
  acked: boolean;
  termed: boolean;
  nakedAfter: number | null;
  naks: number;
}

export type Probe = JsMsg & Answers;

export interface ProbeOptions {
  readonly subject: string;
  readonly data?: unknown;
  readonly raw?: string;
  readonly deliveryCount?: number;
  readonly seq?: number;
  readonly reads?: { count: number };
  readonly refuseAck?: boolean;
}

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

export function unanswered(one: Answers): boolean {
  return !one.acked && !one.termed && one.nakedAfter === null;
}

export interface Published {
  readonly subject: string;
  readonly data: unknown;
}

export interface DispatchReport {
  readonly result: DrainResult;
  readonly published: Published[];
  readonly rejected: unknown;
}

export interface DispatchOptions {
  publish?: (subject: string) => Promise<string>;
}

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
