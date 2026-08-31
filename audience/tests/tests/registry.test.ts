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
import { equals, expect, expectLater, isA, Scribe, throwsA } from "@scribe/alchemy/test";
import { Audience } from "../../lib/src/core/declaration.ts";
import { AudienceClaimError, verifyDeclarations } from "../../lib/src/core/registry.ts";
import { installAudienceMock } from "../testing/mock.ts";
import { PostgrestClients } from "@scribe/foundation/database";
import { type InstalledMock, installMock } from "@scribe/testing/install.ts";
import type { PostgrestClient } from "@supabase/postgrest-js";

const FEATURE = "registry-test";
const NAME = "registry-claim-target";

Audience.for(FEATURE).global(NAME);

Scribe.test("verifyDeclarations durably claims every pair this process declared", async () => {
  const audiences = installAudienceMock();

  try {
    await verifyDeclarations("owner-a");

    const claim = audiences.declarations().find((row) => row.feature === FEATURE && row.name === NAME);
    expect(claim?.owner, equals("owner-a"));
  } finally {
    audiences.restore();
  }
});

Scribe.test("verifyDeclarations called again by the same owner is a no-op", async () => {
  const audiences = installAudienceMock();

  try {
    await verifyDeclarations("owner-a");
    await verifyDeclarations("owner-a");

    const claims = audiences.declarations().filter((row) => row.feature === FEATURE && row.name === NAME);
    expect(claims.length, equals(1));
  } finally {
    audiences.restore();
  }
});

Scribe.test("verifyDeclarations refuses a pair already durably claimed by a different owner", async () => {
  const audiences = installAudienceMock();
  audiences.seedDeclarations([{ feature: FEATURE, name: NAME, owner: "owner-a", created_at: 1 }]);

  try {
    await expectLater(() => verifyDeclarations("owner-b"), throwsA(isA(AudienceClaimError)));
  } finally {
    audiences.restore();
  }
});

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

Scribe.test("a table that cannot be reached refuses to verify rather than claiming blind", async () => {
  const down = installUnreachableDatabase();

  try {
    await expectLater(() => verifyDeclarations("owner-a"), throwsA(isA(Error)));
  } finally {
    down.restore();
  }
});
