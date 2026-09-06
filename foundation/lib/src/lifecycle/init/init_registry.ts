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
import type { InitHandler } from "./init.ts";

/** A declared one-time job, and the handler that runs it. */
export interface RegisteredInit {
  /** The name this job was declared under, and the key it is tracked by in `foundation.__inits__`. */
  readonly name: string;

  /** The body to run the one time this job has never run before. */
  readonly handler: InitHandler;
}

/**
 * Every `Init` declared so far, indexed by name.
 *
 * The name has to be unique because it is the key the tracking table stores: two declarations
 * sharing one would be indistinguishable once either had run.
 */
export class InitRegistry {
  readonly #jobs = new Map<string, RegisteredInit>();

  /** Registers a job, and refuses a name already taken. */
  add(entry: RegisteredInit): void {
    if (this.#jobs.has(entry.name)) {
      throw new DuplicateDeclarationError(
        `new Init("${entry.name}"): this name is already declared. An init name is the key it ` +
          `is tracked by, it must be unique.`,
      );
    }
    this.#jobs.set(entry.name, entry);
  }

  /** The jobs declared so far, in declaration order. */
  list(): UnmodifiableList<RegisteredInit> {
    return [...this.#jobs.values()];
  }

  /** One line naming how many jobs are declared, printed before the runner plays them. */
  report(): string {
    const jobs = this.list();
    if (jobs.length === 0) {
      return "[init] no job declared";
    }

    return `[init] ${jobs.length} job(s) declared: ${jobs.map((entry) => entry.name).join(", ")}`;
  }
}

/** The registry every `Init` declaration writes into. */
export const initRegistry: InitRegistry = new InitRegistry();
