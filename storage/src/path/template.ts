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

const PLACEHOLDER_PATTERN = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;

/**
 * The arguments a template takes, one string per placeholder, in the order the template writes
 * them.
 *
 * It is what makes a missing segment a compilation error rather than a key with a hole in it.
 * The tuple is built by recursion on the template rather than by mapping a tuple of names,
 * because a mapped type over a template that is still generic is not seen as an array, and a
 * rest parameter needs one.
 */
export type PathArgs<S extends string> = S extends `${string}{${string}}${infer R}` ? [string, ...PathArgs<R>]
  : [];

/** One part of a parsed template. */
export type TemplateSegment =
  | {
    /** A part the template spells out, the same for every object under it. */
    readonly kind: "literal";
    /** The name that part carries. */
    readonly value: string;
  }
  | {
    /** A part the caller fills in, one argument per occurrence. */
    readonly kind: "arg";
    /** The name the placeholder was written with, which no other placeholder may reuse. */
    readonly name: string;
  };

/** A template taken apart, ready to be rendered against a caller's arguments. */
export interface ParsedTemplate {
  /** The parts of the template, in order. */
  readonly segments: readonly TemplateSegment[];

  /** The names of the placeholders, in order, which is also the order of the arguments. */
  readonly argNames: readonly string[];
}

/**
 * Takes `template` apart, and refuses anything that would not render into a usable key.
 *
 * @throws {StoragePathError} When a part is neither a valid name nor a valid placeholder, or
 * when the template is empty, or when it writes the same placeholder twice.
 */
export function parseTemplate(template: string): ParsedTemplate {
  const parts = template.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) throw new StoragePathError(template);

  const segments: TemplateSegment[] = [];
  const argNames: string[] = [];

  for (const part of parts) {
    if (!part.includes("{") && !part.includes("}")) {
      segments.push({ kind: "literal", value: pathSegment(part) });
      continue;
    }

    const match = PLACEHOLDER_PATTERN.exec(part);
    if (!match) throw new StoragePathError(part);

    const name = match[1];
    if (argNames.includes(name)) throw new StoragePathError(`${template} (duplicate {${name}})`);

    argNames.push(name);
    segments.push({ kind: "arg", name });
  }

  return { segments, argNames };
}

/**
 * Builds the key `segments` describe, filled in with `args`.
 *
 * @remarks
 * Every value goes back through `pathSegment`, so an argument holding `../..` is refused here
 * rather than normalised away by the storage service later on.
 *
 * @throws {StoragePathError} When an argument is missing, or carries anything a key cannot.
 */
export function renderTemplate(
  segments: readonly TemplateSegment[],
  args: readonly string[],
): string {
  const rendered: string[] = [];
  let index = 0;

  for (const segment of segments) {
    rendered.push(
      segment.kind === "literal" ? segment.value : pathSegment(args[index++] ?? ""),
    );
  }

  return rendered.join("/");
}
