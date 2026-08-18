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

import type { StorageBucket, StorageObjectEntry } from "./transport.ts";
import { currentClient } from "@scribe/foundation/src/http/run_with_client.ts";
import type { RequestBody } from "@scribe/foundation/src/http/client.ts";
import type { Response as HttpResponse } from "@scribe/foundation/src/http/response/response.ts";

interface RawEntry {
  readonly name: string;
  readonly id: string | null;
  readonly updated_at: string | null;
}

const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 50;
const MAX_DEPTH = 8;
const MAX_REMOVED = 10_000;

export class Bucket implements StorageBucket {
  readonly #name: string;
  readonly #url: string;
  readonly #serviceKey: string;

  constructor(name: string, url: string, serviceKey: string) {
    this.#name = name;
    this.#url = url;
    this.#serviceKey = serviceKey;
  }

  async upload(
    path: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<boolean> {
    const res = await this.#send("POST", `object/${this.#name}/${path}`, {
      headers: { "content-type": contentType, "x-upsert": "true" },
      body: new Uint8Array(body),
    });
    return res !== null;
  }

  async remove(paths: readonly string[]): Promise<boolean> {
    if (paths.length === 0) return true;
    const res = await this.#send("DELETE", `object/${this.#name}`, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
    return res !== null;
  }

  async list(
    prefix: string,
    offset = 0,
    limit = PAGE_SIZE,
  ): Promise<RawEntry[] | null> {
    const res = await this.#send("POST", `object/list/${this.#name}`, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit, offset }),
    });
    if (res === null) return null;
    return res.json<RawEntry[]>();
  }

  async listTree(
    prefix: string,
    limit: number,
    depth = 0,
  ): Promise<StorageObjectEntry[] | null> {
    if (depth >= MAX_DEPTH || limit <= 0) return [];

    const objects: StorageObjectEntry[] = [];
    const folders: string[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const entries = await this.list(prefix, page * PAGE_SIZE);
      if (entries === null) return null;

      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id === null) folders.push(path);
        else if (objects.length < limit) objects.push({ path, updatedAt: entry.updated_at });
      }

      if (entries.length < PAGE_SIZE || objects.length >= limit) break;
    }

    for (const folder of folders) {
      if (objects.length >= limit) break;

      const nested = await this.listTree(folder, limit - objects.length, depth + 1);
      if (nested === null) return null;
      objects.push(...nested);
    }

    return objects;
  }

  async removeTree(prefix: string): Promise<boolean> {
    const objects = await this.listTree(prefix, MAX_REMOVED);
    if (objects === null) return false;
    return await this.remove(objects.map((object) => object.path));
  }

  // Every call answers `null` on failure and logs why, so no caller of this bucket has to tell
  // a refused upload from an unreachable storage service. The two cases are logged apart.
  async #send(
    method: "POST" | "DELETE",
    route: string,
    options: { headers: Record<string, string>; body: RequestBody },
  ): Promise<HttpResponse | null> {
    const client = currentClient();
    const url = `${this.#url}/${route}`;
    const sent = {
      headers: {
        apikey: this.#serviceKey,
        Authorization: `Bearer ${this.#serviceKey}`,
        ...options.headers,
      },
      body: options.body,
      timeout: REQUEST_TIMEOUT_MS,
    };

    try {
      const res = method === "POST" ? await client.post(url, sent) : await client.delete(url, sent);
      if (res.ok) return res;

      console.error(`[storage] ${method} ${route} failed (${res.statusCode}): ${_reason(res)}`);
      return null;
    } catch (e) {
      console.error(`[storage] ${method} ${route} unreachable:`, e);
      return null;
    } finally {
      client.close();
    }
  }
}

function _reason(res: HttpResponse): string {
  try {
    const body = res.json<{ message?: string; error?: string }>();
    return body.message ?? body.error ?? "unexpected error";
  } catch {
    return "unexpected error";
  }
}
