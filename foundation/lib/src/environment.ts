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

import type { Environment } from "@scribe/alchemy";
import { Environments } from "@scribe/alchemy";

/**
 * The environment this process was started in, as the port describes one.
 *
 * @remarks
 * It is the only file of this package that reads the runtime's own environment, which is what
 * lets a test put a fixed set of values behind the port without the machine it runs on showing
 * through. Every read answers the way the runtime's reader does: an unset name is `undefined`,
 * and a name set to the empty string is `""`.
 */
export class ProcessEnvironment implements Environment {
  /** The value set for `name`, or `undefined` when the process holds none. */
  get(name: string): string | undefined {
    return Deno.env.get(name);
  }

  /** Every name and value the process was started with. */
  toObject(): Record<string, string> {
    return Deno.env.toObject();
  }
}

const process = new ProcessEnvironment();

/**
 * What a setting is read through: what filled {@link Environments} when a host or a test did, and
 * the real process environment otherwise.
 *
 * @remarks
 * The fallback is what lets {@link required} and {@link optional} run while a process wires
 * itself, before anything has filled the slot. A test that needs a fixed environment fills it,
 * and from then on every read goes through what it put there.
 */
export function environment(): Environment {
  return Environments.configured ? Environments.get() : process;
}

/**
 * The value `name` holds in the process environment, refusing an absent or empty one.
 *
 * @remarks
 * A package reads what it needs while it wires itself, not at the first call that needs
 * it: a deployment missing a variable then stops on a line that names the variable,
 * instead of failing later in a stack that names the caller and never the setting.
 *
 * Nothing here holds a list of names. The names belong to the deployment, and a package
 * asks only for the ones it reads, which is what keeps a package from carrying the
 * environment of a process it cannot see.
 *
 * @param name - The variable to read, as the deployment spells it.
 * @returns What the environment holds under `name`.
 * @throws {Error} When the variable is absent, or holds nothing but an empty string.
 */
export function required(name: string): string {
  const value = environment().get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);

  return value;
}

/**
 * The value `name` holds in the process environment, or `fallback` when it holds none.
 *
 * @remarks
 * This is for a setting a deployment may legitimately leave out, a provider it does not
 * use being the usual one. A variable that is set to an empty string is taken as set, so
 * a deployment that means to disable something clears it rather than emptying it.
 *
 * @param name - The variable to read, as the deployment spells it.
 * @param fallback - What the caller works with when the deployment names nothing.
 * @returns What the environment holds under `name`, or `fallback`.
 */
export function optional(name: string, fallback = ""): string {
  return environment().get(name) ?? fallback;
}
