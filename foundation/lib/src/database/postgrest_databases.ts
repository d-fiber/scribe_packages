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

import type { DatabaseDriver, DatabaseSchema, Query } from "@scribe/alchemy";
import { PostgrestClients } from "./postgrest_clients.ts";
import { from } from "./tables_base.ts";

/**
 * What opens a query on a table for a package that asked the port for one.
 *
 * @remarks
 * The builder this hands back is the one this package writes its own reads with, so a package
 * that reaches the port and one that reaches the builder are held to the same two guards: the
 * owner filter and the refusal of a write naming no row. Handing back anything else would make
 * the port the way around them.
 *
 * The client is opened at the first call rather than here, so importing a package that never
 * reads a row costs no connection.
 *
 * The conversion bridges one difference, and it is not reachable from the port. This package's
 * projection admits an embedded relation, which answers an array; the port's admits a column and
 * answers what that column holds. A caller cannot ask for an embed through the port, whose
 * `select` takes column names and nothing else, so the wider shape never leaves this file.
 */
export class PostgrestDatabases implements DatabaseDriver {
  /** A query on `name`, scoped to the caller the way every other read of this package is. */
  table<S extends DatabaseSchema, K extends keyof S & string>(name: K): Query<S[K]["row"] & object> {
    return from<S[K]["row"] & object>(PostgrestClients.service(), name) as unknown as Query<
      S[K]["row"] & object
    >;
  }
}
