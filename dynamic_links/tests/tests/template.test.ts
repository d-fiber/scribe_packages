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
import "@scribe/testing/runner.ts";
import { allOf, equals, expect, isA, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { LinkTemplate, LinkTemplateError } from "../../lib/src/core/template.ts";
Scribe.test("a template names its placeholders in the order it writes them", () => {
  const template = new LinkTemplate("/party/{partyId}/invite/{code}");

  expect(template.names, equals(["partyId", "code"]));
});

Scribe.test("rendering writes each parameter where its placeholder was", () => {
  const template = new LinkTemplate("/invite/{code}");

  expect(template.render({ code: "A1B2" }), equals("/invite/A1B2"));
});

Scribe.test("a parameter is escaped, so it cannot open a second address", () => {
  const template = new LinkTemplate("https://example.test/go/{target}");

  expect(
    template.render({ target: "https://evil.test/x" }),
    equals("https://example.test/go/https%3A%2F%2Fevil.test%2Fx"),
  );
});

Scribe.test("a missing parameter renders nothing rather than an address with a hole", () => {
  const template = new LinkTemplate("/invite/{code}");

  expect(template.render({}), equals(null));
  expect(template.render({ code: "" }), equals(null));
});

Scribe.test("a template refuses to write the same placeholder twice", () => {
  expect(() => new LinkTemplate("/{code}/again/{code}"), throwsA(allOf(isA(LinkTemplateError), withMessage("twice"))));
});

Scribe.test("an empty template is refused", () => {
  expect(() => new LinkTemplate(""), throwsA(allOf(isA(LinkTemplateError), withMessage("is empty"))));
});

Scribe.test("a template without a placeholder accepts any parameters", () => {
  const template = new LinkTemplate("/home");

  expect(template.names, equals([]));
  expect(template.render({}), equals("/home"));
});
