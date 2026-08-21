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

import "@scribe/core/testing/settings.ts";
import type { InstalledMock } from "@scribe/core/testing/install.ts";
import { RealtimeTransports } from "@scribe/realtime/src/transport/registry.ts";
import type { RealtimeRow, RealtimeTransport } from "@scribe/realtime/src/transport/transport.ts";

/** A transport that keeps every row instead of sending it, so a test can read what was emitted. */
export class RecordingTransport implements RealtimeTransport {
  /** Every row handed over since this transport was installed, oldest first. */
  readonly rows: RealtimeRow[] = [];

  readonly #answer: boolean;

  /**
   * @param answer - What every send answers. False is how a test exercises the path a caller
   * takes when an emission does not leave.
   */
  constructor(answer = true) {
    this.#answer = answer;
  }

  /** Keeps `row` and answers what the constructor was given. */
  send(row: RealtimeRow): Promise<boolean> {
    this.rows.push(row);
    return Promise.resolve(this.#answer);
  }

  /** The rows addressed to `channel`, in the order they were emitted. */
  on(channel: string): RealtimeRow[] {
    return this.rows.filter((row) => row.channel === channel);
  }
}

/**
 * Sends every emission of the process into a recording transport, and answers the handle that
 * puts the previous one back.
 *
 * @remarks
 * What is replaced is the transport, never a declaration: a channel keeps deriving its own
 * channels, checking its own topics and pulling its own identifiers, so a test exercises the
 * addressing rather than a second implementation of it written for the test.
 *
 * @param answer - What every send answers. Defaults to a send that left.
 */
export function installRealtimeMock(answer = true): RecordingTransport & InstalledMock {
  const recording = new RecordingTransport(answer);
  const previous = RealtimeTransports.use(recording);

  return Object.assign(recording, {
    restore(): void {
      RealtimeTransports.use(previous);
    },
  });
}
