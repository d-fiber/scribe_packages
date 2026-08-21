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

/**
 * Code that runs off the caller's path: `run()` starts the body and returns at once.
 *
 * ```ts
 * Isolate.run(async () => {
 *   await sendWelcomeEmail(userId);
 * });
 * ```
 *
 * Dropped in the middle of an endpoint, the body outlives the response: the endpoint answers,
 * the body carries on to the end, and then it is gone. The request scope is inherited, so
 * `currentIdentity()` still answers inside it, but the request itself is over and its body has
 * already been read.
 *
 * @remarks
 * The body lives in this process and nowhere else. A crash, a redeploy or a `SIGTERM` takes it
 * with them, and nothing waits for it or replays it. Work whose loss would be noticed belongs on
 * a `Queue`, which pays a NATS round trip for the guarantee.
 *
 * Nothing caps how much work is detached either, so a caller that loops keeps starting bodies
 * until the process runs out of memory.
 */
export class Isolate {
  private constructor() {}

  /**
   * Starts `body` and returns without waiting for it.
   *
   * It answers nothing on purpose. There is no outcome to hand back, and a promise here would
   * invite an `await` that the caller would read as waiting for the work when it waits for
   * nothing at all. A body that throws or rejects is logged and goes no further: the caller has
   * already answered its own request, and there is no one left to tell.
   */
  static run(body: () => Promise<void> | void): void {
    void (async () => {
      try {
        await body();
      } catch (error) {
        console.error("[isolate] detached body failed:", error);
      }
    })();
  }
}
