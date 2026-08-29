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

SCENARIO=foundation
FIXTURE=mini
. "$(dirname "$0")/support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the datastores and the provisioner"
# shellcheck disable=SC2086
docker compose $COMPOSE up -d --build db redis nats provision >/dev/null 2>&1 \
  || fail "up refused the datastores."

for service in db redis nats; do
  wait_for "$service is healthy" 300 healthy "$service" \
    || fail "$service never turned healthy, it is $(state_of $service)"
done
wait_for "provision ran the base SQL" 180 finished provision \
  || fail "provision never exited zero, it is $(state_of provision)"

exts=$(query_db "select count(*) from pg_extension where extname in ('pg_cron','pgcrypto')")
[ "$exts" = "2" ] || fail "foundation opens pg_cron and pgcrypto, and the cluster holds '$exts'."
say "the two extensions foundation opens are installed"

tables=$(query_db "select count(*) from information_schema.tables where table_schema='public' and table_name in ('__trigger_sources__','__trigger_events__')")
[ "$tables" = "2" ] || fail "foundation declares two trigger tables and the cluster holds '$tables'."
say "the trigger tables foundation declares are in the cluster"

fn=$(query_db "select count(*) from pg_proc where proname='log_table_change'")
[ "$fn" = "1" ] || fail "foundation's log_table_change function is not there."
say "the trigger function foundation declares is defined"

# shellcheck disable=SC2086
pong=$(docker compose $COMPOSE exec -T redis redis-cli -a "$(grep '^REDIS_PASSWORD=' "$WORK/.env" | cut -d= -f2-)" ping 2>/dev/null | tr -d '[:space:]')
[ "$pong" = "PONG" ] || fail "redis did not answer PING, it said '$pong'."
say "redis answers on the credentials the fixture set"

# shellcheck disable=SC2086
varz=$(docker compose $COMPOSE exec -T nats wget -q -O - http://localhost:8222/varz 2>/dev/null || true)
case "$varz" in
  *'"server_id"'*) ;;
  *) fail "nats did not answer its own monitoring endpoint." ;;
esac
say "nats answers its monitoring endpoint"

say "green"
