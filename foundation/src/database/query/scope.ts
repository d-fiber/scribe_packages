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

import { currentIdentity } from "@scribe/core/runtime/http/accessors/identity.ts";
import { ownerOf } from "../schema.ts";

const ADMIN_COLUMN = "admin_id";
const USER_COLUMN = "user_id";

export type ScopeDecision =
  | { readonly kind: "open" }
  | { readonly kind: "scoped"; readonly column: string; readonly id: string }
  | { readonly kind: "denied"; readonly column: string };

const OPEN: ScopeDecision = { kind: "open" };

export function ownerScope(table: string): ScopeDecision {
  const column = ownerOf(table);
  if (column === null) return OPEN;

  const identity = currentIdentity();
  if (!identity) return OPEN;

  const callerColumn = "rules" in identity ? ADMIN_COLUMN : USER_COLUMN;
  if (column === callerColumn) return { kind: "scoped", column, id: identity.id };

  if (callerColumn === ADMIN_COLUMN) return OPEN;

  return { kind: "denied", column };
}
