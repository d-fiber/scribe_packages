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

import { type Pagination, pagination } from "@scribe/core/contracts/pagination.ts";
import { Queue } from "@scribe/foundation/src/queue/mod.ts";
import type { LinkOutcome, LinkPlatform, LinkStatistic, LinkVisitor } from "../../contracts/link.ts";
import { type DynamicLinkStatisticRow, dynamicLinkStatistics } from "./tables.ts";

/** How long the queue holds a visit before writing the group it has gathered. */
const LINGER_MS = 500;

/** One visit as it travels to the queue, which is one row once the group is written. */
export interface RecordedVisit {
  /** The link that was visited. */
  readonly linkId: number;

  /** What became of the visit. */
  readonly outcome: LinkOutcome;

  /** What the client announced about itself. */
  readonly visitor: LinkVisitor;
}

/**
 * The queue that writes visits in groups rather than one by one.
 *
 * Serving a link does not wait for its measurement: the node pushes, the queue gathers what
 * arrives within half a second, and one insert carries the group.
 */
export const dynamicLinkStatisticsQueue: Queue<RecordedVisit> = new Queue<RecordedVisit>(
  { name: "dynamic-link-statistics", batch: { lingerMs: LINGER_MS } },
  async (visits) => {
    if (visits.length === 0) return;

    const rows = visits.map((visit) => ({
      link_id: visit.linkId,
      outcome: visit.outcome,
      platform: visit.visitor.platform ?? null,
      user_id: visit.visitor.userId ?? null,
      device_id: visit.visitor.deviceId ?? null,
      ip_address: visit.visitor.ipAddress ?? null,
      user_agent: visit.visitor.userAgent ?? null,
      referer: visit.visitor.referer ?? null,
    }));

    const written = await dynamicLinkStatistics().insert(rows);
    if (!written) {
      console.error(`[dynamic-links:statistics] a group of ${rows.length} visits was refused by the database`);
    }
  },
);

/** The page of visits recorded against the link `linkId` names, newest first. */
export async function statisticsOf(
  linkId: number,
  offset: number,
  size: number,
): Promise<Pagination<LinkStatistic>> {
  const rows = await dynamicLinkStatistics()
    .select((s) => ({
      statistic_id: s.statistic_id,
      link_id: s.link_id,
      user_id: s.user_id,
      device_id: s.device_id,
      ip_address: s.ip_address,
      user_agent: s.user_agent,
      referer: s.referer,
      outcome: s.outcome,
      platform: s.platform,
      created_at: s.created_at,
    }))
    .where((f) => f.link_id.eq(linkId))
    .order("created_at", { ascending: false })
    .range(offset, offset + size)
    .get();

  return pagination(rows.map(statisticOf), offset, size);
}

function statisticOf(row: DynamicLinkStatisticRow): LinkStatistic {
  return {
    id: row.statistic_id,
    outcome: row.outcome as LinkOutcome,
    platform: row.platform as LinkPlatform | null,
    userId: row.user_id,
    deviceId: row.device_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    referer: row.referer,
    createdAt: row.created_at,
  };
}
