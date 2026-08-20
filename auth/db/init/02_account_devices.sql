-- Copyright (C) 2026 Fiber
--
-- This file is part of scribe and is made available under the PolyForm Shield
-- License 1.0.0. The full terms are in the LICENSE file at the root of this
-- repository, and at https://polyformproject.org/licenses/shield/1.0.0
--
-- What you may do:
-- - Use this software for any purpose, including commercially, and build and
--   sell your own products on top of it.
-- - Change it, and create new works based on it.
-- - Distribute copies of it, with or without your changes.
--
-- The one thing you may not do:
-- - Use it to provide any product that competes with scribe, or with any
--   product Fiber or its affiliates provide using scribe. Products compete
--   even when they are offered free of charge, through a different kind of
--   interface, or for a different technical platform.
--
-- If you pass this software on:
-- - Anyone who receives any part of it from you must also receive these terms,
--   or the URL above, together with the "Required Notice" line carried by the
--   LICENSE file.
--
-- Disclaimer:
-- AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
-- CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
-- OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
-- LEGAL CLAIM.
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
