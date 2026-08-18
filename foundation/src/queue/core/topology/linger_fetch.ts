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

import type { Consumer, JsMsg } from "@nats-io/jetstream";

export type GraceResolver = (subject: string) => number;

export async function lingerFetch(
  consumer: Consumer,
  count: number,
  expiresMs: number,
  graceFor?: GraceResolver,
): Promise<JsMsg[]> {
  if (count <= 0) return [];

  const iterator = await consumer.fetch({
    max_messages: count,
    expires: expiresMs,
  });

  const messages: JsMsg[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstAt = 0;
  let grace = Number.POSITIVE_INFINITY;

  try {
    for await (const message of iterator) {
      messages.push(message);
      if (!graceFor) continue;

      if (firstAt === 0) firstAt = Date.now();
      grace = Math.min(grace, graceFor(message.subject));

      clearTimeout(timer);
      const remaining = firstAt + grace - Date.now();
      if (remaining <= 0) {
        iterator.stop();
        break;
      }
      timer = setTimeout(() => iterator.stop(), remaining);
    }
  } finally {
    clearTimeout(timer);
  }

  return messages;
}
