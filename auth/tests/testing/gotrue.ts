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

import { installAuthTestSettings } from "./settings.ts";

installAuthTestSettings();
import type { InstalledMock } from "@scribe/testing/install.ts";

/** One call this package made to GoTrue, as this mock recorded it. */
export interface GoTrueCall {
  /** The HTTP method the package sent, uppercased. */
  readonly method: string;

  /** The GoTrue path the call reached, `/auth/v1` already stripped. */
  readonly path: string;

  /** The decoded request body, or `null` when the call carried none or it could not be parsed. */
  readonly body: Record<string, unknown> | null;
}

/**
 * Answers a fixed response for a matched call, or `undefined` to let the next matching route
 * try instead of failing the call outright.
 */
export type GoTrueHandler = (
  call: GoTrueCall,
) => { status: number; body?: unknown } | undefined;

/** A stand-in for GoTrue that answers a test's own routed responses instead of a real service. */
export interface GoTrueMock extends InstalledMock {
  /** Every call this mock has answered so far, in the order it received them. */
  readonly calls: GoTrueCall[];

  /** Every call this mock has answered so far, as `"METHOD /path"`, for a test that only cares which endpoints were reached. */
  paths(): string[];

  /** How many recorded calls match `method` and `path` exactly, query string ignored. */
  called(method: string, path: string): number;

  /**
   * Adds `handler` for `matcher`, ahead of every route already registered.
   *
   * @remarks
   * `matcher` is `"METHOD /path"`, with a trailing `*` matching any path that starts with the
   * prefix. Routes added later run first, so a test can override the routes `installGoTrueMock`
   * was given without having to rebuild the whole table.
   */
  route(matcher: string, handler: GoTrueHandler): void;
}

/** `url`'s path and query, with the `/auth/v1` GoTrue mounts under stripped, to match {@link GoTrueCall.path}. */
function _path(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\/auth\/v1/, "") + parsed.search;
}

/** Whether `matcher`'s method and path pattern, a trailing `*` meaning any prefix, matches `call`. */
function _matches(matcher: string, call: GoTrueCall): boolean {
  const [method, pattern] = matcher.split(" ");
  if (method !== call.method) return false;
  if (pattern.endsWith("*")) return call.path.startsWith(pattern.slice(0, -1));
  return call.path === pattern;
}

/**
 * Replaces `globalThis.fetch` with a router that answers `routes` and records every call, so a
 * test can exercise this package's GoTrue calls without a real service behind them.
 *
 * @remarks
 * A call that matches no route, or whose handler answers `undefined`, gets a `501` with an
 * `error_code` of `not_mocked` rather than falling through to the real network: a test whose
 * fixture is missing a route should fail loudly on that call, not make a live request.
 */
export function installGoTrueMock(
  routes: Record<string, GoTrueHandler> = {},
): GoTrueMock {
  const calls: GoTrueCall[] = [];
  const table: [string, GoTrueHandler][] = Object.entries(routes);

  function _decodeBody(body: BodyInit | null | undefined): Record<string, unknown> | null {
    if (body === null || body === undefined) return null;

    const text = typeof body === "string" ? body : body instanceof Uint8Array ? new TextDecoder().decode(body) : null;
    if (text === null) return null;

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const original = globalThis.fetch;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    // The package client encodes a body to bytes before it reaches fetch, so a harness that
    // only reads strings sees every payload as absent and lets the call through to the network.
    const body = _decodeBody(init?.body);

    const call: GoTrueCall = { method, path: _path(url), body };
    calls.push(call);

    for (const [matcher, handler] of table) {
      if (!_matches(matcher, call)) continue;
      const result = handler(call);
      if (!result) continue;
      return Promise.resolve(
        new Response(
          result.body === undefined ? null : JSON.stringify(result.body),
          {
            status: result.status,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          error_code: "not_mocked",
          msg: `${method} ${call.path}`,
        }),
        {
          status: 501,
          headers: { "content-type": "application/json" },
        },
      ),
    );
  }) as typeof globalThis.fetch;

  return {
    calls,
    paths: () => calls.map((c) => `${c.method} ${c.path}`),
    called: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path.split("?")[0] === path)
        .length,
    route(matcher: string, handler: GoTrueHandler): void {
      table.unshift([matcher, handler]);
    },
    restore(): void {
      globalThis.fetch = original;
    },
  };
}

/**
 * A GoTrue session response with every field a real one carries, `overrides` replacing whichever
 * a test needs to control, so a route handler never has to restate the fields it does not care
 * about.
 */
export function goTrueSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: goTrueUser(),
    ...overrides,
  };
}

/**
 * A GoTrue user with every field a real one carries, `overrides` replacing whichever a test
 * needs to control, so a route handler never has to restate the fields it does not care about.
 */
export function goTrueUser(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "user-1",
    aud: "authenticated",
    role: "authenticated",
    email: "u1@example.com",
    phone: null,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    phone_confirmed_at: null,
    confirmed_at: "2026-01-01T00:00:00Z",
    last_sign_in_at: null,
    app_metadata: { provider: "email", role: "user" },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** The body GoTrue answers an error with, `msg` defaulting to `code` when a test does not care about the message. */
export function goTrueError(
  code: string,
  msg = code,
): { error_code: string; msg: string } {
  return { error_code: code, msg };
}
