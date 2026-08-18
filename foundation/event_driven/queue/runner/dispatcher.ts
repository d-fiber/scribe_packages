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

import { queueRegistry } from "@scribe/host/packages/foundation/event_driven/queue/core/registry.ts";
import type { JsMsg } from "@nats-io/jetstream";
import type { DrainTally } from "./drain_tally.ts";
import { processorFor } from "./processing/processor_factory.ts";

function groupBySubject(
  messages: readonly JsMsg[],
): ReadonlyMap<string, JsMsg[]> {
  const groups = new Map<string, JsMsg[]>();
  for (const message of messages) {
    const group = groups.get(message.subject);
    if (group) group.push(message);
    else groups.set(message.subject, [message]);
  }
  return groups;
}

export class MessageDispatcher {
  async dispatch(
    messages: readonly JsMsg[],
    tally: DrainTally,
  ): Promise<void> {
    if (messages.length === 0) return;

    await Promise.all(
      [...groupBySubject(messages)].map(([subject, group]) =>
        this.#dispatchGroup(subject, group, tally)
      ),
    );
  }

  #dispatchGroup(
    subject: string,
    group: readonly JsMsg[],
    tally: DrainTally,
  ): Promise<void> {
    const queue = queueRegistry.bySubject(subject);
    if (!queue) {
      console.error(
        `[queue] no queue declared for subject "${subject}", ${group.length} message(s) discarded`,
      );
      for (const message of group) message.term();
      return Promise.resolve();
    }

    return processorFor(queue).process(group, tally);
  }
}
