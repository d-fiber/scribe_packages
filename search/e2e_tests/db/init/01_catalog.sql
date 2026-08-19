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


create table public.e2e_brands (
  brand_id uuid primary key default gen_random_uuid(),
  label    text not null
);

create table public.e2e_stores (
  store_id   uuid primary key default gen_random_uuid(),
  name       text        not null,
  status     text        not null default 'open',
  rank       integer     not null default 0,
  is_open    boolean     not null default true,
  brand_id   uuid        references public.e2e_brands (brand_id),
  created_at timestamptz not null default now()
);

create table public.e2e_store_tags (
  tag_id   uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.e2e_stores (store_id) on delete cascade,
  tag      text not null
);

create index e2e_store_tags_store_idx on public.e2e_store_tags (store_id);

create trigger e2e_stores_search
  after insert or update or delete on public.e2e_stores
  for each row execute function public.__search_track__('e2e_stores', 'store_id');

create trigger e2e_store_tags_search
  after insert or update or delete on public.e2e_store_tags
  for each row execute function public.__search_track__('e2e_stores', 'store_id');

grant usage on schema public to anon, service_role;
grant all on public.e2e_brands, public.e2e_stores, public.e2e_store_tags to service_role;
grant select on public.e2e_brands, public.e2e_stores, public.e2e_store_tags to anon;
