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

import { LinkTemplate, LinkTemplateError } from "@scribe/dynamic_links/src/core/template.ts";
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
