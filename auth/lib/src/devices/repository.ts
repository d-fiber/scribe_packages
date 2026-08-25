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

import { wrote } from "@scribe/foundation/database";
import type { RequestDevice } from "@scribe/contracts/device.ts";
import type { DeviceCategory, DeviceOs } from "@scribe/contracts/enums.ts";
import { requestDevice } from "@scribe/runtime/device/device.ts";
import { currentLocation } from "@scribe/runtime/http/accessors/location.ts";
import { request } from "@scribe/runtime/http/request.ts";
import type { AccountDevice } from "../../contracts/device.ts";
import { accountDevices } from "../tables.ts";
import { DeviceToken } from "./token.ts";

/** What a client reports about the hardware it runs on, which a later request is checked against. */
export interface DeviceHardware {
  /** The operating system the client reported. */
  os: DeviceOs;

  /** The hardware model the client reported. */
  model: string;

  /** Whether the client claimed to be a real device rather than a simulator. */
  is_physical_device: boolean;

  /** The class of device the client reported. */
  device_category: DeviceCategory;
}

/** What is known about whether a device may skip the code a new one would be sent. */
export interface DeviceTrust {
  /** The digest of the token the client should hold, null when the device was never trusted. */
  hash: string | null;

  /** When the trust was last renewed, in milliseconds. */
  seen_at: number;
}

/** What the caller of a registration gets back. */
export interface DeviceRegistration {
  /** The token the client has to keep, handed out once and never written down. */
  token: string;

  /** The device as the request described it. */
  device: RequestDevice;
}

/** Where the last request came from, refreshed on every sign-in. */
export interface DeviceOrigin {
  /** The address the request came from. */
  ip: string;

  /** The city that address resolved to. */
  city: string;

  /** The country that address resolved to. */
  country: string;

  /** The build of the application the client runs, absent when it sent none. */
  appVersion?: string;
}

/**
 * The one table of devices, whatever role its accounts hold.
 *
 * There is a single repository because there is a single table. Two of them, one per role, is
 * what the framework used to carry, and every lookup had to ask both and take whichever answered.
 */
export class DeviceRepository {
  /** The record identifier of this device, or null when the account has never used it. */
  async idOf(accountId: string, deviceId: string): Promise<string | null> {
    const row = await accountDevices()
      .unscoped()
      .select((s) => ({ id: s.id }))
      .where((f) => [f.account_id.eq(accountId), f.device_id.eq(deviceId)])
      .getOne();

    return row?.id ?? null;
  }

  /** Mints a new token for a device already known, and answers it. */
  async renew(accountId: string, id: string): Promise<string | null> {
    const { token, hash } = await DeviceToken.generate();

    const renewed = await accountDevices()
      .unscoped()
      .where((f) => [f.account_id.eq(accountId), f.id.eq(id)])
      .update({ hash, trusted: true });

    return renewed ? token : null;
  }

  /** Writes the device the request came from, and answers the token its client has to keep. */
  async register(accountId: string): Promise<DeviceRegistration | null> {
    const device = await requestDevice();
    if (!device) return null;

    const { token, hash } = await DeviceToken.generate();
    const { city, country } = await currentLocation();

    const written = await accountDevices().insert({
      account_id: accountId,
      device_id: device.device_id,
      client: device.client,
      hash,
      os: device.os,
      model: device.model,
      app_version: device.app_version ?? null,
      is_physical_device: device.is_physical_device,
      device_category: device.device_category,
      notification_token: device.notification_token ?? null,
      ip: request.ip(),
      city,
      country,
      trusted: true,
    });

    return written ? { token, device } : null;
  }

  /** Writes down where the last request came from. */
  origin(accountId: string, deviceId: string, origin: DeviceOrigin): Promise<boolean> {
    return accountDevices()
      .unscoped()
      .where((f) => [f.account_id.eq(accountId), f.device_id.eq(deviceId)])
      .update({
        ip: origin.ip,
        city: origin.city,
        country: origin.country,
        app_version: origin.appVersion ?? null,
      }).then(wrote);
  }

  /** Removes the device, which is what a kick does once the hook has been told. */
  remove(accountId: string, deviceId: string): Promise<boolean> {
    return accountDevices()
      .unscoped()
      .where((f) => [f.account_id.eq(accountId), f.device_id.eq(deviceId)])
      .delete().then(wrote);
  }

  /** What the client reported about this device's hardware, or null when it is unknown. */
  hardware(accountId: string, deviceId: string): Promise<DeviceHardware | null> {
    return accountDevices()
      .unscoped()
      .select((s) => ({
        os: s.os,
        model: s.model,
        is_physical_device: s.is_physical_device,
        device_category: s.device_category,
      }))
      .where((f) => [f.account_id.eq(accountId), f.device_id.eq(deviceId)])
      .getOne();
  }

  /** What is known about this device's trust, or null when the account has never used it. */
  trust(accountId: string, deviceId: string): Promise<DeviceTrust | null> {
    return accountDevices()
      .unscoped()
      .select((s) => ({ hash: s.hash, seen_at: s.seen_at }))
      .where((f) => [f.account_id.eq(accountId), f.device_id.eq(deviceId)])
      .getOne();
  }

  /** One device of this account, or null when it has never used it. */
  async get(accountId: string, deviceId: string): Promise<AccountDevice | null> {
    const row = await accountDevices()
      .unscoped()
      .select((s) => ({
        id: s.id,
        device_id: s.device_id,
        client: s.client,
        os: s.os,
        model: s.model,
        app_version: s.app_version,
        is_physical_device: s.is_physical_device,
        device_category: s.device_category,
        notification_token: s.notification_token,
        location: s.location,
        ip: s.ip,
        city: s.city,
        country: s.country,
        trusted: s.trusted,
        created_at: s.created_at,
        seen_at: s.seen_at,
      }))
      .where((f) => [f.account_id.eq(accountId), f.device_id.eq(deviceId)])
      .getOne();

    return row === null ? null : recordOf(row);
  }

  /** Every device this account signs in from. */
  async all(accountId: string): Promise<AccountDevice[]> {
    const rows = await accountDevices()
      .unscoped()
      .select((s) => ({
        id: s.id,
        device_id: s.device_id,
        client: s.client,
        os: s.os,
        model: s.model,
        app_version: s.app_version,
        is_physical_device: s.is_physical_device,
        device_category: s.device_category,
        notification_token: s.notification_token,
        location: s.location,
        ip: s.ip,
        city: s.city,
        country: s.country,
        trusted: s.trusted,
        created_at: s.created_at,
        seen_at: s.seen_at,
      }))
      .where((f) => f.account_id.eq(accountId))
      .get();

    return rows.map(recordOf);
  }
}

function recordOf(row: Omit<AccountDevice, "metadata"> & { created_at: number; seen_at: number }): AccountDevice {
  return {
    ...row,
    metadata: { created_at: row.created_at, updated_at: row.seen_at },
  };
}

/** The devices of every account. */
export const deviceRepository: DeviceRepository = new DeviceRepository();
