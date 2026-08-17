#!/usr/bin/env bash
# Copyright (C) 2026 Fiber
#
# This file is part of scribe and is made available under the PolyForm Shield
# License 1.0.0. The full terms are in the LICENSE file at the root of this
# repository, and at https://polyformproject.org/licenses/shield/1.0.0
#
# What you may do:
# - Use this software for any purpose, including commercially, and build and
#   sell your own products on top of it.
# - Change it, and create new works based on it.
# - Distribute copies of it, with or without your changes.
#
# The one thing you may not do:
# - Use it to provide any product that competes with scribe, or with any
#   product Fiber or its affiliates provide using scribe. Products compete
#   even when they are offered free of charge, through a different kind of
#   interface, or for a different technical platform.
#
# If you pass this software on:
# - Anyone who receives any part of it from you must also receive these terms,
#   or the URL above, together with the "Required Notice" line carried by the
#   LICENSE file.
#
# Disclaimer:
# AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
# CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
# OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
# LEGAL CLAIM.
#
# This header is a summary written for convenience. Where it differs from the
# LICENSE file, the LICENSE file governs.

set -euo pipefail

BASE="${1:-}"
HEAD="${2:-HEAD}"

TAGS="DEV|BUGFIX|REFACTO|DOC|TEST|CI|PERF|SECURITY|BREAKING|RELEASE|REVERT|CHORE"
PATTERN="^\[(${TAGS})\]: .+$"
SUBJECT_LIMIT=72

if [ -z "$BASE" ] || [ "$BASE" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "No base revision to compare against, checking $HEAD on its own"
  COMMITS=$(git rev-list -1 "$HEAD")
else
  COMMITS=$(git rev-list "$BASE..$HEAD")
fi

failed=0
checked=0

for commit in $COMMITS; do
  parents=$(git rev-list --parents -n 1 "$commit" | wc -w)
  if [ "$parents" -gt 2 ]; then
    continue
  fi

  subject=$(git log -1 --format=%s "$commit")
  checked=$((checked + 1))

  if [ ${#subject} -gt $SUBJECT_LIMIT ]; then
    echo "BAD  ${commit:0:8}  subject is ${#subject} characters, limit is $SUBJECT_LIMIT"
    echo "                   $subject"
    failed=$((failed + 1))
    continue
  fi

  if ! printf '%s' "$subject" | grep -Eq "$PATTERN"; then
    echo "BAD  ${commit:0:8}  $subject"
    failed=$((failed + 1))
    continue
  fi

  if printf '%s' "$subject" | grep -Eq '\.$'; then
    echo "BAD  ${commit:0:8}  subject ends with a period"
    echo "                   $subject"
    failed=$((failed + 1))
    continue
  fi

  echo "ok   ${commit:0:8}  $subject"
done

if [ "$failed" -gt 0 ]; then
  cat >&2 <<EOF

$failed of $checked commit messages have the wrong format.

Use [TAG]: message

  DEV        new feature, new endpoint, new code
  BUGFIX     a fix for something that was broken
  REFACTO    moving or rewriting code without changing behaviour
  DOC        documentation only
  TEST       tests only
  CI         workflows and build tooling
  PERF       speed or footprint
  SECURITY   hardening, closing a leak
  BREAKING   breaks the contract or a published API
  RELEASE    publishing, generated files, versions that moved
  REVERT     undoing an earlier commit
  CHORE      dependencies and other housekeeping

Tags are uppercase and in brackets. Keep the message in the imperative, drop
the trailing period, and stay under $SUBJECT_LIMIT characters.

For example:

  [DEV]: add the capability token to every invocation
  [BUGFIX]: keep the rate limit a node passes down
  [REFACTO]: move the rest engine out of dependencies
  [BREAKING]: replace the Mount enum with declared nodes
EOF
  exit 1
fi

echo ""
echo "Checked $checked commit messages, all good"
