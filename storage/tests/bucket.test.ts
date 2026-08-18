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

// deno-lint-ignore-file no-explicit-any

import "@scribe/core/testing/settings.ts";
import { assertEquals } from "@std/assert";
import { Bucket } from "@scribe/storage/src/bucket/bucket.ts";

// A fake `list()`. Every prefix returns `folders` subdirectories and then
// `files` files, which leaves the depth and the width of the tree under
// control.
function tree(folders: number, files: number, calls: string[]) {
  return function (this: Bucket, prefix: string, offset = 0) {
    calls.push(prefix);
    if (offset > 0) return Promise.resolve([]);

    const entries = [
      ...Array.from({ length: folders }, (_, i) => ({ name: `d${i}`, id: null, updated_at: null })),
      ...Array.from({ length: files }, (_, i) => ({ name: `f${i}`, id: `${i}`, updated_at: null })),
    ];
    return Promise.resolve(entries);
  };
}

function bucketWith(folders: number, files: number) {
  const calls: string[] = [];
  const bucket = new Bucket("b", "http://x", "k");
  (bucket as any).list = tree(folders, files, calls);
  return { bucket, calls };
}

Deno.test("listTree: stops as soon as the budget is spent", async () => {
  const { bucket } = bucketWith(0, 100);
  assertEquals((await bucket.listTree("p", 10))?.length, 10);
});

Deno.test("listTree: a zero budget reads nothing at all", async () => {
  const { bucket, calls } = bucketWith(0, 100);

  assertEquals(await bucket.listTree("p", 0), []);
  assertEquals(calls.length, 0);
});

Deno.test("listTree: recursion stops once the budget is met", async () => {
  const { bucket, calls } = bucketWith(5, 3);

  const found = await bucket.listTree("p", 3);

  assertEquals(found?.length, 3);
  assertEquals(calls, ["p"]);
});

Deno.test("listTree: children receive only what is left of the budget", async () => {
  const { bucket } = bucketWith(2, 2);
  const found = await bucket.listTree("p", 5);

  assertEquals(found?.length, 5);
});

Deno.test("listTree: a whole small tree comes back untouched", async () => {
  const { bucket } = bucketWith(2, 2);

  const found = await bucket.listTree("p", 1_000);

  assertEquals(found?.length, 2 + 2 * 2 + 4 * 2 + 8 * 2 + 16 * 2 + 32 * 2 + 64 * 2 + 128 * 2);
});

Deno.test("listTree: depth is capped even with an unspent budget", async () => {
  const { bucket, calls } = bucketWith(1, 0);

  await bucket.listTree("p", 1_000);

  assertEquals(calls.length, 8);
});

Deno.test("listTree: a page failure aborts instead of truncating", async () => {
  const bucket = new Bucket("b", "http://x", "k");
  (bucket as any).list = () => Promise.resolve(null);

  assertEquals(await bucket.listTree("p", 10), null);
});
