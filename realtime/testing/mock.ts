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
