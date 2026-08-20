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

import type { RequestDevice } from "@scribe/core/contracts/device.ts";
import type { DeviceCategory, DeviceOs } from "@scribe/core/contracts/enums.ts";
import { requestDevice } from "@scribe/core/runtime/device/device.ts";
import { currentLocation } from "@scribe/core/runtime/http/accessors/location.ts";
import { request } from "@scribe/core/runtime/http/request.ts";
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
      });
  }

  /** Removes the device, which is what a kick does once the hook has been told. */
  remove(accountId: string, deviceId: string): Promise<boolean> {
    return accountDevices()
      .unscoped()
      .where((f) => [f.account_id.eq(accountId), f.device_id.eq(deviceId)])
      .delete();
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
