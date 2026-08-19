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

import { declaredChannels } from "../core/registry.ts";
import { realtimeChannels } from "./tables.ts";

/**
 * Makes the stored openness of every declared channel match what the code declares.
 *
 * @remarks
 * It is what turns `Listen.Public` written in TypeScript into a row the broadcast trigger and
 * the read policies can act on, and `register.ts` runs it once the process is up rather than
 * at import, since a declaration lives at module scope and the database is not reachable yet
 * when one is evaluated.
 *
 * It writes only what differs, so a process that starts on an already correct database spends
 * one read per declaration and no write at all.
 *
 * It never deletes. A channel that stops being declared keeps its row until someone removes
 * it, which costs a stale line; deleting instead would let a process that declares half the
 * channels close the other half every time it starts.
 */
export async function syncDeclaredChannels(): Promise<void> {
  for (const [channel, listen] of declaredChannels()) {
    const stored = await realtimeChannels()
      .selectRaw("listen")
      .where((f) => f.channel.eq(channel))
      .getOne();

    if (stored === null) {
      await realtimeChannels().insert({ channel, listen });
      continue;
    }

    if (stored.listen === listen) continue;

    await realtimeChannels()
      .where((f) => f.channel.eq(channel))
      .update({ listen });
  }
}
