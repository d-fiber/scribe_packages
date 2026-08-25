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

/**
 * What a worker may ask the host about the accounts a project declared.
 *
 * @remarks
 * Every procedure here names a role, and the role is resolved to the declaration that owns it
 * before anything else runs. That is what keeps a caller holding one role from reading or
 * banning an account of another: the declaration carries its own tables, and a name that was
 * never declared answers a refusal instead of falling through to a shared one.
 *
 * The work itself belongs to `auth`. Nothing is reimplemented here, and nothing reaches past
 * the package's door.
 */

import { Auth } from "@scribe/sdk/gen/scribe/packages/auth/protocol/auth_pb.ts";
import type { CapabilityWiring } from "@scribe/contracts/capability.ts";
import { create } from "@bufbuild/protobuf";
import {
  type AccountRequest,
  type AccountResult,
  AccountResultSchema,
  AccountSchema,
  type Ban as BanMessage,
  type BanListRequest,
  type BanListResult,
  BanListResultSchema,
  type BanRequest,
  type BanResult,
  BanResultSchema,
  BanSchema,
  type DeviceListResult,
  DeviceListResultSchema,
  type DeviceRequest,
  DeviceSchema,
  type KickResult,
  KickResultSchema,
  ListedBanSchema,
  type RoleListResult,
  RoleListResultSchema,
  RoleSchema,
} from "@scribe/sdk/gen/scribe/packages/auth/protocol/auth_pb.ts";
import { Duration } from "@scribe/alchemy";
import { type Ban } from "../../auth.ts";
import { accountNamed, type AnyAccount, AUTH_EXTENSION, declaredAccounts } from "../../declaration.ts";
import { extensions } from "@scribe/runtime/support/extensions/mod.ts";
import { encodeJson } from "@scribe/sdk";

const IDENTITY_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "role",
  "email",
  "phone",
  "emailVerified",
  "phoneVerified",
  "createdAt",
  "banned",
]);

function failed(scope: string, cause: unknown): { code: string; message: string } {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`[worker-auth:${scope}] ${message}`);
  return { code: "auth_failed", message };
}

/**
 * The declaration `role` names, or null when this process knows none by that name.
 *
 * @remarks
 * The project's declarations are loaded first. A role lives in the project, and a capability call
 * can land in a process that never imported the file declaring it, so loading here is what makes a
 * role findable by name wherever the call arrives. The registry runs it once per process.
 */
async function declarationOf(role: string): Promise<AnyAccount | null> {
  if (!role) return null;

  await extensions.load(AUTH_EXTENSION);
  return accountNamed(role);
}

function banOf(ban: Ban): BanMessage {
  return create(BanSchema, {
    since: BigInt(ban.since),
    until: ban.until === null ? 0n : BigInt(ban.until),
    reason: ban.reason ?? "",
  });
}

/**
 * Answers the account of one role, folds included, or says why it cannot.
 *
 * @remarks
 * The folds are whatever the project's own declaration reads on top of the identity every
 * account carries, so their shape is decided by the project and not by this contract. They
 * travel as loose JSON for that reason.
 *
 * A role nobody declared and an account nobody holds are both refusals rather than an empty
 * account, because a caller that cannot tell the two apart from a blank answer would treat a
 * typo in a role name as a deleted account.
 */
export async function authGetAccount(request: AccountRequest): Promise<AccountResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) {
    return create(AccountResultSchema, { error: failed("get-account", `no role named "${request.role}"`) });
  }

  try {
    const account = await declaration.get(request.accountId);
    if (!account) return create(AccountResultSchema, { error: failed("get-account", "no such account") });

    const folded = Object.fromEntries(
      Object.entries(account).filter(([key]) => !IDENTITY_FIELDS.has(key)),
    );

    return create(AccountResultSchema, {
      account: create(AccountSchema, {
        id: account.id,
        role: account.role,
        email: account.email ?? "",
        phone: account.phone ?? "",
        emailVerified: account.emailVerified,
        phoneVerified: account.phoneVerified,
        createdAt: BigInt(account.createdAt),
        ban: account.banned ? banOf(account.banned) : undefined,
        folded: encodeJson(folded),
      }),
    });
  } catch (cause) {
    return create(AccountResultSchema, { error: failed("get-account", cause) });
  }
}

/**
 * Erases an account and everything the declaration hangs off it.
 *
 * @remarks
 * It answers the same empty result whether the account was there or not, because `forget` is
 * how the package spells a deletion that has already happened and a caller retrying one has
 * nothing different to do in either case.
 */
export async function authDeleteAccount(request: AccountRequest): Promise<BanResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) {
    return create(BanResultSchema, { error: failed("delete-account", `no role named "${request.role}"`) });
  }

  try {
    await declaration.forget(request.accountId);
    return create(BanResultSchema, {});
  } catch (cause) {
    return create(BanResultSchema, { error: failed("delete-account", cause) });
  }
}

/**
 * Shuts an account out, for a while or until somebody lifts it by hand.
 *
 * @remarks
 * A `forMs` of zero is a ban with no end, which is what the package means by laying one with no
 * duration. The refusal the package answers is carried through as it is, so a caller can tell a
 * ban that was refused because the account does not exist from one the database would not write.
 */
export async function authBan(request: BanRequest): Promise<BanResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) return create(BanResultSchema, { error: failed("ban", `no role named "${request.role}"`) });

  try {
    const forMs = Number(request.forMs);
    const laid = await declaration.bans.lay(request.accountId, {
      for: forMs > 0 ? Duration.milliseconds(forMs) : undefined,
      reason: request.reason || undefined,
    });

    return laid.ok ? create(BanResultSchema, {}) : create(BanResultSchema, { error: failed("ban", laid.error) });
  } catch (cause) {
    return create(BanResultSchema, { error: failed("ban", cause) });
  }
}

/** Lets an account back in, and refuses when no ban of that role stands over it. */
export async function authUnban(request: AccountRequest): Promise<BanResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) return create(BanResultSchema, { error: failed("unban", `no role named "${request.role}"`) });

  try {
    const lifted = await declaration.bans.lift(request.accountId);
    return lifted.ok ? create(BanResultSchema, {}) : create(BanResultSchema, { error: failed("unban", lifted.error) });
  } catch (cause) {
    return create(BanResultSchema, { error: failed("unban", cause) });
  }
}

/**
 * Lists every ban standing over the accounts of one role.
 *
 * @remarks
 * A ban whose end has already passed is not listed. It is still a row in the table until
 * something writes over it, and the package drops it on the way out rather than at midnight,
 * so this answers who is shut out now and not who has a row.
 */
export async function authListBans(request: BanListRequest): Promise<BanListResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) {
    return create(BanListResultSchema, { error: failed("list-bans", `no role named "${request.role}"`) });
  }

  try {
    const standing = await declaration.bans.standing();
    return create(BanListResultSchema, {
      bans: standing.map((listed) => create(ListedBanSchema, { accountId: listed.accountId, ban: banOf(listed) })),
    });
  } catch (cause) {
    return create(BanListResultSchema, { error: failed("list-bans", cause) });
  }
}

/**
 * Lists the devices one account has signed in from.
 *
 * @remarks
 * The `deviceId` a caller may put in the request is ignored here: it is what names a single
 * device to kick, and listing answers all of them.
 */
export async function authListDevices(request: DeviceRequest): Promise<DeviceListResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) {
    return create(DeviceListResultSchema, { error: failed("list-devices", `no role named "${request.role}"`) });
  }

  try {
    const found = await declaration.devices.of(request.accountId);
    return create(DeviceListResultSchema, {
      devices: found.map((device) =>
        create(DeviceSchema, {
          id: device.id,
          deviceId: device.device_id,
          client: device.client,
          os: device.os,
          model: device.model,
          appVersion: device.app_version ?? "",
          isPhysicalDevice: device.is_physical_device,
          deviceCategory: device.device_category,
          trusted: device.trusted,
          ip: device.ip,
          city: device.city,
          country: device.country,
          createdAt: BigInt(device.created_at),
          seenAt: BigInt(device.seen_at),
        })
      ),
    });
  } catch (cause) {
    return create(DeviceListResultSchema, { error: failed("list-devices", cause) });
  }
}

/**
 * Signs one device out and forgets its record.
 *
 * @remarks
 * `kicked` is false when no device of that account answers to the identifier, which is not a
 * failure: a caller kicking a device that a second operator has already kicked gets the state
 * it asked for.
 */
export async function authKickDevice(request: DeviceRequest): Promise<KickResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) {
    return create(KickResultSchema, { error: failed("kick-device", `no role named "${request.role}"`) });
  }
  if (!request.deviceId) return create(KickResultSchema, { error: failed("kick-device", "missing device id") });

  try {
    return create(KickResultSchema, { kicked: await declaration.devices.kick(request.accountId, request.deviceId) });
  } catch (cause) {
    return create(KickResultSchema, { error: failed("kick-device", cause) });
  }
}

/**
 * Signs every device of one account out, including the one that asked.
 *
 * @remarks
 * It answers `kicked` true whenever it went through, even for an account that had no device
 * left, because the package answers nothing about how many records it removed.
 */
export async function authKickAllDevices(request: DeviceRequest): Promise<KickResult> {
  const declaration = await declarationOf(request.role);
  if (!declaration) {
    return create(KickResultSchema, { error: failed("kick-all-devices", `no role named "${request.role}"`) });
  }

  try {
    await declaration.devices.kickAll(request.accountId);
    return create(KickResultSchema, { kicked: true });
  } catch (cause) {
    return create(KickResultSchema, { error: failed("kick-all-devices", cause) });
  }
}

/**
 * Names every role this project declared, and the doors each one may be created through.
 *
 * @remarks
 * A process that never imported the project's declarations answers an empty list rather than a
 * failure, so a caller reading nothing here should suspect the extension was not loaded before
 * suspecting the project.
 */
export function authListRoles(): Promise<RoleListResult> {
  return Promise.resolve(create(RoleListResultSchema, {
    roles: declaredAccounts().map((account) =>
      create(RoleSchema, { name: account.name, channels: [...account.channels] })
    ),
  }));
}

/**
 * Answers the nine procedures of `auth.proto` that a declaration can answer.
 *
 * @remarks
 * `Validate` is left to the host's named 501: this package carries no rule to hold a candidate
 * password, address or number against, so there is nothing to call.
 */
export function wireAuth(wiring: CapabilityWiring): void {
  wiring.on(Auth.method.getAccount, authGetAccount);
  wiring.on(Auth.method.deleteAccount, authDeleteAccount);
  wiring.on(Auth.method.ban, authBan);
  wiring.on(Auth.method.unban, authUnban);
  wiring.on(Auth.method.listBans, authListBans);
  wiring.on(Auth.method.listDevices, authListDevices);
  wiring.on(Auth.method.kickDevice, authKickDevice);
  wiring.on(Auth.method.kickAllDevices, authKickAllDevices);
  wiring.on(Auth.method.listRoles, () => authListRoles());
}
