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

import "@scribe/scholium/runner.ts";
import { Scribe } from "@scribe/alchemy/test";
import "@scribe/testing/settings.ts";

import { create } from "@bufbuild/protobuf";
import { assertEquals } from "@std/assert";
import { installMock } from "@scribe/testing/install.ts";
import { PostgrestClients } from "@scribe/foundation";
import { FakePostgrestClient } from "@scribe/foundation/testing";
import { Operation, QuerySchema } from "@scribe/sdk/gen/scribe/packages/foundation/protocol/database_pb.ts";
import { executeQuery } from "../../../lib/src/database/capability.ts";

const UNOWNED = "t_email_templates";

function seeded(): { fake: FakePostgrestClient; restore(): void } {
  const fake = new FakePostgrestClient({
    [UNOWNED]: [{ id: 1, name: "welcome" }, { id: 2, name: "reset" }],
  });
  const mock = installMock(
    PostgrestClients as unknown as Record<string, unknown>,
    "service",
    (() => fake) as unknown as never,
  );
  return { fake, restore: () => mock.restore() };
}

Scribe.test("a worker delete with no predicate at all is refused, not run", async () => {
  const { fake, restore } = seeded();
  try {
    const answer = await executeQuery(
      create(QuerySchema, { table: UNOWNED, operation: Operation.DELETE }),
    );

    assertEquals(fake.rows(UNOWNED).length, 2, "no row may be removed by a query naming none");
    assertEquals(answer.error?.code, "unbounded_write");
  } finally {
    restore();
  }
});
