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

export type RelNode = {
  row: object;
  many?: boolean;
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
    builder: (s: any) => any,
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
