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

import type { List, ProtoMessageBuilder, ProtoServiceBuilder } from "@scribe/alchemy";
import { Proto, ProtoBuilder, ProtoMessage, ProtoService } from "@scribe/alchemy";

/** The worker-facing contract for `Storage`: upload, delete, sign and list objects. */
@Proto("storage")
export class StorageProtocol extends ProtoBuilder {
  /** The socle types this contract references: `scribe.v1.Size`, `scribe.v1.Time`, `scribe.v1.Failure`. */
  imports(): List<string> {
    return ["scribe/protocol/common.proto"];
  }

  /** The folder, path arguments and filename that address one object. */
  @ProtoMessage()
  objectRef(): ProtoMessageBuilder {
    return this.builder("ObjectRef").fields((f) => ({
      folder: f.string().number(1),
      pathArgs: f.map("string", (v) => v.string()).number(2),
      filename: f.string().number(3),
    }));
  }

  /** What `Storage.Upload` takes: the object, its content, and whether it may replace one that exists. */
  @ProtoMessage()
  uploadRequest(): ProtoMessageBuilder {
    return this.builder("UploadRequest").fields((f) => ({
      object: f.message("ObjectRef").number(1),
      content: f.bytes().number(2),
      mimeType: f.string().number(3),
      upsert: f.bool().number(4),
    }));
  }

  /** What `Storage.Upload` answers: the path it was written to and its size, or a failure. */
  @ProtoMessage()
  uploadResult(): ProtoMessageBuilder {
    return this.builder("UploadResult").fields((f) => ({
      path: f.string().number(1),
      size: f.message("scribe.v1.Size").number(2),
      error: f.message("scribe.v1.Failure").number(3),
    }));
  }

  /** What `Storage.Delete` takes: the objects to remove. */
  @ProtoMessage()
  deleteRequest(): ProtoMessageBuilder {
    return this.builder("DeleteRequest").fields((f) => ({
      objects: f.message("ObjectRef").repeated().number(1),
    }));
  }

  /** What `Storage.Delete` answers: how many objects it removed. */
  @ProtoMessage()
  deleteResult(): ProtoMessageBuilder {
    return this.builder("DeleteResult").fields((f) => ({
      deleted: f.uint32().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** What `Storage.SignedUrl` takes: the object, and how long the URL stays valid. */
  @ProtoMessage()
  signedUrlRequest(): ProtoMessageBuilder {
    return this.builder("SignedUrlRequest").fields((f) => ({
      object: f.message("ObjectRef").number(1),
      expiresIn: f.message("scribe.v1.Time").number(2),
    }));
  }

  /** What `Storage.SignedUrl` answers: the URL, or a failure. */
  @ProtoMessage()
  signedUrlResult(): ProtoMessageBuilder {
    return this.builder("SignedUrlResult").fields((f) => ({
      url: f.string().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** What `Storage.List` takes: the folder, its path arguments, and the page to read. */
  @ProtoMessage()
  listRequest(): ProtoMessageBuilder {
    return this.builder("ListRequest").fields((f) => ({
      folder: f.string().number(1),
      pathArgs: f.map("string", (v) => v.string()).number(2),
      limit: f.uint32().number(3),
      offset: f.uint32().number(4),
    }));
  }

  /** One object as `Storage.List` returns it. */
  @ProtoMessage()
  objectSummary(): ProtoMessageBuilder {
    return this.builder("ObjectSummary").fields((f) => ({
      path: f.string().number(1),
      size: f.message("scribe.v1.Size").number(2),
      mimeType: f.string().number(3),
      updatedAt: f.int64().number(4),
    }));
  }

  /** What `Storage.List` answers: the page of objects, or a failure. */
  @ProtoMessage()
  listResult(): ProtoMessageBuilder {
    return this.builder("ListResult").fields((f) => ({
      objects: f.message("ObjectSummary").repeated().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  /** `Storage`, the four procedures a worker calls against its buckets. */
  @ProtoService()
  storage(): ProtoServiceBuilder {
    return this.builder("Storage").rpc((r) => [
      r.name("Upload").request("UploadRequest").response("UploadResult"),
      r.name("Delete").request("DeleteRequest").response("DeleteResult"),
      r.name("SignedUrl").request("SignedUrlRequest").response("SignedUrlResult"),
      r.name("List").request("ListRequest").response("ListResult"),
    ]);
  }
}
