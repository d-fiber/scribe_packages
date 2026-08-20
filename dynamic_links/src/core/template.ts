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

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * The parameters a template takes, one string per placeholder it writes.
 *
 * It is what makes a forgotten parameter a compilation error rather than a link whose address
 * still carries a pair of braces. The names are read off the template itself, so a declaration
 * that gains a placeholder breaks every call that has not been given the new value.
 */
export type LinkParams<S extends string> = S extends `${string}{${infer N}}${infer R}`
  ? { readonly [K in N]: string } & LinkParams<R>
  : Record<never, never>;

/** A template that names something no link could render. */
export class LinkTemplateError extends Error {
  /** The template as it was declared. */
  readonly template: string;

  /**
   * @param template - The template that was refused.
   * @param reason - What is wrong with it, in a sentence that finishes "template … reason".
   */
  constructor(template: string, reason: string) {
    super(`dynamic link template "${template}" ${reason}.`);
    this.template = template;
    this.name = "LinkTemplateError";
  }
}

/** One part of a parsed template. */
type Segment =
  | {
    /** A part the template spells out, the same for every link declared with it. */
    readonly kind: "literal";

    /** The text that part carries. */
    readonly value: string;
  }
  | {
    /** A part a caller fills in, one parameter per occurrence. */
    readonly kind: "param";

    /** The name the placeholder was written with, which no other placeholder may reuse. */
    readonly name: string;
  };

/**
 * A route or an address with holes in it, and the parameters that fill them.
 *
 * A value is escaped as it is written, so a parameter carries a name, an identifier or a code,
 * and never a second address. A declaration that has to send a visitor to an arbitrary target
 * needs a shape this class does not offer.
 */
export class LinkTemplate {
  /** The template as it was declared, placeholders included. */
  readonly pattern: string;

  /** The names of the placeholders, in the order the template writes them. */
  readonly names: readonly string[];

  readonly #segments: readonly Segment[];

  /**
   * @param pattern - The template to take apart.
   *
   * @throws {LinkTemplateError} When the template is empty, or writes the same placeholder
   * twice. Two placeholders of one name would take one value and put it in two places, and a
   * caller has no way to say it wanted two.
   */
  constructor(pattern: string) {
    if (pattern.length === 0) throw new LinkTemplateError(pattern, "is empty");

    const segments: Segment[] = [];
    const names: string[] = [];
    let cursor = 0;

    for (const match of pattern.matchAll(PLACEHOLDER_PATTERN)) {
      const name = match[1];
      if (names.includes(name)) {
        throw new LinkTemplateError(pattern, `writes the placeholder "${name}" twice`);
      }

      const literal = pattern.slice(cursor, match.index);
      if (literal.length > 0) segments.push({ kind: "literal", value: literal });

      segments.push({ kind: "param", name });
      names.push(name);
      cursor = match.index + match[0].length;
    }

    const tail = pattern.slice(cursor);
    if (tail.length > 0) segments.push({ kind: "literal", value: tail });

    this.pattern = pattern;
    this.names = names;
    this.#segments = segments;
  }

  /**
   * The template with `params` written into it, or null when a placeholder has no value.
   *
   * Null rather than a throw because the parameters of an existing link come out of a row: a
   * declaration that gained a placeholder leaves the links written before it unrenderable, and
   * that is a link the caller cannot serve rather than a mistake in its code.
   */
  render(params: Readonly<Record<string, string>>): string | null {
    const parts: string[] = [];

    for (const segment of this.#segments) {
      if (segment.kind === "literal") {
        parts.push(segment.value);
        continue;
      }

      const value = params[segment.name];
      if (typeof value !== "string" || value.length === 0) return null;
      parts.push(encodeURIComponent(value));
    }

    return parts.join("");
  }

  /** Whether `params` holds a usable value for every placeholder this template writes. */
  accepts(params: Readonly<Record<string, string>>): boolean {
    return this.names.every((name) => typeof params[name] === "string" && params[name].length > 0);
  }
}
