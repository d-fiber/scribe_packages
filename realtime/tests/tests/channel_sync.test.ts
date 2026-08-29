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
import "@scribe/testing/runner.ts";
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { Listen, Realtime, syncDeclaredChannels } from "@scribe/realtime";
import { realtimeChannels } from "../../lib/src/db/tables.ts";
import { installDatabaseFake } from "./mocks/database.ts";

interface Item {
  id: string;
}

Realtime.public<Item>("sync_public");
Realtime.granted<Item>("sync_granted");

async function storedListen(channel: string): Promise<string | null> {
  const row = await realtimeChannels()
    .selectRaw("listen")
    .where((f) => f.channel.eq(channel))
    .getOne();

  return row === null ? null : String(row.listen);
}

Scribe.test("a declaration nobody stored yet is written with its openness", async () => {
  const db = installDatabaseFake();

  await syncDeclaredChannels();

  expect(await storedListen("sync_public"), equals(Listen.Public));
  expect(await storedListen("sync_granted"), equals(Listen.Granted));
  db.restore();
});

Scribe.test("an openness that changed in the code is written over the stored one", async () => {
  const db = installDatabaseFake({
    __realtime_channels__: [{ channel: "sync_public", listen: Listen.Granted }],
  });

  await syncDeclaredChannels();

  expect(await storedListen("sync_public"), equals(Listen.Public));
  db.restore();
});

Scribe.test("a channel nobody declares any more keeps its row", async () => {
  const db = installDatabaseFake({
    __realtime_channels__: [{ channel: "sync_retired", listen: Listen.Public }],
  });

  await syncDeclaredChannels();

  expect(await storedListen("sync_retired"), equals(Listen.Public));
  db.restore();
});
