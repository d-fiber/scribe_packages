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

import type { Location } from "@scribe/core/contracts/common/location.ts";
import type { Metadata } from "@scribe/core/contracts/common/metadata.ts";
import type { ClientType, DeviceCategory, DeviceOs } from "@scribe/core/contracts/enums.ts";

/** One device an account has signed in from, as a caller reads it back. */
export interface AccountDevice {
  /** The identifier of the record, which a kick names. */
  readonly id: string;

  /** The identifier the client reports for itself, unique per account. */
  readonly device_id: string;

  /** Which kind of client it is. */
  readonly client: ClientType;

  /** Which operating system it runs. */
  readonly os: DeviceOs;

  /** The hardware model the client reports. */
  readonly model: string;

  /** The build of the application it runs, null when the client sent none. */
  readonly app_version: string | null;

  /** Whether it is a real device rather than a simulator. */
  readonly is_physical_device: boolean;

  /** Which class of device it is, which decides what a session is allowed to do. */
  readonly device_category: DeviceCategory;

  /** Where a push notification for this account is delivered, null until the client sends one. */
  readonly notification_token: string | null;

  /** Where the device was when it was last seen, null when the client shared none. */
  readonly location: Location | null;

  /** The address the last request came from. */
  readonly ip: string;

  /** The city that address resolved to. */
  readonly city: string;

  /** The country that address resolved to. */
  readonly country: string;

  /** Whatever the client attached to the record, kept as it was given. */
  readonly metadata: Metadata;

  /** Whether a sign-in from this device skips the code the engine would otherwise send. */
  readonly trusted: boolean;

  /** When the device was first seen, in milliseconds. */
  readonly created_at: number;

  /** When it was last seen, in milliseconds. */
  readonly seen_at: number;
}
