import { ClientException, FetchClient, get, post, read, runWithClient } from "@scribe/foundation/lib/src/http/mod.ts";
import type { Response } from "@scribe/foundation/lib/src/http/mod.ts";

/** The shape the rates endpoint answers with. */
interface Rates {
  /** One rate per currency code. */
  readonly rates: Record<string, number>;
}

/**
 * A one-off exchange, which opens the current client and closes it again.
 *
 * `del` and `read` carry those names rather than `delete` and `readString` because one of the
 * two is a reserved word and the other is the name the underlying library uses.
 */
export function ping(url: string): Promise<Response> {
  return get(url, { timeout: 2_000 });
}

/**
 * A record body goes out as a form, a string as text, and bytes as they are.
 *
 * A `content-type` given in the headers is never overwritten by the one the body would have
 * implied, which is how a caller sends JSON.
 */
export function publish(url: string, event: object): Promise<Response> {
  return post(url, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

/** Reads a body as text, which throws on any status but a 2xx. */
export async function rates(url: string): Promise<Rates | null> {
  try {
    return JSON.parse(await read(url)) as Rates;
  } catch (error) {
    if (error instanceof ClientException) return null;
    throw error;
  }
}

/**
 * Substitutes the client every call underneath will use.
 *
 * It is what a test replaces to keep a suite off the network, and what a caller uses to give
 * a whole call tree a client that retries or logs. The convenience functions above resolve
 * the current client at each call, so nothing has to be threaded through.
 */
export function withOwnClient<T>(body: () => Promise<T>): Promise<T> {
  return runWithClient(body, () => new FetchClient());
}
