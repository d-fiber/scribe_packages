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

SCENARIO=storage
FIXTURE=mini
. "$(dirname "$0")/support/stack.sh"

trap teardown EXIT
prepare_stack

say "starting the cluster and what the storage package brings"
# shellcheck disable=SC2086
docker compose $COMPOSE up -d --build db kong storage imgproxy storage-init >/dev/null 2>&1 \
  || fail "up refused the storage services."

for service in db kong storage imgproxy; do
  wait_for "$service is healthy" 420 healthy "$service" \
    || fail "$service never turned healthy, it is $(state_of $service)"
done

wait_for "storage-init seeded the schema" 120 finished storage-init \
  || fail "storage-init never exited zero, it is $(state_of storage-init)"

buckets=$(query_db "select count(*) from storage.buckets where id in ('public_bucket', 'private_bucket')")
[ "$buckets" = "2" ] || fail "the package declares two buckets and the cluster holds '$buckets'."
say "the two buckets the package declares are in the cluster"

key=$(grep '^SERVICE_KEY=' "$WORK/.env" | cut -d= -f2-)
[ -n "$key" ] || fail "the fixture names no service key, so nothing can be uploaded."

sent=$(http_body -X POST \
  -H "authorization: Bearer $key" \
  -H "content-type: text/plain" \
  --data-binary "written by the scenario" \
  "http://storage:5000/object/public_bucket/probe.txt")
case "$sent" in
  *probe.txt*) ;;
  *) fail "the upload did not come back with the object it wrote: $sent" ;;
esac
say "an object is uploaded the way the engine writes one"

stored=$(query_db "select count(*) from storage.objects where name = 'probe.txt'")
[ "$stored" = "1" ] || fail "storage reported the write and the cluster holds '$stored' rows."
say "the object storage reported is the row the cluster holds"

read_back=$(http_body -H "authorization: Bearer $key" \
  "http://storage:5000/object/public_bucket/probe.txt")
[ "$read_back" = "written by the scenario" ] \
  || fail "the object came back changed: '$read_back'"
say "the bytes come back as they went in"

missing=$(http_code -H "authorization: Bearer $key" \
  "http://storage:5000/object/public_bucket/nothing-here.txt")
[ "$missing" = "400" ] || [ "$missing" = "404" ] \
  || fail "an object that was never written answered $missing."
say "an object nobody wrote is refused, so a read proves something"

png=iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkS5NAAAAAElFTkSuQmCC
docker run --rm --network "${PROJECT}_app" --entrypoint sh "$CURL_IMAGE" -c \
  "echo $png | base64 -d | curl -sf -X POST -H 'authorization: Bearer $key' \
     -H 'content-type: image/png' --data-binary @- \
     http://storage:5000/object/public_bucket/probe.png" >/dev/null 2>&1 \
  || fail "the four-pixel image was refused on upload."
say "an image is uploaded, so the derivation has something to work on"

derived=$(http_code -H "authorization: Bearer $key" \
  "http://storage:5000/render/image/public/public_bucket/probe.png?width=2")
[ "$derived" = "200" ] || fail "imgproxy answered $derived instead of deriving the image."

kind=$(http_body -o /dev/null -w '%{content_type}' -H "authorization: Bearer $key" \
  "http://storage:5000/render/image/public/public_bucket/probe.png?width=2")
case "$kind" in
  image/*) ;;
  *) fail "the derivation answered 200 with '$kind', which is not an image." ;;
esac
say "imgproxy derives the image and answers $kind"

answers "a public object read through the gateway, with no key" 200 \
  "http://kong:8000/storage/v1/object/public/public_bucket/probe.txt"

answers "the same object written through the gateway" 404 \
  -X POST --data-binary "not allowed" \
  "http://kong:8000/storage/v1/object/public/public_bucket/probe.txt"

answers "the private bucket with no token" 401 \
  "http://kong:8000/storage/v1/object/private_bucket/probe.txt"

say "green"
