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
import { equals, expect, Scribe } from "@scribe/alchemy/test";
import { installStorageTestSettings } from "../testing/settings.ts";

installStorageTestSettings();
import type { FakePostgrestSeed } from "@scribe/foundation/testing";
import { objectsUnder } from "../../lib/src/db/objects.ts";
import { installDatabaseFake } from "./mocks/database.ts";

function seededWith(count: number): FakePostgrestSeed {
  return {
    __storage_objects__: Array.from({ length: count }, (_, i) => ({
      path: `bin/${String(i).padStart(5, "0")}`,
      visibility: "public",
      mime_type: "application/octet-stream",
      byte_size: 1,
      blur_hash: null,
      updated_at: "2026-08-01T00:00:00.000Z",
    })),
  };
}

Scribe.test("objectsUnder: a prefix holding exactly the page size is not reported full", async () => {
  const database = installDatabaseFake(seededWith(5));

  const page = await objectsUnder("bin", 5);

  expect(page !== null && page.objects.length, equals(5));
  expect(page !== null && page.full, equals(false));

  database.restore();
});

Scribe.test("objectsUnder: a prefix holding one more than the page size is reported full", async () => {
  const database = installDatabaseFake(seededWith(6));

  const page = await objectsUnder("bin", 5);

  expect(page !== null && page.objects.length, equals(5));
  expect(page !== null && page.full, equals(true));
  expect(page !== null && page.last, equals("bin/00004"));

  database.restore();
});
