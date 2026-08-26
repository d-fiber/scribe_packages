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

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCOPE="version"

say() {
  echo "[$SCOPE] $1"
}

fail() {
  echo "[$SCOPE] $1" >&2
  exit 1
}

cd "$ROOT"

version_of() {
  awk '/^version:/ { print $2; exit }' "$1/package.yaml"
}

held=0
moving=0

for manifest in */package.yaml; do
  package=$(dirname "$manifest")
  version=$(version_of "$package")

  case "$version" in
    *.*.*) ;;
    *) fail "$package/package.yaml holds \"version: $version\", which is not three numbers." ;;
  esac

  tag="$package-v$version"

  if ! git rev-parse "$tag" >/dev/null 2>&1; then
    say "$package $version is free, and this commit is what it would name"
    moving=$((moving + 1))
    continue
  fi

  # The changelog is written by the release itself, so a change to it is not a
  # change to the package. Counting it would demand a version for the commit
  # that wrote the section, whose own section would then demand another.
  if git diff --quiet "$tag" HEAD -- "$package" ":(exclude)$package/CHANGELOG.md"; then
    say "$package $version is already named, and nothing in it has changed since"
    held=$((held + 1))
    continue
  fi

  echo "[$SCOPE] $tag is on $(git rev-parse --short "$tag^{commit}") and $package has changed since." >&2
  echo "" >&2
  echo "A tag never moves, so the change needs a version of its own." >&2
  echo "Raise version: in $package/package.yaml and run this again." >&2
  exit 1
done

say "$moving package(s) to name, $held already named"
