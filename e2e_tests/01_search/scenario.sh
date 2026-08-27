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

set -e

SCENARIO=01_search
FIXTURE=mini
. "$(dirname "$0")/../support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the cluster, the gateway and what the search package brings"
# shellcheck disable=SC2086
docker compose $COMPOSE --profile search up -d --build db kong opensearch >/dev/null 2>&1 \
  || fail "up refused the search services."

for service in db kong opensearch; do
  wait_for "$service is healthy" 600 healthy "$service" \
    || fail "$service never turned healthy, it is $(state_of $service)"
done

tables=$(query_db "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('__search_indices__', '__search_sources__', '__search_outbox__')")
[ "$tables" = "3" ] || fail "the package declares three tables and the cluster holds '$tables'."
say "the three tables the package declares are in the cluster"

health=$(http_body_in data "http://opensearch:9200/_cluster/health")
case "$health" in
  *'"status":"green"'*|*'"status":"yellow"'*) ;;
  *) fail "the index answered a health nobody can work with: $health" ;;
esac
say "the index answers its own health from the app network"

answers_in data "creating an index" 200 -X PUT \
  -H "content-type: application/json" \
  --data-binary '{"mappings":{"properties":{"label":{"type":"text"}}}}' \
  "http://opensearch:9200/e2e_probe"

answers_in data "writing a document" 201 -X PUT \
  -H "content-type: application/json" \
  --data-binary '{"label":"rosa coffee"}' \
  "http://opensearch:9200/e2e_probe/_doc/1?refresh=true"

found=$(http_body_in data -H "content-type: application/json" \
  --data-binary '{"query":{"match":{"label":"rosa"}}}' \
  "http://opensearch:9200/e2e_probe/_search")
case "$found" in
  *'"_id":"1"'*) ;;
  *) fail "the document written a moment ago is not searchable: $found" ;;
esac
say "a document written is a document the query finds"

answers_in data "a query on an index nobody created" 404 \
  "http://opensearch:9200/e2e_never_written/_search"

answers "the index through the public gateway" 404 \
  "http://kong:8000/e2e_probe/_search"
say "the index is not reachable from outside, only the app network holds it"

answers_in data "dropping the index" 200 -X DELETE "http://opensearch:9200/e2e_probe"

say "green"
