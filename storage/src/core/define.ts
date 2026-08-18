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

import type { Size } from "@scribe/core/contracts/common/size.ts";
import { identityOf, ownershipOf, type StorageAccess, type StorageReader, visibilityOf, writerOf } from "./access.ts";
import type { StorageResourceConfig } from "../runtime/config.ts";
import { folderOperations, type StorageFolderOperations } from "../runtime/folder.ts";
import { FileResource } from "../resources/file.ts";
import { ImageResource } from "../resources/image.ts";
import { VideoResource } from "../resources/video.ts";
import { StorageScope } from "../path/scope.ts";
import { type AsArgs, namedArgs, type ParsedTemplate, parseTemplate, type PathArgs } from "../path/template.ts";

export interface StorageMediaSpec {
  readonly extensions: readonly string[];
  readonly maxSize: Size;
  readonly read?: StorageReader;
}

export interface ImageSpec {
  readonly kind: "image";
  readonly media: StorageMediaSpec;
}

export interface VideoSpec {
  readonly kind: "video";
  readonly media: StorageMediaSpec;
}

export interface FileSpec {
  readonly kind: "file";
  readonly media: StorageMediaSpec;
}

export interface FolderSpec<
  P extends string = string,
  R extends StorageSpecs = StorageSpecs,
> {
  readonly kind: "folder";
  readonly path: P;
  readonly read?: StorageReader;
  readonly resources: R;
}

export type StorageSpec = ImageSpec | VideoSpec | FileSpec | FolderSpec;
export type StorageSpecs = { readonly [name: string]: StorageSpec };

export function image(media: StorageMediaSpec): ImageSpec {
  return { kind: "image", media };
}

export function video(media: StorageMediaSpec): VideoSpec {
  return { kind: "video", media };
}

export function file(media: StorageMediaSpec): FileSpec {
  return { kind: "file", media };
}

export interface FolderDefinition<P extends string, R extends StorageSpecs> {
  readonly path: P;
  readonly read?: StorageReader;
  readonly resources: R;
}

export function folder<P extends string, R extends StorageSpecs>(
  path: P,
  resources: R,
): FolderSpec<P, R>;
export function folder<P extends string, R extends StorageSpecs>(
  definition: FolderDefinition<P, R>,
): FolderSpec<P, R>;
export function folder<P extends string, R extends StorageSpecs>(
  pathOrDefinition: P | FolderDefinition<P, R>,
  resources?: R,
): FolderSpec<P, R> {
  return typeof pathOrDefinition === "string"
    ? { kind: "folder", path: pathOrDefinition, resources: resources as R }
    : { kind: "folder", ...pathOrDefinition };
}

export type StorageResourceOf<
  S extends StorageSpec,
  TArgs extends string[],
> = S extends ImageSpec ? ImageResource<TArgs>
  : S extends VideoSpec ? VideoResource<TArgs>
  : S extends FileSpec ? FileResource<TArgs>
  : S extends FolderSpec<infer P, infer R> ? StorageFolder<R, [...TArgs, ...AsArgs<PathArgs<P>>]>
  : never;

export type StorageFolder<R extends StorageSpecs, TArgs extends string[]> =
  & {
    readonly [K in keyof R]: StorageResourceOf<R[K], TArgs>;
  }
  & StorageFolderOperations<TArgs>;

export interface StorageDefinition<P extends string, R extends StorageSpecs> {
  readonly path: P;
  readonly access: StorageAccess<P>;
  readonly resources: R;
}

const RESERVED = new Set(["list", "clear"]);

export function defineStorage<
  P extends string,
  R extends StorageSpecs,
  TArgs extends string[] = PathArgs<P>,
>(definition: StorageDefinition<P, R>): StorageFolder<R, TArgs> {
  const template = parseTemplate(definition.path);
  const owns = ownershipOf(definition.access.write);

  const scope = new StorageScope<TArgs>(
    template.segments,
    identityOf(writerOf(definition.access.write)),
    visibilityOf(definition.access.read),
    owns &&
      ((account, args) => owns(account, namedArgs(template.argNames, args) as never)),
    template.argNames.length,
  );

  return buildFolder(scope, definition.resources);
}

function buildFolder<R extends StorageSpecs, TArgs extends string[]>(
  scope: StorageScope<TArgs>,
  resources: R,
): StorageFolder<R, TArgs> {
  const built: Record<string, unknown> = { ...folderOperations(scope) };

  for (const [name, spec] of Object.entries(resources)) {
    if (RESERVED.has(name)) {
      throw new Error(
        `Storage resource cannot be named ${JSON.stringify(name)}: reserved by list()/clear().`,
      );
    }

    built[name] = spec.kind === "folder" ? buildChild(scope, spec) : buildResource(scope, name, spec);
  }

  return built as StorageFolder<R, TArgs>;
}

function buildChild<TArgs extends string[]>(
  scope: StorageScope<TArgs>,
  spec: FolderSpec,
) {
  const child: ParsedTemplate = parseTemplate(spec.path);
  return buildFolder(
    scope.child(
      child.segments,
      spec.read ? visibilityOf(spec.read) : undefined,
    ),
    spec.resources,
  );
}

function buildResource<TArgs extends string[]>(
  scope: StorageScope<TArgs>,
  name: string,
  spec: ImageSpec | VideoSpec | FileSpec,
) {
  const config: StorageResourceConfig<TArgs> = {
    identity: scope.identity,
    visibility: spec.media.read ? visibilityOf(spec.media.read) : scope.visibility,
    extensions: spec.media.extensions,
    maxSize: spec.media.maxSize,
    path: scope.path(name),
    authorize: scope.authorize,
  };

  switch (spec.kind) {
    case "image":
      return new ImageResource<TArgs>(config);
    case "video":
      return new VideoResource<TArgs>(config);
    case "file":
      return new FileResource<TArgs>(config);
  }
}
