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

import { OK, type Result } from "@scribe/core/contracts/result.ts";
import type { AudienceError } from "../../contracts/audience.ts";
import { audiencesOfMember, dropMember } from "../db/members.ts";
import { forgetMemberIn } from "../runtime/cache.ts";
import { guarded } from "./guard.ts";

/**
 * The audiences `member` belongs to, as their keys are stored.
 *
 * It is what a route calls once to put every belonging in a token, instead of asking each
 * declaration in turn and paying one round trip per audience. It never fails: a table that cannot
 * be reached answers with an empty listing, reported, and a caller that turns that into a token
 * hands out one that opens nothing.
 */
export async function audiencesOf(member: string): Promise<string[]> {
  try {
    return await audiencesOfMember(member);
  } catch {
    console.error("[audience:member] the audiences of a member could not be listed, so none are.");
    return [];
  }
}

/**
 * Takes `member` out of every audience it belongs to.
 *
 * It is what an account being deleted calls. Without it every caller would have to know which
 * audiences it once put that member in, and one of them would be forgotten.
 */
export function forgetMember(member: string): Promise<Result<void, AudienceError>> {
  return guarded(async () => {
    const held = await audiencesOfMember(member);
    await dropMember(member);

    await forgetMemberIn(held, member);
    return new OK();
  });
}
