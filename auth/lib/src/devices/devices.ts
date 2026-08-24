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

import { Duration } from "@scribe/alchemy";
import { requestDevice } from "@scribe/core/runtime/device/device.ts";
import { request } from "@scribe/core/runtime/http/request.ts";
import { constantTimeEqual } from "@scribe/core/runtime/support/crypto/constant_time.ts";
import { sha256Hex } from "@scribe/core/runtime/support/crypto/hash.ts";
import type { AccountDevice } from "../../contracts/device.ts";
import { AccountRevocation } from "../revocation.ts";
import { deviceCache } from "./cache.ts";
import { type DeviceHardware, type DeviceOrigin, deviceRepository } from "./repository.ts";

/** How long a device stays trusted without signing in again. */
const TRUST_WINDOW = Duration.days(7);

/** What checking the device a request came from concluded. */
export enum DeviceCheck {
  /** The device is the one it says it is. */
  Ok = "ok",

  /** The account has no such device, so whoever is holding the session should not be. */
  NotFound = "not_found",

  /** The device answers to the right identifier but not to the right hardware. */
  Tampered = "tampered",

  /** The request carried no device at all, which no client of this framework does. */
  Unexpected = "unexpected",
}

/**
 * The devices an account signs in from, and what a caller is allowed to do to them.
 *
 * Registration, trust and the check on every request are the engine's own business and are not
 * exposed: a route has no reason to record a device, only to list them and to throw one out.
 */
export class Devices {
  /**
   * Records the device the request came from, and answers the token its client has to keep.
   *
   * A device already known is given a fresh token rather than a second row, so a client that
   * signs in twice does not accumulate records it cannot tell apart.
   */
  async register(accountId: string): Promise<string | null> {
    const device = await requestDevice();
    if (!device) return null;

    const known = await deviceRepository.idOf(accountId, device.device_id);

    if (known !== null) {
      const token = await deviceRepository.renew(accountId, known);
      if (token === null) return null;

      await deviceCache.invalidate(accountId, device.device_id);
      return token;
    }

    const registered = await deviceRepository.register(accountId);
    if (registered === null) return null;

    await deviceCache.invalidate(accountId, device.device_id);
    return registered.token;
  }

  /**
   * Whether the device this request came from is still the one it was recorded as.
   *
   * A session whose device cannot be found, or whose hardware no longer matches what was
   * recorded, is signed out on the spot: both mean the token is being replayed somewhere it was
   * not issued to.
   */
  async verify(accountId: string): Promise<DeviceCheck> {
    const device = await requestDevice();
    if (!device) return DeviceCheck.Unexpected;

    const hardware = await this.#hardwareOf(accountId, device.device_id);
    if (hardware === null) {
      await this.#signOut();
      return DeviceCheck.NotFound;
    }

    const same = hardware.os === device.os &&
      hardware.model === device.model &&
      hardware.is_physical_device === device.is_physical_device &&
      hardware.device_category === device.device_category;

    if (!same) {
      await this.#signOut();
      return DeviceCheck.Tampered;
    }

    return DeviceCheck.Ok;
  }

  /**
   * Whether this device may sign in without being sent a code.
   *
   * The comparison runs in constant time because the token it checks is a secret the caller
   * supplied, and an early exit would say how much of it was right.
   */
  async isTrusted(accountId: string, deviceId: string): Promise<boolean> {
    const device = await requestDevice();
    if (!device?.device_token) return false;

    const trust = await deviceRepository.trust(accountId, deviceId);
    if (!trust?.hash) return false;
    if (trust.seen_at < Date.now() - TRUST_WINDOW.inMilliseconds) return false;

    return constantTimeEqual(await sha256Hex(device.device_token), trust.hash);
  }

  /** Every device this account signs in from. */
  async of(accountId: string): Promise<AccountDevice[]> {
    const cached = await deviceCache.list(accountId);
    if (cached !== null) return cached;

    const devices = await deviceRepository.all(accountId);
    await deviceCache.rememberList(accountId, devices);

    return devices;
  }

  /** One device of this account, or null when it has never used it. */
  async get(accountId: string, deviceId: string): Promise<AccountDevice | null> {
    const cached = await deviceCache.get(accountId, deviceId);
    if (cached !== null) return cached;

    const device = await deviceRepository.get(accountId, deviceId);
    if (device !== null) await deviceCache.remember(accountId, deviceId, device);

    return device;
  }

  /**
   * Throws a device out: its record goes, and every session it holds goes with it.
   *
   * A device the account never used answers false rather than pretending to have thrown one out,
   * so a caller that names the wrong one is told.
   */
  async kick(accountId: string, deviceId: string): Promise<boolean> {
    const known = await deviceRepository.idOf(accountId, deviceId);
    if (known === null) return false;

    const removed = await deviceRepository.remove(accountId, deviceId);
    if (!removed) return false;

    await deviceCache.invalidate(accountId, deviceId);
    return true;
  }

  /** Throws out every device of this account. */
  async kickAll(accountId: string): Promise<void> {
    const devices = await this.of(accountId);

    for (const device of devices) {
      await this.kick(accountId, device.device_id);
    }
  }

  /** Writes down where the last request came from, which is what a session list shows. */
  async origin(accountId: string, deviceId: string, origin: DeviceOrigin): Promise<boolean> {
    const written = await deviceRepository.origin(accountId, deviceId, origin);
    if (!written) return false;

    await deviceCache.invalidate(accountId, deviceId);
    return true;
  }

  async #hardwareOf(accountId: string, deviceId: string): Promise<DeviceHardware | null> {
    const cached = await deviceCache.hardware<DeviceHardware>(accountId, deviceId);
    if (cached !== null) return cached;

    const hardware = await deviceRepository.hardware(accountId, deviceId);
    if (hardware !== null) await deviceCache.rememberHardware(accountId, deviceId, hardware);

    return hardware;
  }

  async #signOut(): Promise<void> {
    const token = request.token();
    if (!token) return;

    await AccountRevocation.session(token);
  }
}

/** The devices of every account. */
export const devices: Devices = new Devices();
