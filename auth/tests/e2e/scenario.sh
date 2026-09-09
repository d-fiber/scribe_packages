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

SCENARIO=auth
FIXTURE=mini
. "$(dirname "$0")/support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the cluster and seeding what the auth package declares"
# shellcheck disable=SC2086
docker compose $COMPOSE up -d --build db provision >/dev/null 2>&1 \
  || fail "up refused the database and the provisioner."

wait_for "db is healthy" 300 healthy db || fail "db never turned healthy, it is $(state_of db)"
wait_for "provision ran the module SQL" 180 finished provision \
  || fail "provision never exited zero, it is $(state_of provision)"

tables=$(query_db "select count(*) from information_schema.tables where table_schema='public' and table_name in ('__accounts__','__account_devices__','__account_bans__','__pending_tokens__')")
[ "$tables" = "4" ] || fail "the package declares four tables and the cluster holds '$tables'."
say "the four tables the package declares are in the cluster"

types=$(query_db "select count(*) from pg_type where typname in ('client_type','device_os','device_category','location_coordinate')")
[ "$types" = "4" ] || fail "the package declares four types and the cluster holds '$types'."
say "the device types the package declares are defined"

role=$(query_db "select count(*) from pg_roles where rolname='supabase_auth_admin'")
[ "$role" = "1" ] || fail "the provisioning SQL did not create supabase_auth_admin."
say "the admin role the package provisions exists"

hidden=$(query_db "select count(*) from information_schema.role_table_grants where table_name='__accounts__' and grantee in ('anon','authenticated')")
[ "$hidden" = "0" ] || fail "__accounts__ is reachable by anon or authenticated, and it must not be."
say "the account table is closed to every role but the service one"

cron=$(query_db "select count(*) from cron.job where jobname='cleanup-pending-tokens'")
[ "$cron" = "1" ] || fail "the package schedules cleanup-pending-tokens and cron holds '$cron'."
say "the pending-token cleanup the package schedules is registered"

id=$(query_db "insert into public.__accounts__ (id, role) values (gen_random_uuid(), 'user') returning id")
case "$id" in
  *-*-*-*-*) ;;
  *) fail "an account row could not be written: $id" ;;
esac
say "an account row is written"

query_db "insert into public.__account_bans__ (account_id, reason) values ('$id', 'e2e')" >/dev/null
banned=$(query_db "select count(*) from public.__account_bans__ where account_id='$id'")
[ "$banned" = "1" ] || fail "the ban referencing the account was refused."
say "a ban references the account it belongs to"

query_db "delete from public.__accounts__ where id='$id'" >/dev/null
orphans=$(query_db "select count(*) from public.__account_bans__ where account_id='$id'")
[ "$orphans" = "0" ] || fail "deleting an account left '$orphans' bans behind."
say "deleting an account cascades to its bans"

say "green"
