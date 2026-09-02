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
import { DateTime } from "@scribe/alchemy";
import { Audience } from "../../lib/src/core/declaration.ts";
import { installAudienceMock } from "../testing/mock.ts";
import type { Row } from "@scribe/foundation/testing";

const list = Audience.for("pagination").global("large-list");

function rowsOf(members: readonly string[], expiresAt: number | null = null): Row[] {
  return members.map((member) => ({
    feature: "pagination",
    audience: "large-list",
    member,
    created_at: 1,
    expires_at: expiresAt,
  }));
}

Scribe.test("a page walks a list too large for one page without gaps or duplicates", async () => {
  const audiences = installAudienceMock();
  const members = Array.from({ length: 25 }, (_, i) => `m${String(i).padStart(3, "0")}`);
  audiences.seed(rowsOf(members));

  try {
    const collected: string[] = [];
    let cursor: string | undefined;

    for (let guard = 0; guard < 10; guard++) {
      const page = await list.members({ after: cursor, limit: 10 });
      collected.push(...page.members);
      if (page.cursor === null) break;
      cursor = page.cursor;
    }

    expect(collected, equals(members));
  } finally {
    audiences.restore();
  }
});

Scribe.test("a page does not under-report live members when expired rows are interleaved within its window", async () => {
  const audiences = installAudienceMock();
  const expired = Array.from({ length: 8 }, (_, i) => `expired${i}`);
  const live = ["m0", "m1", "m2"];

  // Interleave so the expired rows sort ahead of some live ones: a raw page of the requested size
  // would previously have been filtered after being capped, undercounting the live members.
  audiences.seed([...rowsOf(expired, DateTime.now().millisecondsSinceEpoch - 1), ...rowsOf(live)]);

  try {
    const page = await list.members({ limit: 3 });

    expect(page.members, equals(live));
    expect(page.truncated, isFalse);
  } finally {
    audiences.restore();
  }
});

Scribe.test("a page that gives up scanning says so instead of reading as complete", async () => {
  const audiences = installAudienceMock();
  const allExpired = Array.from({ length: 40 }, (_, i) => `gone${i}`);
  audiences.seed(rowsOf(allExpired, DateTime.now().millisecondsSinceEpoch - 1));

  try {
    const page = await list.members({ limit: 2 });

    expect(page.members, equals([]));
    expect(page.truncated, equals(true));
  } finally {
    audiences.restore();
  }
});
