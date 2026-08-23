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

import { Failure, Future, okay, type Result } from "@scribe/alchemy";
import { Hook } from "@scribe/foundation/lib/src/hook/hook.ts";

/** What a sign-up carries to whoever listens for it. */
interface SignUp {
  /** The account that was just created. */
  readonly accountId: string;

  /** The mailbox it was created with. */
  readonly email: string;
}

/** Why a sign-up was turned down by a subscriber. */
type SignUpRefusal = "blocked_domain";

/**
 * An extension point whose subscribers are side effects, so it decides nothing.
 *
 * There is no fallback because there is no answer to give: a hook nobody listens to has run
 * to completion.
 */
export const signedIn = new Hook<{ accountId: string }>({ name: "auth.signed-in" });

/**
 * An extension point that carries a decision, so it says what it answers when nobody listens.
 *
 * The fallback is required as soon as there is a decision, which keeps the answer of an
 * unwired project written down rather than inferred.
 */
export const signingUp = new Hook<SignUp, Result<void, SignUpRefusal>>({
  name: "auth.signing-up",
  fallback: okay,
});

/**
 * A subscriber that runs inside the request, in order, and may refuse.
 *
 * It is endpoint code written elsewhere: same latency, same transaction, same consequence.
 * Answering something whose `ok` is false stops the chain, and the emitter sees that answer.
 */
export const refuseBlockedDomains = signingUp.on((payload: SignUp) => {
  return payload.email.endsWith("@blocked.example") ? new Failure<SignUpRefusal>("blocked_domain") : okay;
});

/**
 * A subscriber that runs later and survives a crash, and cannot refuse.
 *
 * There is no request context on the other side, so everything the body needs travels in the
 * payload. A database write in particular gets no owner filter applied, which is why an
 * account identifier is in nearly every payload.
 */
export const sendWelcome = signingUp.background(async (payload: SignUp) => {
  await mail(payload.email);
});

/**
 * Emits the event and answers what the inline chain decided.
 *
 * The background subscribers are queued only when nobody refused, so a sign-up that was turned
 * down sends no welcome mail.
 */
export function announceSignUp(payload: SignUp): Future<Result<void, SignUpRefusal>> {
  return signingUp.run(payload);
}

/** Sends the welcome mail, which is the work this hook was declared for. */
function mail(_to: string): Future<void> {
  return Future.value(undefined);
}
