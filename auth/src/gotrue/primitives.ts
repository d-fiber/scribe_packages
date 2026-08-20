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

import { authSettings } from "../settings.ts";
import { Failure, type Result } from "@scribe/core/contracts/result.ts";
import { anonHeaders, type AuthError, authUrl, type GoTrueSessionResponse, requestAuth } from "./transport.ts";

export enum SocialProvider {
  Google = "google",
  Apple = "apple",
}

export function isPhoneProviderConfigured(): boolean {
  return Boolean(
    authSettings.get().twilioAccountSid &&
      authSettings.get().twilioAuthToken &&
      authSettings.get().twilioMessageServiceSid,
  );
}

export function isSocialProviderConfigured(provider: SocialProvider): boolean {
  switch (provider) {
    case SocialProvider.Google:
      return Boolean(authSettings.get().googleClientId && authSettings.get().googleClientSecret);
    case SocialProvider.Apple:
      return Boolean(authSettings.get().appleClientId && authSettings.get().appleClientSecret);
  }
}

export const phoneNotConfiguredError: AuthError = {
  code: "phone_provider_not_configured",
  message: "Phone sign-in/sign-up is not configured.",
};

export function socialNotConfiguredError(provider: SocialProvider): AuthError {
  return {
    code: "social_provider_not_configured",
    message: `Sign-in with ${provider} is not configured.`,
  };
}

export function requestIdTokenExchange(
  provider: SocialProvider,
  idToken: string,
  nonce: string,
  accessToken?: string,
): Promise<Result<GoTrueSessionResponse, AuthError>> {
  if (!isSocialProviderConfigured(provider)) {
    return Promise.resolve(new Failure(socialNotConfiguredError(provider)));
  }
  return requestAuth(`${authUrl()}/token?grant_type=id_token`, {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({
      provider,
      id_token: idToken,
      nonce,
      access_token: accessToken,
    }),
  });
}
