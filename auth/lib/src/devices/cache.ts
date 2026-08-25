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

import { Duration, cache } from "@scribe/alchemy";
import type { AccountDevice } from "../../contracts/device.ts";

const DEVICE_TTL = Duration.seconds(300);

function entryOf(accountId: string, deviceId: string): string {
  return `${accountId}:${deviceId}`;
}

/**
 * The devices of an account, remembered whole and one by one.
 *
 * The two are kept apart because they go stale for different reasons: one device changing makes
 * its own entry wrong and the list wrong, while a device being added only makes the list wrong.
 */
class DeviceCache {
  readonly #list = cache<AccountDevice[]>({ key: "account:devices", ttl: DEVICE_TTL });
  readonly #one = cache<AccountDevice>({ key: "account:device", ttl: DEVICE_TTL });
  readonly #hardware = cache<unknown>({ key: "device:hw", ttl: DEVICE_TTL });

  /** Every device remembered for this account, or null when none were. */
  list(accountId: string): Promise<AccountDevice[] | null> {
    return this.#list.get(accountId);
  }

  /** Remembers the whole list of devices this account signs in from. */
  rememberList(accountId: string, devices: AccountDevice[]): Promise<void> {
    return this.#list.add(accountId, devices);
  }

  /** The device remembered under this account and identifier, or null when none was. */
  get(accountId: string, deviceId: string): Promise<AccountDevice | null> {
    return this.#one.get(entryOf(accountId, deviceId));
  }

  /** Remembers one device of this account. */
  remember(accountId: string, deviceId: string, device: AccountDevice): Promise<void> {
    return this.#one.add(entryOf(accountId, deviceId), device);
  }

  /** What the client last reported about this device's hardware, or null when nothing was kept. */
  hardware<T>(accountId: string, deviceId: string): Promise<T | null> {
    return this.#hardware.get(entryOf(accountId, deviceId)) as Promise<T | null>;
  }

  /** Remembers what the client reported about this device's hardware. */
  rememberHardware<T>(accountId: string, deviceId: string, hardware: T): Promise<void> {
    return this.#hardware.add(entryOf(accountId, deviceId), hardware);
  }

  /** Drops one device and the list it belonged to, since the list now names a device that changed. */
  async invalidate(accountId: string, deviceId: string): Promise<void> {
    await Promise.all([
      this.#one.delete(entryOf(accountId, deviceId)),
      this.#hardware.delete(entryOf(accountId, deviceId)),
      this.#list.delete(accountId),
    ]);
  }

  /** Drops everything remembered about this account's devices. */
  async invalidateAll(accountId: string): Promise<void> {
    await Promise.all([
      this.#one.clear(`${accountId}:*`),
      this.#hardware.clear(`${accountId}:*`),
      this.#list.delete(accountId),
    ]);
  }
}

/** The devices of an account, for the five minutes a session's worth of requests lasts. */
export const deviceCache: DeviceCache = new DeviceCache();
