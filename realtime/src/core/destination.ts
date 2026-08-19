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

import { grantChannel, grantedAccounts, isGranted, revokeChannel, revokeChannelEntirely } from "../db/grants.ts";
import { emit } from "../transport/registry.ts";
import { accountTopicChannel, actionName, isValidTopic } from "./name.ts";

/**
 * One channel of a declaration, and the three actions that reach it.
 *
 * @remarks
 * A destination holds a channel and the field of the payload that carries the identifier. It
 * is built by {@link Channel} and never on its own, because the channel it holds is only
 * well formed when it was derived from a declared name.
 */
export class Destination<T extends object> {
  readonly #channel: string;
  readonly #key: keyof T & string;

  constructor(channel: string, key: keyof T & string) {
    this.#channel = channel;
    this.#key = key;
  }

  /** The channel a listener subscribes to in order to receive what this destination sends. */
  get channel(): string {
    return this.#channel;
  }

  /** Sends `row` as an insert. */
  insert(row: T): Promise<boolean> {
    return this.send("insert", row);
  }

  /** Sends `row` as an update. */
  update(row: T): Promise<boolean> {
    return this.send("update", row);
  }

  /** Sends `row` as a delete, carrying the values it had before it went. */
  delete(row: T): Promise<boolean> {
    return this.send("delete", row);
  }

  /**
   * Sends `row` under an action of the project's own choosing.
   *
   * @param action - Lowercase snake case, at most 32 characters. It travels beside the payload
   * and a client dispatches on it, so it is part of what the declaration promises.
   */
  emit(action: string, row: T): Promise<boolean> {
    return this.send(actionName(action), row);
  }

  /**
   * Addresses `row` and hands it to the transport.
   *
   * A payload whose declared key holds nothing is refused and reported rather than sent: the
   * catch-up a client runs on reconnection reads that identifier, so a row without one is a
   * row no reconnecting client will ever see.
   */
  protected send(action: string, row: T): Promise<boolean> {
    const id = row[this.#key];
    if (id === null || id === undefined || id === "") {
      console.error(
        `[realtime] ${this.#channel} carries no ${String(this.#key)}, broadcast dropped.`,
      );
      return Promise.resolve(false);
    }

    return emit({
      channel: this.#channel,
      action,
      entityId: String(id),
      payload: row as unknown as Record<string, unknown>,
    });
  }
}

/**
 * A destination whose listeners are named one by one.
 *
 * It is what a channel nobody may listen to by default answers with, and what a topic always
 * answers with. The channel that carries an account identifier never has one, since the token
 * of the caller already says whether they are that account.
 */
export class GrantedDestination<T extends object> extends Destination<T> {
  /** Lets `accountId` listen to this channel, and answers whether the grant is in place. */
  grant(accountId: string): Promise<boolean> {
    return grantChannel(this.channel, accountId);
  }

  /** Stops `accountId` from listening, and answers whether a grant was removed. */
  revoke(accountId: string): Promise<boolean> {
    return revokeChannel(this.channel, accountId);
  }

  /** Stops everyone from listening, and answers whether the wipe went through. */
  revokeAll(): Promise<boolean> {
    return revokeChannelEntirely(this.channel);
  }

  /** Whether `accountId` may listen to this channel. */
  allows(accountId: string): Promise<boolean> {
    return isGranted(this.channel, accountId);
  }

  /** The accounts that may listen to this channel. */
  grants(): Promise<string[]> {
    return grantedAccounts(this.channel);
  }
}

/**
 * The private channel of one account, and the topics it can be narrowed to.
 *
 * Narrowing keeps the account in the channel, so the same rule opens it: the caller hears it
 * when their token says they are that account, whatever the topic.
 */
export class AccountDestination<T extends object> extends Destination<T> {
  readonly #name: string;
  readonly #accountId: string;
  readonly #key: keyof T & string;

  constructor(name: string, accountId: string, key: keyof T & string) {
    super(`${name}:${accountId}`, key);
    this.#name = name;
    this.#accountId = accountId;
    this.#key = key;
  }

  /**
   * The same account, narrowed to what happens under `topic`.
   *
   * @throws {TypeError} When `topic` is not a name a channel can carry. A project that takes
   * one from a caller checks it with `isValidTopic` first.
   */
  topic(topic: string): Destination<T> {
    if (!isValidTopic(topic)) {
      throw new TypeError(`realtime topic: ${JSON.stringify(topic)} is not a usable name.`);
    }

    return new Destination<T>(
      accountTopicChannel(this.#name, this.#accountId, topic),
      this.#key,
    );
  }
}
