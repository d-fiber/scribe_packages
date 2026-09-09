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

# Runs every package's tests: puts the packages into a scribe checkout and runs
# the framework's own type check, lint and suite against them. This is what a
# package resolves through, so there is no other way to check one from here.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SCRIBE="${SCRIBE_CHECKOUT:-${1:-$ROOT/../scribe}}"

say() { echo "[test] $1"; }
fail() { echo "[test] $1" >&2; exit 1; }

command -v deno >/dev/null 2>&1 || fail "deno is not on your PATH. Install Deno 2, then run this again."
command -v rsync >/dev/null 2>&1 || fail "rsync is not on your PATH."
[ -d "$SCRIBE/engine" ] || fail "$SCRIBE is not a scribe checkout. Name one, or set SCRIBE_CHECKOUT."

say "checking the version"
bash "$ROOT/.github/version/check.sh"

say "copying the packages into $SCRIBE/packages"
bash "$ROOT/.github/sync/copy.sh" "$SCRIBE/packages"

cd "$SCRIBE"
say "type checking the framework with them"
deno task check
say "linting"
deno lint
say "running the suite"
deno task test

echo ""
say "green: the framework type checks with these packages and its suite passes."
say "the packages you just checked are the ones now in $SCRIBE, so commit or discard them there."
