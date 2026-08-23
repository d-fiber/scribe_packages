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

import { Future, unawaited } from "@scribe/alchemy";
import { emails } from "@scribe/foundation/examples/queue.ts";

/**
 * Work that runs off the caller's path, so the response does not wait for it.
 *
 * `unawaited` answers nothing on purpose: there is no outcome to hand back, and a future here
 * would invite an `await` that reads as waiting for the work when it waits for nothing. The
 * request scope is inherited, so what reads the caller's identity still answers inside the
 * body, but the request itself is over.
 */
export function warmUpAfterSignIn(accountId: string): void {
  unawaited(refreshRecommendations(accountId));
}

/**
 * The same work, put on a queue instead, because losing it would be noticed.
 *
 * Detached work lives in this process and nowhere else: a crash, a redeploy or a `SIGTERM`
 * takes it with them, and nothing replays it. A queue pays a NATS round trip for the
 * guarantee, and that is the whole of the choice between the two.
 */
export function mailAfterSignUp(email: string): Future<string> {
  return emails.push({ to: email, template: "welcome" });
}

/** Recomputes what to suggest, which nobody waits for. */
function refreshRecommendations(_accountId: string): Future<void> {
  return Future.value(undefined);
}
