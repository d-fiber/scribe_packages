-- Copyright (C) 2026 Fiber
--
-- This Source Code Form is subject to the terms of the Mozilla Public License,
-- v. 2.0. If a copy of the MPL was not distributed with this file, You can
-- obtain one at https://mozilla.org/MPL/2.0/.
--
-- What you may do:
-- - Use this software for any purpose, including commercially, and build and
--   sell your own products on top of it.
-- - Change it, and create new works based on it.
-- - Distribute copies of it, with or without your changes.
-- - Combine it with files under any other licence, proprietary ones included,
--   and licence that larger work on your own terms.
--
-- What you must do in return:
-- - Keep this notice on every file you received it on.
-- - Publish, under these same terms, the source of every file covered by them
--   that you distribute, including the ones you changed, so that whoever
--   receives your version can obtain that source.
-- - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
--   trademarks may not be used to endorse or promote what you build, and this
--   licence grants no right to them.
--
-- Disclaimer:
-- AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
-- OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
-- WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
-- NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
-- INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
-- LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
-- OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
-- KIND OF LEGAL CLAIM.
--
-- This header is a summary written for convenience. Where it differs from the
-- LICENSE file, the LICENSE file governs.

create table if not exists public.__account_devices__ (
  id                  uuid                      primary key default gen_random_uuid(),
  account_id          uuid                      not null references public.__accounts__(id) on delete cascade,
  device_id           varchar(256)              not null,
  client              public.client_type        not null,
  os                  public.device_os          not null,
  model               varchar(255)              not null,
  app_version         text,
  is_physical_device  boolean                   not null,
  device_category     public.device_category    not null,
  hash                text,
  notification_token  text,
  ip                  varchar(45)               not null,
  city                varchar(100)              not null,
  country             varchar(100)              not null,
  location            public.location_coordinate,
  metadata            jsonb                     not null default '{}'::jsonb,
  trusted             boolean                   not null default false,
  created_at          bigint                    not null default (extract(epoch from now()) * 1000)::bigint,
  seen_at             bigint                    not null default (extract(epoch from now()) * 1000)::bigint,

  unique (account_id, device_id)
);

alter table public.__account_devices__ enable row level security;

grant select on public.__account_devices__ to authenticated;

revoke insert, update, delete on public.__account_devices__ from authenticated, anon;

create policy "account_devices_select" on public.__account_devices__
  for select using (auth.uid() = account_id);

create or replace function __account_devices_seen__()
returns trigger as $$
begin
  new.seen_at := (extract(epoch from now()) * 1000)::bigint;
  return new;
end;
$$ language plpgsql;

drop trigger if exists __account_devices_seen_trigger__ on public.__account_devices__;

create trigger __account_devices_seen_trigger__
  before update on public.__account_devices__
  for each row execute function __account_devices_seen__();
