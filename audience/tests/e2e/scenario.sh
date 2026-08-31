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

SCENARIO=audience
FIXTURE=mini
. "$(dirname "$0")/support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the cluster and seeding what the audience package declares"
# shellcheck disable=SC2086
docker compose $COMPOSE up -d --build db provision >/dev/null 2>&1 \
  || fail "up refused the database and the provisioner."

wait_for "db is healthy" 300 healthy db || fail "db never turned healthy, it is $(state_of db)"
wait_for "provision ran the module SQL" 180 finished provision \
  || fail "provision never exited zero, it is $(state_of provision)"

table=$(query_db "select count(*) from information_schema.tables where table_schema='public' and table_name='__audiences__'")
[ "$table" = "1" ] || fail "the package declares __audiences__ and the cluster holds '$table'."
say "the table the package declares is in the cluster"

partitioned=$(query_db "select count(*) from pg_partitioned_table pt join pg_class c on c.oid = pt.partrelid where c.relname='__audiences__'")
[ "$partitioned" = "1" ] || fail "__audiences__ is expected to be partitioned by feature, and pg_partitioned_table holds '$partitioned'."
say "__audiences__ is partitioned"

default_partition=$(query_db "select count(*) from pg_inherits i join pg_class parent on parent.oid = i.inhparent join pg_class child on child.oid = i.inhrelid where parent.relname='__audiences__' and child.relname='__audiences_default__'")
[ "$default_partition" = "1" ] || fail "the default partition __audiences_default__ is not attached, pg_inherits holds '$default_partition'."
say "the default partition catches a feature nobody promoted"

hidden=$(query_db "select count(*) from information_schema.role_table_grants where table_name='__audiences__' and grantee in ('anon','authenticated')")
[ "$hidden" = "0" ] || fail "__audiences__ is reachable by anon or authenticated, and it must not be."
say "the table is closed to every role but the service one"

declarations=$(query_db "select count(*) from information_schema.tables where table_schema='public' and table_name='__audience_declarations__'")
[ "$declarations" = "1" ] || fail "the package declares __audience_declarations__ and the cluster holds '$declarations'."
say "the durable declaration registry is in the cluster"

declarations_hidden=$(query_db "select count(*) from information_schema.role_table_grants where table_name='__audience_declarations__' and grantee in ('anon','authenticated')")
[ "$declarations_hidden" = "0" ] || fail "__audience_declarations__ is reachable by anon or authenticated, and it must not be."
say "the registry is closed to every role but the service one"

query_db "insert into public.__audiences__ (feature, audience, member, created_at) values ('e2e', 'e2e:banned', 'm1', 0)" >/dev/null
stamped=$(query_db "select case when created_at > 0 then 'yes' else 'no' end from public.__audiences__ where feature='e2e' and audience='e2e:banned' and member='m1'")
[ "$stamped" = "yes" ] || fail "the insert trigger did not stamp created_at, it left '$stamped'."
say "the trigger stamps created_at on the way in"

dup=$(query_db "insert into public.__audiences__ (feature, audience, member, created_at) values ('e2e', 'e2e:banned', 'm1', 0) on conflict (feature, audience, member) do nothing returning member")
[ -z "$dup" ] || fail "the primary key let the same pair in twice."
say "the primary key holds a member once per feature and audience"

routed=$(query_db "select tableoid::regclass::text = '__audiences_default__' from public.__audiences__ where feature='e2e' and audience='e2e:banned' and member='m1'")
[ "$routed" = "t" ] || fail "a row of an unpromoted feature did not land in the default partition, it landed in '$routed'."
say "an unpromoted feature routes to the default partition"

sibling=$(query_db "select count(*) from public.__audiences__ where feature='e2e' and audience='e2e:editors:p1'")
query_db "insert into public.__audiences__ (feature, audience, member, created_at) values ('e2e', 'e2e:editors:p1', 'm2', 0)" >/dev/null
query_db "delete from public.__audiences__ where feature='e2e' and audience='e2e:banned'" >/dev/null
kept=$(query_db "select count(*) from public.__audiences__ where feature='e2e' and audience='e2e:editors:p1'")
[ "$kept" = "$((sibling + 1))" ] || fail "emptying one audience touched another."
say "emptying an audience leaves its siblings alone"

query_db "insert into public.__audience_declarations__ (feature, name, owner, created_at) values ('e2e', 'editors', 'service-a', 0)" >/dev/null
claim_stamped=$(query_db "select case when created_at > 0 then 'yes' else 'no' end from public.__audience_declarations__ where feature='e2e' and name='editors'")
[ "$claim_stamped" = "yes" ] || fail "the registry's insert trigger did not stamp created_at, it left '$claim_stamped'."
say "the registry stamps created_at on the way in"

second_owner=$(query_db "insert into public.__audience_declarations__ (feature, name, owner, created_at) values ('e2e', 'editors', 'service-b', 0) on conflict (feature, name) do nothing returning owner")
[ -z "$second_owner" ] || fail "the registry let two different owners claim the same (feature, name) pair."
say "the registry's primary key refuses a second owner claiming the same pair"

say "green"
