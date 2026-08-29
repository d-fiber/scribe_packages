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
import "@scribe/testing/runner.ts";
import { contains, equals, expect, isFalse, isNot, Scribe } from "@scribe/alchemy/test";
import { ConsoleLogger } from "../../../lib/src/observe/console_logger.ts";
import type { LoggedLevel } from "@scribe/alchemy/observe";
import { installMock } from "../../testing/install.ts";

function actionOf(written: Written): string {
  const line = String(written.args[0]);
  return line.slice(line.indexOf("["));
}

interface Written {
  readonly level: LoggedLevel;
  readonly args: readonly unknown[];
}

function writing(body: (written: Written[]) => void): void {
  const written: Written[] = [];
  const taken = (["debug", "info", "warn", "error"] as const).map((level) =>
    installMock(
      console,
      level,
      ((...args: unknown[]) => {
        written.push({ level, args });
      }) as typeof console.log,
    )
  );

  try {
    body(written);
  } finally {
    for (const one of taken) one.restore();
  }
}

Scribe.test("each of the four levels reaches the console member that carries it", () => {
  writing((written) => {
    const logger = new ConsoleLogger();
    logger.debug("a");
    logger.info("a");
    logger.warn("a");
    logger.error("a");

    expect(written.map((one) => one.level), equals(["debug", "info", "warn", "error"]));
  });
});

Scribe.test("a line below the floor is dropped, unread", () => {
  writing((written) => {
    const logger = new ConsoleLogger("warn");
    logger.debug("a");
    logger.info("a");
    logger.warn("a");
    logger.error("a");

    expect(written.map((one) => one.level), equals(["warn", "error"]));
  });
});

Scribe.test("a floor at the most serious level keeps that level alone", () => {
  writing((written) => {
    const logger = new ConsoleLogger("error");
    for (const level of ["debug", "info", "warn", "error"] as const) logger.at(level, "a");

    expect(written.map((one) => one.level), equals(["error"]));
  });
});

Scribe.test("a level nobody declared is dropped rather than written at the bottom", () => {
  writing((written) => {
    new ConsoleLogger("debug").at("trace" as LoggedLevel, "a");

    expect(written.length, equals(0));
  });
});

Scribe.test("the action is written between brackets and nothing else is when nothing was carried", () => {
  writing((written) => {
    new ConsoleLogger().info("cache.filled");

    expect(actionOf(written[0]), equals("[cache.filled]"));
    expect(written[0].args.length, equals(1));
  });
});

Scribe.test("who acted is written as one argument, kind and identifier together", () => {
  writing((written) => {
    new ConsoleLogger().info("a", { actorType: "user", actorId: "7" });

    expect(actionOf(written[0]), equals("[a]"));
    expect(written[0].args[1], equals("user=7"));
  });
});

Scribe.test("an identifier with no kind is written under a kind of its own", () => {
  writing((written) => {
    new ConsoleLogger().info("a", { actorId: "7" });

    expect(written[0].args[1], equals("actor=7"));
  });
});

Scribe.test("metadata is handed over as a value rather than folded into the sentence", () => {
  writing((written) => {
    const carried = { queue: "orders", attempts: 2 };
    new ConsoleLogger().info("a", { metadata: carried });

    expect(written[0].args.length, equals(2));
    expect(written[0].args[1], equals(carried));
  });
});

Scribe.test("metadata left out carries nothing, where metadata set to null carries null", () => {
  writing((written) => {
    const logger = new ConsoleLogger();
    logger.info("a", { metadata: undefined });
    logger.info("b", { metadata: null });

    expect(written[0].args.length, equals(1));
    expect(actionOf(written[1]), equals("[b]"));
    expect(written[1].args[1], equals(null));
  });
});

Scribe.test("metadata that refers to itself is written without the console being asked to unroll it", () => {
  writing((written) => {
    const circular: Record<string, unknown> = { name: "self" };
    circular.again = circular;

    new ConsoleLogger().info("a", { metadata: circular });

    expect(written[0].args[1], equals(circular));
  });
});

Scribe.test("metadata fifty deep and metadata holding a bigint are both written", () => {
  writing((written) => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let at = 0; at < 50; at++) {
      const next: Record<string, unknown> = {};
      deep.under = next;
      deep = next;
    }

    const logger = new ConsoleLogger();
    logger.info("deep", { metadata: root });
    logger.info("big", { metadata: { counted: 9_007_199_254_740_993n } });

    expect(written.length, equals(2));
    expect(written[1].args[1], equals({ counted: 9_007_199_254_740_993n }));
  });
});

Scribe.test("an error carrying no message is written as the value it is", () => {
  writing((written) => {
    const raised = new Error();
    Object.defineProperty(raised, "message", { value: undefined });

    new ConsoleLogger().error("failed", { metadata: { error: raised } });

    expect(written[0].level, equals("error"));
    expect(written[0].args[1], equals({ error: raised }));
  });
});

Scribe.test("an action of ten thousand characters is written whole", () => {
  writing((written) => {
    new ConsoleLogger().info("x".repeat(10_000));

    expect(actionOf(written[0]).length, equals(10_002));
    expect(actionOf(written[0]), contains("x".repeat(10_000)));
  });
});

Scribe.test("an action that is empty still writes a pair of brackets", () => {
  writing((written) => {
    new ConsoleLogger().info("");

    expect(actionOf(written[0]), equals("[]"));
    expect(written[0].args.length, equals(1));
  });
});

Scribe.test("a line under the floor costs nothing to build", () => {
  writing((written) => {
    const logger = new ConsoleLogger("error");
    let read = 0;
    const carried = {
      get metadata(): unknown {
        read++;
        return { a: 1 };
      },
    };

    for (let at = 0; at < 1_000; at++) logger.debug("a", carried);

    expect(written.length, equals(0));
    expect(read, equals(0), "a dropped line must not touch what it would have carried");
  });
});

Scribe.test("the written line says which level it is, where today an info and a debug are the same text", () => {
  writing((written) => {
    const logger = new ConsoleLogger();
    logger.debug("a");
    logger.info("a");
    logger.warn("a");
    logger.error("a");

    expect(String(written[0].args[0]), isNot(equals(String(written[1].args[0]))), "debug and info read alike");
    expect(String(written[2].args[0]), isNot(equals(String(written[3].args[0]))), "warn and error read alike");
  });
});

Scribe.test("an action holding a line break cannot write a second line that reads like a record of its own", () => {
  writing((written) => {
    new ConsoleLogger().info("noise]\n[auth.sign_in_succeeded");

    expect(
      String(written[0].args[0]).includes("\n"),
      isFalse,
      "a caller that names an action forges a whole line of the journal",
    );
  });
});

Scribe.test("a kind of actor with no identifier is still written, where today it is dropped whole", () => {
  writing((written) => {
    new ConsoleLogger().info("a", { actorType: "cron" });

    expect(written[0].args.length, equals(2));
  });
});
