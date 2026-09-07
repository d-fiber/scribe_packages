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

@Proto("hook")
export class HookProtocol extends ProtoBuilder {
  imports(): List<string> {
    return ["scribe/protocol/common.proto"];
  }

  @ProtoMessage()
  event(): ProtoMessageBuilder {
    return this.builder("Event").fields((f) => ({
      hookId: f.string().number(1),
      event: f.string().number(2),
      traceId: f.string().number(3),
      payload: f.message("scribe.v1.Json").number(4),
      emittedAt: f.int64().number(5),
      capabilityToken: f.string().number(6),
    }));
  }

  @ProtoMessage()
  emitResult(): ProtoMessageBuilder {
    return this.builder("EmitResult").fields((f) => ({
      handled: f.uint32().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  @ProtoMessage()
  handleResult(): ProtoMessageBuilder {
    return this.builder("HandleResult").fields((f) => ({
      halted: f.bool().number(1),
      mutation: f.message("scribe.v1.Json").number(2),
      error: f.message("scribe.v1.Failure").number(3),
    }));
  }

  @ProtoService()
  hook(): ProtoServiceBuilder {
    return this.builder("Hook").rpc((r) => [r.rpc("Emit", "Event", "EmitResult")]);
  }

  @ProtoService()
  hookDispatch(): ProtoServiceBuilder {
    return this.builder("HookDispatch").rpc((r) => [r.rpc("Handle", "Event", "HandleResult")]);
  }
}
