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

import { LinkTemplate, LinkTemplateError } from "@scribe/dynamic_links/lib/src/core/template.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("a template names its placeholders in the order it writes them", () => {
  const template = new LinkTemplate("/party/{partyId}/invite/{code}");

  assertEquals(template.names, ["partyId", "code"]);
});

Deno.test("rendering writes each parameter where its placeholder was", () => {
  const template = new LinkTemplate("/invite/{code}");

  assertEquals(template.render({ code: "A1B2" }), "/invite/A1B2");
});

Deno.test("a parameter is escaped, so it cannot open a second address", () => {
  const template = new LinkTemplate("https://example.test/go/{target}");

  assertEquals(
    template.render({ target: "https://evil.test/x" }),
    "https://example.test/go/https%3A%2F%2Fevil.test%2Fx",
  );
});

Deno.test("a missing parameter renders nothing rather than an address with a hole", () => {
  const template = new LinkTemplate("/invite/{code}");

  assertEquals(template.render({}), null);
  assertEquals(template.render({ code: "" }), null);
});

Deno.test("a template refuses to write the same placeholder twice", () => {
  assertThrows(
    () => new LinkTemplate("/{code}/again/{code}"),
    LinkTemplateError,
    "twice",
  );
});

Deno.test("an empty template is refused", () => {
  assertThrows(() => new LinkTemplate(""), LinkTemplateError, "is empty");
});

Deno.test("a template without a placeholder accepts any parameters", () => {
  const template = new LinkTemplate("/home");

  assertEquals(template.names, []);
  assertEquals(template.render({}), "/home");
});
