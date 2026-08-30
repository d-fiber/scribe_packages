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
import "@scribe/runtime/scholium/runner.ts";
import { equals, expect, isFalse, Scribe } from "@scribe/alchemy/test";
import { AudienceError } from "../../lib/contracts/audience.ts";
import { Audience } from "../../lib/src/core/declaration.ts";
import { audiencesOf } from "../../lib/src/core/member.ts";
import { installAudienceMock } from "../testing/mock.ts";
import { PostgrestClients } from "@scribe/foundation/database";
import { type InstalledMock, installMock } from "@scribe/testing/install.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";
const editors = Audience.keyed("down-editors");

function installUnreachableDatabase(): InstalledMock {
  const unreachable = {
    from(): never {
      throw new Error("connection refused");
    },
  };

  return installMock(
    PostgrestClients,
    "service",
    () => unreachable as unknown as PostgrestClient,
  );
}

Scribe.test("a table that cannot be reached lets nobody through", async () => {
  const audiences = installAudienceMock();
  const down = installUnreachableDatabase();

  try {
    expect(await editors.in("p1").has("a1"), isFalse);
  } finally {
    down.restore();
    audiences.restore();
  }
});

Scribe.test("a table that cannot be reached lists nobody", async () => {
  const audiences = installAudienceMock();
  const down = installUnreachableDatabase();

  try {
    expect(await editors.in("p1").members(), equals([]));
    expect(await audiencesOf("a1"), equals([]));
  } finally {
    down.restore();
    audiences.restore();
  }
});

Scribe.test("a table that cannot be reached refuses a write instead of throwing", async () => {
  const audiences = installAudienceMock();
  const down = installUnreachableDatabase();

  try {
    const added = await editors.in("p1").add("a1");

    expect(added.ok, isFalse);
    expect(added.ok ? null : added.error, equals(AudienceError.Backend));
  } finally {
    down.restore();
    audiences.restore();
  }
});
