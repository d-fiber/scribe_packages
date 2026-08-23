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

import { okay, type Result } from "@scribe/alchemy";
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
    return okay;
  });
}
