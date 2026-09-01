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

nats_handshake() {
  # shellcheck disable=SC2086
  docker compose $COMPOSE exec -T nats sh -c \
    "printf 'CONNECT {\"auth_token\":\"$1\",\"verbose\":false}\r\nPING\r\n' | nc -w 2 localhost 4222" 2>/dev/null
}

bad_auth=$(nats_handshake "wrong-token")
case "$bad_auth" in
  *'-ERR'*) ;;
  *) fail "nats accepted a wrong token: '$bad_auth'." ;;
esac
say "nats refuses a wrong token"

nats_password=$(grep '^NATS_PASSWORD=' "$WORK/.env" | cut -d= -f2-)
good_auth=$(nats_handshake "$nats_password")
case "$good_auth" in
  *PONG*) ;;
  *) fail "nats refused the fixture's own token: '$good_auth'." ;;
esac
say "nats accepts the token the fixture set"

attached=$(query_db "select count(*) from pg_trigger where tgname = '__scribe_table_change__' and tgrelid = 'public.items'::regclass")
[ "$attached" = "1" ] || fail "public.items has no change trigger attached, and the cluster holds '$attached'."
say "the create-table event trigger attached foundation's function to the fixture's own table"

query_db "insert into public.__trigger_sources__ (table_name, key_column) values ('items', 'item_id') on conflict (table_name) do update set key_column = excluded.key_column" >/dev/null
say "items is registered as a trigger source, the way a declaration would register it"

events_before=$(query_db "select count(*) from public.__trigger_events__ where table_name = 'items'")
query_db "insert into public.items (name) values ('e2e-trigger-single')" >/dev/null
events_after=$(query_db "select count(*) from public.__trigger_events__ where table_name = 'items'")
[ "$events_after" -gt "$events_before" ] || fail "one insert into a registered table produced no trigger event."

op=$(query_db "select op from public.__trigger_events__ where table_name = 'items' order by id desc limit 1")
[ "$op" = "insert" ] || fail "the event the trigger wrote names the op '$op' instead of 'insert'."
say "log_table_change fired on a real write and recorded it"

say "starting 20 concurrent writes to the same table"
events_before=$(query_db "select count(*) from public.__trigger_events__ where table_name = 'items'")
for i in $(seq 1 20); do
  query_db "insert into public.items (name) values ('e2e-trigger-load-$i')" >/dev/null &
done
wait
events_after=$(query_db "select count(*) from public.__trigger_events__ where table_name = 'items'")
gained=$((events_after - events_before))
[ "$gained" -ge 20 ] || fail "20 concurrent inserts produced $gained trigger events, at least 20 were expected."
say "20 concurrent writes produced $gained trigger events, none dropped"

say "starting 20 concurrent claims on the same key"
redis_password=$(grep '^REDIS_PASSWORD=' "$WORK/.env" | cut -d= -f2-)
claim_key="e2e:claim:$$"
claim_results=$(mktemp -d)
for i in $(seq 1 20); do
  ( # shellcheck disable=SC2086
    docker compose $COMPOSE exec -T redis redis-cli -a "$redis_password" --no-auth-warning \
      set "$claim_key" "$i" NX EX 30 2>/dev/null | tr -d '[:space:]' > "$claim_results/$i"
  ) &
done
wait
wins=$(grep -l '^OK$' "$claim_results"/* 2>/dev/null | wc -l | tr -d '[:space:]')
rm -rf "$claim_results"
[ "$wins" = "1" ] || fail "20 concurrent claims on one key produced $wins winners, expected exactly 1."
say "20 concurrent claims on one key produced exactly one winner"

say "green"
