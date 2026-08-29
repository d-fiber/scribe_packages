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

SCENARIO=dynamic_links
FIXTURE=mini
. "$(dirname "$0")/support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the cluster and seeding what the dynamic_links package declares"
# shellcheck disable=SC2086
docker compose $COMPOSE up -d --build db provision >/dev/null 2>&1 \
  || fail "up refused the database and the provisioner."

wait_for "db is healthy" 300 healthy db || fail "db never turned healthy, it is $(state_of db)"
wait_for "provision ran the module SQL" 180 finished provision \
  || fail "provision never exited zero, it is $(state_of provision)"

tables=$(query_db "select count(*) from information_schema.tables where table_schema='public' and table_name in ('__dynamic_links__','__dynamic_link_statistics__')")
[ "$tables" = "2" ] || fail "the package declares two tables and the cluster holds '$tables'."
say "the two tables the package declares are in the cluster"

crons=$(query_db "select count(*) from cron.job where jobname in ('dynamic-links-expire','dynamic-links-prune-statistics')")
[ "$crons" = "2" ] || fail "the package schedules two cron jobs and cron holds '$crons'."
say "the two cron jobs the package schedules are registered"

link_id=$(query_db "insert into public.__dynamic_links__ (slug, payload, created_at, updated_at) values ('e2e-slug', '{\"to\":\"https://example.com\"}'::jsonb, 0, 0) returning link_id")
[ -n "$link_id" ] || fail "the link insert was refused."
stamped=$(query_db "select case when created_at > 0 then 'yes' else 'no' end from public.__dynamic_links__ where link_id=$link_id")
[ "$stamped" = "yes" ] || fail "the insert trigger did not stamp created_at."
say "a link is written and its created_at is stamped"

dup=$(query_db "insert into public.__dynamic_links__ (slug, payload, created_at, updated_at) values ('e2e-slug', '{}'::jsonb, 0, 0) on conflict do nothing returning link_id")
[ -z "$dup" ] || fail "the unique index let one slug in twice."
say "a slug is unique"

query_db "insert into public.__dynamic_link_statistics__ (link_id, outcome) values ($link_id, 'served')" >/dev/null
query_db "delete from public.__dynamic_links__ where link_id=$link_id" >/dev/null
orphans=$(query_db "select count(*) from public.__dynamic_link_statistics__ where link_id=$link_id")
[ "$orphans" = "0" ] || fail "deleting a link left '$orphans' orphaned statistics."
say "deleting a link cascades to its statistics"

bad=$(query_db "insert into public.__dynamic_link_statistics__ (link_id, outcome) values ($link_id, 'not-a-thing') returning statistic_id" 2>&1 || true)
case "$bad" in
  *statistic_id*) fail "the outcome check let an unknown value through." ;;
esac
say "the outcome check refuses a value it does not name"

say "green"
