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

/**
 * A stream of bytes, with the two ways of draining it that a caller ever wants.
 *
 * It wraps a `ReadableStream` rather than replacing it: {@link stream} hands the underlying
 * one back, so anything that already speaks the platform's streams keeps working.
 */
export class ByteStream {
  /** The underlying stream. */
  readonly stream: ReadableStream<Uint8Array>;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.stream = stream;
  }

  /** A stream carrying `bytes` and nothing else. */
  static fromBytes(bytes: Uint8Array): ByteStream {
    return new ByteStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    );
  }

  /** Collects the whole stream into one buffer. */
  async toBytes(): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;

    for await (const chunk of this.stream) {
      chunks.push(chunk);
      total += chunk.length;
    }

    const collected = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      collected.set(chunk, at);
      at += chunk.length;
    }
    return collected;
  }

  /** Collects the whole stream and decodes it, utf-8 unless told otherwise. */
  async bytesToString(encoding = "utf-8"): Promise<string> {
    return new TextDecoder(encoding).decode(await this.toBytes());
  }
}
