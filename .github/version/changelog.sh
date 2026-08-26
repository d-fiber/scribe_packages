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
SCOPE="changelog"

ORDER="BREAKING SECURITY DEV BUGFIX PERF REVERT REFACTO DOC TEST CI CHORE"
BOOKKEEPING='/CHANGELOG\.md$'

say() {
  echo "[$SCOPE] $1"
}

cd "$ROOT"

package="${1:-}"

if [ -z "$package" ]; then
  echo "[$SCOPE] Name the package this section is for, as its directory." >&2
  exit 1
fi

[ -f "$package/package.yaml" ] || {
  echo "[$SCOPE] $package holds no package.yaml, so it is not a package." >&2
  exit 1
}

version=$(awk '/^version:/ { print $2; exit }' "$package/package.yaml")
previous=$(git tag --list "$package-v*" --sort=-v:refname | head -1)

if [ "$previous" = "$package-v$version" ]; then
  say "$package-v$version is already the last tag, so its section is already written"
  exit 0
fi

if [ -z "$previous" ]; then
  say "$package has never been tagged, so this section covers everything up to here"
  range=""
else
  say "reading the commits between $previous and here that touched $package"
  range="$previous..HEAD"
fi

subjects=$(mktemp)
trap 'rm -f "$subjects"' EXIT

for commit in $(git rev-list ${range:-HEAD} -- "$package"); do
  parents=$(git rev-list --parents -n 1 "$commit" | wc -w)
  [ "$parents" -le 2 ] || continue

  touched=$(git show --name-only --format= "$commit" -- "$package" | grep -v '^$' || true)
  [ -n "$(printf '%s\n' "$touched" | grep -vE "$BOOKKEEPING" || true)" ] || continue

  printf '%s\t%s\n' "$(git log -1 --format=%s "$commit")" "${commit:0:7}" >> "$subjects"
done

if [ ! -s "$subjects" ]; then
  say "no commit to account for, so nothing is written"
  exit 0
fi

section=$(mktemp)
trap 'rm -f "$subjects" "$section"' EXIT

{
  echo "## $version"

  for tag in $ORDER; do
    held=$(grep -c "^\[$tag\]: " "$subjects" || true)
    [ "$held" -gt 0 ] || continue

    echo ""
    echo "$tag:"
    echo ""

    while IFS=$'\t' read -r subject commit; do
      case "$subject" in
        "[$tag]: "*) echo "- $subject ($commit)" ;;
      esac
    done < "$subjects"
  done
} > "$section"

written=$(mktemp)
trap 'rm -f "$subjects" "$section" "$written"' EXIT

awk -v version="## $version" -v section="$section" '
  BEGIN { inside = 0 }
  $0 == version { inside = 1; while ((getline line < section) > 0) print line; next }
  inside && /^## / { inside = 0 }
  inside { next }
  { print }
  END { }
' "$package/CHANGELOG.md" > "$written"

if ! grep -q "^## $version$" "$written"; then
  awk -v section="$section" '
    NR == 1 && /^# / { print; print ""; while ((getline line < section) > 0) print line; print ""; next }
    NR == 2 && $0 == "" { next }
    { print }
  ' "$package/CHANGELOG.md" > "$written"
fi

if cmp -s "$written" "$package/CHANGELOG.md"; then
  say "$package/CHANGELOG.md already says this"
  exit 0
fi

cp "$written" "$package/CHANGELOG.md"
say "wrote $package $version, $(grep -c '^- ' "$section") commits under $(grep -c ':$' "$section") headings"
