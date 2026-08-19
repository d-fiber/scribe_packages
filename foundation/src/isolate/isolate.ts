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
