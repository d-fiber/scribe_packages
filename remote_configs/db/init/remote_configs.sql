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

create table if not exists public.__remote_configs__ (
  name       text primary key,
  value      jsonb not null,
  created_at bigint not null,
  updated_at bigint not null,
  expires_at bigint
);

alter table public.__remote_configs__ enable row level security;

revoke all on public.__remote_configs__ from authenticated, anon;

create or replace function public.__remote_configs_touch__()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if tg_op = 'INSERT' then
    new.created_at := now_ms;
  end if;
  new.updated_at := now_ms;
  return new;
end;
$$;

drop trigger if exists __remote_configs_touch__ on public.__remote_configs__;

create trigger __remote_configs_touch__
  before insert or update on public.__remote_configs__
  for each row execute function public.__remote_configs_touch__();
