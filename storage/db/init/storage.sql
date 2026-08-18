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

-- Two buckets, differing on one thing only: who is allowed to read.
--
--   app_bucket   public   served on APP_URL under /object/public/..., with no
--                         token on the storage side. For anything meant for the app.
--   admin_bucket private  served on ADMIN_URL under /object/<bucket>/..., so
--                         behind the VPN in Caddy, a JWT in Kong, and the RLS
--                         below, which demands the admin role.
--
-- Neither constrains types or sizes. Those rules live in the TypeScript
-- entities, which declare extensions and a maximum size per resource.
-- Duplicating them here would make two sources of truth, and the refusal a
-- bucket returns says nothing to the client.
--
-- No folder is ever created. storage.objects.name is a flat key and the "/" are
-- only a naming convention, which storage.foldername() parses on read. An
-- upload to "brands/<id>/logo" creates the object directly.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('app_bucket',   'app_bucket',   true,  NULL, NULL),
  ('admin_bucket', 'admin_bucket', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = NULL,
      allowed_mime_types = NULL;

DO $$
BEGIN
  -- The public bucket, readable by any authenticated account. Since the bucket
  -- is `public = true`, this policy only covers the authenticated path,
  -- /object/<bucket>/..., and /object/public/... never consults it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_select_app_bucket'
  ) THEN
    CREATE POLICY "storage_select_app_bucket" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'app_bucket');
  END IF;

  -- The private bucket, for admins only. This is the one barrier that depends
  -- neither on the network in the VPN nor on the gateway in Kong, so a URL that
  -- leaks stays useless without a JWT carrying app_metadata.role = 'admin'.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'storage_select_admin_bucket'
  ) THEN
    CREATE POLICY "storage_select_admin_bucket" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'admin_bucket'
        AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      );
  END IF;
END;
$$;

-- No write policy for `authenticated`. Uploads and deletions all go through the
-- edge functions, with the service key that bypasses the RLS. The old
-- storage_insert, storage_update and storage_delete policies let an
-- authenticated account write into the bucket, and only the Kong gateway
-- stopped it.
DROP POLICY IF EXISTS "storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_users" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_public" ON storage.objects;
