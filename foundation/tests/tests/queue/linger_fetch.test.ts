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
import { installDrivers } from "../../testing/drivers.ts";
import { lingerFetch } from "../../../lib/src/queue/topology/linger_fetch.ts";
import type { Consumer, JsMsg } from "@nats-io/jetstream";
import { Now, type NowSource } from "@scribe/alchemy";
import { StreamSource } from "../../../lib/src/queue/runner/stream_source.ts";
import { topology } from "../../../lib/src/queue/topology/topology.ts";
import { installMock } from "../../testing/install.ts";
import { Queue } from "../../../lib/src/queue/queue.ts";
import { probe } from "./probe.ts";
installDrivers();

new Queue<{ id: number }>(
  { name: "test:linger:patient", batch: { lingerMs: 30_000 } },
  () => Promise.resolve(),
);

class SteppingNow implements NowSource {
  #at: number;
  readonly #step: number;
  reads = 0;

  constructor(at: number, step: number) {
    this.#at = at;
    this.#step = step;
  }

  millisecondsSinceEpoch(): number {
    const read = this.#at;
    this.#at += this.#step;
    this.reads++;
    return read;
  }
}

interface Feed {
  readonly available: number;
  readonly subject: string;
  stopped: boolean;
  delivered: number;
}

function consumer(feed: Feed): Consumer {
  return {
    fetch: () => {
      const iterator = {
        stop: () => {
          feed.stopped = true;
        },
        async *[Symbol.asyncIterator]() {
          while (!feed.stopped && feed.delivered < feed.available) {
            feed.delivered++;
            yield probe({
              subject: feed.subject,
              data: { id: feed.delivered },
              seq: feed.delivered,
            }) as unknown as JsMsg;
            await Promise.resolve();
          }
        },
      };
      return Promise.resolve(iterator);
    },
  } as unknown as Consumer;
}

function feed(available: number, subject = "q.linger"): Feed {
  return { available, subject, stopped: false, delivered: 0 };
}

Scribe.test("a fetch asked for nothing never reaches the server", async () => {
  const source = feed(10);

  expect(await lingerFetch(consumer(source), 0, 5_000, () => 25), equals([]));
  expect(await lingerFetch(consumer(source), -3, 5_000, () => 25), equals([]));
  expect(source.delivered, equals(0));
});

Scribe.test("a fetch without a grace resolver takes everything the iterator gives it", async () => {
  const source = feed(40);

  const messages = await lingerFetch(consumer(source), 40, 5_000);

  expect(messages.length, equals(40));
  expect(source.stopped, equals(false));
});

Scribe.test("the window closes once the grace has passed since the first message", async () => {
  const source = feed(100);
  Now.use(new SteppingNow(1_800_000_000_000, 4));

  try {
    const messages = await lingerFetch(consumer(source), 100, 5_000, () => 25);

    expect(messages.length < 100, equals(true), `${messages.length} messages came back`);
    expect(source.stopped, equals(true));
  } finally {
    installDrivers();
  }
});

Scribe.test("a clock reading the epoch loses the stamp of the first message of the window", async () => {
  const atEpoch = feed(100);
  const later = feed(100);
  Now.use(new SteppingNow(0, 4));
  const fromEpoch = await lingerFetch(consumer(atEpoch), 100, 5_000, () => 25);

  Now.use(new SteppingNow(1_800_000_000_000, 4));
  const fromLater = await lingerFetch(consumer(later), 100, 5_000, () => 25);
  installDrivers();

  expect(
    fromEpoch.length - fromLater.length,
    equals(1),
    "firstAt is held in a number whose empty value is zero, so a clock reading zero does not " +
      "look stamped and the second message restamps the window: the slip is one message and " +
      "no more, because the second stamp is not zero",
  );
});

Scribe.test("a fetch gives a batch queue less time to group than the linger it declared", async () => {
  const asked: number[] = [];
  const mock = installMock(
    topology,
    "fetch",
    (
      _stream: string,
      _durable: string,
      _count: number,
      expiresMs: number,
    ) => {
      asked.push(expiresMs);
      return Promise.resolve([] as JsMsg[]);
    },
  );

  try {
    await StreamSource.shared().fetch(100);

    expect(
      asked[0] >= 30_000,
      equals(true),
      `the fetch window is a constant ${asked[0]}ms while the linger comes from the ` +
        "declaration, so a queue that asked to group over 30000ms has its iterator closed " +
        "first and is handed its group early, without anything saying the number it " +
        "declared was not the one applied",
    );
  } finally {
    mock.restore();
  }
});

Scribe.test("the shortest grace in the batch is the one the window closes on", async () => {
  const source = feed(60);
  Now.use(new SteppingNow(1_800_000_000_000, 6));
  const asked: string[] = [];

  try {
    const messages = await lingerFetch(consumer(source), 60, 5_000, (subject) => {
      asked.push(subject);
      return asked.length === 1 ? 10_000 : 12;
    });

    expect(messages.length < 60, equals(true));
    expect(asked.length, equals(messages.length));
  } finally {
    installDrivers();
  }
});

Scribe.test("every message of the fetch costs one grace lookup and one timer", async () => {
  const source = feed(50);
  Now.use(new SteppingNow(1_800_000_000_000, 0));
  let lookups = 0;

  try {
    const messages = await lingerFetch(consumer(source), 50, 5_000, () => {
      lookups++;
      return 25;
    });

    expect(messages.length, equals(50));
    expect(
      lookups,
      equals(50),
      "the deadline is firstAt plus the smallest grace seen, and it only ever moves earlier, " +
        "so re-arming a timer on every message is work the window does not need",
    );
  } finally {
    installDrivers();
  }
});
