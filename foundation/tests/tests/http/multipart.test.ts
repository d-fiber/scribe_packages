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
import { allOf, contains, equals, expect, fail, isA, isNot, Scribe, throwsA, withMessage } from "@scribe/alchemy/test";
import { MultipartFile } from "@scribe/alchemy/http";
import { MultipartRequest } from "@scribe/alchemy/http";

function boundaryOf(request: MultipartRequest): string {
  const type = request.headers.get("content-type") ?? "";
  const found = /boundary=(.+)$/.exec(type);
  if (found === null) fail(`no boundary in ${type}`);

  return found[1];
}

Scribe.test("the body carries the fields, then the files, then the closing boundary", async () => {
  const request = new MultipartRequest("POST", "https://example.test/upload");
  request.fields.set("name", "ada");
  request.files.push(
    MultipartFile.fromString("note", "hello", { filename: "note.txt" }),
  );

  const body = await request.finalize().bytesToString();
  const boundary = boundaryOf(request);

  expect(
    body,
    equals(
      `--${boundary}\r\n` +
        'content-disposition: form-data; name="name"\r\n\r\n' +
        "ada\r\n" +
        `--${boundary}\r\n` +
        "content-type: text/plain; charset=utf-8\r\n" +
        'content-disposition: form-data; name="note"; filename="note.txt"\r\n\r\n' +
        "hello\r\n" +
        `--${boundary}--\r\n`,
    ),
  );
});

Scribe.test("a file with no filename says so by leaving the directive out", async () => {
  const request = new MultipartRequest("POST", "https://example.test/upload");
  request.files.push(MultipartFile.fromBytes("blob", new Uint8Array([1, 2])));

  const body = await request.finalize().bytesToString();

  expect(body, contains("content-type: application/octet-stream\r\n"));
  expect(body, contains('content-disposition: form-data; name="blob"\r\n'));
});

Scribe.test("the announced length is the length of the body", async () => {
  const cases: Array<[string, (request: MultipartRequest) => void]> = [
    ["nothing at all", () => {}],
    ["one field", (request) => request.fields.set("name", "ada")],
    [
      "a field name outside ascii",
      (request) => request.fields.set("prénom", "ada"),
    ],
    ["a value outside ascii", (request) => request.fields.set("name", "adá")],
    [
      "a file",
      (request) =>
        request.files.push(
          MultipartFile.fromString("f", "hello", { filename: "a.txt" }),
        ),
    ],
    [
      "a filename outside ascii",
      (request) =>
        request.files.push(
          MultipartFile.fromString("f", "hello", { filename: "é.txt" }),
        ),
    ],
    [
      "a name that needs escaping",
      (request) => request.fields.set('a"b', "v"),
    ],
  ];

  for (const [label, build] of cases) {
    const request = new MultipartRequest("POST", "https://example.test/upload");
    build(request);

    const announced = request.contentLength;
    const sent = (await request.finalize().toBytes()).length;

    expect(announced, equals(sent), `${label}: announced ${announced}, sent ${sent}`);
  }
});

Scribe.test("two requests do not share a boundary", () => {
  const first = new MultipartRequest("POST", "https://example.test/upload");
  const second = new MultipartRequest("POST", "https://example.test/upload");

  first.finalize();
  second.finalize();

  expect(boundaryOf(first), isNot(equals(boundaryOf(second))));
});

Scribe.test("the boundary is drawn at finalize, not before", () => {
  const request = new MultipartRequest("POST", "https://example.test/upload");

  expect(request.headers.get("content-type"), equals(null));

  request.finalize();

  expect(request.headers.get("content-type") ?? "", contains("multipart/form-data; boundary="));
});

Scribe.test("a quote or a newline in a name cannot end the header early", async () => {
  const request = new MultipartRequest("POST", "https://example.test/upload");
  request.fields.set('a"b\r\nc', "v");
  request.files.push(
    MultipartFile.fromString("f", "x", { filename: 'd"e\nf' }),
  );

  const body = await request.finalize().bytesToString();

  expect(body, contains('name="a%22b%0D%0Ac"'));
  expect(body, contains('filename="d%22e%0Af"'));
});

Scribe.test("a file hands its bytes over once", () => {
  const file = MultipartFile.fromString("f", "x");

  file.finalize();

  expect(
    () => file.finalize(),
    throwsA(
      allOf(
        isA(Error),
        withMessage("This file has already been finalised, and a finalised file cannot be sent twice."),
      ),
    ),
  );
});

Scribe.test("a file made from text announces its length in bytes and calls itself text", () => {
  const file = MultipartFile.fromString("f", "héllo");

  expect(file.length, equals(6));
  expect(file.contentType, equals("text/plain; charset=utf-8"));
  expect(file.filename, equals(null));
});

Scribe.test("a content type given by the caller wins over the one text assumes", () => {
  const file = MultipartFile.fromString("f", "{}", {
    contentType: "application/json",
  });

  expect(file.contentType, equals("application/json"));
});

Scribe.test("a finalized multipart request refuses a second finalize", () => {
  const request = new MultipartRequest("POST", "https://example.test/upload");
  request.finalize();

  expect(
    () => request.finalize(),
    throwsA(
      allOf(isA(Error), withMessage("This request has already been sent, and a sent request cannot be changed.")),
    ),
  );
});
