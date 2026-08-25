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
 * What "foundation" hands whoever mounts it.
 *
 * @remarks
 * Everything it is made of lives in `src/`, and this is the one file that publishes it. A package
 * writes `@scribe/foundation` and nothing else: each name below is reached from the file that
 * declares it, so there is one list to read and no barrel between it and the code.
 *
 * One entry rather than nine, and no `mod.ts` under `src/`, because a barrel is a second place a
 * name can be published from and a second place it can be forgotten. What the package publishes is
 * this list, and a file that is not named here is not published.
 *
 * What it wires at import is the drivers it carries: the vocabulary a package writes lives in
 * alchemy, and what answers it is filled here. Nothing else of the package runs at a moment of its
 * own. It poses SQL, starts containers and answers when something asks it to, and none of that
 * needs to happen at import or after boot.
 */

import { Caches, Claims, Crons, Databases, FileSystems, Hooks, Queues, RateLimiters, Triggers } from "@scribe/alchemy";
import { Clients } from "@scribe/alchemy/http";
import { Loggers } from "@scribe/alchemy/observe";
import { Now } from "@scribe/alchemy";
import type { LifecycleSteps } from "@scribe/alchemy";
import { EXTENSION_CRON, EXTENSION_QUEUE } from "@scribe/contracts/extensions.ts";
import { extensions, OptionalExtension, runDeclarations } from "@scribe/runtime/support/extensions/mod.ts";
import { FetchClients } from "./src/http/fetch_client.ts";
import { RedisCaches } from "./src/cache/redis_caches.ts";
import { RedisClaims } from "./src/redis/claim_once.ts";
import { NatsQueues } from "./src/queue/nats_queues.ts";
import { InlineHooks } from "./src/hook/inline_hooks.ts";
import { ScheduledCrons } from "./src/cron/scheduled_crons.ts";
import { OutboxTriggers } from "./src/trigger/outbox_triggers.ts";
import { PostgrestDatabases } from "./src/database/postgrest_databases.ts";
import { LocalFileSystems } from "./src/files/local_files.ts";
import { RedisRateLimiters } from "./src/rate_limit/redis_rate_limiter.ts";
import { ConsoleLogger } from "./src/observe/console_logger.ts";
import { SystemNow } from "./src/observe/system_now.ts";

export type { CacheSettings, DatabaseSettings, QueueSettings } from "./src/settings.ts";
export { optional, required } from "./src/environment.ts";

/**
 * When this package runs, which is once, at import, to answer the slots its drivers are for.
 *
 * @remarks
 * Each slot is filled only when nothing has filled it. A step every package runs cannot write
 * over what a host settled: `Slot.use` does not refuse a second call, so an unconditional write
 * makes the last package imported win, and a fallback that wins is not a fallback. A test that
 * put something there keeps it, which is what a test putting something there is for.
 *
 * None of these drivers reads a slot or opens a connection while it is being built, which is what
 * makes import the right moment: the settings they need are read at the first call, not here.
 */
export const scribe: LifecycleSteps = {
  wires: () => {
    if (!extensions.declares(EXTENSION_QUEUE)) {
      extensions.register(new OptionalExtension(EXTENSION_QUEUE, () => runDeclarations("queues")));
    }
    if (!extensions.declares(EXTENSION_CRON)) {
      extensions.register(new OptionalExtension(EXTENSION_CRON, () => runDeclarations("crons")));
    }

    if (!Clients.configured) Clients.use(new FetchClients());
    if (!Loggers.configured) Loggers.use(new ConsoleLogger());
    if (!Now.configured) Now.use(new SystemNow());
    if (!Caches.configured) Caches.use(new RedisCaches());
    if (!Claims.configured) Claims.use(new RedisClaims());
    if (!RateLimiters.configured) RateLimiters.use(new RedisRateLimiters());
    if (!Queues.configured) Queues.use(new NatsQueues());
    if (!Hooks.configured) Hooks.use(new InlineHooks());
    if (!Crons.configured) Crons.use(new ScheduledCrons());
    if (!Triggers.configured) Triggers.use(new OutboxTriggers());
    if (!Databases.configured) Databases.use(new PostgrestDatabases());
    if (!FileSystems.configured) FileSystems.use(new LocalFileSystems());
  },
};
