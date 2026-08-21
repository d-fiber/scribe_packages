import { Isolate } from "@scribe/foundation/lib/src/isolate/mod.ts";
import { emails } from "./queue.ts";

/**
 * Work that runs off the caller's path, so the response does not wait for it.
 *
 * `run` answers nothing on purpose: there is no outcome to hand back, and a promise here
 * would invite an `await` that reads as waiting for the work when it waits for nothing. The
 * request scope is inherited, so what reads the caller's identity still answers inside the
 * body, but the request itself is over.
 */
export function warmUpAfterSignIn(accountId: string): void {
  Isolate.run(async () => {
    await refreshRecommendations(accountId);
  });
}

/**
 * The same work, put on a queue instead, because losing it would be noticed.
 *
 * A detached body lives in this process and nowhere else: a crash, a redeploy or a `SIGTERM`
 * takes it with them, and nothing replays it. A queue pays a NATS round trip for the
 * guarantee, and that is the whole of the choice between the two.
 */
export function mailAfterSignUp(email: string): Promise<string> {
  return emails.push({ to: email, template: "welcome" });
}

function refreshRecommendations(_accountId: string): Promise<void> {
  return Promise.resolve();
}
