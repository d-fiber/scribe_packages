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

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const ACTION_MAX_LENGTH = 32;
const CHANNEL_MAX_LENGTH = 64;

const TOPIC_PATTERN = /^[a-zA-Z0-9_-]+$/;
const TOPIC_MAX_LENGTH = 64;

/** The character that opens a topic, and the one thing an account identifier can never start with. */
const TOPIC_MARK = "#";

function checkName(label: string, value: string, maxLength: number): string {
  if (!NAME_PATTERN.test(value)) {
    throw new TypeError(
      `${label}: "${value}" must be lowercase snake_case (${NAME_PATTERN.source}).`,
    );
  }
  if (value.length > maxLength) {
    throw new TypeError(`${label}: "${value}" exceeds ${maxLength} characters.`);
  }
  return value;
}

/**
 * Checks the name a declaration was given, and answers it.
 *
 * It is the prefix of every channel the declaration reaches, so two declarations that pick the
 * same name share their listeners and their grants.
 */
export function channelName(name: string): string {
  return checkName("realtime channel", name, CHANNEL_MAX_LENGTH);
}

/** Checks the name of an action, which travels beside the payload, and answers it. */
export function actionName(action: string): string {
  return checkName("realtime action", action, ACTION_MAX_LENGTH);
}

/**
 * Whether `topic` may be used to name a channel.
 *
 * The alphabet is wider than a channel's because a topic often comes from a project's own
 * vocabulary, and it stops short of the colon that separates the parts of a channel.
 */
export function isValidTopic(topic: string): boolean {
  return TOPIC_PATTERN.test(topic) && topic.length <= TOPIC_MAX_LENGTH;
}

/** The channel that reaches everyone listening to `name`. */
export function broadcastChannel(name: string): string {
  return name;
}

/** The channel that reaches the single account `accountId`, and nobody else. */
export function accountChannel(name: string, accountId: string): string {
  return `${name}:${accountId}`;
}

/**
 * The channel that reaches the accounts granted on `topic`.
 *
 * The mark keeps it apart from {@link accountChannel}: an account identifier never opens with
 * it, so the policy that compares the second part of a channel to the caller's subject can
 * never match a topic by accident.
 */
export function topicChannel(name: string, topic: string): string {
  return `${name}:${TOPIC_MARK}${topic}`;
}

/** The channel that reaches `accountId` alone, narrowed to what happens under `topic`. */
export function accountTopicChannel(
  name: string,
  accountId: string,
  topic: string,
): string {
  return `${name}:${accountId}:${topic}`;
}
