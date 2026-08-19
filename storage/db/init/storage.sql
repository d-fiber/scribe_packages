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


INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('public_bucket',  'public_bucket',  true,  NULL, NULL),
  ('private_bucket', 'private_bucket', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = NULL,
      allowed_mime_types = NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_select_public_bucket'
  ) THEN
    CREATE POLICY "storage_select_public_bucket" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'public_bucket');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_select_private_bucket'
  ) THEN
    CREATE POLICY "storage_select_private_bucket" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'private_bucket'
        AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END;
$$;

DROP POLICY IF EXISTS "storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_users" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_public" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_app_bucket" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_admin_bucket" ON storage.objects;

create table if not exists public.__storage_objects__ (
  path       text primary key,
  visibility text not null check (visibility in ('public', 'private')),
  mime_type  text not null,
  byte_size  bigint not null check (byte_size >= 0),
  blur_hash  text,
  updated_at timestamptz not null default now()
);

create index if not exists __storage_objects_prefix__
  on public.__storage_objects__ (path text_pattern_ops);

alter table public.__storage_objects__ enable row level security;
revoke all on public.__storage_objects__ from authenticated, anon;
