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
 * What "realtime" hands whoever mounts it.
 *
 * @remarks
 * Everything it is made of lives in `src/`, and this is the one file that names them: a file no
 * line below reaches is a file this package does not publish.
 *
 * `scribe` at the bottom is the other half of what it hands over. It is the three moments the
 * host may run this package at, and a package that runs at none of them says so with an empty
 * one rather than by exporting nothing.
 */

import type { LifecycleSteps } from "@scribe/alchemy";
import { syncDeclaredChannels } from "./src/db/channels.ts";
import { EventLogTransport } from "./src/transport/event_log.ts";
import { RealtimeTransports } from "./src/transport/registry.ts";

export { Realtime } from "./src/core/channel.ts";
export type { BroadcastOf } from "./src/core/channel.ts";
export { Listen } from "./src/core/listen.ts";
export { AccountDestination, Destination, GrantedDestination } from "./src/core/destination.ts";
export { isValidTopic } from "./src/core/name.ts";

export { emit as broadcast, RealtimeTransports } from "./src/transport/registry.ts";
export { EventLogTransport } from "./src/transport/event_log.ts";
export type { RealtimeRow, RealtimeTransport } from "./src/transport/transport.ts";

export { syncDeclaredChannels } from "./src/db/channels.ts";
export type { RealtimeChannelRow, RealtimeEventRow, RealtimeGrantRow } from "./src/db/tables.ts";

/**
 * When this package runs: the transport at import, the openness once the database answers.
 *
 * @remarks
 * The transport needs nothing, so it is wired as soon as the entry is imported. The openness
 * cannot be: a declaration lives at module scope and is evaluated before anything is connected,
 * so the row it asks for is written after boot, where the process can reach the database.
 */
export const scribe: LifecycleSteps = {
  wires: () => {
    RealtimeTransports.use(new EventLogTransport());
  },
  starts: () => syncDeclaredChannels(),
};
