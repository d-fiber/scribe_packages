import { Realtime } from "@scribe/realtime";

/** What one order broadcast carries. */
interface Order {
  /** The identifier of the order, named as the key because the channel does not use `id`. */
  orderId: string;

  /** What the order is worth, in cents. */
  total: number;

  /** Where the order stands. */
  status: string;
}

/** What one price broadcast carries, keyed on `id` because that is the default. */
interface Price {
  /** The identifier of the article. */
  id: string;

  /** What it costs, in cents. */
  amount: number;
}

/**
 * A channel nobody hears until a grant is written for them.
 *
 * It is the one to reach for when the answer is not obvious, because the two others hand out
 * what they carry to a population the declaration cannot name.
 */
export const orders = Realtime.granted<Order>("order", { key: "orderId" });

/**
 * A channel every caller holding a session hears.
 *
 * No grant is needed, and none narrows it: a session is the whole of the condition.
 */
export const announcements = Realtime.authenticated<Price>("announcement");

/**
 * A channel anyone hears, session or not.
 *
 * What travels is as readable as what ships inside the application, so a public price belongs
 * here and anything tied to an account does not.
 */
export const prices = Realtime.public<Price>("price");

/** The three shapes of change, sent to everyone the channel's openness lets in. */
export async function broadcastOrder(order: Order): Promise<void> {
  await orders.all.insert(order);
  await orders.all.update(order);
  await orders.all.delete(order);
}

/**
 * An event of the project's own naming, beside the three the row's life gives.
 *
 * The action is lowercase snake case, thirty-two characters at most.
 */
export function shipped(order: Order): Promise<boolean> {
  return orders.all.emit("shipped", order);
}

/**
 * One account, and nobody else.
 *
 * No grant opens this and none can: the channel carries the identifier, and a caller hears it
 * when their token says they are that account.
 */
export function toAccount(accountId: string, order: Order): Promise<boolean> {
  return orders.to(accountId).update(order);
}

/**
 * The accounts granted on one topic of the channel.
 *
 * A project that takes a topic from a caller checks it with `isValidTopic` first, since a name
 * a channel cannot carry throws here.
 */
export function toSellers(order: Order): Promise<boolean> {
  return orders.topic("seller").update(order);
}
