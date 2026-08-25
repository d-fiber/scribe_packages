// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

/**
 * What "storage" hands whoever mounts it.
 *
 * @remarks
 * Everything it is made of lives in `src/`, the types it publishes in `contracts/`, and this is
 * the one file that names them: a file no line below reaches is a file this package does not
 * publish.
 *
 * `scribe` at the bottom is the other half of what it hands over. It is the three moments the
 * host may run this package at, and a package that runs at none of them says so with an empty
 * one rather than by exporting nothing.
 */

import type { LifecycleSteps } from "@scribe/alchemy";
import { required } from "@scribe/foundation/lib/foundation.ts";
import { SupabaseStorageTransport } from "./src/bucket/supabase.ts";
import { StorageTransports } from "./src/bucket/registry.ts";
import { storageSettings } from "./src/settings.ts";

export { Bytes } from "@scribe/alchemy";

export { Storage } from "./src/core/storage.ts";
export type { StorageMediaSpec } from "./src/core/storage.ts";
export { StorageVisibility } from "./src/core/visibility.ts";
export { declaredStorage } from "./src/core/registry.ts";

export { StoragePathError } from "./src/path/segment.ts";
export type { PathArgs } from "./src/path/template.ts";

export { FileResource } from "./src/resources/file.ts";
export { ImageResource } from "./src/resources/image.ts";
export { VideoResource } from "./src/resources/video.ts";
export { StorageResource } from "./src/runtime/resource.ts";

export { StorageListError, StorageRemoveError, StorageUploadError } from "./src/runtime/result.ts";
export type {
  StorageFile,
  StorageImage,
  StorageListResult,
  StorageObject,
  StorageRemoveResult,
  StorageUploadResult,
  StorageVideo,
} from "./src/runtime/result.ts";

export type { StorageObjectRow } from "./src/db/tables.ts";

export { StorageTransports } from "./src/bucket/registry.ts";
export { SupabaseStorageTransport } from "./src/bucket/supabase.ts";
export type { StorageBucket, StorageTransport } from "./src/bucket/transport.ts";

/**
 * When this package runs, which is once, at import, to fill what a mounted module needs.
 *
 * @remarks
 * The settings are where this package reaches the storage service, read from the process
 * environment. The transport is what answers a bucket once they are filled, and it needs nothing
 * else to be built, so both belong at import.
 */
export const scribe: LifecycleSteps = {
  wires: () => {
    storageSettings.use({
      apiUrl: required("SUPABASE_STORAGE_INTERNAL_URL"),
      serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
      publicBaseUrl: required("APP_URL"),
      privateBaseUrl: required("ADMIN_URL"),
    });

    StorageTransports.use(new SupabaseStorageTransport());
  },
};
