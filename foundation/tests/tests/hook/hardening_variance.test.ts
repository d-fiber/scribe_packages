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

import { assertEquals } from "@std/assert";
import type { Hook, HookDefinition } from "@scribe/foundation/lib/src/hook/hook.ts";
import type {
  BackgroundHookHandler,
  HookHandler,
} from "@scribe/foundation/lib/src/hook/hook_handler.ts";
import type { InlineChain } from "@scribe/foundation/lib/src/hook/inline_chain.ts";
import type { BackgroundChannel } from "@scribe/foundation/lib/src/hook/background_channel.ts";

interface Event {
  readonly id: string;
}

interface RicherEvent extends Event {
  readonly at: number;
}

type Holds<From, To> = [From] extends [To] ? true : false;

const handlerTakesAWiderPayload: Holds<HookHandler<Event, Event>, HookHandler<RicherEvent, Event>> =
  true;
const handlerRefusesANarrowerPayload: Holds<
  HookHandler<RicherEvent, Event>,
  HookHandler<Event, Event>
> = false;
const handlerAnswersARicherDecision: Holds<
  HookHandler<Event, RicherEvent>,
  HookHandler<Event, Event>
> = true;
const handlerRefusesAWiderDecision: Holds<
  HookHandler<Event, Event>,
  HookHandler<Event, RicherEvent>
> = false;

const deferredTakesAWiderPayload: Holds<
  BackgroundHookHandler<Event>,
  BackgroundHookHandler<RicherEvent>
> = true;
const deferredRefusesANarrowerPayload: Holds<
  BackgroundHookHandler<RicherEvent>,
  BackgroundHookHandler<Event>
> = false;

const definitionCarriesARicherFallback: Holds<HookDefinition<RicherEvent>, HookDefinition<Event>> =
  true;
const definitionRefusesAWiderFallback: Holds<HookDefinition<Event>, HookDefinition<RicherEvent>> =
  false;

const hookRefusesARicherPayload: Holds<Hook<RicherEvent, Event>, Hook<Event, Event>> = false;
const hookRefusesAWiderPayload: Holds<Hook<Event, Event>, Hook<RicherEvent, Event>> = false;
const hookAnswersARicherDecision: Holds<Hook<Event, RicherEvent>, Hook<Event, Event>> = true;
const hookRefusesAWiderDecision: Holds<Hook<Event, Event>, Hook<Event, RicherEvent>> = false;

const chainRefusesEitherPayload: Holds<
  InlineChain<RicherEvent, Event>,
  InlineChain<Event, Event>
> = false;
const chainAnswersARicherDecision: Holds<
  InlineChain<Event, RicherEvent>,
  InlineChain<Event, Event>
> = true;

const channelRefusesARicherPayload: Holds<BackgroundChannel<RicherEvent>, BackgroundChannel<Event>> =
  false;
const channelRefusesAWiderPayload: Holds<BackgroundChannel<Event>, BackgroundChannel<RicherEvent>> =
  false;

Deno.test("HookHandler takes a payload contravariantly and answers a decision covariantly", () => {
  assertEquals(handlerTakesAWiderPayload, true, "HookHandler declares in T");
  assertEquals(handlerRefusesANarrowerPayload, false, "HookHandler does not declare out T");
  assertEquals(handlerAnswersARicherDecision, true, "HookHandler declares out R");
  assertEquals(handlerRefusesAWiderDecision, false, "HookHandler does not declare in R");
});

Deno.test("BackgroundHookHandler takes a payload contravariantly", () => {
  assertEquals(deferredTakesAWiderPayload, true, "BackgroundHookHandler declares in T");
  assertEquals(deferredRefusesANarrowerPayload, false, "BackgroundHookHandler does not declare out T");
});

Deno.test("HookDefinition carries its fallback covariantly", () => {
  assertEquals(definitionCarriesARicherFallback, true, "HookDefinition declares out R");
  assertEquals(definitionRefusesAWiderFallback, false, "HookDefinition does not declare in R");
});

Deno.test("Hook is invariant in its payload and covariant in its decision", () => {
  assertEquals(hookRefusesARicherPayload, false, "Hook declares in out T, not out T");
  assertEquals(hookRefusesAWiderPayload, false, "Hook declares in out T, not in T");
  assertEquals(hookAnswersARicherDecision, true, "Hook declares out R");
  assertEquals(hookRefusesAWiderDecision, false, "Hook does not declare in R");
});

Deno.test("the payload of a hook is invariant because the chain holds a mutable array of handlers", () => {
  assertEquals(chainRefusesEitherPayload, false, "InlineChain declares in out T");
  assertEquals(chainAnswersARicherDecision, true, "InlineChain declares out R");
  assertEquals(channelRefusesARicherPayload, false, "BackgroundChannel declares in out T");
  assertEquals(channelRefusesAWiderPayload, false, "BackgroundChannel declares in out T");
});
