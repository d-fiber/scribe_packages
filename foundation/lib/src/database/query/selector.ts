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

/** One relation a table can embed, and what embedding it yields. */
export type RelNode = {
  /** The shape of a row on the far side of this relation. */
  row: object;

  /** Whether embedding this relation yields a list rather than a single row. */
  many?: boolean;

  /** What the far side can embed in turn, so a selection can go deeper than one level. */
  relations?: Record<string, RelNode>;
};

type EmbedToken<
  _Name extends string,
  SubResult,
  Many extends boolean,
> = string & { readonly __sr: SubResult; readonly __many: Many };

type ExtractValue<Row extends object, V> = V extends {
  __sr: infer SR;
  __many: infer M;
} ? M extends false ? SR | null
  : SR[]
  : V extends keyof Row ? Row[V]
  : never;

export type ExtractShape<
  Row extends object,
  Shape extends Record<string, unknown>,
> = { [K in keyof Shape]: ExtractValue<Row, Shape[K]> };

type SubRels<N extends RelNode> = N["relations"] extends Record<string, RelNode> ? N["relations"]
  : Record<string, never>;

type IsMany<N extends RelNode> = N extends { many: false } ? false : true;

export type Selector<
  Row extends object,
  Rels extends Record<string, RelNode> = Record<string, never>,
> = { readonly [K in keyof Row & string]: K } & {
  readonly embed: {
    <
      RelName extends keyof Rels & string,
      SubShape extends Record<string, unknown>,
    >(
      relation: RelName,
      builder: (
        s: Selector<Rels[RelName]["row"] & object, SubRels<Rels[RelName]>>,
      ) => SubShape,
      options?: { inner?: boolean },
    ): EmbedToken<
      RelName,
      ExtractShape<Rels[RelName]["row"] & object, SubShape>,
      IsMany<Rels[RelName]>
    >;
    <R extends object>(
      relation: string,
      builder: (
        s: Selector<R, Record<string, never>>,
      ) => Record<string, unknown>,
      options?: { inner?: boolean },
    ): string;
  };
};

export function selector<
  Row extends object,
  Rels extends Record<string, RelNode> = Record<string, never>,
>(): Selector<Row, Rels> {
  const embed = (
    relation: string,
    builder: (s: unknown) => Record<string, unknown>,
    options?: { inner?: boolean },
  ): string => {
    const shape = builder(selector());
    const cols = Object.values(shape).map(String).join(", ");
    const rel = options?.inner ? `${relation}!inner` : relation;
    return `${rel}(${cols})`;
  };

  return new Proxy({ embed } as Selector<Row, Rels>, {
    get: (target, key: string) => (key === "embed" ? target.embed : key),
  });
}

export function columnsOf(shape: Record<string, unknown>): string {
  return Object.values(shape).map(String).join(", ");
}
