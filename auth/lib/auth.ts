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

/**
 * What "auth" hands whoever mounts it.
 *
 * @remarks
 * Everything it is made of lives in `src/`, the types it publishes in `contracts/`, and this is
 * the one file that names them: a file no line below reaches is a file this package does not
 * publish.
 *
 * `scribe` at the bottom is the other half of what it hands over. It is the three moments the
 * host may run this package at, and a package that runs at none of them says so with an empty
 * one rather than by exporting nothing.
 */

import { wireAuth } from "./src/capability/wire.ts";
import { capabilities } from "@scribe/contracts/capability.ts";
import type { LifecycleSteps } from "@scribe/alchemy";
import { extensions, OptionalExtension, runDeclarations } from "@scribe/runtime/support/extensions/mod.ts";
import { optional, required } from "@scribe/foundation";
import { AUTH_EXTENSION } from "./src/declaration/registry.ts";
import { authSettings } from "./src/settings.ts";
import { Account } from "./src/declaration/account.ts";

export { SignOutScope } from "./contracts/account.ts";
export type {
  AccountIdentity,
  AccountRow,
  Ban,
  BanOptions,
  BanRow,
  Session,
  SignInContext,
} from "./contracts/account.ts";
export { Channel } from "./contracts/channel.ts";
export type { AccountDevice } from "./contracts/device.ts";
export type { AccountRole } from "./contracts/role.ts";
export type { AuthSettings } from "./contracts/settings.ts";

/**
 * The kinds a project may declare against this package, bucket to the symbol it imports.
 *
 * @remarks
 * Read by `scribe gen code`, which is the only reader: it is what tells the tool that mounting
 * "auth" gives a project an "accounts" bucket to write into, without either the framework or the
 * tool ever naming this package.
 */
export const declares = { accounts: Account };

/**
 * When this package runs, which is once, at import, to fill what a mounted module needs.
 *
 * @remarks
 * The settings are the secrets and provider credentials this package reaches, read from the
 * process environment. They are read here rather than at the first call so that a checkout
 * missing one fails where the name of the variable is in front of the reader.
 *
 * The extension is where the project's own role declarations are loaded from, on the first token
 * that needs them. A declaration lives in the project, and a token can arrive in a process that
 * never imported it, so registering it here is what makes a role findable by name wherever the
 * token lands.
 */
export const scribe: LifecycleSteps = {
  wires: () => {
    capabilities.register(wireAuth);

    authSettings.use({
      jwtSecret: optional("JWT_SECRET"),
      pendingTokenSecret: required("PENDING_TOKEN_SECRET"),
      googleClientId: optional("GOOGLE_CLIENT_ID"),
      googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),
      appleClientId: optional("APPLE_CLIENT_ID"),
      appleClientSecret: optional("APPLE_CLIENT_SECRET"),
      twilioAccountSid: optional("TWILIO_ACCOUNT_SID"),
      twilioAuthToken: optional("TWILIO_AUTH_TOKEN"),
      twilioMessageServiceSid: optional("TWILIO_MESSAGE_SERVICE_SID"),
    });

    if (!extensions.declares(AUTH_EXTENSION)) {
      extensions.register(new OptionalExtension(AUTH_EXTENSION, () => runDeclarations("accounts")));
    }
  },
};
