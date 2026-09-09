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

import { AccountDestination, GrantedDestination } from "./destination.ts";
import type { Destination } from "./destination.ts";
import { Listen } from "./listen.ts";
import { broadcastChannel, channelName, isValidTopic, topicChannel } from "./name.ts";
import { declareChannel } from "./registry.ts";

/**
 * What the broadcast of a channel answers with, which depends on how open it was declared.
 *
 * A channel nobody may listen to by default hands out the destination that writes grants. The
 * other two hand out the plain one, because there is nothing left to open.
 */
export type BroadcastOf<T extends object, L extends Listen> = L extends Listen.Granted ? GrantedDestination<T>
  : Destination<T>;

/**
 * A named channel, the payload it carries, and the three ways to address it.
 *
 * ```ts
 * interface Order { orderId: string; total: number }
 *
 * const order = Realtime.granted<Order>("order", { key: "orderId" });
 *
 * await order.all.update(row);                 // everyone granted on "order"
 * await order.to(accountId).update(row);       // that account alone
 * await order.topic("seller").update(row);     // everyone granted on "order:#seller"
 * ```
 *
 * `T` sits on the channel rather than on each call because a channel carries one kind of
 * thing: the type is a property of the declaration, checked at every emission, and impossible
 * for two call sites to disagree on. `key` names the field of `T` that identifies the row,
 * and it is constrained by `keyof T`, so a typo does not compile.
 *
 * A channel is **built, not extended**: there is nothing to subclass and nothing to override,
 * which is what keeps every channel of the fleet addressed the same way. It is safe to keep at
 * module scope, since it holds no client and no identity.
 *
 * Nothing here reaches the database. Declaring costs nothing until something is emitted, and
 * the openness a declaration asks for is written by `syncDeclaredChannels` at boot.
 */
export class Realtime<T extends object, L extends Listen = Listen.Granted> {
  /** The name this channel was declared with, and the prefix of every channel it reaches. */
  readonly name: string;

  /** How open this channel's own broadcast is. */
  readonly listen: L;

  readonly #key: keyof T & string;

  private constructor(name: string, listen: L, key: keyof T & string) {
    this.name = channelName(name);
    this.listen = listen;
    this.#key = key;
    declareChannel(this.name, listen);
  }

  /**
   * A channel anyone hears, session or not.
   *
   * What travels is as readable as what ships inside the application, so a remote
   * configuration belongs here and anything tied to an account does not.
   */
  static public<T extends { id: string }>(name: string): Realtime<T, Listen.Public>;
  /** The same declaration for a payload with no `id`, naming which field of `T` keys a row. */
  static public<T extends object>(
    name: string,
    options: { key: keyof T & string },
  ): Realtime<T, Listen.Public>;
  /** The shared implementation behind both overloads above. */
  static public<T extends object>(
    name: string,
    options?: { key: keyof T & string },
  ): Realtime<T, Listen.Public> {
    return new Realtime<T, Listen.Public>(name, Listen.Public, keyOf<T>(options));
  }

  /** A channel every caller holding a session hears. */
  static authenticated<T extends { id: string }>(name: string): Realtime<T, Listen.Authenticated>;
  /** The same declaration for a payload with no `id`, naming which field of `T` keys a row. */
  static authenticated<T extends object>(
    name: string,
    options: { key: keyof T & string },
  ): Realtime<T, Listen.Authenticated>;
  /** The shared implementation behind both overloads above. */
  static authenticated<T extends object>(
    name: string,
    options?: { key: keyof T & string },
  ): Realtime<T, Listen.Authenticated> {
    return new Realtime<T, Listen.Authenticated>(name, Listen.Authenticated, keyOf<T>(options));
  }

  /**
   * A channel nobody hears until a grant is written for them.
   *
   * It is the one to reach for when the answer is not obvious, because the two others hand out
   * what they carry to a population the declaration cannot name.
   */
  static granted<T extends { id: string }>(name: string): Realtime<T, Listen.Granted>;
  /** The same declaration for a payload with no `id`, naming which field of `T` keys a row. */
  static granted<T extends object>(
    name: string,
    options: { key: keyof T & string },
  ): Realtime<T, Listen.Granted>;
  /** The shared implementation behind both overloads above. */
  static granted<T extends object>(
    name: string,
    options?: { key: keyof T & string },
  ): Realtime<T, Listen.Granted> {
    return new Realtime<T, Listen.Granted>(name, Listen.Granted, keyOf<T>(options));
  }

  /** Everyone listening to this channel, as far as its declared openness lets them. */
  get all(): BroadcastOf<T, L> {
    return new GrantedDestination<T>(
      broadcastChannel(this.name),
      this.#key,
    ) as BroadcastOf<T, L>;
  }

  /**
   * The account `accountId`, and nobody else.
   *
   * No grant opens it and none can: the channel carries the identifier, and a caller hears it
   * when their token says they are that account.
   */
  to(accountId: string): AccountDestination<T> {
    return new AccountDestination<T>(this.name, accountId, this.#key);
  }

  /**
   * The accounts granted on `topic`.
   *
   * @throws {TypeError} When `topic` is not a name a channel can carry. A project that takes
   * one from a caller checks it with `isValidTopic` first.
   */
  topic(topic: string): GrantedDestination<T> {
    if (!isValidTopic(topic)) {
      throw new TypeError(`realtime topic: ${JSON.stringify(topic)} is not a usable name.`);
    }

    return new GrantedDestination<T>(topicChannel(this.name, topic), this.#key);
  }
}

/** `options.key` when given, or `"id"`, the field every overload without a `key` requires `T` to carry. */
function keyOf<T extends object>(options?: { key: keyof T & string }): keyof T & string {
  return options?.key ?? ("id" as keyof T & string);
}
