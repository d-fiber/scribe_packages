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

import type { MappingFieldType } from "@opensearch-project/opensearch/api/types";

export type { MappingFieldType };

/** Which way a sort clause runs. */
export enum SortOrder {
  /** Smallest first, and earliest first for a date. */
  Asc = "asc",

  /** Largest first, and latest first for a date. */
  Desc = "desc",
}

/** How the terms of one text query combine. */
export enum Operator {
  /** Every term must be found. */
  And = "AND",

  /** One term is enough. */
  Or = "OR",
}

/** Which value of a multi-valued field a sort compares. */
export enum SortMode {
  /** The smallest of the values held by the field. */
  Min = "min",

  /** The largest of them. */
  Max = "max",

  /** Their sum. */
  Sum = "sum",

  /** Their arithmetic mean. */
  Avg = "avg",

  /** Their median. */
  Median = "median",
}

/** How the scores of the documents matched inside a nested field reach the parent. */
export enum NestedScoreMode {
  /** The mean of the matched children. */
  Avg = "avg",

  /** Their sum. */
  Sum = "sum",

  /** The lowest of them. */
  Min = "min",

  /** The highest of them. */
  Max = "max",

  /** None of them, so the parent scores as if the nested clause were a filter. */
  None = "none",
}

/** How a query spread over several fields turns their scores into one. */
export enum MultiMatchType {
  /** The score of the single best field, which suits fields that hold different things. */
  BestFields = "best_fields",

  /** The combined score of every matching field, which suits one thing written several ways. */
  MostFields = "most_fields",

  /** The fields treated as one big field, which suits a name split across columns. */
  CrossFields = "cross_fields",

  /** The terms in order and adjacent. */
  Phrase = "phrase",

  /** The terms in order, the last one allowed to be a prefix, which is what search-as-you-type needs. */
  PhrasePrefix = "phrase_prefix",

  /** Every term matched separately, the last one as a prefix. */
  BoolPrefix = "bool_prefix",
}

/** The unit a distance is written in. */
export enum DistanceUnit {
  /** Kilometres. */
  Kilometers = "km",

  /** Metres. */
  Meters = "m",

  /** Statute miles. */
  Miles = "mi",

  /** Yards. */
  Yards = "yd",

  /** Feet. */
  Feet = "ft",

  /** Inches. */
  Inches = "in",

  /** Nautical miles. */
  NauticalMiles = "nmi",

  /** Centimetres. */
  Centimeters = "cm",

  /** Millimetres. */
  Millimeters = "mm",
}

/** What a script sort compares, which decides how the engine reads its return value. */
export enum ScriptValueType {
  /** A number, compared numerically. */
  Number = "number",

  /** A string, compared lexicographically. */
  String = "string",
}

/** The language a script is written in. */
export enum ScriptLang {
  /** Painless, the only one an OpenSearch cluster runs without being reconfigured. */
  Painless = "painless",
}

/** A value a term or a range compares against. */
export type ScalarValue = string | number | boolean;

/** How many character edits a term may be away from what was typed. */
export type Fuzziness = "AUTO" | `AUTO:${number},${number}` | 0 | 1 | 2;

/** How many clauses of a `should` list must match for a document to be kept. */
export type MinimumShouldMatch = number | string;

/** The unit a date-math expression steps by. */
export type DateMathUnit = "y" | "M" | "w" | "d" | "h" | "H" | "m" | "s";

/** A point on the globe, in the field order OpenSearch reads. */
export interface GeoPoint {
  /** Degrees of latitude, between -90 and 90. */
  lat: number;

  /** Degrees of longitude, between -180 and 180. Named `lon`, which is the spelling the cluster reads. */
  lon: number;
}

/** A place, written in any of the three forms a cluster accepts. */
export type GeoLocation = string | [number, number] | GeoPoint;

/** A distance and its unit, as one string. */
export type DistanceValue = `${number}${DistanceUnit}`;

/** Keeps every document of the index. */
export interface MatchAllQuery {
  /** The empty body the clause takes. */
  match_all: Record<string, never>;
}

/** Keeps the documents whose field holds exactly this value. */
export interface TermQuery {
  /** The field, and the value it must hold. */
  term: Record<string, ScalarValue>;
}

/** Keeps the documents whose field holds one of these values. */
export interface TermsQuery {
  /** The field, and the values one of which it must hold. */
  terms: Record<string, ScalarValue[]>;
}

/** Keeps the documents whose field falls inside the bounds. */
export interface RangeQuery {
  /** The field, and the bounds it must fall inside. Every bound is optional and they combine. */
  range: Record<
    string,
    {
      /** The lower bound, included. */
      gte?: number | string | DateMathValue;

      /** The upper bound, included. */
      lte?: number | string | DateMathValue;

      /** The lower bound, excluded. */
      gt?: number | string | DateMathValue;

      /** The upper bound, excluded. */
      lt?: number | string | DateMathValue;
    }
  >;
}

/** What a date-math expression looks like once it is on the wire. */
export interface DateMathValue {
  /** The expression, as the cluster parses it. */
  toJSON(): string;
}

/** Matches one piece of text against several fields at once. */
export interface MultiMatchQuery {
  /** The text, the fields it is matched against, and how they combine. */
  multi_match: {
    /** What the caller typed. */
    query: string;

    /** The fields to look in, each optionally carrying its weight as `name^2`. */
    fields: string[];

    /** How the per-field scores become one. Best fields when absent. */
    type?: MultiMatchType;

    /** How many character edits a term may be away from what was typed. None when absent. */
    fuzziness?: Fuzziness;

    /** How many leading characters must match exactly before fuzziness applies. */
    prefix_length?: number;

    /** How the terms combine. One term is enough when absent. */
    operator?: Operator;

    /** How many terms must match for a document to be kept. */
    minimum_should_match?: MinimumShouldMatch;

    /** What this clause's score is multiplied by. One when absent. */
    boost?: number;
  };
}

/** Matches one piece of text against one field. */
export interface MatchQuery {
  /** The field, and either the text alone or the text with its options. */
  match: Record<
    string,
    string | {
      /** What the caller typed. */
      query: string;

      /** How the terms combine. One term is enough when absent. */
      operator?: Operator;

      /** How many character edits a term may be away from what was typed. */
      fuzziness?: Fuzziness;
    }
  >;
}

/** Keeps the documents whose geo point sits within a radius. */
export interface GeoDistanceQuery {
  /** The radius, then the field and the point it is measured from. */
  geo_distance: {
    /** How far from the point a document may sit. */
    distance: DistanceValue;

    /** The geo field, and the point distances are measured from. */
    [field: string]: GeoLocation | DistanceValue;
  };
}

/** Combines clauses, which is how every plan this package builds is shaped. */
export interface BoolQuery {
  /** The four lists and the two knobs a boolean clause takes. */
  bool: {
    /** What must match, and what contributes to the score. */
    must?: SearchQuery | SearchQuery[];

    /** What must match without contributing to the score, which is what a filter is for. */
    filter?: SearchQuery | SearchQuery[];

    /** What must not match. */
    must_not?: SearchQuery | SearchQuery[];

    /** What may match, raising the score of the documents it matches. */
    should?: SearchQuery | SearchQuery[];

    /** How many `should` clauses must match. None required when absent. */
    minimum_should_match?: MinimumShouldMatch;

    /** What this clause's score is multiplied by. One when absent. */
    boost?: number;
  };
}

/** Runs a clause against the documents held inside a nested field. */
export interface NestedQuery {
  /** The nested field, the clause to run inside it, and how its scores reach the parent. */
  nested: {
    /** The nested field to descend into. */
    path: string;

    /** The clause run against each document held there. */
    query: SearchQuery;

    /** How the scores of the matched children reach the parent. */
    score_mode?: NestedScoreMode;

    /** Whether a field the mapping does not declare answers no match instead of failing. */
    ignore_unmapped?: boolean;
  };
}

/** Any clause a plan can carry. */
export type SearchQuery =
  | MatchAllQuery
  | TermQuery
  | TermsQuery
  | RangeQuery
  | MultiMatchQuery
  | MatchQuery
  | GeoDistanceQuery
  | BoolQuery
  | NestedQuery;

/** What a sort on a plain field takes beyond its direction. */
export interface FieldSortOptions {
  /** Which way the sort runs. */
  order: SortOrder;

  /** What to treat the field as when the mapping does not declare it, instead of failing. */
  unmapped_type?: MappingFieldType;

  /** Where the documents that hold nothing land. */
  missing?: "_first" | "_last" | string | number;

  /** Which value of a multi-valued field is compared. */
  mode?: SortMode;
}

/** Sorts on a field, by direction alone or with its options. */
export interface FieldSort {
  /** The field, and either its direction or its full options. */
  [field: string]: SortOrder | FieldSortOptions;
}

/** Sorts by how far each document sits from a point. */
export interface GeoDistanceSort {
  /** The geo field, the point, and how the distance is read. */
  _geo_distance: {
    /** The geo field, holding the point distances are measured from. */
    [field: string]:
      | GeoLocation
      | SortOrder
      | DistanceUnit
      | SortMode
      | boolean
      | undefined;

    /** Which way the sort runs, so nearest first is ascending. */
    order: SortOrder;

    /** The unit distances are compared in. */
    unit: DistanceUnit;

    /** Whether a field the mapping does not declare sorts last instead of failing. */
    ignore_unmapped?: boolean;

    /** Which point of a multi-point field is measured. */
    mode?: SortMode;
  };
}

/** Sorts by what a script returns for each document. */
export interface ScriptSort {
  /** What the script returns, which way to run, and the script itself. */
  _script: {
    /** What the script returns, which decides how the values are compared. */
    type: ScriptValueType;

    /** Which way the sort runs. */
    order: SortOrder;

    /** The script, its language and the parameters it reads. */
    script: {
      /** The language the source is written in. */
      lang: ScriptLang;

      /** The source, which reads `doc[…]` for field values and `params[…]` for the rest. */
      source: string;

      /** What the source reads out of `params`, which keeps the source itself constant. */
      params: Record<string, unknown>;
    };
  };
}

/** Any sort clause a plan can carry. */
export type SearchSort =
  | "_score"
  | FieldSort
  | GeoDistanceSort
  | ScriptSort;
