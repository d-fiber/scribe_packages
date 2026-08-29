create table if not exists public.items (
  item_id uuid primary key default gen_random_uuid(),
  name text not null
);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.items to anon, authenticated, service_role;

insert into public.items (name) values ('rendered by the fixture') on conflict do nothing;
