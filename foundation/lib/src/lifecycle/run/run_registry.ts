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

import { DuplicateDeclarationError, type UnmodifiableList } from "@scribe/alchemy";
import type { RunHandler } from "./run.ts";

/** A declared job, and the handler that runs it on every launch. */
export interface RegisteredRun {
  /** The name this job was declared under: the class `@Run` was written on. */
  readonly name: string;

  /** The body to run once the rest of the stack has answered healthy. */
  readonly handler: RunHandler;
}

/**
 * Every `@Run` declared so far, indexed by name.
 *
 * The name has to be unique for the same reason a `Cron` name does: it is what tells two
 * declarations apart, and a collision would mean one of them is silently never run.
 */
export class RunRegistry {
  readonly #jobs = new Map<string, RegisteredRun>();

  /** Registers a job, and refuses a name already taken. */
  add(entry: RegisteredRun): void {
    if (this.#jobs.has(entry.name)) {
      throw new DuplicateDeclarationError(
        `@Run() on "${entry.name}": this class already declared one. A class carries at most one ` +
          `@Run method.`,
      );
    }
    this.#jobs.set(entry.name, entry);
  }

  /** The jobs declared so far, in declaration order. */
  list(): UnmodifiableList<RegisteredRun> {
    return [...this.#jobs.values()];
  }

  /** One line naming how many jobs are declared, printed before the runner plays them. */
  report(): string {
    const jobs = this.list();
    if (jobs.length === 0) {
      return "[run] no job declared";
    }

    return `[run] ${jobs.length} job(s) declared: ${jobs.map((entry) => entry.name).join(", ")}`;
  }
}

/** The registry every `@Run` declaration writes into. */
export const runRegistry: RunRegistry = new RunRegistry();
