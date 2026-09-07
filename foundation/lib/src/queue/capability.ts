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

import { create } from "@bufbuild/protobuf";
import {
  type PushRequest,
  type PushResult,
  PushResultSchema,
} from "@scribe/sdk/gen/scribe/packages/foundation/protocol/queue_pb.ts";
import { Duration } from "@scribe/alchemy";
import { decodeJson } from "@scribe/sdk/transport.ts";
import { causeMessage } from "../error_message.ts";
import { QueuePublisher } from "./queue.ts";
import { queueRegistry } from "./queue_registry.ts";

/**
 * Puts what a worker sent on one of the queues the host declared.
 *
 * @remarks
 * The queue has to be declared on the host: a worker names one, it does not create one, and a
 * name nothing answers to is refused under `unknown_queue` rather than silently dropped.
 *
 * A request carrying several payloads pushes them together and answers one identifier per
 * message, in the order they were given. A failure part way through leaves the messages already
 * pushed on the queue, because nothing here can take one back.
 */
export async function queuePush(request: PushRequest): Promise<PushResult> {
  const registered = queueRegistry.get(request.queueId);
  if (!registered) {
    return create(PushResultSchema, {
      error: { code: "unknown_queue", message: `${request.queueId} is not declared by the host.` },
    });
  }

  const producer = new QueuePublisher<unknown>(registered);
  const delay = Number(request.delay?.millis ?? 0n);

  try {
    const messageIds = await Promise.all(
      request.payloads.map((payload) =>
        producer.push(decodeJson(payload), delay > 0 ? { delay: Duration.milliseconds(delay) } : {})
      ),
    );
    return create(PushResultSchema, { messageIds });
  } catch (cause) {
    return create(PushResultSchema, { error: { code: "push_failed", message: causeMessage(cause) } });
  }
}
