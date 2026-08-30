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

import type { Command, CommandOptions, CommandResult } from "@scribe/alchemy";

/**
 * The subprocesses this process can start, as the port describes a command runner.
 *
 * @remarks
 * It is the only file of this package that starts a program that is not this one, which is what
 * lets a test stand a fixed answer behind the port without a binary being installed. Whether a
 * program may be started at all is the deployment's business, set by what the process was allowed
 * to run, not by a check this class could make.
 */
export class LocalCommands implements Command {
  /** Runs `program` with `args`, feeding it `options.stdin` when there is any, and reads it whole. */
  async run(program: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult> {
    const input = options?.stdin;
    const spawned = new Deno.Command(program, {
      args: [...args],
      stdin: input === undefined ? "null" : "piped",
      stdout: "piped",
      stderr: "piped",
    });

    if (input === undefined) {
      const { code, stdout, stderr } = await spawned.output();
      return { code, stdout, stderr };
    }

    const child = spawned.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(input);
    await writer.close();

    const { code, stdout, stderr } = await child.output();
    return { code, stdout, stderr };
  }
}
