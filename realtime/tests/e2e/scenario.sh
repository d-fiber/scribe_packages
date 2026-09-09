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

SCENARIO=realtime
FIXTURE=mini
. "$(dirname "$0")/support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the cluster, the gateway and what the realtime package brings"
# shellcheck disable=SC2086
docker compose $COMPOSE --profile realtime up -d --build db kong realtime realtime-init >/dev/null 2>&1 \
  || fail "up refused the realtime services."

for service in db kong realtime; do
  wait_for "$service is healthy" 600 healthy "$service" \
    || fail "$service never turned healthy, it is $(state_of $service)"
done

wait_for "realtime-init seeded the schema" 180 finished realtime-init \
  || fail "realtime-init never exited zero, it is $(state_of realtime-init)"

tenants=$(query_db "select count(*) from _realtime.tenants where external_id = 'realtime-dev'")
[ "$tenants" = "1" ] || fail "the package declares one tenant and the cluster holds '$tenants'."
say "the tenant the package declares is in the cluster"

anon=$(grep '^ANON_KEY=' "$WORK/.env" | cut -d= -f2-)
[ -n "$anon" ] || fail "the fixture names no anonymous key, so nothing can subscribe."

answers "a socket with no key" 401 \
  "http://kong:8000/realtime/v1/websocket?vsn=1.0.0"

socket="ws://kong:8000/realtime/v1/websocket?apikey=$anon&vsn=1.0.0"
joined=$(docker run --rm --network "${PROJECT}_app" --entrypoint deno \
  "$DENO_IMAGE" eval --quiet "
const socket = new WebSocket('$socket');
const answer = await new Promise((resolve) => {
  const give = (what) => { try { socket.close(); } catch { /* already closing */ } resolve(what); };
  setTimeout(() => give('timed out'), 20000);
  socket.onerror = () => give('refused');
  socket.onopen = () => socket.send(JSON.stringify({
    topic: 'realtime:e2e', event: 'phx_join', ref: '1',
    payload: { config: { broadcast: { self: true } } },
  }));
  socket.onmessage = (message) => {
    const frame = JSON.parse(message.data);
    if (frame.event === 'phx_reply') give(frame.payload?.status ?? 'no status');
  };
});
console.log(answer);
" 2>/dev/null | tail -1)

[ "$joined" = "ok" ] || fail "the socket did not join the channel, it answered '$joined'."
say "a socket opened with a key joins a channel through the gateway"

say "green"
