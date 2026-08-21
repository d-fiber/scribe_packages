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

create table if not exists public.__dynamic_links__ (
  link_id    bigint primary key generated always as identity,
  slug       text not null unique,
  payload    jsonb not null,
  user_id    uuid,
  created_at bigint not null,
  updated_at bigint not null,
  expires_at bigint
);

create index if not exists __dynamic_links_user__
  on public.__dynamic_links__ (user_id)
  where user_id is not null;

create index if not exists __dynamic_links_expiry__
  on public.__dynamic_links__ (expires_at)
  where expires_at is not null;

create table if not exists public.__dynamic_link_statistics__ (
  statistic_id bigint primary key generated always as identity,
  link_id      bigint not null references public.__dynamic_links__(link_id) on delete cascade,
  created_at   bigint not null default (extract(epoch from now()) * 1000)::bigint,
  user_id      uuid,
  device_id    varchar(256),
  ip_address   text,
  user_agent   text,
  referer      text,
  outcome      text not null default 'served'
    check (outcome in ('served', 'redirected', 'opened_app', 'store_fallback', 'crawler')),
  platform     text
    check (platform is null or platform in ('ios', 'android', 'web'))
);

create index if not exists __dynamic_link_statistics_link__
  on public.__dynamic_link_statistics__ (link_id, created_at);

create index if not exists __dynamic_link_statistics_outcome__
  on public.__dynamic_link_statistics__ (link_id, outcome, created_at);

create index if not exists __dynamic_link_statistics_user__
  on public.__dynamic_link_statistics__ (user_id)
  where user_id is not null;

alter table public.__dynamic_links__ enable row level security;
alter table public.__dynamic_link_statistics__ enable row level security;

revoke all on public.__dynamic_links__ from authenticated, anon;
revoke all on public.__dynamic_link_statistics__ from authenticated, anon;

create or replace function public.__dynamic_links_touch__()
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

drop trigger if exists __dynamic_links_touch__ on public.__dynamic_links__;

create trigger __dynamic_links_touch__
  before insert or update on public.__dynamic_links__
  for each row execute function public.__dynamic_links_touch__();

create or replace function public.__dynamic_links_prune_statistics__(
  p_days integer default 30,
  p_rows bigint default 10000000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff bigint := (extract(epoch from now() - make_interval(days => p_days)) * 1000)::bigint;
  v_removed integer;
begin
  delete from public.__dynamic_link_statistics__
  where created_at < v_cutoff;

  get diagnostics v_removed = row_count;

  delete from public.__dynamic_link_statistics__
  where statistic_id in (
    select statistic_id
    from   public.__dynamic_link_statistics__
    order  by statistic_id desc
    offset p_rows
  );

  return v_removed;
end;
$$;

select cron.schedule(
  'dynamic-links-expire',
  '*/10 * * * *',
  'DELETE FROM public.__dynamic_links__ WHERE expires_at IS NOT NULL AND expires_at < (extract(epoch from now()) * 1000)::bigint'
);

select cron.schedule(
  'dynamic-links-prune-statistics',
  '0 3 * * *',
  'SELECT public.__dynamic_links_prune_statistics__()'
);

