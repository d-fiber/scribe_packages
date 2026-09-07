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

import type { List, ProtoMessageBuilder, ProtoServiceBuilder } from "@scribe/alchemy";
import { Proto, ProtoBuilder, ProtoMessage, ProtoService } from "@scribe/alchemy";

/** The contract for `Queue`/`QueueDispatch`: a worker pushes messages, the host delivers them back in batch. */
@Proto("queue")
export class QueueProtocol extends ProtoBuilder {
  /** The socle types this contract references: `scribe.v1.Json`, `scribe.v1.Time`, `scribe.v1.Failure`. */
  imports(): List<string> {
    return ["scribe/protocol/common.proto"];
  }

  /** One message as it sits in a queue, with the delivery attempt it is on. */
  @ProtoMessage()
  message(): ProtoMessageBuilder {
    return this.builder("Message").fields((f) => ({
      messageId: f.string().number(1),
      payload: f.message("scribe.v1.Json").number(2),
      attempt: f.uint32().number(3),
      enqueuedAt: f.int64().number(4),
    }));
  }

  /** What `Queue.Push` takes: the queue, the payloads, and how long to delay them. */
  @ProtoMessage()
  pushRequest(): ProtoMessageBuilder {
    return this.builder("PushRequest").fields((f) => ({
      queueId: f.string().number(1),
      payloads: f.message("scribe.v1.Json").repeated().number(2),
      delay: f.message("scribe.v1.Time").number(3),
    }));
  }

  /** What `Queue.Push` answers: the identifier assigned to each pushed message. */
  @ProtoMessage()
  pushResult(): ProtoMessageBuilder {
    return this.builder("PushResult").fields((f) => ({
      messageIds: f.string().repeated().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** One group of messages the host delivers to a worker's queue handler together. */
  @ProtoMessage()
  batch(): ProtoMessageBuilder {
    return this.builder("Batch").fields((f) => ({
      queueId: f.string().number(1),
      traceId: f.string().number(2),
      messages: f.message("Message").repeated().number(3),
      capabilityToken: f.string().number(4),
    }));
  }

  /** Whether one message of a delivered batch was acknowledged. */
  @ProtoMessage()
  messageOutcome(): ProtoMessageBuilder {
    return this.builder("MessageOutcome").fields((f) => ({
      messageId: f.string().number(1),
      acknowledged: f.bool().number(2),
      error: f.message("scribe.v1.Failure").number(3),
    }));
  }

  /** What `QueueDispatch.Handle` answers: the outcome of every message in the delivered batch. */
  @ProtoMessage()
  batchOutcome(): ProtoMessageBuilder {
    return this.builder("BatchOutcome").fields((f) => ({
      outcomes: f.message("MessageOutcome").repeated().number(1),
    }));
  }

  /** `Push`, worker to host: a worker enqueues one or more payloads. */
  @ProtoService()
  queue(): ProtoServiceBuilder {
    return this.builder("Queue").rpc((r) => [r.name("Push").request("PushRequest").response("PushResult")]);
  }

  /** `Handle`, host to worker: the host delivers a batch to the worker's own queue handler. */
  @ProtoService()
  queueDispatch(): ProtoServiceBuilder {
    return this.builder("QueueDispatch").rpc((r) => [r.name("Handle").request("Batch").response("BatchOutcome")]);
  }
}
