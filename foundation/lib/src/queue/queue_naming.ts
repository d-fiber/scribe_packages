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

import { DeclarationError } from "@scribe/alchemy";

/**
 * The stream every queue that did not ask for isolation is published to.
 *
 * Three fixed streams carry any number of queues, which is what keeps the cost of the
 * infrastructure independent of how many are declared: a stream per queue would mean two
 * streams, a consumer and a loop each, and thousands of round trips at start-up.
 */
export const SHARED_STREAM = "QUEUE";
/**
 * The stream a queue that asked for isolation is published to.
 *
 * It is a second stream rather than a filtered consumer on the first because JetStream
 * refuses two consumers whose filters overlap on a work-queue stream, and `q.>` overlaps
 * every subject under it.
 */
export const DEDICATED_STREAM = "QUEUE_DEDICATED";
/** Where a job that exhausted its retries is kept until somebody looks at it. */
export const DEAD_STREAM = "QUEUE_DEAD";
/** The single consumer every shared queue is drained through. */
export const SHARED_CONSUMER = "workers";

/**
 * Reduces a queue name to what NATS accepts in a subject token.
 *
 * @remarks
 * A name that holds nothing NATS accepts is refused here rather than folded into the empty token.
 * A subject whose second token is empty is refused by the server at publish time, which is long
 * after the declaration that built it and far from the file that wrote the name.
 *
 * @throws {DeclarationError} When `name` holds no character a subject token can carry.
 */
export function sanitize(name: string): string {
  const token = name.replace(/[^A-Za-z0-9_-]+/g, "_");
  if (token === "" || /^_+$/.test(token)) {
    throw new DeclarationError(
      `new Queue("${name}"): a queue name has to hold a letter, a digit or a dash. What this one `
        + "reduces to is not a subject token NATS accepts.",
    );
  }
  return token;
}

/** The subject a queue publishes to. */
export function subjectOf(name: string, dedicated: boolean): string {
  return `${dedicated ? "qd" : "q"}.${sanitize(name)}`;
}

/** The subject a queue's dead letters are kept under. */
export function deadSubjectOf(name: string): string {
  return `dead.${sanitize(name)}`;
}

/** The stream a queue lives in, which its isolation decides. */
export function streamOf(dedicated: boolean): string {
  return dedicated ? DEDICATED_STREAM : SHARED_STREAM;
}
