#!/usr/bin/env bash
# Copyright (C) 2026 Fiber
#
# This Source Code Form is subject to the terms of the Mozilla Public License,
# v. 2.0. If a copy of the MPL was not distributed with this file, You can
# obtain one at https://mozilla.org/MPL/2.0/.
#
# What you may do:
# - Use this software for any purpose, including commercially, and build and
#   sell your own products on top of it.
# - Change it, and create new works based on it.
# - Distribute copies of it, with or without your changes.
# - Combine it with files under any other licence, proprietary ones included,
#   and licence that larger work on your own terms.
#
# What you must do in return:
# - Keep this notice on every file you received it on.
# - Publish, under these same terms, the source of every file covered by them
#   that you distribute, including the ones you changed, so that whoever
#   receives your version can obtain that source.
# - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
#   trademarks may not be used to endorse or promote what you build, and this
#   licence grants no right to them.
#
# Disclaimer:
# AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
# OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
# WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
# NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
# INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
# LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
# OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
# KIND OF LEGAL CLAIM.
#
# This header is a summary written for convenience. Where it differs from the
# LICENSE file, the LICENSE file governs.

set -euo pipefail

REPOSITORY="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$REPOSITORY" ]; then
  echo "usage: $0 <owner>/<repo>" >&2
  exit 64
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "This needs the GitHub CLI. See https://cli.github.com" >&2
  exit 1
fi

apply_one() {
  ruleset="$1"
  name=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['name'])" "$ruleset")
  existing=$(gh api "repos/$REPOSITORY/rulesets" --jq ".[] | select(.name == \"$name\") | .id" 2>/dev/null || true)

  if [ -n "$existing" ]; then
    echo "Updating \"$name\" (id $existing) on $REPOSITORY"
    gh api --method PUT "repos/$REPOSITORY/rulesets/$existing" --input "$ruleset" --jq '"  " + .name + " is now " + .enforcement'
  else
    echo "Creating \"$name\" on $REPOSITORY"
    gh api --method POST "repos/$REPOSITORY/rulesets" --input "$ruleset" --jq '"  " + .name + " is now " + .enforcement'
  fi
}

for ruleset in "$HERE"/*.json; do
  apply_one "$ruleset"
done

cat <<EOF

Done. $REPOSITORY now rejects a direct push to main and an untagged commit
message. That applies to you too, so an urgent fix still goes through a pull
request.

To check what is in place:
  gh api repos/$REPOSITORY/rulesets --jq '.[] | .name + " (" + .enforcement + ")"'
EOF
