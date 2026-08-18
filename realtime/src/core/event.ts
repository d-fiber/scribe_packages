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

import type { RealtimeScope } from "./scope.ts";
import { AudienceDispatcher, type AudienceScope } from "../dispatch/audience.ts";
import { TargetedDispatcher, type TargetedScope } from "../dispatch/targeted.ts";
import { TopicDispatcher, type TopicScope } from "../dispatch/topic.ts";

export type { AudienceScope, TargetedScope, TopicScope };

export interface RealtimeEvent {
  readonly to: TargetedScope;
  readonly all: AudienceScope;
  readonly topic: TopicScope;
}

const DISPATCHERS: {
  readonly [S in RealtimeScope]: new (entity: string, action: string) => RealtimeEvent[S];
} = {
  to: TargetedDispatcher,
  all: AudienceDispatcher,
  topic: TopicDispatcher,
};

export function buildScope<S extends RealtimeScope>(
  scope: S,
  entity: string,
  action: string,
): RealtimeEvent[S] {
  return new DISPATCHERS[scope](entity, action);
}
