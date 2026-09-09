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

/** The worker-facing contract for `Realtime`: broadcast to a channel, and grant or revoke who may listen to it. */
@Proto("realtime")
export class RealtimeProtocol extends ProtoBuilder {
  /** The socle types this contract references: `scribe.v1.Json`, `scribe.v1.Failure`. */
  imports(): List<string> {
    return ["scribe/protocol/common.proto"];
  }

  /** What `Realtime.Broadcast` takes: the channel, the action, the entity, and the payload to send. */
  @ProtoMessage()
  broadcastRequest(): ProtoMessageBuilder {
    return this.builder("BroadcastRequest").fields((f) => ({
      channel: f.string().number(1),
      action: f.string().number(2),
      entityId: f.string().number(3),
      payload: f.message("scribe.v1.Json").number(4),
    }));
  }

  /** What `Realtime.Broadcast` answers: whether the message was sent. */
  @ProtoMessage()
  broadcastResult(): ProtoMessageBuilder {
    return this.builder("BroadcastResult").fields((f) => ({
      sent: f.bool().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** What `Realtime.Grant` and `Realtime.Revoke` take: the channel, and the accounts to grant or revoke it for. */
  @ProtoMessage()
  grantRequest(): ProtoMessageBuilder {
    return this.builder("GrantRequest").fields((f) => ({
      channel: f.string().number(1),
      accountIds: f.string().repeated().number(2),
    }));
  }

  /** What `Realtime.Grant` and `Realtime.Revoke` answer. */
  @ProtoMessage()
  grantResult(): ProtoMessageBuilder {
    return this.builder("GrantResult").fields((f) => ({
      error: f.message("scribe.v1.Failure").number(1),
    }));
  }

  /** `Realtime`, the three procedures a worker calls to broadcast and manage channel access. */
  @ProtoService()
  realtime(): ProtoServiceBuilder {
    return this.builder("Realtime").rpc((r) => [
      r.name("Broadcast").request("BroadcastRequest").response("BroadcastResult"),
      r.name("Grant").request("GrantRequest").response("GrantResult"),
      r.name("Revoke").request("GrantRequest").response("GrantResult"),
    ]);
  }
}
