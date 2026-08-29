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

set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
PACKAGES=$(cd "$HERE/../../.." && pwd)
FRAMEWORK=${FRAMEWORK:-$PACKAGES/../scribe}
TOOLS=${TOOLS:-$PACKAGES/../scribe_tools}
OUT=$HERE/.e2e
FIXTURE=${FIXTURE:-mini}

say() { echo "[$SCENARIO] $1"; }

fail() {
  echo "[$SCENARIO] $1" >&2
  if [ -n "${COMPOSE:-}" ]; then
    echo "" >&2
    # shellcheck disable=SC2086
    docker compose $COMPOSE ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Health}}' 2>/dev/null | sed 's/^/  /' >&2
    for service in $(docker compose $COMPOSE ps --all --services 2>/dev/null); do
      echo "" >&2
      echo "  --- $service" >&2
      # shellcheck disable=SC2086
      docker compose $COMPOSE logs --tail 20 --no-log-prefix "$service" 2>&1 | sed 's/^/    /' >&2
    done
  fi
  exit 1
}

stale_cli() {
  [ -x "$TOOLS/out/scribe" ] || return 0
  [ -n "$(find "$TOOLS/lib" "$TOOLS/bin" "$TOOLS/templates" \
    -type f -newer "$TOOLS/out/scribe" -print -quit)" ]
}

build_cli() {
  say "building the CLI on the templates it ships"
  ( cd "$TOOLS" && dart pub get >/dev/null && mkdir -p out && dart compile exe bin/scribe.dart -o out/scribe >/dev/null )
  rm -rf "$TOOLS/out/templates" && cp -R "$TOOLS/templates" "$TOOLS/out/templates"
}

prepare_stack() {
  WORK=$OUT/$FIXTURE
  stale_cli && build_cli

  mkdir -p "$OUT"
  rm -rf "$WORK"
  cp -R "$HERE/fixtures/$FIXTURE" "$WORK"
  ln -sfn "$FRAMEWORK" "$WORK/scribe"

  render_arguments="--dry-run"
  [ -n "${TARGET:-}" ] && render_arguments="$render_arguments --target $TARGET"
  [ -n "${WORKER:-}" ] && render_arguments="$render_arguments --worker"

  # shellcheck disable=SC2086
  STACK=$( cd "$WORK" && SCRIBE_STACK_HOME="$OUT/cache" "$TOOLS/out/scribe" run $render_arguments \
    | awk '/^Assembled /{ print $NF }' )
  [ -n "$STACK" ] || fail "the CLI wrote no stack."

  PROJECT="e2e-$SCENARIO"
  COMPOSE="--project-directory $WORK -p $PROJECT"
  for document in "$STACK"/*.yaml; do COMPOSE="$COMPOSE -f $document"; done
}

services_running() {
  # shellcheck disable=SC2086
  docker compose $COMPOSE ps --format '{{.Service}}' 2>/dev/null | sort -u | tr '\n' ' '
}

container_of() {
  docker ps --all --filter "label=com.docker.compose.project=$1" \
    --filter "label=com.docker.compose.service=$2" --format '{{.ID}}' | head -1
}

exit_code_of() {
  id=$(container_of "$PROJECT" "$1")
  [ -n "$id" ] || { echo "absent"; return 0; }
  docker inspect "$id" --format '{{.State.ExitCode}}'
}

inspect_of() {
  id=$(container_of "$PROJECT" "$1")
  [ -n "$id" ] || { echo ""; return 0; }
  docker inspect "$id" --format "$2"
}

query_db() {
  # shellcheck disable=SC2086
  docker compose $COMPOSE exec -T db su postgres -c "psql -tAc \"$1\"" 2>/dev/null | tr -d '[:space:]'
}

CURL_IMAGE=curlimages/curl:8.11.1
DENO_IMAGE=denoland/deno:2.7.14

http_code_in() {
  network=$1
  shift
  docker run --rm --network "${PROJECT}_$network" "$CURL_IMAGE" \
    -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" 2>/dev/null
}

http_body_in() {
  network=$1
  shift
  docker run --rm --network "${PROJECT}_$network" "$CURL_IMAGE" \
    -s --max-time 10 "$@" 2>/dev/null
}

http_code() {
  http_code_in app "$@"
}

http_body() {
  http_body_in app "$@"
}

http_code_on_host() {
  docker run --rm --network host "$CURL_IMAGE" \
    -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $1" "http://localhost$2" 2>/dev/null
}

answers_in() {
  network=$1
  label=$2
  expected=$3
  shift 3
  got=$(http_code_in "$network" "$@")
  [ "$got" = "$expected" ] || fail "$label: expected $expected, got $got"
  say "$label answers $expected"
}

answers() {
  label=$1
  expected=$2
  shift 2
  answers_in app "$label" "$expected" "$@"
}

teardown() {
  if [ -n "${KEEP:-}" ]; then
    say "the stack is left up, KEEP is set"
    return 0
  fi

  [ -n "${COMPOSE:-}" ] || return 0

  # shellcheck disable=SC2086
  removal=$(docker compose $COMPOSE --profile '*' down --volumes --remove-orphans 2>&1) || true

  survivors=$(docker ps --all --quiet --filter "label=com.docker.compose.project=$PROJECT")
  [ -z "$survivors" ] && return 0

  echo "[$SCENARIO] the teardown left $PROJECT behind, the next scenario would start on a dirty host" >&2
  echo "$removal" | sed 's/^/    /' >&2
  # shellcheck disable=SC2086
  docker rm --force --volumes $survivors >/dev/null 2>&1 || true
}

wait_for() {
  label=$1; timeout=$2; shift 2
  waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if "$@" >/dev/null 2>&1; then
      say "$label after ${waited}s"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done

  return 1
}

state_of() {
  # shellcheck disable=SC2086
  docker compose $COMPOSE ps --all --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null \
    | awk -v s="$1" '$1 == s { print $2 (($3 == "" || $3 == "<nil>") ? "" : " (" $3 ")") }' \
    | head -1
}

healthy() {
  # shellcheck disable=SC2086
  [ "$(docker compose $COMPOSE ps "$1" --format '{{.Health}}' 2>/dev/null | head -1)" = healthy ]
}

finished() {
  id=$(container_of "$PROJECT" "$1")
  [ -n "$id" ] || return 1
  [ "$(docker inspect "$id" --format '{{.State.Status}} {{.State.ExitCode}}')" = "exited 0" ]
}
