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

import {
  Caches,
  Claims,
  Crons,
  Databases,
  FileSystems,
  Hooks,
  Queues,
  RateLimiters,
  Triggers,
} from "@scribe/alchemy";
import { Clients } from "@scribe/alchemy/http";
import { Loggers } from "@scribe/alchemy/observe";
import { Now } from "@scribe/alchemy";
import type { LifecycleSteps } from "@scribe/alchemy";
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

export { Cron, type CronDefinition } from "./src/cron/cron.ts";
export { cronRegistry, type RegisteredCron } from "./src/cron/cron_registry.ts";
export { ScheduledCrons } from "./src/cron/scheduled_crons.ts";
export { cronRunner } from "./src/cron/cron_runner.ts";
export { type CronExpression, cronExpression } from "./src/cron/cron_expression.ts";
export { at, type TimeOfDay } from "./src/cron/daily_schedule.ts";
export { every } from "./src/cron/interval_schedule.ts";
export type { CronHandler, Schedule, Scheduled } from "./src/cron/schedule.ts";
export { CronTimezone } from "./src/cron/cron_timezone.ts";

export { database, DatabaseClient } from "./src/database/database_client.ts";
export { databaseSettings } from "./src/database/database_settings.ts";
export { ownerOf, registerTableOwners } from "./src/database/table_owners.ts";
export { type DatabaseSchema, Table, type TableShape } from "./src/database/table.ts";
export { from, type RpcBuilder, TablesBase } from "./src/database/tables_base.ts";
export { PostgrestDatabases } from "./src/database/postgrest_databases.ts";
export { wrote } from "./src/database/wrote.ts";
export { ownerScope, READS_EVERY_ROW, type ScopeDecision } from "./src/database/query/owner_scope.ts";
export { UnsafeFilterError } from "./src/database/query/filter_literal.ts";
export { DatabaseQueryError, TypedQueryBuilder } from "./src/database/query/typed_query_builder.ts";

export { Hook, type HookDefinition } from "./src/hook/hook.ts";
export { hookRegistry, type RegisteredHook } from "./src/hook/hook_registry.ts";
export { InlineHooks } from "./src/hook/inline_hooks.ts";
export type { BackgroundHookHandler, HookHandler } from "./src/hook/hook_handler.ts";

export { FetchClient, FetchClients } from "./src/http/fetch_client.ts";

export { ConsoleLogger } from "./src/observe/console_logger.ts";
export { type Kv, kv } from "./src/redis/kv.ts";
export { RedisClaims } from "./src/redis/claim_once.ts";
export { IDENTITY_CACHE_KEY, IdentityRevocation } from "./src/redis/identity_revocation.ts";
export { KeyIndex } from "./src/redis/key_index.ts";
export { LocalFiles, LocalFileSystems } from "./src/files/local_files.ts";
export { SystemNow } from "./src/observe/system_now.ts";

export {
  type BatchQueueDefinition,
  Queue,
  type QueueDefinition,
  type QueuePublisher,
} from "./src/queue/queue.ts";
export { queueSettings } from "./src/queue/queue_settings.ts";
export { queueRegistry } from "./src/queue/queue_registry.ts";
export { NatsQueues } from "./src/queue/nats_queues.ts";
export {
  QUEUE_DEFAULTS,
  type QueueDefaults,
  type QueueLimits,
  type QueueMode,
  type RegisteredQueue,
} from "./src/queue/queue_declaration.ts";
export { type QueueStatus, queueStatus } from "./src/queue/queue_status.ts";
export { queueRunner } from "./src/queue/runner/queue_runner.ts";
export type {
  BatchHandler,
  DrainResult,
  JobHandler,
  PushOptions,
  QueueMessage,
  QueueOptions,
} from "./src/queue/queue_options.ts";

export {
  DEFAULT_MAX_PENALTY,
  DEFAULT_STRIKE_MEMORY,
  RedisRateLimiter,
  RedisRateLimiters,
  SHARED_ADDRESS_MAX_PENALTY,
  SHARED_ADDRESS_STRIKE_MEMORY,
} from "./src/rate_limit/redis_rate_limiter.ts";
export { RateLimitBucket } from "./src/rate_limit/rate_limit_bucket.ts";
export { type RateLimitCommands, rateLimitCommands } from "./src/rate_limit/rate_limit_commands.ts";

export { Trigger } from "./src/trigger/trigger.ts";
export type {
  FieldsTarget,
  FieldTarget,
  Transition,
  TriggerMethods,
  TriggerOptions,
  TriggerTarget,
} from "./src/trigger/trigger.ts";
export type {
  ChangeHandler,
  DeleteChange,
  FieldChange,
  FieldsChange,
  InsertChange,
  TriggerOp,
  UpdateChange,
} from "./src/trigger/trigger_change.ts";
export { type RegisteredTrigger, triggerRegistry } from "./src/trigger/trigger_registry.ts";
export { triggerRunner } from "./src/trigger/trigger_runner.ts";
export { syncDeclaredSources } from "./src/trigger/trigger_sources.ts";
export { type TriggerSourceRow, triggerSources } from "./src/trigger/trigger_tables.ts";

export { DEFAULT_TTL, RedisCache, refreshesSettled } from "./src/cache/redis_cache.ts";
export { RedisCaches } from "./src/cache/redis_caches.ts";
export { cacheSettings } from "./src/cache/cache_settings.ts";
export { KeySpace } from "./src/cache/key_space.ts";
export { withJitter } from "./src/cache/ttl_jitter.ts";
export { DEFAULT_BETA } from "./src/cache/early_expiry.ts";
export {
  DistributedLock,
  DEFAULT_LOCK_HOLD,
  type LockErrorReporter,
  type LockOutcome,
} from "./src/cache/lock/distributed_lock.ts";
export { type LockCommands, lockCommands } from "./src/cache/lock/lock_commands.ts";

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
