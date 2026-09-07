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

@Proto("cache")
export class CacheProtocol extends ProtoBuilder {
  imports(): List<string> {
    return ["scribe/protocol/common.proto"];
  }

  @ProtoMessage()
  cacheKey(): ProtoMessageBuilder {
    return this.builder("CacheKey").fields((f) => ({
      namespace: f.string().number(1),
      key: f.string().number(2),
    }));
  }

  @ProtoMessage()
  getRequest(): ProtoMessageBuilder {
    return this.builder("GetRequest").fields((f) => ({
      key: f.message("CacheKey").number(1),
    }));
  }

  @ProtoMessage()
  getResult(): ProtoMessageBuilder {
    return this.builder("GetResult").fields((f) => ({
      hit: f.bool().number(1),
      value: f.message("scribe.v1.Json").number(2),
      error: f.message("scribe.v1.Failure").number(3),
    }));
  }

  @ProtoMessage()
  setRequest(): ProtoMessageBuilder {
    return this.builder("SetRequest").fields((f) => ({
      key: f.message("CacheKey").number(1),
      value: f.message("scribe.v1.Json").number(2),
      ttl: f.message("scribe.v1.Time").number(3),
    }));
  }

  @ProtoMessage()
  setResult(): ProtoMessageBuilder {
    return this.builder("SetResult").fields((f) => ({
      error: f.message("scribe.v1.Failure").number(1),
    }));
  }

  @ProtoMessage()
  deleteRequest(): ProtoMessageBuilder {
    return this.builder("DeleteRequest").fields((f) => ({
      key: f.message("CacheKey").number(1),
      prefix: f.bool().number(2),
    }));
  }

  @ProtoMessage()
  deleteResult(): ProtoMessageBuilder {
    return this.builder("DeleteResult").fields((f) => ({
      deleted: f.uint32().number(1),
      error: f.message("scribe.v1.Failure").number(2),
    }));
  }

  @ProtoService()
  cache(): ProtoServiceBuilder {
    return this.builder("Cache").rpc((r) => [
      r.rpc("Get", "GetRequest", "GetResult"),
      r.rpc("Set", "SetRequest", "SetResult"),
      r.rpc("Delete", "DeleteRequest", "DeleteResult"),
    ]);
  }
}
