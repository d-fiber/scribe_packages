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

import type { LinkValue } from "./template.ts";

/**
 * A rule that decides whether an unknown value belongs in one field of a declaration's data.
 *
 * @remarks
 * A declaration's data is usually a literal written next to the call that declares it, so
 * TypeScript's own generic already protects it. That protection ends the moment the data comes
 * from a request instead: a body read with `request.json()` answers `unknown`, and a cast such as
 * `create(body as Invite)` compiles whether or not `body` actually holds `Invite`'s fields. A
 * field descriptor is what checks the value for real, at the moment a link is created, instead of
 * only where a cast can be typed past.
 */
export interface FieldDescriptor<T extends LinkValue> {
  /** Which of the three shapes a {@link LinkValue} may take this field accepts. */
  readonly typeName: "string" | "number" | "boolean";

  /** Whether `value` belongs in this field. */
  accepts(value: unknown): value is T;
}

/**
 * The shape a declaration's `fields` option takes: one descriptor per field of `T`.
 *
 * A field of `T` that is not itself a {@link LinkValue} resolves to `never`, which no descriptor
 * can satisfy, rather than silently accepting one that could not check it.
 */
export type LinkFields<T> = {
  readonly [K in keyof T]: T[K] extends LinkValue ? FieldDescriptor<T[K]> : never;
};

function descriptor<T extends LinkValue>(
  typeName: FieldDescriptor<T>["typeName"],
  accepts: (value: unknown) => value is T,
): FieldDescriptor<T> {
  return { typeName, accepts };
}

/**
 * Builds the descriptors a declaration's `fields` option is made of.
 *
 * ```ts
 * const invite = DynamicLink.deeplink<Invite>("invite", {
 *   path: "/invite/{code}",
 *   fields: { code: field.string(), invitedBy: field.string() },
 * });
 * ```
 */
export const field = {
  /** A field only a string satisfies. */
  string: (): FieldDescriptor<string> => descriptor("string", (value): value is string => typeof value === "string"),

  /** A field only a finite number satisfies. */
  number: (): FieldDescriptor<number> =>
    descriptor("number", (value): value is number => typeof value === "number" && Number.isFinite(value)),

  /** A field only a boolean satisfies. */
  boolean: (): FieldDescriptor<boolean> =>
    descriptor("boolean", (value): value is boolean => typeof value === "boolean"),
};
