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

import { type DateMathUnit, DistanceUnit, type GeoPoint } from "../../contracts/query.ts";

/**
 * A date expressed relative to another, which the cluster resolves when it runs the query.
 *
 * @remarks
 * It exists so a cached plan does not carry a timestamp taken when it was built. `now - 7d`
 * means the same thing an hour later, whereas the millisecond it resolved to does not.
 *
 * ```ts
 * DateMath.now().minus(7, "d").roundTo("d"); // "now-7d/d"
 * ```
 */
export class DateMath {
  readonly #expression: string;

  private constructor(expression: string) {
    this.#expression = expression;
  }

  /** The moment the cluster runs the query. */
  static now(): DateMath {
    return new DateMath("now");
  }

  /** A fixed date, which the following steps are counted from. */
  static of(date: string): DateMath {
    return new DateMath(`${date}||`);
  }

  /** This date moved forward by `amount` units. */
  plus(amount: number, unit: DateMathUnit): DateMath {
    return new DateMath(`${this.#expression}+${amount}${unit}`);
  }

  /** This date moved back by `amount` units. */
  minus(amount: number, unit: DateMathUnit): DateMath {
    return new DateMath(`${this.#expression}-${amount}${unit}`);
  }

  /** This date rounded down to the start of its `unit`. */
  roundTo(unit: DateMathUnit): DateMath {
    return new DateMath(`${this.#expression}/${unit}`);
  }

  /** The expression, as the cluster parses it. */
  toJSON(): string {
    return this.#expression;
  }

  /** The expression, so an interpolation writes it rather than the object. */
  toString(): string {
    return this.#expression;
  }
}

/** Builds a point in the field order the cluster reads, which is `lon` and never `lng`. */
export const Geo: {
  /** The point at `lat` and `lng`, renamed to what the cluster expects. */
  point(lat: number, lng: number): GeoPoint;
} = {
  point: (lat: number, lng: number): GeoPoint => ({ lat, lon: lng }),
};

/** Builds the distances a geo clause compares against. */
export const Distance: {
  /** `value` kilometres. */
  kilometers(value: number): `${number}${DistanceUnit.Kilometers}`;

  /** `value` metres. */
  meters(value: number): `${number}${DistanceUnit.Meters}`;

  /** `value` statute miles. */
  miles(value: number): `${number}${DistanceUnit.Miles}`;

  /** `value` yards. */
  yards(value: number): `${number}${DistanceUnit.Yards}`;

  /** `value` feet. */
  feet(value: number): `${number}${DistanceUnit.Feet}`;

  /** `value` inches. */
  inches(value: number): `${number}${DistanceUnit.Inches}`;

  /** `value` nautical miles. */
  nauticalMiles(value: number): `${number}${DistanceUnit.NauticalMiles}`;

  /** `value` centimetres. */
  centimeters(value: number): `${number}${DistanceUnit.Centimeters}`;

  /** `value` millimetres. */
  millimeters(value: number): `${number}${DistanceUnit.Millimeters}`;
} = {
  kilometers: (value) => `${value}${DistanceUnit.Kilometers}`,
  meters: (value) => `${value}${DistanceUnit.Meters}`,
  miles: (value) => `${value}${DistanceUnit.Miles}`,
  yards: (value) => `${value}${DistanceUnit.Yards}`,
  feet: (value) => `${value}${DistanceUnit.Feet}`,
  inches: (value) => `${value}${DistanceUnit.Inches}`,
  nauticalMiles: (value) => `${value}${DistanceUnit.NauticalMiles}`,
  centimeters: (value) => `${value}${DistanceUnit.Centimeters}`,
  millimeters: (value) => `${value}${DistanceUnit.Millimeters}`,
};

/** Builds how far from what was typed a term is still allowed to be. */
export const Fuzziness: {
  /** The edit distance the cluster picks from the length of each term. */
  auto(): "AUTO";

  /** The same, with the two term lengths at which it steps up. */
  autoRange(low: number, high: number): `AUTO:${number},${number}`;

  /** A fixed number of character edits. */
  exact(editDistance: 0 | 1 | 2): 0 | 1 | 2;
} = {
  auto: () => "AUTO",
  autoRange: (low, high) => `AUTO:${low},${high}`,
  exact: (editDistance) => editDistance,
};
