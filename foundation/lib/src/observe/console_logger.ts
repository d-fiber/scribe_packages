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
import type { UnmodifiableList } from "@scribe/alchemy";
import { atLeast } from "@scribe/alchemy/observe";

/**
 * The logger that writes to the process console, and what fills `Loggers` when nothing better has.
 *
 * @remarks
 * It exists so that a line recorded before a host has wired anything still reaches somebody. Every
 * package writes `log.error` and never a console, and the day a deployment ships lines to a
 * collector it fills the slot again and not one call site changes.
 *
 * The line is `level [action] {metadata}`, which is what the rest of the stack already prints, so
 * a deployment reading two processes side by side reads one format.
 *
 * @param floor - The least severe level this writes. A line below it is dropped, unread.
 */
export class ConsoleLogger implements Logger {
  /** The least severe level this writes, which everything is compared against. */
  readonly #floor: LoggedLevel;

  constructor(floor: LoggedLevel = "debug") {
    this.#floor = floor;
  }

  /** Records something only useful while somebody is looking. */
  debug(action: string, input?: LogInput): void {
    this.at("debug", action, input);
  }

  /** Records something that happened and was meant to. */
  info(action: string, input?: LogInput): void {
    this.at("info", action, input);
  }

  /** Records something that worked and should not have to. */
  warn(action: string, input?: LogInput): void {
    this.at("warn", action, input);
  }

  /** Records something that did not work. */
  error(action: string, input?: LogInput): void {
    this.at("error", action, input);
  }

  /**
   * Records at `level`, dropping the line when `level` is below the floor this was opened with.
   *
   * @remarks
   * What a line carries beyond its action is passed to the console as a value rather than folded
   * into the string, so a terminal expands it and a collector that reads this process keeps the
   * shape instead of a sentence it would have to parse back.
   *
   * The level opens the text and not only the console method it was written with. A collector
   * reads the stream, where an info and a debug arrive on the same descriptor and the colour a
   * terminal adds is gone.
   */
  at(level: LoggedLevel, action: string, input?: LogInput): void {
    if (!atLeast(level, this.#floor)) return;

    const line = `${level} [${_onOneLine(action)}]`;
    const carried = _carriedBy(input);

    if (level === "error") return void console.error(line, ...carried);
    if (level === "warn") return void console.warn(line, ...carried);
    if (level === "info") return void console.info(line, ...carried);
    console.debug(line, ...carried);
  }
}

/** What a line carries beyond its action, as arguments a console prints one after the other. */
function _carriedBy(input?: LogInput): UnmodifiableList<unknown> {
  if (input === undefined) return [];

  const who = _whoBy(input);
  const carried: unknown[] = [];

  if (who !== null) carried.push(who);
  if (input.metadata !== undefined) carried.push(input.metadata);

  return carried;
}

/**
 * Who a line is about, as one word, or null when it names nobody.
 *
 * @remarks
 * A kind with no identifier still says something a reader wants: a cron and a request are not the
 * same actor even when neither has a name to give.
 */
function _whoBy(input: LogInput): string | null {
  if (input.actorId !== undefined) return `${input.actorType ?? "actor"}=${_onOneLine(input.actorId)}`;
  return input.actorType === undefined ? null : _onOneLine(input.actorType);
}

/**
 * `text` with the line breaks in it spelled out.
 *
 * @remarks
 * An action is named by whoever writes the line, and some of them pass a value they were given. A
 * break left as it comes ends the record and opens a second one that reads like a line the process
 * wrote, which is how a journal is forged from the outside.
 */
function _onOneLine(text: string): string {
  return text.includes("\n") || text.includes("\r")
    ? text.replaceAll("\r", "\\r").replaceAll("\n", "\\n")
    : text;
}
