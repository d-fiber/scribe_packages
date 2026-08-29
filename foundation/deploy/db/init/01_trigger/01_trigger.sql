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

create table if not exists public.__trigger_sources__ (
  table_name text primary key,
  key_column text not null default 'id'
);

create table if not exists public.__trigger_events__ (
  id          bigserial primary key,
  table_name  text not null,
  op          text not null check (op in ('insert', 'update', 'delete')),
  entity_id   text not null,
  before      jsonb,
  after       jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists __trigger_events_order__
  on public.__trigger_events__ (id);

alter table public.__trigger_sources__ enable row level security;
alter table public.__trigger_events__ enable row level security;

revoke all on public.__trigger_sources__ from anon, authenticated;
revoke all on public.__trigger_events__ from anon, authenticated;

create or replace function public.log_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_column text;
  v_after      jsonb;
  v_before     jsonb;
  v_entity_id  text;
begin
  select key_column into v_key_column
  from public.__trigger_sources__
  where table_name = tg_table_name;

  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  v_after  := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_before := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_entity_id := coalesce(v_after, v_before) ->> v_key_column;

  if v_entity_id is null then
    raise warning
      'log_table_change: column "%" is missing or null on %, no event written',
      v_key_column, tg_table_name;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  insert into public.__trigger_events__ (table_name, op, entity_id, before, after)
  values (tg_table_name, lower(tg_op), v_entity_id, v_before, v_after);

  return case when tg_op = 'DELETE' then old else new end;
exception when others then
  raise warning
    'log_table_change: % on % was not recorded: %',
    lower(tg_op), tg_table_name, sqlerrm;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.attach_table_change(p_table text)
returns void
language plpgsql
as $$
begin
  if left(p_table, 2) = '__' then
    return;
  end if;

  execute format(
    'create or replace trigger __scribe_table_change__ '
    'after insert or update or delete on public.%I '
    'for each row execute function public.log_table_change()',
    p_table
  );
end;
$$;

create or replace function public.attach_table_change_on_create()
returns event_trigger
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select objid from pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    perform public.attach_table_change(c.relname)
    from pg_class c
    where c.oid = r.objid and c.relkind = 'r' and c.relpersistence = 'p';
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relpersistence = 'p'
  loop
    perform public.attach_table_change(r.relname);
  end loop;
end;
$$;

drop event trigger if exists __scribe_attach_table_change__;
create event trigger __scribe_attach_table_change__
  on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS')
  execute function public.attach_table_change_on_create();
