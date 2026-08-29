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

SCENARIO=remote_configs
FIXTURE=mini
. "$(dirname "$0")/support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the cluster and seeding what the remote_configs package declares"
# shellcheck disable=SC2086
docker compose $COMPOSE up -d --build db provision >/dev/null 2>&1 \
  || fail "up refused the database and the provisioner."

wait_for "db is healthy" 300 healthy db || fail "db never turned healthy, it is $(state_of db)"
wait_for "provision ran the module SQL" 180 finished provision \
  || fail "provision never exited zero, it is $(state_of provision)"

table=$(query_db "select count(*) from information_schema.tables where table_schema='public' and table_name='__remote_configs__'")
[ "$table" = "1" ] || fail "the package declares __remote_configs__ and the cluster holds '$table'."
say "the table the package declares is in the cluster"

hidden=$(query_db "select count(*) from information_schema.role_table_grants where table_name='__remote_configs__' and grantee in ('anon','authenticated')")
[ "$hidden" = "0" ] || fail "__remote_configs__ is reachable by anon or authenticated, and it must not be."
say "the table is closed to every role but the service one"

query_db "insert into public.__remote_configs__ (name, value, created_at, updated_at) values ('e2e.flag', 'true'::jsonb, 0, 0)" >/dev/null
made=$(query_db "select case when created_at > 0 and updated_at > 0 then 'yes' else 'no' end from public.__remote_configs__ where name='e2e.flag'")
[ "$made" = "yes" ] || fail "the insert trigger did not stamp the timestamps, it left '$made'."
say "the trigger stamps created_at and updated_at on the way in"

sleep 1
query_db "update public.__remote_configs__ set value='false'::jsonb where name='e2e.flag'" >/dev/null
moved=$(query_db "select case when updated_at > created_at then 'yes' else 'no' end from public.__remote_configs__ where name='e2e.flag'")
[ "$moved" = "yes" ] || fail "an update left updated_at where it was."
say "an update moves updated_at and leaves created_at"

value=$(query_db "select value from public.__remote_configs__ where name='e2e.flag'")
[ "$value" = "false" ] || fail "the value did not come back as it was written: '$value'"
say "the value round-trips through jsonb"

say "green"
