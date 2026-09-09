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

# Runs every package's e2e scenario, one after another, then tears down whatever
# they left. A scenario brings its own stack up and down; this is the sweep for
# one that crashed before its own teardown ran. Pass a package name to run just
# that one.

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

say() { echo "[e2e] $1"; }

command -v docker >/dev/null 2>&1 || { echo "[e2e] docker is not on your PATH." >&2; exit 1; }

if [ $# -ge 1 ]; then
  scenarios=("$1/tests/e2e/scenario.sh")
  [ -f "${scenarios[0]}" ] || { echo "[e2e] $1 has no tests/e2e/scenario.sh." >&2; exit 64; }
else
  scenarios=(*/tests/e2e/scenario.sh)
fi

ran=()
failed=()
for scenario in "${scenarios[@]}"; do
  [ -f "$scenario" ] || continue
  package=${scenario%%/*}
  echo ""
  say "=================== $package ==================="
  if bash "$scenario"; then
    ran+=("$package")
  else
    failed+=("$package")
    say "$package failed"
  fi
done

echo ""
say "cleaning up"
projects=$(
  docker ps -aq --filter "label=com.docker.compose.project" \
    --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | grep '^e2e-' | sort -u || true
)
for project in $projects; do
  docker compose -p "$project" --profile '*' down --volumes --remove-orphans >/dev/null 2>&1 || true
  survivors=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
  # shellcheck disable=SC2086
  [ -n "$survivors" ] && docker rm --force --volumes $survivors >/dev/null 2>&1 || true
done
docker network ls -q --filter 'name=^e2e-' 2>/dev/null | xargs -r docker network rm >/dev/null 2>&1 || true
rm -rf ./*/tests/e2e/.e2e

echo ""
if [ ${#failed[@]} -eq 0 ]; then
  say "${#ran[@]} scenario(s) green: ${ran[*]:-none}"
  exit 0
fi
say "failed: ${failed[*]}"
exit 1
