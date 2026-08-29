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

create table if not exists public.__realtime_channels__ (
  channel text primary key,
  listen  text not null default 'granted'
    check (listen in ('granted', 'authenticated', 'public'))
);

create table if not exists public.__realtime_grants__ (
  channel    text not null,
  account_id uuid not null,
  granted_at timestamptz not null default now(),
  primary key (channel, account_id)
);

create index if not exists __realtime_grants_account__
  on public.__realtime_grants__ (account_id);

alter table public.__realtime_channels__ enable row level security;
alter table public.__realtime_grants__ enable row level security;

do $$ begin
  create policy "anyone_reads_channel_openness"
  on public.__realtime_channels__
  for select
  to authenticated, anon
  using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "an_account_reads_its_own_grants"
  on public.__realtime_grants__
  for select
  to authenticated
  using (account_id = (auth.jwt()->>'sub')::uuid);
exception when duplicate_object then null;
end $$;

grant select on public.__realtime_channels__ to authenticated, anon;
grant select on public.__realtime_grants__ to authenticated;
revoke insert, update, delete on public.__realtime_channels__ from authenticated, anon;
revoke insert, update, delete on public.__realtime_grants__ from authenticated, anon;

alter table realtime.messages enable row level security;

do $$ begin
  create policy "an_account_hears_its_own_channel"
  on realtime.messages
  for select
  to authenticated
  using (
    split_part(realtime.topic(), ':', 2) = (auth.jwt()->>'sub')
    and exists (
      select 1 from public.__realtime_channels__
      where channel = split_part(realtime.topic(), ':', 1)
    )
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "an_authenticated_caller_hears_an_open_channel"
  on realtime.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.__realtime_channels__
      where channel = realtime.topic() and listen = 'authenticated'
    )
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "a_granted_account_hears_its_channel"
  on realtime.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.__realtime_grants__
      where channel = realtime.topic()
        and account_id = (auth.jwt()->>'sub')::uuid
    )
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.__realtime_events__ (
  id          bigserial primary key,
  channel     text   not null check (length(channel) <= 194),
  action      text   not null check (action ~ '^[a-z][a-z0-9_]*$' and length(action) <= 32),
  entity_id   text   not null,
  payload     jsonb  not null default '{}'::jsonb,
  occurred_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists __realtime_events_lookup__
  on public.__realtime_events__ (channel, occurred_at);

create index if not exists __realtime_events_entity__
  on public.__realtime_events__ (channel, entity_id, occurred_at desc);

create index if not exists __realtime_events_occurred_at__
  on public.__realtime_events__ (occurred_at);

alter table public.__realtime_events__ enable row level security;
revoke all on public.__realtime_events__ from authenticated, anon;

create or replace function public.broadcast_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listen text;
begin
  select listen into v_listen
  from public.__realtime_channels__
  where channel = split_part(new.channel, ':', 1);

  perform realtime.send(
    payload := new.payload || jsonb_build_object(
      'action', new.action,
      'at', new.occurred_at,
      'id', new.entity_id
    ),
    event   := new.action,
    topic   := new.channel,
    private := coalesce(v_listen, 'granted') <> 'public'
  );

  new.payload := '{}'::jsonb;
  return new;
end;
$$;

drop trigger if exists __realtime_events_broadcast__ on public.__realtime_events__;
create trigger __realtime_events_broadcast__
  before insert on public.__realtime_events__
  for each row
  execute function public.broadcast_realtime_event();

create or replace function public.log_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel   text := tg_argv[0];
  v_key_col   text := tg_argv[1];
  v_recip_col text := case when tg_nargs > 2 then tg_argv[2] end;
  v_row       jsonb;
  v_entity_id text;
  v_recipient text;
begin
  if v_channel is null or v_key_col is null then
    raise exception
      'log_realtime_event: missing required arguments on %, expected (channel, key_column[, recipient_column])',
      tg_table_name
      using errcode = 'invalid_parameter_value';
  end if;

  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_entity_id := v_row ->> v_key_col;

  if v_entity_id is null then
    raise exception
      'log_realtime_event: column "%" is missing or null on %', v_key_col, tg_table_name
      using errcode = 'invalid_parameter_value';
  end if;

  if v_recip_col is not null then
    v_recipient := v_row ->> v_recip_col;
    if v_recipient is null then
      raise exception
        'log_realtime_event: recipient column "%" is null on %', v_recip_col, tg_table_name
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  insert into public.__realtime_events__ (channel, action, entity_id, payload)
  values (
    case when v_recipient is null then v_channel else v_channel || ':' || v_recipient end,
    lower(tg_op),
    v_entity_id,
    v_row
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.get_realtime_ids(
  p_channel     text,
  p_cursor      bigint,
  p_known_ids   text[],
  out upserted_ids text[],
  out deleted_ids  text[],
  out new_cursor   bigint,
  out full_resync  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lag_ms           constant bigint := 5000;
  v_now_ms           bigint := (extract(epoch from now()) * 1000)::bigint;
  v_retention_cutoff bigint := (extract(epoch from now() - interval '30 days') * 1000)::bigint;
  v_max_occurred     bigint;
begin
  if p_cursor != 0 and p_cursor < v_retention_cutoff then
    full_resync  := true;
    upserted_ids := '{}';
    deleted_ids  := '{}';
    new_cursor   := v_now_ms - v_lag_ms;
    return;
  end if;

  full_resync := false;

  select max(occurred_at)
  into   v_max_occurred
  from   public.__realtime_events__
  where  channel = p_channel
    and  occurred_at > p_cursor;

  if v_max_occurred is null then
    upserted_ids := '{}';
    deleted_ids  := '{}';
    new_cursor   := p_cursor;
    return;
  end if;

  new_cursor := greatest(p_cursor, least(v_max_occurred, v_now_ms - v_lag_ms));

  with latest as (
    select distinct on (entity_id) entity_id, action
    from   public.__realtime_events__
    where  channel = p_channel
      and  occurred_at > p_cursor
    order  by entity_id, occurred_at desc, id desc
  )
  select
    coalesce(array_agg(entity_id) filter (
      where (action <> 'delete' and entity_id = any(p_known_ids))
         or (action = 'insert' and not (entity_id = any(p_known_ids)))
    ), '{}'),
    coalesce(array_agg(entity_id) filter (
      where action = 'delete' and entity_id = any(p_known_ids)
    ), '{}')
  into upserted_ids, deleted_ids
  from latest;
end;
$$;

revoke all on function public.get_realtime_ids(text, bigint, text[]) from public, anon, authenticated;
grant execute on function public.get_realtime_ids(text, bigint, text[]) to service_role;

select cron.schedule(
  'cleanup-realtime-events',
  '0 0 * * *',
  $$delete from public.__realtime_events__
    where occurred_at < (extract(epoch from now() - interval '30 days') * 1000)::bigint$$
);
