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


import "@scribe/core/testing/settings.ts";
import type { InstalledMock } from "@scribe/core/testing/install.ts";
import { StorageTransports } from "@scribe/storage/src/bucket/registry.ts";
import type { StorageBucket, StorageTransport } from "@scribe/storage/src/bucket/transport.ts";
import { bucketNameOf, type StorageVisibility } from "@scribe/storage/src/core/visibility.ts";

/** One upload a recording transport kept instead of sending it. */
export interface RecordedUpload {
  /** The bucket the bytes were headed for. */
  readonly bucket: string;

  /** The key they would have been written under. */
  readonly path: string;

  /** The media type the resource resolved from the file's extension. */
  readonly contentType: string;

  /** How many bytes the upload carried. */
  readonly byteSize: number;
}

/** One removal a recording transport kept instead of sending it. */
export interface RecordedRemoval {
  /** The bucket the paths would have been removed from. */
  readonly bucket: string;

  /** The keys named in that one call. */
  readonly paths: readonly string[];
}

/** A transport that keeps every write instead of making it, so a test can read what was asked. */
export class RecordingTransport implements StorageTransport {
  /** Every upload handed over since this transport was installed, oldest first. */
  readonly uploads: RecordedUpload[] = [];

  /** Every removal handed over since this transport was installed, oldest first. */
  readonly removals: RecordedRemoval[] = [];

  readonly #answer: boolean;

  /**
   * @param answer - What every write answers. False is how a test exercises the path a caller
   * takes when a bucket refuses.
   */
  constructor(answer = true) {
    this.#answer = answer;
  }

  /** A bucket that keeps what it is handed and answers what the constructor was given. */
  of(visibility: StorageVisibility): StorageBucket {
    const bucket = bucketNameOf(visibility);

    return {
      upload: (path: string, body: ArrayBuffer, contentType: string) => {
        this.uploads.push({ bucket, path, contentType, byteSize: body.byteLength });
        return Promise.resolve(this.#answer);
      },
      remove: (paths: readonly string[]) => {
        this.removals.push({ bucket, paths: [...paths] });
        return Promise.resolve(this.#answer);
      },
    };
  }

  /** The keys uploaded so far, in the order they were handed over. */
  get uploadedPaths(): string[] {
    return this.uploads.map((upload) => upload.path);
  }

  /** The keys removed so far, flattened across the calls that named them. */
  get removedPaths(): string[] {
    return this.removals.flatMap((removal) => [...removal.paths]);
  }
}

/**
 * Sends every write of the process into a recording transport, and answers the handle that puts
 * the previous one back.
 *
 * @remarks
 * What is replaced is the transport, never a declaration: a folder keeps rendering its own keys,
 * refusing its own arguments and choosing its own bucket, so a test exercises the declaration
 * rather than a second implementation of it written for the test.
 *
 * @param answer - What every write answers. Defaults to a write that landed.
 */
export function installStorageMock(answer = true): RecordingTransport & InstalledMock {
  const recording = new RecordingTransport(answer);
  const previous = StorageTransports.use(recording);

  return Object.assign(recording, {
    restore(): void {
      StorageTransports.use(previous);
    },
  });
}
