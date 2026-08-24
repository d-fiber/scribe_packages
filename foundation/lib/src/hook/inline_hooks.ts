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

import type { Future, Hook as PortHook, HookDriver, HookOptions } from "@scribe/alchemy";
import { Hook } from "./hook.ts";

/**
 * What opens an extension point for a package that asked the port for one.
 *
 * @remarks
 * The port promises two members, `emit` and `on`, where this package's own `Hook` carries the
 * inline chain, the background channel and a decision to answer. What is handed back is an
 * adapter: a caller that reached the port sees a point it can emit on and subscribe to, and the
 * decision the chain reaches is dropped, because the port says an emit answers nothing.
 *
 * A point is kept per event, because two declarations of one name would be two chains and a
 * subscriber would only ever be called by one of them.
 */
export class InlineHooks implements HookDriver {
  /** The point `options` names, declared on the first ask and kept from then on. */
  open<T>(options: HookOptions): PortHook<T> {
    const held = _opened.get(options.event);
    const point = (held ?? new Hook<T, void>({ name: options.event, fallback: undefined })) as Hook<T, void>;
    if (held === undefined) _opened.set(options.event, point as unknown as Hook<never, void>);

    return {
      emit: (payload: T): Future<void> => point.run(payload).then(() => undefined),
      on: (listen: (payload: T) => void | Future<void>): void => void point.on(listen),
    };
  }
}

/**
 * One hook per event, so opening twice answers the one already declared.
 *
 * @remarks
 * It lives beside the class and not inside an instance, because what a declaration writes to is
 * process-global: a host that clears the slot and wires a second driver would meet a registry
 * that already holds the first driver's keys, and every declaration made before the clear would
 * be refused as a duplicate.
 */
const _opened: Map<string, Hook<never, void>> = new Map();
