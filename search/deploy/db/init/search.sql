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

create table if not exists public.__search_indices__ (
  name          text primary key,
  index_name    text not null,
  source_table  text not null,
  source_key    text not null,
  mappings_hash text not null,
  settings_hash text not null,
  synced_at     timestamptz not null default now()
);

create table if not exists public.__search_sources__ (
  index        text not null,
  source_table text not null,
  source_key   text not null,
  primary key (index, source_table, source_key)
);

create index if not exists __search_sources_table__
  on public.__search_sources__ (source_table);

create table if not exists public.__search_outbox__ (
  index       text not null,
  entity_id   text not null,
  operation   text not null check (operation in ('index', 'delete')),
  enqueued_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  attempts    integer not null default 0,
  failed_at   timestamptz,
  last_error  text,
  primary key (index, entity_id)
);

create index if not exists __search_outbox_line__
  on public.__search_outbox__ (enqueued_at)
  where failed_at is null;

alter table public.__search_indices__ enable row level security;
alter table public.__search_sources__ enable row level security;
alter table public.__search_outbox__ enable row level security;

revoke all on public.__search_indices__ from authenticated, anon;
revoke all on public.__search_sources__ from authenticated, anon;
revoke all on public.__search_outbox__ from authenticated, anon;

create or replace function public.__search_enqueue__(
  p_index     text,
  p_ids       text[],
  p_operation text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_written integer;
begin
  insert into public.__search_outbox__ (index, entity_id, operation)
  select p_index, wanted.entity_id, p_operation
  from   (select distinct unnest(p_ids) as entity_id) wanted
  where  wanted.entity_id is not null
  on conflict (index, entity_id) do update
    set operation  = excluded.operation,
        attempts   = 0,
        failed_at  = null,
        last_error = null;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

create or replace function public.__search_fail__(
  p_index        text,
  p_ids          text[],
  p_error        text,
  p_max_attempts integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_written integer;
begin
  update public.__search_outbox__
  set attempts   = attempts + 1,
      last_error = p_error,
      failed_at  = case when attempts + 1 >= p_max_attempts then now() end
  where index = p_index
    and entity_id = any(p_ids)
    and failed_at is null;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

create or replace function public.__search_backlog__(
  p_index     text,
  out pending bigint,
  out failed  bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  select count(*) filter (where failed_at is null),
         count(*) filter (where failed_at is not null)
  into   pending, failed
  from   public.__search_outbox__
  where  index = p_index;
end;
$$;

create or replace function public.__search_track__()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_index     text := tg_argv[0];
  v_key_col   text := tg_argv[1];
  v_operation text := 'index';
  v_indexed   text;
  v_row       jsonb;
  v_entity_id text;
  v_previous  text;
begin
  if v_index is null or v_key_col is null then
    raise exception
      '__search_track__: missing required arguments on %, expected (index, key_column)',
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
      '__search_track__: column "%" is missing or null on %', v_key_col, tg_table_name
      using errcode = 'invalid_parameter_value';
  end if;

  if tg_op = 'DELETE' then
    select source_table into v_indexed
    from   public.__search_indices__
    where  name = v_index;

    if v_indexed = tg_table_name then
      v_operation := 'delete';
    end if;
  end if;

  perform public.__search_enqueue__(v_index, array[v_entity_id], v_operation);

  if tg_op = 'UPDATE' then
    v_previous := to_jsonb(old) ->> v_key_col;

    if v_previous is not null and v_previous <> v_entity_id then
      perform public.__search_enqueue__(v_index, array[v_previous], 'index');
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.__search_enqueue__(text, text[], text)
  from public, anon, authenticated;
revoke all on function public.__search_fail__(text, text[], text, integer)
  from public, anon, authenticated;
revoke all on function public.__search_backlog__(text)
  from public, anon, authenticated;

grant execute on function public.__search_enqueue__(text, text[], text) to service_role;
grant execute on function public.__search_fail__(text, text[], text, integer) to service_role;
grant execute on function public.__search_backlog__(text) to service_role;
