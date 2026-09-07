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
  type EmitResult,
  EmitResultSchema,
  type Event,
} from "@scribe/sdk/gen/scribe/packages/foundation/protocol/hook_pb.ts";
import { decodeJson } from "@scribe/sdk";
import { causeMessage } from "../error_message.ts";
import { hookRegistry } from "./hook_registry.ts";

/**
 * Runs the handlers the host registered for the event a worker emitted.
 *
 * @remarks
 * The hook has to be declared on the host, and an event nothing answers to is refused under
 * `unknown_hook`: a worker emitting into a name that was never registered would otherwise
 * believe it had been heard.
 *
 * `handled` is how many handlers ran, which is what tells an emitter that a hook exists but
 * nobody subscribed to it. The handlers run before the answer leaves, so a failure in any one
 * of them is carried back rather than swallowed.
 */
export async function hookEmit(event: Event): Promise<EmitResult> {
  const hook = hookRegistry.get(event.event);
  if (!hook) {
    return create(EmitResultSchema, {
      error: { code: "unknown_hook", message: `${event.event} is not declared by the host.` },
    });
  }

  try {
    await hook.run(decodeJson(event.payload) as never);
    return create(EmitResultSchema, { handled: hook.handlers() });
  } catch (cause) {
    return create(EmitResultSchema, { error: { code: "emit_failed", message: causeMessage(cause) } });
  }
}
