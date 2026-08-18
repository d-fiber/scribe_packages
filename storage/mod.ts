// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

export { Size } from "@scribe/core/contracts/common/size.ts";

export {
  defineStorage,
  file,
  folder,
  image,
  video
} from "./src/core/define.ts";
export type {
  FileSpec,
  FolderDefinition,
  FolderSpec,
  ImageSpec,
  StorageDefinition,
  StorageFolder,
  StorageMediaSpec,
  StorageSpec,
  StorageSpecs,
  VideoSpec
} from "./src/core/define.ts";

export type {
  StorageAccess,
  StorageOwnershipCheck,
  StorageReader,
  StorageWriter,
  StorageWriteRule
} from "./src/core/access.ts";

export type { StorageOwner, StorageSession } from "./src/access/identity.ts";
export type {
  PathArgNames,
  PathArgs,
  PathNamedArgs
} from "./src/path/template.ts";
export type { StorageFolderOperations } from "./src/runtime/folder.ts";

export { StoragePathError } from "./src/path/segment.ts";

export {
  StorageListError,
  StorageRemoveError,
  StorageUploadError
} from "./src/runtime/result.ts";
export type {
  StorageFile,
  StorageImage,
  StorageListResult,
  StorageObject,
  StorageRemoveResult,
  StorageUploadResult,
  StorageVideo
} from "./src/runtime/result.ts";

export type { FileResource } from "./src/resources/file.ts";
export type { ImageResource } from "./src/resources/image.ts";
export type { VideoResource } from "./src/resources/video.ts";

export { StorageClient } from "./src/client.ts";

export { AccountRoles } from "@scribe/core/runtime/support/ports/account_roles.ts";
export { StorageVisibility } from "./src/access/visibility.ts";
export { StorageTransports } from "./src/bucket/registry.ts";
export { SupabaseStorageTransport } from "./src/bucket/supabase.ts";
export type {
  StorageBucket,
  StorageObjectEntry,
  StorageTransport
} from "./src/bucket/transport.ts";

