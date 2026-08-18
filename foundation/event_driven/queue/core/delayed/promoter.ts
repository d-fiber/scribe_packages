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

import { kv } from "@scribe/core/runtime/redis/mod.ts";
import { runPooled } from "@scribe/core/runtime/support/async/pool.ts";
import { topology } from "../topology/topology.ts";
import { encode } from "../wire.ts";
import { DELAYED_KEY, type DelayedMember, decodeMember } from "./member.ts";

const PROMOTE_BATCH = 500;
const PROMOTE_CONCURRENCY = 16;

export async function promoteDue(): Promise<number> {
  const due = await dueMembers();
  if (due.length === 0) return 0;

  let promoted = 0;
  await runPooled(due, PROMOTE_CONCURRENCY, async (raw) => {
    if (await promote(raw)) promoted++;
  });

  return promoted;
}

async function dueMembers(): Promise<string[]> {
  try {
    return await kv().zrangebyscore(
      DELAYED_KEY,
      "-inf",
      Date.now(),
      "LIMIT",
      0,
      PROMOTE_BATCH,
    );
  } catch (error) {
    console.error("[queue] could not read the delayed set:", error);
    return [];
  }
}

async function promote(raw: string): Promise<boolean> {
  const member = decodeMember(raw);
  if (member === null) {
    console.error("[queue] dropping an unreadable delayed member:", raw);
    await forget(raw, "unknown");
    return false;
  }

  try {
    await publish(member);
  } catch (error) {
    console.error(
      `[queue] could not promote a delayed job of "${member.queue}":`,
      error,
    );
    return false;
  }

  await forget(raw, member.queue);
  return true;
}

function publish(member: DelayedMember): Promise<string> {
  return topology.publish(
    member.subject,
    encode({ data: member.data, attempts: member.attempts }),
    `${member.queue}:${member.id}`,
  );
}

async function forget(raw: string, queue: string): Promise<void> {
  try {
    await kv().zrem(DELAYED_KEY, raw);
  } catch (error) {
    console.error(
      `[queue] promoted a delayed job of "${queue}" but could not remove it, it will run again:`,
      error,
    );
  }
}
