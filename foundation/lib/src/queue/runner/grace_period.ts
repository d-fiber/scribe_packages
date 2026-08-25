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

import { queueRegistry } from "../queue_registry.ts";

/**
 * How long a queue that does not group waits for company.
 *
 * Just enough to pick up what lands in the same millisecond, and short enough that nobody
 * notices it.
 */
export const IMMEDIATE_GRACE_MS = 25;

/** The grace a subject is entitled to: its linger, or the immediate one. */
export function graceFor(subject: string): number {
  return queueRegistry.bySubject(subject)?.lingerMs ?? IMMEDIATE_GRACE_MS;
}

/**
 * How long a fetch holds its window open, which is the longest grace anything declared asks for.
 *
 * @remarks
 * The window has to outlast every linger it may have to honour, because it is the iterator
 * closing that ends a group. A queue declared with a linger longer than the window would be
 * handed a group the moment the window closed, whatever it asked for.
 */
export function longestGrace(): number {
  let longest = FETCH_FLOOR_MS;

  for (const queue of queueRegistry.list()) {
    const linger = queue.lingerMs ?? 0;
    if (linger > longest) longest = linger;
  }

  return longest;
}

/** How long a fetch waits when nothing declared asks for longer. */
export const FETCH_FLOOR_MS = 5_000;
