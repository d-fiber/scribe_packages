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
 * writes `@scribe/foundation` and nothing else: every export below is grouped by the subject it
 * belongs to, so there is one file to read and no second door a name can be published from or
 * forgotten under.
 *
 * `ConsoleLogger`, `SystemNow` and the `inits` query builder are not exported at all, on purpose.
 * The first two are the drivers this file wires into `Loggers`/`Now` at import, below, and neither
 * has a reason to be constructed a second time by whatever mounts this package. `inits` is read
 * only by the engine's own init runner, which decides what already ran and what still needs to; a
 * package or a project reaching it directly could mark a job as run without running it, or the
 * reverse, so it stays reached through `@scribe/foundation/internal/lifecycle_tables`, a door the
 * engine's own `_collection.json` opens and nothing else does.
 *
 * What it wires at import is the drivers it carries: the vocabulary a package writes lives in
 * alchemy, and what answers it is filled here. Nothing else of the package runs at a moment of its
 * own. It poses SQL, starts containers and answers when something asks it to, and none of that
 * needs to happen at import or after boot.
 */

import { Caches, Claims, Crons, Databases, Hooks, Init, Queues, RateLimiters, Run, Triggers } from "@scribe/alchemy";
import { Clients } from "@scribe/alchemy/http";
import { Loggers } from "@scribe/alchemy/observe";
import { Now } from "@scribe/alchemy";
import type { LifecycleSteps } from "@scribe/alchemy";
import { capabilities } from "@scribe/contracts/capability.ts";
import { EXTENSION_CRON, EXTENSION_INIT, EXTENSION_QUEUE, EXTENSION_RUN } from "@scribe/contracts/extensions.ts";
import { wireFoundation } from "./src/capability/wire.ts";
import { Cron } from "./src/cron/cron.ts";
import { Queue } from "./src/queue/queue.ts";
import { extensions, OptionalExtension, runDeclarations } from "@scribe/runtime/wiring/extensions/mod.ts";
import { FetchClients } from "./src/http/fetch_client.ts";
import { RedisCaches } from "./src/cache/redis_caches.ts";
import { RedisClaims } from "./src/redis/claim_once.ts";
import { FoundationQueues } from "./src/queue/foundation_queues.ts";
import { queueBackend } from "./src/queue/queue_backend.ts";
import { InlineHooks } from "./src/hook/inline_hooks.ts";
import { ScheduledCrons } from "./src/cron/scheduled_crons.ts";
import { cronRegistry } from "./src/cron/cron_registry.ts";
import { cronRunner } from "./src/cron/cron_runner.ts";
import { OutboxTriggers } from "./src/trigger/outbox_triggers.ts";
import { syncDeclaredSources } from "./src/trigger/trigger_sources.ts";
import { triggerRegistry } from "./src/trigger/trigger_registry.ts";
import { triggerRunner } from "./src/trigger/trigger_runner.ts";
import { PostgrestDatabases } from "./src/database/postgrest_databases.ts";
import { RedisRateLimiters } from "./src/rate_limit/redis_rate_limiter.ts";
import { ConsoleLogger } from "./src/observe/console_logger.ts";
import { SystemNow } from "./src/observe/system_now.ts";

export type { CacheSettings, DatabaseSettings, QueueSettings } from "./src/settings.ts";

/** Values kept for a while, and the keys they hang under. */
export {
  DEFAULT_LOCK_HOLD,
  DistributedLock,
  type LockErrorReporter,
  type LockOutcome,
} from "./src/cache/lock/distributed_lock.ts";
export { DEFAULT_BETA } from "./src/cache/early_expiry.ts";
export { DEFAULT_TTL, refreshesSettled, Valkery } from "./src/cache/cache.ts";
export { KeySpace } from "./src/cache/key_space.ts";
export { cacheSettings } from "./src/cache/cache_settings.ts";
export { withJitter } from "./src/cache/ttl_jitter.ts";

/** Work a schedule runs, and what decides when it next runs. */
export type { CronHandler, Schedule, Scheduled } from "./src/cron/schedule.ts";
export { Cron, type CronDefinition } from "./src/cron/cron.ts";
export { CronTimezone } from "./src/cron/cron_timezone.ts";
export { at, type TimeOfDay } from "./src/cron/daily_schedule.ts";
export { every } from "./src/cron/interval_schedule.ts";
export { type CronExpression, cronExpression } from "./src/cron/cron_expression.ts";

/** Tables, the queries built against them, and what a query is allowed to see. */
export {
  assertPlainColumn,
  keywordLiteral,
  quoteFilterList,
  quoteFilterLiteral,
  UnsafeFilterError,
} from "./src/database/query/filter_literal.ts";
export { DatabaseQueryError, TypedQueryBuilder } from "./src/database/query/typed_query_builder.ts";
export { NOBODY, ownerScope, READS_EVERY_ROW, type ScopeDecision } from "./src/database/query/owner_scope.ts";
export { PostgrestClients } from "./src/database/postgrest_clients.ts";
export { database, DatabaseClient } from "./src/database/database_client.ts";
export { databaseSettings } from "./src/database/database_settings.ts";
export { from, type RpcBuilder, TablesBase } from "./src/database/tables_base.ts";
export { ownerOf, registerTableOwners } from "./src/database/table_owners.ts";
export { Database, type DatabaseSchema, Table, type TableShape } from "./src/database/table.ts";
export { wrote } from "./src/database/wrote.ts";

/** Events a project emits, and the handlers that answer them. */
export type { BackgroundHookHandler, HookHandler } from "./src/hook/hook_handler.ts";
export { Hook, type HookDefinition } from "./src/hook/hook.ts";

/** The client this package makes outgoing calls with, and the driver that opens one. */
export { FetchClient, FetchClients } from "./src/http/fetch_client.ts";

/** Work handed over to be done later, and what runs it. */
export type {
  BatchHandler,
  DrainResult,
  JobHandler,
  PushOptions,
  QueueMessage,
  QueueOptions,
} from "./src/queue/queue_options.ts";
export {
  QUEUE_DEFAULTS,
  type QueueDefaults,
  type QueueLimits,
  type QueueMode,
  type RegisteredQueue,
} from "./src/queue/queue_declaration.ts";
export { queueRegistry } from "./src/queue/queue_registry.ts";
export { queueSettings } from "./src/queue/queue_settings.ts";
export { type BatchQueueDefinition, Queue, type QueueDefinition, QueuePublisher } from "./src/queue/queue.ts";
export { type QueueStatus, queueStatus } from "./src/queue/queue_status.ts";

/** How often one caller may ask, and what happens when it asks more. */
export { RateLimitBucket } from "./src/rate_limit/rate_limit_bucket.ts";

/** The store behind the cache, the claims and the key index. */
export { IDENTITY_CACHE_KEY, IdentityRevocation } from "./src/redis/identity_revocation.ts";
export { KeyIndex } from "./src/redis/key_index.ts";
export { type Kv, kv } from "./src/redis/kv.ts";

/** What a row being written sets off. */
export type {
  ChangeHandler,
  DeleteChange,
  FieldChange,
  FieldsChange,
  InsertChange,
  TriggerOp,
  UpdateChange,
} from "./src/trigger/trigger_change.ts";
export type {
  FieldsTarget,
  FieldTarget,
  Transition,
  TriggerMethods,
  TriggerOptions,
  TriggerTarget,
} from "./src/trigger/trigger.ts";
export { Trigger } from "./src/trigger/trigger.ts";

/**
 * The kinds a project may declare against this package, bucket to the symbol it imports.
 *
 * @remarks
 * Read by `scribe gen code`, which is the only reader: it is what tells the tool that mounting
 * "foundation" gives a project a "queues", a "crons", an "inits" and a "runs" bucket to write
 * into, without either the framework or the tool ever naming this package.
 */
export const declares = { queues: Queue, crons: Cron, inits: Init, runs: Run };

/**
 * The console logger this package wired, so `stops` can flush what it is still holding.
 *
 * Null when a host filled `Loggers` first: `wires` never constructs one in that case, and there
 * is nothing here to flush on the way out.
 */
let _consoleLogger: ConsoleLogger | null = null;

/** The three moments a host calls into this package: once at import, once at start, once at stop. */
export const scribe: LifecycleSteps = {
  /**
   * Fills every slot this package's drivers answer, once, at import.
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
  wires: () => {
    if (!extensions.declares(EXTENSION_QUEUE)) {
      extensions.register(
        new OptionalExtension(EXTENSION_QUEUE, () => runDeclarations("queues")),
      );
    }
    if (!extensions.declares(EXTENSION_CRON)) {
      extensions.register(
        new OptionalExtension(EXTENSION_CRON, () => runDeclarations("crons")),
      );
    }
    if (!extensions.declares(EXTENSION_INIT)) {
      extensions.register(
        new OptionalExtension(EXTENSION_INIT, () => runDeclarations("inits")),
      );
    }
    if (!extensions.declares(EXTENSION_RUN)) {
      extensions.register(
        new OptionalExtension(EXTENSION_RUN, () => runDeclarations("runs")),
      );
    }

    if (!Clients.configured) Clients.use(new FetchClients());
    if (!Loggers.configured) {
      _consoleLogger = new ConsoleLogger();
      Loggers.use(_consoleLogger);
    }
    if (!Now.configured) Now.use(new SystemNow());
    if (!Caches.configured) Caches.use(new RedisCaches());
    if (!Claims.configured) Claims.use(new RedisClaims());
    if (!RateLimiters.configured) RateLimiters.use(new RedisRateLimiters());
    if (!Queues.configured) Queues.use(new FoundationQueues());
    if (!Hooks.configured) Hooks.use(new InlineHooks());
    if (!Crons.configured) Crons.use(new ScheduledCrons());
    if (!Triggers.configured) Triggers.use(new OutboxTriggers());
    if (!Databases.configured) Databases.use(new PostgrestDatabases());

    capabilities.register(wireFoundation);
  },

  /**
   * Brings this package's background work up: the declared crons, the queue backend's own
   * draining loop, and the trigger runner.
   *
   * @remarks
   * A project with no declared trigger never records a table as emitting, which is why the sync
   * only runs when {@link triggerRegistry} actually lists one.
   */
  starts: async () => {
    await extensions.load(EXTENSION_CRON);
    console.info(cronRegistry.report());
    cronRunner.start();

    queueBackend().startDraining();

    console.info(triggerRegistry.report());
    if (triggerRegistry.list().length > 0) {
      const tables = await syncDeclaredSources();
      console.info(`[trigger] ${tables} table(s) recorded as emitting`);
    }
    triggerRunner.start();
  },

  /**
   * Brings this package's background work back down, in the reverse order `starts` brought it up,
   * and flushes whatever the console logger is still holding.
   */
  stops: () => {
    cronRunner.stop();
    queueBackend().stopDraining();
    triggerRunner.stop();
    _consoleLogger?.flush();
  },
};
