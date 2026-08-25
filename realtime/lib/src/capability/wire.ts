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
  type BroadcastRequest,
  type BroadcastResult,
  BroadcastResultSchema,
  type GrantRequest,
  type GrantResult,
  GrantResultSchema,
} from "@scribe/sdk/gen/scribe/packages/realtime/protocol/realtime_pb.ts";
import { broadcast, GrantedDestination } from "../../realtime.ts";
import { decodeJson } from "@scribe/sdk";
import { Realtime } from "@scribe/sdk/gen/scribe/packages/realtime/protocol/realtime_pb.ts";
import type { CapabilityWiring } from "@scribe/contracts/capability.ts";

function failed(scope: string, cause: unknown): { code: string; message: string } {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`[worker-realtime:${scope}] ${message}`);
  return { code: "realtime_failed", message };
}

/**
 * The channel `channel`, as the destination that writes and removes grants.
 *
 * @remarks
 * A destination carries the field of a payload that identifies one row, and nothing here ever
 * sends a payload: a grant is a row keyed on the channel and the account, so the field named
 * here is never read.
 */
function granted(channel: string): GrantedDestination<Record<string, unknown>> {
  return new GrantedDestination<Record<string, unknown>>(channel, "id");
}

/**
 * Lets the accounts a worker names listen to a channel.
 *
 * @remarks
 * The realtime package writes one row per account and answers whether the grant is in place, so
 * an account that was already listening counts as granted. An account whose row did not land is
 * carried back as a failure naming how many of them there were, and the grants that did land
 * stay: the worker asked for a state, and the accounts that reached it keep it.
 *
 * A request naming no account writes nothing and answers no failure.
 */
export async function realtimeGrant(request: GrantRequest): Promise<GrantResult> {
  if (!request.channel) return create(GrantResultSchema, { error: failed("grant", "missing channel") });

  try {
    const destination = granted(request.channel);
    const written = await Promise.all(request.accountIds.map((accountId) => destination.grant(accountId)));
    const refused = written.filter((landed) => !landed).length;

    if (refused > 0) {
      return create(GrantResultSchema, {
        error: failed("grant", `${refused} of ${written.length} accounts were not granted on ${request.channel}`),
      });
    }

    return create(GrantResultSchema, {});
  } catch (cause) {
    return create(GrantResultSchema, { error: failed("grant", cause) });
  }
}

/**
 * Takes a channel back from the accounts a worker names.
 *
 * @remarks
 * The realtime package answers whether a grant was removed, and an account that held none
 * answers false. That is the state the worker asked for, so it is not carried back as a failure:
 * only a store that could not be reached is.
 *
 * A request naming no account removes nothing and answers no failure.
 */
export async function realtimeRevoke(request: GrantRequest): Promise<GrantResult> {
  if (!request.channel) return create(GrantResultSchema, { error: failed("revoke", "missing channel") });

  try {
    const destination = granted(request.channel);
    await Promise.all(request.accountIds.map((accountId) => destination.revoke(accountId)));
    return create(GrantResultSchema, {});
  } catch (cause) {
    return create(GrantResultSchema, { error: failed("revoke", cause) });
  }
}

/**
 * Sends what a worker addressed to a channel, and answers whether it left.
 *
 * @remarks
 * `sent` is what the transport knows, which is whether the emission was handed over, not how
 * many listeners took it. Nothing downstream counts subscribers: the transport a mounted package
 * registers writes a row and lets Postgres carry it, and no reader reports back.
 *
 * A process with no transport registered answers false rather than a failure. The package makes
 * that choice, on the grounds that an emission is a side effect nobody has a recovery for, so
 * failing the request that triggered it would cost more than the event it lost.
 */
export async function realtimeBroadcast(request: BroadcastRequest): Promise<BroadcastResult> {
  if (!request.channel) return create(BroadcastResultSchema, { error: failed("broadcast", "missing channel") });

  try {
    const payload = decodeJson<Record<string, unknown>>(request.payload) ?? {};
    const sent = await broadcast({
      channel: request.channel,
      action: request.action,
      entityId: request.entityId,
      payload,
    });

    return create(BroadcastResultSchema, { sent });
  } catch (cause) {
    return create(BroadcastResultSchema, { error: failed("broadcast", cause) });
  }
}

/**
 * Answers the three procedures `realtime.proto` declares.
 *
 * @remarks
 * The host hands the wire over at boot and never names a procedure of this package, so mounting it
 * is what makes a worker able to broadcast, and unmounting it is what stops that.
 */
export function wireRealtime(wiring: CapabilityWiring): void {
  wiring.on(Realtime.method.broadcast, realtimeBroadcast);
  wiring.on(Realtime.method.grant, realtimeGrant);
  wiring.on(Realtime.method.revoke, realtimeRevoke);
}
