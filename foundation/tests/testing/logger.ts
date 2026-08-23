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

import type { LoggedLevel, Logger, LogInput } from "@scribe/alchemy/observe";
import { Loggers } from "@scribe/alchemy/observe";

export interface LoggedLine {
  readonly level: LoggedLevel;

  readonly action: string;

  readonly input: LogInput | null;
}

export class MemoryLogger implements Logger {
  readonly lines: LoggedLine[] = [];

  debug(action: string, input?: LogInput): void {
    this.at("debug", action, input);
  }

  info(action: string, input?: LogInput): void {
    this.at("info", action, input);
  }

  warn(action: string, input?: LogInput): void {
    this.at("warn", action, input);
  }

  error(action: string, input?: LogInput): void {
    this.at("error", action, input);
  }

  at(level: LoggedLevel, action: string, input?: LogInput): void {
    this.lines.push({ level, action, input: input ?? null });
  }

  get actions(): readonly string[] {
    return this.lines.map((line) => line.action);
  }

  clear(): void {
    this.lines.length = 0;
  }
}

export function recordLog(): MemoryLogger & { restore(): void } {
  const held = Loggers.configured ? Loggers.get() : null;
  const logger = new MemoryLogger();
  Loggers.use(logger);

  return Object.assign(logger, {
    restore(): void {
      if (held === null) Loggers.clear();
      else Loggers.use(held);
    },
  });
}
