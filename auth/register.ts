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

import { extensions, OptionalExtension } from "@scribe/core/runtime/support/extensions/mod.ts";
import { Env } from "@scribe/host/env.ts";
import { authSettings } from "./src/settings.ts";
import { AUTH_EXTENSION } from "./src/declaration/registry.ts";

/** The secrets and provider credentials this module reaches, from the process environment. */
authSettings.use({
  jwtSecret: Env.JWT_SECRET ?? "",
  pendingTokenSecret: Env.PENDING_TOKEN_SECRET ?? "",
  googleClientId: Env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: Env.GOOGLE_CLIENT_SECRET ?? "",
  appleClientId: Env.APPLE_CLIENT_ID ?? "",
  appleClientSecret: Env.APPLE_CLIENT_SECRET ?? "",
  twilioAccountSid: Env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: Env.TWILIO_AUTH_TOKEN ?? "",
  twilioMessageServiceSid: Env.TWILIO_MESSAGE_SERVICE_SID ?? "",
});

/**
 * Where the project's own role declarations are loaded from, on the first token that needs them.
 *
 * A declaration lives in the project, and a token can arrive in a process that never imported it.
 * Registering it here is what makes a role findable by name wherever the token lands.
 */
extensions.register(
  new OptionalExtension(
    AUTH_EXTENSION,
    () => import("@app/extensions/manifest/auth/auth.ts"),
  ),
);
