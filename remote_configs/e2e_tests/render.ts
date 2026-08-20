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

/**
 * Renders the ops fragments a deployment ships so Docker Compose can read them.
 *
 * @remarks
 * The stack runs the files a deployment runs, and not a copy. A compose written beside them
 * would drift, and the day it drifts is the day the suite stops proving anything about what
 * ships.
 *
 * Three trees are rendered, and two of them come from `foundation`: the database, because a
 * value is a row read through PostgREST, and the cache, because a row answered once is kept in
 * Redis. The third is this package's own overlay, the fragment that mounts its SQL into the
 * database image, which is how the table and its trigger come to exist.
 *
 * Only `{{sdk_root}}` stands between a fragment and Compose, plus the placeholders the CLI
 * fills when it renders a project. Everything else is `${VARIABLE}`, which Compose substitutes
 * itself from the environment file, so it is left untouched.
 */

/** The fragments a deployment mounts, in the order Compose reads them. */
const FRAGMENTS: readonly { readonly from: string; readonly as: string }[] = [
  { from: "../../foundation/ops/valkery/docker-compose.yaml", as: "valkery" },
  { from: "../../foundation/ops/database/docker-compose.yaml", as: "database" },
  { from: "../ops/overlay.yaml", as: "remote_configs_overlay" },
];

/** What the CLI would substitute, and what it becomes for a run of the suite. */
const PLACEHOLDERS: Readonly<Record<string, string>> = {
  app_name_snake: "scribe_remote_configs_e2e",
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
