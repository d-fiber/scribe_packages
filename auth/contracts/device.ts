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
