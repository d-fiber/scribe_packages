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

import "@scribe/core/testing/settings.ts";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { StorageIdentity } from "@scribe/storage/src/access/identity.ts";
import { StorageVisibility } from "@scribe/storage/mod.ts";
import { StorageScope } from "@scribe/storage/src/path/scope.ts";
import { parseTemplate } from "@scribe/storage/src/path/template.ts";

function scoped(owns?: (a: unknown, args: readonly string[]) => boolean) {
  const template = parseTemplate("things/{account}/{thing}");
  return new StorageScope(
    template.segments,
    StorageIdentity.User,
    StorageVisibility.Public,
    owns as never,
    template.argNames.length,
  );
}

Deno.test("scope: authorize is built once, not per read", () => {
  const scope = scoped(() => true);
  assertStrictEquals(scope.authorize, scope.authorize);
});

Deno.test("scope: with no ownership rule there is nothing to build", () => {
  assertEquals(scoped().authorize, undefined);
});

Deno.test("scope: authorize only forwards the arguments the path owns", () => {
  const seen: string[][] = [];
  const scope = scoped((_a, args) => {
    seen.push([...args]);
    return true;
  });

  scope.authorize?.({ id: "u1", role: "user" } as never, ["t1", "extra", "more"]);
  assertEquals(seen, [["t1"]]);
});

Deno.test("scope: a child keeps the parent's ownership rule", () => {
  const scope = scoped(() => true);
  const child = scope.child(parseTemplate("nested").segments);

  assertEquals(typeof child.authorize, "function");
  assertEquals(child.identity, scope.identity);
});

Deno.test("scope: a child can narrow the visibility without touching the parent", () => {
  const scope = scoped();
  const child = scope.child(parseTemplate("nested").segments, StorageVisibility.Private);

  assertEquals(child.visibility, StorageVisibility.Private);
  assertEquals(scope.visibility, StorageVisibility.Public);
});
