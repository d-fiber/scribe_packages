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

import type { List, ProtoMessageBuilder, ProtoServiceBuilder } from "@scribe/alchemy";
import { Proto, ProtoBuilder, ProtoMessage, ProtoService } from "@scribe/alchemy";

/** The worker-facing contract for `Auth`: read and delete an account, ban and unban it, manage its devices, and list the roles a project declares. */
@Proto("auth")
export class AuthProtocol extends ProtoBuilder {
  /** The socle types this contract references: `scribe.v1.Json`, `scribe.v1.Failure`. */
  imports(): List<string> {
    return ["scribe/protocol/common.proto"];
  }

  /** What `Auth.GetAccount`, `Auth.DeleteAccount` and `Auth.Unban` take: an account by identifier and role. */
  @ProtoMessage()
  accountRequest(): ProtoMessageBuilder {
    return this.builder("AccountRequest").fields((f) => ({
      accountId: f.string().number(1),
      role: f.string().number(2),
    }));
  }

  /** One account as `Auth.GetAccount` answers it, its ban and its folded extension data included. */
  @ProtoMessage()
  account(): ProtoMessageBuilder {
    return this.builder("Account").fields((f) => ({
      id: f.string().number(1),
      role: f.string().number(2),
      email: f.string().number(3),
      phone: f.string().number(4),
      emailVerified: f.bool().number(5),
      phoneVerified: f.bool().number(6),
      createdAt: f.int64().number(7),
      ban: f.message("Ban").number(8),
      folded: f.message("scribe.v1.Json").number(9),
    }));
  }

  /** What `Auth.GetAccount` answers: the account, or a failure. */
  @ProtoMessage()
  accountResult(): ProtoMessageBuilder {
    return this.builder("AccountResult").fields((f) => ({
      account: f.message("Account").number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** The window an account is banned for, and why. */
  @ProtoMessage()
  ban(): ProtoMessageBuilder {
    return this.builder("Ban").fields((f) => ({
      since: f.int64().number(1),
      until: f.int64().number(2),
      reason: f.string().number(3),
    }));
  }

  /** What `Auth.Ban` takes: the account, how long, and the stated reason. */
  @ProtoMessage()
  banRequest(): ProtoMessageBuilder {
    return this.builder("BanRequest").fields((f) => ({
      accountId: f.string().number(1),
      role: f.string().number(2),
      forMs: f.int64().number(3),
      reason: f.string().number(4),
    }));
  }

  /** What `Auth.Ban`, `Auth.Unban` and `Auth.DeleteAccount` answer. */
  @ProtoMessage()
  banResult(): ProtoMessageBuilder {
    return this.builder("BanResult").fields((f) => ({
      error: f.message("scribe.v1.Failure").number(1),
    }));
  }

  /** What `Auth.ListBans` takes: the role to list bans for. */
  @ProtoMessage()
  banListRequest(): ProtoMessageBuilder {
    return this.builder("BanListRequest").fields((f) => ({
      role: f.string().number(1),
    }));
  }

  /** One banned account, as `Auth.ListBans` returns it. */
  @ProtoMessage()
  listedBan(): ProtoMessageBuilder {
    return this.builder("ListedBan").fields((f) => ({
      accountId: f.string().number(1),
      ban: f.message("Ban").number(2),
    }));
  }

  /** What `Auth.ListBans` answers: every ban a role currently carries. */
  @ProtoMessage()
  banListResult(): ProtoMessageBuilder {
    return this.builder("BanListResult").fields((f) => ({
      bans: f.message("ListedBan").repeated().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** What `Auth.ListDevices`, `Auth.KickDevice` and `Auth.KickAllDevices` take: an account, and the device to target when there is one. */
  @ProtoMessage()
  deviceRequest(): ProtoMessageBuilder {
    return this.builder("DeviceRequest").fields((f) => ({
      accountId: f.string().number(1),
      role: f.string().number(2),
      deviceId: f.string().number(3),
    }));
  }

  /** One device an account has signed in from. */
  @ProtoMessage()
  device(): ProtoMessageBuilder {
    return this.builder("Device").fields((f) => ({
      id: f.string().number(1),
      deviceId: f.string().number(2),
      client: f.string().number(3),
      os: f.string().number(4),
      model: f.string().number(5),
      appVersion: f.string().number(6),
      isPhysicalDevice: f.bool().number(7),
      deviceCategory: f.string().number(8),
      trusted: f.bool().number(9),
      ip: f.string().number(10),
      city: f.string().number(11),
      country: f.string().number(12),
      createdAt: f.int64().number(13),
      seenAt: f.int64().number(14),
    }));
  }

  /** What `Auth.ListDevices` answers: every device the account is known from. */
  @ProtoMessage()
  deviceListResult(): ProtoMessageBuilder {
    return this.builder("DeviceListResult").fields((f) => ({
      devices: f.message("Device").repeated().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** What `Auth.KickDevice` and `Auth.KickAllDevices` answer: whether a session was actually kicked. */
  @ProtoMessage()
  kickResult(): ProtoMessageBuilder {
    return this.builder("KickResult").fields((f) => ({
      kicked: f.bool().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** What `Auth.Validate` takes: a password, an email or a phone to check before it is accepted. */
  @ProtoMessage()
  validateRequest(): ProtoMessageBuilder {
    return this.builder("ValidateRequest").fields((f) => ({
      password: f.string().number(1),
      email: f.string().number(2),
      phone: f.string().number(3),
    }));
  }

  /** What `Auth.Validate` answers: whether the input is valid, and which rule it broke when it is not. */
  @ProtoMessage()
  validateResult(): ProtoMessageBuilder {
    return this.builder("ValidateResult").fields((f) => ({
      valid: f.bool().number(1),
      violations: f.string().repeated().number(2),
    }));
  }

  /** What `Auth.ListRoles` takes: nothing, every declared role is returned. */
  @ProtoMessage()
  roleListRequest(): ProtoMessageBuilder {
    return this.builder("RoleListRequest").fields(() => ({}));
  }

  /** What `Auth.ListRoles` answers: every role a project declares. */
  @ProtoMessage()
  roleListResult(): ProtoMessageBuilder {
    return this.builder("RoleListResult").fields((f) => ({
      roles: f.message("Role").repeated().number(1),
    }));
  }

  /** One role a project declares, and the channels it grants. */
  @ProtoMessage()
  role(): ProtoMessageBuilder {
    return this.builder("Role").fields((f) => ({
      name: f.string().number(1),
      channels: f.string().repeated().number(2),
      created: f.string().number(3),
    }));
  }

  /** `Auth`, the ten procedures a worker calls to manage an account, its bans, its devices and its roles. */
  @ProtoService()
  auth(): ProtoServiceBuilder {
    return this.builder("Auth").rpc((r) => [
      r.name("GetAccount").request("AccountRequest").response("AccountResult"),
      r.name("DeleteAccount").request("AccountRequest").response("BanResult"),
      r.name("Ban").request("BanRequest").response("BanResult"),
      r.name("Unban").request("AccountRequest").response("BanResult"),
      r.name("ListBans").request("BanListRequest").response("BanListResult"),
      r.name("ListDevices").request("DeviceRequest").response("DeviceListResult"),
      r.name("KickDevice").request("DeviceRequest").response("KickResult"),
      r.name("KickAllDevices").request("DeviceRequest").response("KickResult"),
      r.name("ListRoles").request("RoleListRequest").response("RoleListResult"),
      r.name("Validate").request("ValidateRequest").response("ValidateResult"),
    ]);
  }
}
