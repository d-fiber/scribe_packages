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

import type { Time } from "@scribe/core/contracts/common/time.ts";
import { Failure, OK, type Result } from "@scribe/core/contracts/result.ts";
import { ConfigError } from "../../contracts/config.ts";
import type { RemoteConfigRow } from "../db/tables.ts";
import { dropValue, retimeValue, valueOf, writeValue } from "../db/values.ts";
import { cachedValue, forgetValue } from "../runtime/cache.ts";
import { declareConfig } from "./registry.ts";
import { guarded } from "./guard.ts";

/** What declaring a config takes beyond its name. */
export interface ConfigOptions {
  /**
   * How long a value written under this config lives before it is dropped.
   *
   * A value never expires when absent. Naming it here is what makes a switch nobody remembers to
   * turn back off impossible: the declaration decides, and every caller inherits it.
   */
  readonly ttl?: Time;
}

/** What declaring a config that always answers takes on top of that. */
export interface DefaultedConfigOptions<T> extends ConfigOptions {
  /**
   * The value `get` answers when the table holds none.
   *
   * It lives in the source and is never written, so a config that has one answers before anything
   * was stored and answers when Postgres cannot be reached.
   */
  readonly default: T;
}

/** What writing one value takes beyond the value. */
export interface SetOptions {
  /**
   * How long this value lives. The declaration's own when absent, forever when null.
   *
   * Null and absent are two answers on purpose: absent means the declaration decides, and null
   * means this value outlives whatever the declaration says.
   */
  readonly ttl?: Time | null;
}

/**
 * One named value a project reads, whose absence is an answer.
 *
 * `get` answers null for a config nothing was written to, because the declaration named no value
 * to fall back on. A declaration that names one answers {@link DefaultedConfig} instead, and its
 * caller has no null to handle.
 */
export interface Config<T> {
  /** The name this config was declared under, which is the whole key of its row. */
  readonly name: string;

  /**
   * The value stored, or null when nothing is.
   *
   * It never fails. A table that cannot be reached and a value that has expired both answer as an
   * empty table does, and are reported: a caller asking for a ceiling wants a number, or nothing,
   * and can do neither with a failure.
   */
  get(): Promise<T | null>;

  /** Writes `value`, replacing what was stored under this name. */
  set(value: T, options?: SetOptions): Promise<Result<void, ConfigError>>;

  /**
   * Moves when the stored value is dropped, counting from now, without touching the value.
   *
   * Null makes it never expire. A config that holds nothing answers `NotFound`, since there is no
   * row to move.
   */
  ttl(ttl: Time | null): Promise<Result<void, ConfigError>>;

  /** Removes what is stored, so `get` goes back to answering the declared value, or null. */
  delete(): Promise<Result<void, ConfigError>>;
}

/** One named value a project reads, which always answers because the declaration named one. */
export interface DefaultedConfig<T> extends Config<T> {
  /**
   * The value stored, or the one the declaration named when nothing is.
   *
   * It never fails, and it never answers null: that is the whole difference a `default` buys, and
   * it is checked by the compiler rather than promised in prose.
   */
  get(): Promise<T>;
}

/**
 * One value a project names in the source and writes to at runtime.
 *
 * ```ts
 * interface Example {
 *   firstname: string;
 *   lastname: string;
 * }
 *
 * const key1 = RemoteConfig.of<Example>("key1", { default: BLANK, ttl: Time.hours(2) });
 * const key2 = RemoteConfig.of<string>("key2", { ttl: Time.hours(2) });
 *
 * await key1.get();                                        // Example
 * await key2.get();                                        // string | null
 * await key1.set({ firstname: "Ada", lastname: "Lovelace" });
 * await key1.ttl(Time.hours(5));
 * await key1.delete();
 * ```
 *
 * A declaration is **built, not extended**: the constructor is private and `of` hands back an
 * interface, so there is one way to make one and it names everything at once.
 *
 * The type argument is a promise the package does not check. The column holds what was written
 * into it, and what was written is a release behind what the declaration says as often as not, so
 * a shape that changed reaches the caller as the old one. Nothing here can tell the difference,
 * and a caller reading a field that used to exist is where it shows.
 */
export class RemoteConfig<T> implements Config<T> {
  readonly name: string;

  readonly #fallback: T | null;
  readonly #ttl: Time | null;

  private constructor(name: string, fallback: T | null, ttl: Time | null) {
    this.name = name;
    this.#fallback = fallback;
    this.#ttl = ttl;
    declareConfig(name);
  }

  /**
   * Declares the config named `name`, and answers the handle a project reads and writes it by.
   *
   * @throws {TypeError} When another declaration already took `name`.
   */
  static of<T>(name: string, options: DefaultedConfigOptions<T>): DefaultedConfig<T>;
  static of<T>(name: string, options?: ConfigOptions): Config<T>;
  static of<T>(name: string, options: ConfigOptions & { default?: T } = {}): Config<T> {
    return new RemoteConfig<T>(name, options.default ?? null, options.ttl ?? null);
  }

  async get(): Promise<T | null> {
    let row: RemoteConfigRow | null;
    try {
      row = await this.#held();
    } catch {
      console.error(`[remote-configs] ${this.name} could not be read, so the declared value stands.`);
      return this.#fallback;
    }

    return row === null ? this.#fallback : row.value as T;
  }

  set(value: T, options: SetOptions = {}): Promise<Result<void, ConfigError>> {
    return guarded(async () => {
      const ttl = options.ttl !== undefined ? options.ttl : this.#ttl;
      const written = await writeValue({
        name: this.name,
        value,
        expiresAt: ttl === null ? null : Date.now() + ttl.ms,
      });
      if (!written) return new Failure(ConfigError.Backend);

      await forgetValue(this.name);
      return new OK();
    });
  }

  ttl(ttl: Time | null): Promise<Result<void, ConfigError>> {
    return guarded(async () => {
      const retimed = await retimeValue(this.name, ttl === null ? null : Date.now() + ttl.ms);
      if (!retimed) return new Failure(ConfigError.NotFound);

      await forgetValue(this.name);
      return new OK();
    });
  }

  delete(): Promise<Result<void, ConfigError>> {
    return guarded(async () => {
      await dropValue(this.name);
      await forgetValue(this.name);
      return new OK();
    });
  }

  async #held(): Promise<RemoteConfigRow | null> {
    const row = await cachedValue(this.name, () => valueOf(this.name));
    if (row === null) return null;

    return row.expires_at !== null && row.expires_at <= Date.now() ? null : row;
  }
}
