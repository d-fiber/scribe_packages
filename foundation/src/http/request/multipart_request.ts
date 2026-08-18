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

import { ByteStream } from "../byte_stream.ts";
import { BaseRequest } from "./base_request.ts";
import type { MultipartFile } from "./multipart_file.ts";

const _BOUNDARY_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'()+_,-./:=?";
const _BOUNDARY_LENGTH = 32;

/**
 * A `multipart/form-data` request: named fields, and files.
 *
 * The boundary is drawn at finalize rather than at construction, from an alphabet the
 * specification allows, so a request built long before it is sent cannot end up carrying a
 * separator that some part of its own body happens to contain.
 */
export class MultipartRequest extends BaseRequest {
  /** The plain fields of the form. */
  readonly fields: Map<string, string> = new Map();

  /** The files of the form. */
  readonly files: MultipartFile[] = [];

  constructor(method: string, url: URL | string) {
    super(method, url);
  }

  /**
   * The length of the whole body, separators included.
   *
   * It is exact, which is what lets the header be set before a single byte is written.
   */
  override get contentLength(): number {
    const boundaryLength = _BOUNDARY_LENGTH + 2;
    let length = 0;

    for (const [name, value] of this.fields) {
      length += "--".length + boundaryLength + "\r\n".length +
        this.#fieldHeader(name).length +
        new TextEncoder().encode(value).length + "\r\n".length;
    }

    for (const file of this.files) {
      length += "--".length + boundaryLength + "\r\n".length +
        this.#fileHeader(file).length + file.length + "\r\n".length;
    }

    return length + "--".length + boundaryLength + "--\r\n".length;
  }

  override finalize(): ByteStream {
    const boundary = this.#drawBoundary();
    this.headers.set("content-type", `multipart/form-data; boundary=${boundary}`);
    super.finalize();

    const encoder = new TextEncoder();
    const files = this.files;
    const fields = this.fields;
    const fieldHeader = (name: string) => this.#fieldHeader(name);
    const fileHeader = (file: MultipartFile) => this.#fileHeader(file);

    return new ByteStream(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const [name, value] of fields) {
            controller.enqueue(encoder.encode(`--${boundary}\r\n${fieldHeader(name)}${value}\r\n`));
          }

          for (const file of files) {
            controller.enqueue(encoder.encode(`--${boundary}\r\n${fileHeader(file)}`));
            for await (const chunk of file.finalize().stream) controller.enqueue(chunk);
            controller.enqueue(encoder.encode("\r\n"));
          }

          controller.enqueue(encoder.encode(`--${boundary}--\r\n`));
          controller.close();
        },
      }),
    );
  }

  #fieldHeader(name: string): string {
    return `content-disposition: form-data; name="${_escape(name)}"\r\n\r\n`;
  }

  #fileHeader(file: MultipartFile): string {
    const name = file.filename === null ? "" : `; filename="${_escape(file.filename)}"`;

    return `content-type: ${file.contentType}\r\n` +
      `content-disposition: form-data; name="${_escape(file.field)}"${name}\r\n\r\n`;
  }

  #drawBoundary(): string {
    const drawn = new Uint8Array(_BOUNDARY_LENGTH);
    crypto.getRandomValues(drawn);

    let boundary = "scribe-boundary-";
    for (const byte of drawn) {
      boundary += _BOUNDARY_CHARS[byte % _BOUNDARY_CHARS.length];
    }
    return boundary.slice(0, _BOUNDARY_LENGTH + 2);
  }
}

// A quote or a newline inside a field name would end the header early and let the rest of the
// name be read as one of our own directives.
function _escape(value: string): string {
  return value.replace(/["\r\n]/g, (found) => ({ '"': "%22", "\r": "%0D", "\n": "%0A" })[found] ?? found);
}
