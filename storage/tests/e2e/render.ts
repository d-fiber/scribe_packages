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
 * Renders the ops fragments a deployment ships so Docker Compose can read them.
 *
 * @remarks
 * The stack runs the files a deployment runs, and not a copy. A compose written beside them
 * would drift, and the day it drifts is the day the suite stops proving anything about what
 * ships.
 *
 * The database comes from `foundation`, because the index this package keeps is written through
 * PostgREST and the buckets live in the storage schema of the same Postgres. Both trees are
 * rendered here.
 *
 * Only `{{sdk_root}}` stands between a fragment and Compose, plus the placeholders the CLI fills
 * when it renders a project. Everything else is `${VARIABLE}`, which Compose substitutes itself
 * from the environment file, so it is left untouched.
 */

/** The fragments a deployment mounts, in the order Compose reads them. */
const FRAGMENTS: readonly { readonly from: string; readonly as: string }[] = [
  { from: "../../../foundation/ops/database/docker-compose.yaml", as: "database" },
  { from: "../../ops/docker-compose.yaml", as: "storage" },
];

/** What the CLI would substitute, and what it becomes for a run of the suite. */
const PLACEHOLDERS: Readonly<Record<string, string>> = {
  app_name_snake: "scribe_storage_e2e",
};

const here = new URL(".", import.meta.url).pathname;
const sdkRoot = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const target = `${here}.generated`;

await Deno.mkdir(target, { recursive: true });

for (const fragment of FRAGMENTS) {
  const source = await Deno.readTextFile(`${here}${fragment.from}`);
  const rendered = source
    .replaceAll("{{sdk_root}}", sdkRoot)
    .replaceAll(/\{\{(\w+)\}\}/g, (whole, name: string) => PLACEHOLDERS[name] ?? whole);

  const left = rendered.match(/\{\{(\w+)\}\}/);
  if (left) {
    throw new Error(
      `${fragment.as} still holds ${left[0]} after rendering. ` +
        "Add it to PLACEHOLDERS, or the container will start with the text as its value.",
    );
  }

  await Deno.writeTextFile(`${target}/${fragment.as}.yaml`, rendered);
}

console.log(`Rendered ${FRAGMENTS.length} ops fragments into ${target}`);
