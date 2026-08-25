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
