import { isValidTopic } from "@scribe/realtime";
import { orders } from "./channels.ts";

/** Opens one topic of the channel to an account. */
export function hire(accountId: string): Promise<boolean> {
  return orders.topic("seller").grant(accountId);
}

/** Closes it again, which stops the next broadcast rather than the ones already heard. */
export function dismiss(accountId: string): Promise<boolean> {
  return orders.topic("seller").revoke(accountId);
}

/** Whether an account currently hears that topic. */
export function hears(accountId: string): Promise<boolean> {
  return orders.topic("seller").allows(accountId);
}

/** Every account granted on the topic, walking pages until the index runs dry. */
export async function audience(): Promise<string[]> {
  const accounts: string[] = [];
  let after = "";

  for (;;) {
    const page = await orders.topic("seller").grants(after);
    accounts.push(...page.accounts);
    if (!page.full) return accounts;
    after = page.last ?? "";
  }
}

/**
 * Grants on a topic a caller chose, which has to be checked before it is used.
 *
 * `topic()` throws on a name a channel cannot carry, so a project that builds one out of
 * caller input asks first and refuses on its own terms.
 */
export function grantOn(topic: string, accountId: string): Promise<boolean> | null {
  if (!isValidTopic(topic)) return null;
  return orders.topic(topic).grant(accountId);
}
