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
import "@scribe/testing/runner.ts";
import { allOf, equals, expect, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import "../../testing/settings.ts";
import { parsePath } from "../../../lib/src/trigger/trigger_path.ts";

Scribe.test("a path names its table and the parameter its key is handed under", () => {
  expect(
    parsePath("orders/{orderId}"),
    equals({
      table: "orders",
      param: "orderId",
      field: null,
    }),
  );
});

Scribe.test("a third segment is the column to watch", () => {
  expect(
    parsePath("orders/{orderId}/status"),
    equals({
      table: "orders",
      param: "orderId",
      field: "status",
    }),
  );
});

Scribe.test("a path that stops at the table is refused", () => {
  expect(
    () => parsePath("orders"),
    throwsA(allOf(isA(Error), withMessage("a path is written <table>/{<param>}[/<field>]"))),
  );
});

Scribe.test("a path with a fourth segment is refused", () => {
  expect(() => parsePath("orders/{orderId}/status/history"), throwsA(isA(Error)));
});

Scribe.test("a second segment without braces is not a parameter", () => {
  expect(() => parsePath("orders/orderId"), throwsA(allOf(isA(Error), withMessage('"orderId" is not a parameter'))));
});

Scribe.test("an empty parameter is refused", () => {
  expect(() => parsePath("orders/{}"), throwsA(isA(Error)));
});

Scribe.test("a path without a table is refused", () => {
  expect(() => parsePath("/{orderId}"), throwsA(allOf(isA(Error), withMessage("the table is missing"))));
});

Scribe.test("a path ending on a slash is refused", () => {
  expect(() => parsePath("orders/{orderId}/"), throwsA(allOf(isA(Error), withMessage("the field is empty"))));
});
