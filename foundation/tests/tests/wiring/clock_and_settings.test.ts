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
import "@scribe/runtime/scholium/runner.ts";
import {
  allOf,
  equals,
  expect,
  FixedNow,
  isA,
  isNot,
  isTrue,
  same,
  Scribe,
  throwsA,
  withMessage,
} from "@scribe/alchemy/test";
import "../../testing/settings.ts";
import { DateTime, Duration, Now } from "@scribe/alchemy";
import { SystemNow } from "../../../lib/src/observe/system_now.ts";
import { cacheSettings } from "../../../lib/src/cache/cache_settings.ts";
import { databaseSettings } from "../../../lib/src/database/database_settings.ts";
import { queueSettings } from "../../../lib/src/queue/queue_settings.ts";
import { PostgrestClients } from "../../../lib/src/database/postgrest_clients.ts";

function withNow<T>(source: { millisecondsSinceEpoch(): number }, body: () => T): T {
  const held = Now.configured ? Now.get() : null;
  Now.use(source);
  try {
    return body();
  } finally {
    if (held === null) Now.clear();
    else Now.use(held);
  }
}

Scribe.test("the system clock answers the machine, and never goes backwards on its own", () => {
  const clock = new SystemNow();
  const first = clock.millisecondsSinceEpoch();
  const second = clock.millisecondsSinceEpoch();

  expect(second >= first, isTrue);
  expect(Math.abs(first - Date.now()) < 1_000, isTrue);
});

Scribe.test("a clock put in the slot is what the package reads, frozen included", () => {
  withNow(new FixedNow(1_700_000_000_000), () => {
    expect(DateTime.now().millisecondsSinceEpoch, equals(1_700_000_000_000));
    expect(DateTime.now().millisecondsSinceEpoch, equals(1_700_000_000_000));
  });
});

Scribe.test("a clock moved ten years forward is read ten years forward", () => {
  const clock = new FixedNow(1_700_000_000_000);

  withNow(clock, () => {
    clock.pass(Duration.days(3653));

    expect(DateTime.now().millisecondsSinceEpoch, equals(1_700_000_000_000 + 3653 * 24 * 60 * 60 * 1000));
  });
});

Scribe.test("a clock set before 1970 is read as the negative instant it is", () => {
  withNow(new FixedNow(-86_400_000), () => {
    expect(DateTime.now().millisecondsSinceEpoch, equals(-86_400_000));
  });
});

Scribe.test("a clock moved backwards is read backwards, since nothing here assumes it only advances", () => {
  const clock = new FixedNow(1_700_000_000_000);

  withNow(clock, () => {
    clock.pass(Duration.minutes(-10));

    expect(DateTime.now().millisecondsSinceEpoch, equals(1_700_000_000_000 - 600_000));
  });
});

Scribe.test("each settings slot refuses a read before anything fills it, and names itself in the refusal", () => {
  for (
    const [slot, name] of [[cacheSettings, "cache"], [queueSettings, "queue"], [databaseSettings, "database"]] as const
  ) {
    const held = slot.configured ? slot.get() : null;
    slot.clear();

    expect(() => slot.get(), throwsA(allOf(isA(Error), withMessage(name))));

    if (held !== null) slot.use(held as never);
  }
});

Scribe.test("the service client is one client for the whole process", () => {
  expect(PostgrestClients.service(), same(PostgrestClients.service()));
});

Scribe.test("clearing the database settings makes the next service client read them again, where today it answers the old one", () => {
  const first = PostgrestClients.service();
  const held = databaseSettings.get();

  try {
    databaseSettings.clear();
    databaseSettings.use({ restUrl: "http://elsewhere:3000", anonKey: "other", serviceRoleKey: "other" });

    expect(PostgrestClients.service(), isNot(same(first)));
  } finally {
    databaseSettings.use(held);
  }
});
