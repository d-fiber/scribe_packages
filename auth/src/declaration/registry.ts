// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
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
