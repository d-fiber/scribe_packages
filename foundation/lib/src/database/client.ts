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

import { databaseSettings } from "@scribe/foundation/lib/src/database/settings.ts";
import { PostgrestClient } from "@supabase/postgrest-js";

/**
 * The PostgREST client every path inside the framework shares.
 *
 * @remarks
 * There is one client and one role. Owner scoping is decided in TypeScript, by `ownerScope` in
 * `query/scope.ts`, and never delegated to a row level security policy: the framework reaches
 * PostgREST with the service role, so `auth.uid()` and `auth.jwt()` never see a caller's identity
 * on this path. A per-caller client passing the request's own `Authorization` header used to sit
 * beside this one, and nothing ever called it.
 */
export class PostgrestClients {
  static #serviceClient: PostgrestClient | null = null;

  /** The shared client, authenticated with the service role key. */
  static service(): PostgrestClient {
    if (!this.#serviceClient) {
      const { restUrl, serviceRoleKey } = databaseSettings.get();
      this.#serviceClient = new PostgrestClient(restUrl, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
    }
    return this.#serviceClient;
  }
}
