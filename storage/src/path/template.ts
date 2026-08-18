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

import { pathSegment, StoragePathError } from "./segment.ts";
import type { StorageSession } from "../access/identity.ts";

export const ACCOUNT = "account";

const PLACEHOLDER_PATTERN = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;

export type PathPlaceholders<S extends string> = S extends `${string}{${infer P}}${infer R}`
  ? [P, ...PathPlaceholders<R>]
  : [];

type NamesWithoutAccount<T extends string[], Acc extends string[] = []> = T extends
  [infer H extends string, ...infer R extends string[]]
  ? H extends typeof ACCOUNT ? NamesWithoutAccount<R, Acc> : NamesWithoutAccount<R, [...Acc, H]>
  : Acc;

type ArgsWithoutAccount<T extends string[], Acc extends string[] = []> = T extends
  [infer H extends string, ...infer R extends string[]]
  ? H extends typeof ACCOUNT ? ArgsWithoutAccount<R, Acc> : ArgsWithoutAccount<R, [...Acc, string]>
  : Acc;

export type PathArgNames<S extends string> = NamesWithoutAccount<PathPlaceholders<S>>;

export type PathArgs<S extends string> = ArgsWithoutAccount<PathPlaceholders<S>>;

export type AsArgs<T> = T extends infer A extends string[] ? A : never;

export type PathNamedArgs<S extends string> = { readonly [K in PathArgNames<S>[number]]: string };

export type TemplateSegment =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "account" }
  | { readonly kind: "arg"; readonly name: string };

export interface ParsedTemplate {
  readonly segments: readonly TemplateSegment[];
  readonly argNames: readonly string[];
}

export function parseTemplate(template: string): ParsedTemplate {
  const parts = template.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) throw new StoragePathError(template);

  const segments: TemplateSegment[] = [];
  const argNames: string[] = [];
  let account = false;

  for (const part of parts) {
    if (!part.includes("{") && !part.includes("}")) {
      segments.push({ kind: "literal", value: pathSegment(part) });
      continue;
    }

    const match = PLACEHOLDER_PATTERN.exec(part);
    if (!match) throw new StoragePathError(part);

    const name = match[1];
    if (name === ACCOUNT) {
      if (account) throw new StoragePathError(`${template} (duplicate {${ACCOUNT}})`);
      account = true;
      segments.push({ kind: "account" });
      continue;
    }

    if (argNames.includes(name)) throw new StoragePathError(`${template} (duplicate {${name}})`);
    argNames.push(name);
    segments.push({ kind: "arg", name });
  }

  return { segments, argNames };
}

/**
 * Builds the key.
 *
 * Every runtime value goes back through `pathSegment()`, so an id holding
 * `../..` is refused here rather than normalised away by `fetch()` later on.
 */
export function renderTemplate(
  segments: readonly TemplateSegment[],
  identity: StorageSession,
  args: readonly string[],
): string {
  const rendered: string[] = [];
  let index = 0;

  for (const segment of segments) {
    switch (segment.kind) {
      case "literal":
        rendered.push(segment.value);
        break;
      case "account":
        rendered.push(pathSegment(identity.id));
        break;
      case "arg":
        rendered.push(pathSegment(args[index++] ?? ""));
        break;
    }
  }

  return rendered.join("/");
}

export function namedArgs(
  argNames: readonly string[],
  args: readonly string[],
): Record<string, string> {
  const named: Record<string, string> = {};
  argNames.forEach((name, index) => {
    named[name] = args[index];
  });
  return named;
}
