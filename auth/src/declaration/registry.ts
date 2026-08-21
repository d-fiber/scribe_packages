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

import type { AnyAccount } from "./account.ts";

const declarations = new Map<string, AnyAccount>();

/**
 * Records that `account` was declared, so a token can find the declaration its role names.
 *
 * @throws {TypeError} When two declarations take the same name. The role travels in the token and
 * nothing else tells the two apart, so one would answer for the other and which one would depend
 * on the order the files were loaded in.
 */
export function declareAccount(account: AnyAccount): void {
  const named = declarations.get(account.name);
  if (named !== undefined && named !== account) {
    throw new TypeError(`account role "${account.name}" is declared twice.`);
  }

  declarations.set(account.name, account);
}

/** Every account role this process declared. */
export function declaredAccounts(): readonly AnyAccount[] {
  return [...declarations.values()];
}

/** The role declared under `name`, or null when nothing answers to it. */
export function accountNamed(name: string): AnyAccount | null {
  return declarations.get(name) ?? null;
}

/** Forgets every declaration, which only a test suite has any reason to do. */
export function forgetDeclaredAccounts(): void {
  declarations.clear();
}

/**
 * The name a project's own account declarations are loaded under.
 *
 * A declaration lives in the project, and a token can arrive in a process that has no reason to
 * have imported it. Loading the extension before reading the registry is what makes a role
 * findable by name in a worker that only ever handled queue work.
 */
export const AUTH_EXTENSION = "auth";
