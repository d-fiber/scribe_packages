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

alter table realtime.messages enable row level security;

do $$ begin
  create policy "users_can_read_own_user_channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'user:%'
    and split_part(realtime.topic(), ':', 2) = (auth.jwt()->>'sub')
    and (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admins_can_read_own_admin_channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'admin:%'
    and split_part(realtime.topic(), ':', 2) = (auth.jwt()->>'sub')
    and (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "users_can_read_users_channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'users'
    and (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admins_can_read_admins_channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'admins'
    and (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.internal_t__user_topic_members (
  topic text not null,
  user_id  uuid not null references public.internal_t__app_users (user_id) on delete cascade,
  primary key (topic, user_id)
);

create index if not exists user_topic_members_user_idx on public.internal_t__user_topic_members (user_id);

alter table public.internal_t__user_topic_members enable row level security;

do $$ begin
  create policy "users_can_read_own_topic_memberships"
  on public.internal_t__user_topic_members
  for select
  to authenticated
  using (user_id = (auth.jwt()->>'sub')::uuid);
exception when duplicate_object then null;
end $$;

grant select on public.internal_t__user_topic_members to authenticated;
revoke insert, update, delete on public.internal_t__user_topic_members from authenticated, anon;

create table if not exists public.internal_t__admin_topic_members (
  topic text not null,
  admin_id uuid not null references public.internal_t__admin_users (admin_id) on delete cascade,
  primary key (topic, admin_id)
);

create index if not exists admin_topic_members_admin_idx on public.internal_t__admin_topic_members (admin_id);

alter table public.internal_t__admin_topic_members enable row level security;

do $$ begin
  create policy "admins_can_read_own_topic_memberships"
  on public.internal_t__admin_topic_members
  for select
  to authenticated
  using (admin_id = (auth.jwt()->>'sub')::uuid);
exception when duplicate_object then null;
end $$;

grant select on public.internal_t__admin_topic_members to authenticated;
revoke insert, update, delete on public.internal_t__admin_topic_members from authenticated, anon;

do $$ begin
  create policy "users_can_read_own_user_topic_channels"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'users:%'
    and (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin'
    and exists (
      select 1 from public.internal_t__user_topic_members
      where topic = substring(realtime.topic() from 7)
        and user_id = (auth.jwt()->>'sub')::uuid
    )
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admins_can_read_own_admin_topic_channels"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'admins:%'
    and (auth.jwt()->'app_metadata'->>'role') = 'admin'
    and exists (
      select 1 from public.internal_t__admin_topic_members
      where topic = substring(realtime.topic() from 8)
        and admin_id = (auth.jwt()->>'sub')::uuid
    )
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.internal_t__sync_events (
  id           bigserial    primary key,
  scope        text         not null check (scope in ('admin', 'user', 'admins', 'users')),
  topic        text         check (topic is null or (topic ~ '^[a-zA-Z0-9_-]+$' and length(topic) <= 64)),
  entity       text         not null check (entity ~ '^[a-z][a-z0-9_]*$' and length(entity) <= 64),
  action       text         not null check (action ~ '^[a-z][a-z0-9_]*$' and length(action) <= 32),
  entity_id    text         not null,
  recipient_id text         check (scope in ('admin', 'user') = (recipient_id is not null)),
  occurred_at  bigint       not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists sync_events_lookup_idx
  on public.internal_t__sync_events (scope, entity, occurred_at);

create index if not exists sync_events_entity_lookup_idx
  on public.internal_t__sync_events (scope, entity, entity_id, occurred_at desc);

create index if not exists sync_events_recipient_lookup_idx
  on public.internal_t__sync_events (scope, entity, recipient_id, occurred_at)
  where recipient_id is not null;

create index if not exists sync_events_occurred_at_idx
  on public.internal_t__sync_events (occurred_at);

create or replace function log_sync_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity    text := tg_argv[0];
  v_scope     text := tg_argv[1];
  v_pk_col    text := tg_argv[2];
  v_recip_col text := case when tg_nargs > 3 then tg_argv[3] end;
  v_topic_col text := case when tg_nargs > 4 then tg_argv[4] end;
  v_private   boolean := v_scope in ('admin', 'user');
  v_row       jsonb;
  v_entity_id text;
begin
  if v_entity is null or v_scope is null or v_pk_col is null then
    raise exception
      'log_sync_event: missing required arguments on %, expected (entity, scope, pk_column[, recipient_column[, topic_column]])',
      tg_table_name
      using errcode = 'invalid_parameter_value';
  end if;

  if v_private and v_recip_col is null then
    raise exception
      'log_sync_event: private scope "%" on % requires a recipient_column (4th argument)',
      v_scope, tg_table_name
      using errcode = 'invalid_parameter_value';
  end if;

  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_entity_id := v_row ->> v_pk_col;

  if v_entity_id is null then
    raise exception
      'log_sync_event: column "%" is missing or null on %', v_pk_col, tg_table_name
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.internal_t__sync_events (scope, topic, entity, action, entity_id, recipient_id)
  values (
    v_scope,
    case when v_topic_col is not null then v_row ->> v_topic_col end,
    v_entity,
    lower(tg_op),
    v_entity_id,
    case when v_private then v_row ->> v_recip_col end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function broadcast_sync_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op   text := new.action;
  v_base text := case new.scope
    when 'admin'  then 'admin:' || new.recipient_id
    when 'user'   then 'user:' || new.recipient_id
    when 'admins' then 'admins'
    when 'users'  then 'users'
  end;
  v_topic text := case
    when new.topic is not null then v_base || ':' || new.topic
    else v_base
  end;
begin
  perform realtime.send(
    payload := jsonb_build_object('op', v_op, 'at', new.occurred_at, 'entity', new.entity, 'data', new.entity_id),
    event   := 'change',
    topic   := v_topic,
    private := true
  );

  return new;
exception
  when others then
    raise warning '[broadcast_sync_event] realtime.send failed for topic %: %', v_topic, sqlerrm;
    return new;
end;
$$;

create trigger sync_events_broadcast
  after insert on public.internal_t__sync_events
  for each row
  execute function broadcast_sync_event();

create or replace function public.get_sync_ids(
  p_scope        text,
  p_entity       text,
  p_cursor       bigint,
  p_known_ids    text[],
  p_recipient_id text default null,
  p_topic        text default null,
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
  v_private          boolean := p_scope in ('admin', 'user');
begin
  if v_private and coalesce(p_recipient_id, '') = '' then
    raise exception
      'get_sync_ids: p_recipient_id is required for private scope %', p_scope
      using errcode = 'invalid_parameter_value';
  end if;

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
  from   public.internal_t__sync_events
  where  scope = p_scope
    and  entity = p_entity
    and  occurred_at > p_cursor
    and  (not v_private or recipient_id = p_recipient_id)
    and  (p_topic is null or topic = p_topic);

  if v_max_occurred is null then
    upserted_ids := '{}';
    deleted_ids  := '{}';
    new_cursor   := p_cursor;
    return;
  end if;

  new_cursor := greatest(p_cursor, least(v_max_occurred, v_now_ms - v_lag_ms));

  with latest as (
    select distinct on (entity_id) entity_id, action
    from   public.internal_t__sync_events
    where  scope = p_scope
      and  entity = p_entity
      and  occurred_at > p_cursor
      and  (not v_private or recipient_id = p_recipient_id)
      and  (p_topic is null or topic = p_topic)
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

revoke all on function public.get_sync_ids(text, text, bigint, text[], text, text) from public, anon, authenticated;
grant execute on function public.get_sync_ids(text, text, bigint, text[], text, text) to service_role;

select cron.schedule(
  'cleanup-sync-events',
  '0 0 * * *',
  $$delete from public.internal_t__sync_events
    where occurred_at < (extract(epoch from now() - interval '30 days') * 1000)::bigint$$
);