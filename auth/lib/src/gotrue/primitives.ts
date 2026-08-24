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

import { authSettings } from "../settings.ts";
import { Failure, type Result } from "@scribe/alchemy";
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
