import { Duration } from "@scribe/alchemy";
import { Queue } from "@scribe/foundation/lib/src/queue/mod.ts";
import type { QueueMessage } from "@scribe/foundation/lib/contracts/queue/queue.ts";

/** What one welcome mail needs to be sent, carried whole because a handler reads no request. */
interface EmailJob {
  /** The mailbox to send to. */
  readonly to: string;

  /** The template the mail is rendered from. */
  readonly template: string;
}

/** One page view, as a batch handler receives it. */
interface PageView {
  /** The path that was served. */
  readonly path: string;

  /** When it was served, in milliseconds since the epoch. */
  readonly at: number;
}

/**
 * Declaring a queue and holding its producer are the same call.
 *
 * The body stays with the declaration so a reader of the name can find what it does. Delivery
 * is at-least-once, so the body has to tolerate seeing the same message twice: a replica that
 * dies between handling and acknowledging gets it again.
 */
export const emails = new Queue<EmailJob>(
  { name: "emails", options: { maxRetries: 5, retryBackoff: Duration.seconds(30) } },
  async (job: EmailJob, message: QueueMessage<EmailJob>) => {
    if (message.attempts > 1) return;
    await send(job.to, job.template);
  },
);

/**
 * A queue whose body is called once with a group.
 *
 * `batch` is what puts it in that mode, and `lingerMs` is how long a partial group waits for
 * company. The group succeeds or fails whole, and a failed group runs again in full.
 */
export const views = new Queue<PageView>(
  { name: "page-views", batch: { lingerMs: 500 } },
  async (items: readonly PageView[]) => {
    await store(items);
  },
);

/** Pushes one job, and answers the identifier the queue assigned it. */
export function welcome(to: string): Promise<string> {
  return emails.push({ to, template: "welcome" });
}

/** Pushes a job that only becomes available later. */
export function remind(to: string): Promise<string> {
  return emails.push({ to, template: "reminder" }, { delay: Duration.hours(24) });
}

/** Pushes a group in one call, which is one publish per item and no round trip in between. */
export function welcomeAll(recipients: readonly string[]): Promise<string[]> {
  return emails.pushMany(recipients.map((to) => ({ to, template: "welcome" })));
}

/** What is waiting, what is due later, and what gave up. */
export async function backlog(): Promise<{ waiting: number; delayed: number; dead: number }> {
  return {
    waiting: await emails.size(),
    delayed: await emails.delayedCount(),
    dead: await emails.deadCount(),
  };
}

function send(_to: string, _template: string): Promise<void> {
  return Promise.resolve();
}

function store(_items: readonly PageView[]): Promise<void> {
  return Promise.resolve();
}
