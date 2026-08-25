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
export interface WireMessage<out T> {
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

/**
 * The message `payload` carries, or null when it carries nothing this can read.
 *
 * @remarks
 * A payload that cannot be parsed is a fact about the bytes, not an accident of the call, so it
 * answers rather than raises: a decode that throws does it before any guard a caller could have
 * put around it, and the caller is a pass over a group where one unreadable message would leave
 * every other one unanswered.
 *
 * The shape is checked too. A payload that parses to a number or to an object carrying no `data`
 * is as unreadable as one that does not parse, and finding out at the first property read would
 * put the raise back where it was.
 */
export function safeDecode<T>(payload: Uint8Array): WireMessage<T> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(decoder.decode(payload));
  } catch {
    return null;
  }

  return typeof parsed === "object" && parsed !== null && "data" in parsed ? (parsed as WireMessage<T>) : null;
}
