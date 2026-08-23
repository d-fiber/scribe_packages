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

import { currentPrincipal } from "@scribe/core/runtime/http/accessors/identity.ts";
import { ScribeError } from "@scribe/alchemy";
import { ownerOf } from "../table_owners.ts";

/**
 * The permission that lets a caller read past the rows it owns.
 *
 * @remarks
 * It is a permission and not a kind of account, because who is allowed to see a whole table is a
 * decision a deployment makes and this framework cannot: a back office, a support tool and an
 * export job all need it, and none of them is a word this layer could have known.
 */
export const READS_EVERY_ROW = "database.unscoped";

/** What a query is allowed to see of an owned table. */
export type ScopeDecision =
  | { readonly kind: "open" }
  | { readonly kind: "scoped"; readonly column: string; readonly id: string }
  | { readonly kind: "nobody"; readonly column: string };

const OPEN: ScopeDecision = { kind: "open" };

/**
 * The owner an anonymous caller is narrowed to, which no row can hold.
 *
 * @remarks
 * The read runs and answers nothing, which is what an anonymous caller should see of a table
 * somebody owns. Answering nothing is not refusing, and the difference matters: a refusal would
 * tell the caller the table exists.
 */
export const NOBODY = "\u0000nobody";

/**
 * Raised when an owned table is read from a path that never resolved a caller.
 *
 * @remarks
 * A queue worker, a cron body, a trigger handler and a webhook endpoint all run outside a
 * request, so nothing resolved an identity on the way in. That is not an anonymous caller, and
 * reading the whole table because nobody asked is how a background job comes to see everything.
 */
export class UnprovenCallerError extends ScribeError {}

/**
 * What the caller of the current request may see of `table`.
 *
 * @remarks
 * A table that declares an owner column is read as that caller's own rows and no others. There is
 * one rule and not one per kind of account: the framework knows who is calling and what column the
 * table says owns a row, and it has no way of knowing that a deployment has two populations, or
 * five, or one. A caller whose identifier appears in no row simply reads no row, which is the
 * same answer as a refusal and does not require guessing which population they belong to.
 *
 * Seeing the whole table is {@link READS_EVERY_ROW}, which a deployment grants to whoever it
 * decides needs it.
 *
 * @throws {UnprovenCallerError} When nothing on this path ever resolved a caller. It is not the
 * same as an anonymous one, which reads no row, and telling the two apart is the whole of why
 * this reads {@link currentPrincipal} rather than an identifier that is null in both cases.
 */
export function ownerScope(table: string): ScopeDecision {
  const column = ownerOf(table);
  if (column === null) return OPEN;

  const principal = currentPrincipal();

  if (principal.kind === "unproven") {
    throw new UnprovenCallerError(
      `refusing to read "${table}" from a path with no caller. Call unscoped() when the `
        + `authorisation was decided upstream, which is what a worker, a cron and a hook do.`,
    );
  }

  if (principal.kind === "anonymous") return { kind: "nobody", column };
  if (principal.user.permissions.includes(READS_EVERY_ROW)) return OPEN;

  return { kind: "scoped", column, id: principal.user.id };
}
