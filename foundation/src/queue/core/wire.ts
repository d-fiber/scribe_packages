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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * What travels on a queue subject.
 *
 * The envelope carries the payload and nothing else. How many times a message has been
 * delivered used to travel with it; it is now read from `JsMsg.info`, which the server keeps
 * and which no producer can get wrong.
 *
 * The `data` key stays in the shape for a reason that outlives the field it replaced: a
 * message published before this change carries `{ data, attempts }`, and reading `.data`
 * decodes both shapes without a guess. A bare payload would have made the two ambiguous.
 */
export interface WireMessage<T> {
  /** The payload the producer sent, untouched. */
  readonly data: T;
}

/** Serializes a payload for publication. */
export function encode<T>(message: WireMessage<T>): Uint8Array {
  return encoder.encode(JSON.stringify(message));
}

/** Reads a payload back, whichever of the two envelope shapes carried it. */
export function decode<T>(payload: Uint8Array): WireMessage<T> {
  return JSON.parse(decoder.decode(payload)) as WireMessage<T>;
}
