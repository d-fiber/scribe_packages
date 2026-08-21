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

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

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
