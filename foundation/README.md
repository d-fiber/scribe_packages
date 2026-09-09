<h1 align="center">foundation</h1>

<h2 align="center">The engine every other package reaches.</h2>

<p align="center">
  The rows, the cache, the queue, the cron, the hook, the outbound HTTP client, the rate<br>
  limiter, and what reacts when a table changes. The package a project cannot mount without.
</p>

<p align="center"><b>Ten subjects, one door each. Import, declare, done.</b></p>

## What's inside

| Subject                     | Import from                   | What it is                                                                 |
| --------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| [`database`](#database)     | `@scribe/foundation/database` | the PostgREST engine, the owner scope in place of RLS                      |
| [`cache`](#cache)           | `@scribe/foundation/cache`    | `Valkery`, the shared cache, request coalescing and early refresh included |
| [`queue`](#queue)           | `@scribe/foundation/queue`    | the durable queue, NATS and Redis, at-least-once delivery                  |
| [`cron`](#cron)             | `@scribe/foundation/cron`     | the clock, with a lock per occurrence across replicas                      |
| [`hook`](#hook)             | `@scribe/foundation/hook`     | an extension point, answered inline or run in the background               |
| [`http`](#http)             | `@scribe/alchemy/http`        | the outbound client, swapped for a double under test                       |
| [`rate_limit`](#rate_limit) | `@scribe/alchemy`             | a call quota with an escalating penalty                                    |
| [`trigger`](#trigger)       | `@scribe/foundation/trigger`  | a row inserted, updated or deleted calling your code                       |
| [`observe`](#observe)       | `@scribe/alchemy/observe`     | the console logger and the process clock, filled by default                |
| [`redis`](#redis)           | `@scribe/foundation/redis`    | the store `cache`, `cron`, `queue` and `rate_limit` share                  |

Every subject but `observe` and `redis` has its own runnable file under `examples/`. The two left out are drivers other
subjects share, not something you call directly.

## `database`

A single table, typed by its row alone:

```ts
import { Database } from "@scribe/foundation/database";

interface OrderRow {
  id: string;
  account_id: string;
  total: number;
  status: string;
}

const orders = new Database<OrderRow>("orders");

await orders.where((f) => f.id.eq("o_1")).getOne();
await orders.insertOne({ total: 4200, status: "pending" });
await orders.where((f) => f.id.eq("o_1")).update({ status: "paid" });
```

Several tables that must agree on one set of names use `Table<S, K>` instead, bound once to a shared schema:

```ts
import { Table } from "@scribe/foundation/database";

type ShopSchema = { orders: { row: OrderRow }; line_items: { row: LineItemRow } };
class ShopTable<K extends keyof ShopSchema & string> extends Table<ShopSchema, K> {}

const orders = new ShopTable("orders");
const lineItems = new ShopTable("line_items");
```

Every query runs in service role and is bounded by an owner scope decided from whoever is calling, not by row level
security. `orders.unscoped()` steps outside it for code that already checked who is allowed to cross.

## `cache`

```ts
import { Duration } from "@scribe/alchemy";
import { Valkery } from "@scribe/foundation/cache";

const sessions = new Valkery<Session>({ key: "session", ttl: Duration.minutes(5) });

await sessions.get("u1"); // Session | null
await sessions.add("u1", session); // this instance's ttl
await sessions.upsert("u1", () => loadSession()); // computed once per key, even under load
await sessions.clear("tenant:*"); // a glob under the namespace
```

`upsert` is why `Valkery` exists rather than `get`/`add` by hand: concurrent callers of the same key share one
computation, and an entry close to expiry is refreshed by whoever draws the short straw while the old value keeps
answering everyone else.

## `queue`

```ts
import { Duration } from "@scribe/alchemy";
import { Queue } from "@scribe/foundation/queue";

const emails = new Queue<EmailJob>(
  { name: "emails", options: { maxRetries: 5, retryBackoff: Duration.seconds(30) } },
  async (job, message) => {
    if (message.attempts > 1) return; // at-least-once: tolerate a duplicate delivery
    await send(job.to, job.template);
  },
);

await emails.push({ to: "a@example.com", template: "welcome" });
await emails.push({ to: "a@example.com", template: "reminder" }, { delay: Duration.hours(24) });
```

## `cron`

```ts
import { at, Cron, CronTimezone, every } from "@scribe/foundation/cron";
import { Duration } from "@scribe/alchemy";

const digest = new Cron(
  { name: "daily-digest", schedule: at(CronTimezone.EuropeParis, "08:00") },
  () => sendDigest(),
);

const sweep = new Cron(
  { name: "sweep-expired", schedule: every(Duration.minutes(15)), timeout: Duration.minutes(2) },
  () => dropExpired(),
);
```

One occurrence, one winner: every replica shares the same lock, so a job never runs twice at once no matter how many
nodes are up.

## `hook`

```ts
import { Hook } from "@scribe/foundation/hook";
import { Failure, okay, type Result } from "@scribe/alchemy";

const signingUp = new Hook<SignUp, Result<void, "blocked_domain">>({ name: "auth.signing-up", fallback: okay });

signingUp.on((payload) => payload.email.endsWith("@blocked.example") ? new Failure("blocked_domain") : okay); // runs inline, same request, may refuse

signingUp.background(async (payload) => {
  await mail(payload.email);
}); // runs later, off the queue, cannot refuse

await signingUp.run({ accountId: "a1", email: "a@example.com" });
```

## `http`

```ts
import { http } from "@scribe/alchemy/http";
import { Duration } from "@scribe/alchemy";

await http.get("https://api.example.com/rates", { timeout: Duration.seconds(2) });
await http.post(url, { headers: { "content-type": "application/json" }, body: JSON.stringify(event) });

const client = http.open(); // several calls over one connection, closed by the caller
try {
  await Promise.all(urls.map((u) => client.read(u)));
} finally {
  client.close();
}
```

`foundation` fills the driver behind `http`; a test fills a different one, so nothing above ever takes a client as a
parameter.

## `rate_limit`

```ts
import { Duration, rateLimit } from "@scribe/alchemy";

const signIn = rateLimit({
  key: "sign-in:email",
  limit: 10,
  window: Duration.minutes(1),
  penalty: Duration.minutes(5),
  failOpen: false, // an unreachable store refuses instead of letting everyone through
});

const outcome = await signIn.check(node, accountId); // records a hit
if (!outcome.ok) return tooManyRequests(outcome.retryAfter);

await signIn.isBlocked(node, accountId); // reads without recording
```

## `trigger`

```ts
import { Trigger } from "@scribe/foundation/trigger";

const orders = Trigger.of<OrderRow>();

orders.onInsert("orders/{orderId}", async (change) => {
  await confirm(change.after.account_id, change.params.orderId);
});

orders.onFieldChange(
  { path: "orders/{orderId}/status", when: { from: "pending", to: "paid" } },
  async (change) => {
    await ship(change.row.id);
  },
);
```

No SQL to write: the trigger already sits on every table of `public`, and a declaration only registers a row the process
writes when it boots.

## `observe`

```ts
import { log } from "@scribe/alchemy/observe";
import { Now } from "@scribe/alchemy";

log.info("sign-in.succeeded", { metadata: { accountId } });
const startedAt = Now.get().millisecondsSinceEpoch();
```

`foundation` wires `Loggers` and `Now` to a console logger and the process clock the moment it is imported, so a line
written before a host configures anything still reaches somewhere. There is nothing under `@scribe/foundation/observe`
to construct directly.

## `redis`

```ts
import { kv } from "@scribe/foundation/redis";

await kv().get("some:key");
```

`cache`, the occurrence lock in `cron`, the delayed set in `queue`, and `rate_limit` all reach the same client through
`kv()`, opened on first use and never at import. Reach for this only when writing a fifth subject that needs the same
store; everything above already does.

## License

Mozilla Public License 2.0
