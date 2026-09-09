import { type LoggedEntry, LogSink, printEntry } from "@scribe/sdk";

/**
 * Where the logs of this node go.
 *
 * Declaring it is what keeps this node's entries away from `lib/_logs.ts`: an
 * entry looks for its own node's sink first, and only falls back on the root
 * one when the node declared none. So this file and that one never see the same
 * entry, and deleting this one hands every entry of the node to the root.
 *
 * Nothing is printed unless a sink says so, here or on the host, so deleting
 * both is what turns the node silent.
 */
export class ExampleLogs extends LogSink {
  /**
   * How many entries gather before {@link block} is called.
   *
   * Larger is fewer round trips and a longer wait before anything leaves the
   * process, which is what a crash loses. Left alone, entries are handed over
   * one at a time.
   */
  protected override blockSize(): number {
    return 200;
  }

  /** Called once per entry, as it happens. */
  protected override each(entry: LoggedEntry): void {
    printEntry(entry);
  }

  /**
   * Called with a whole block, which is where a collector belongs.
   *
   * What this throws is caught and reported, so a collector that is down cannot
   * break the request it was describing. The block is lost with it.
   */
  protected override async block(
    entries: readonly LoggedEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;

    await fetch("https://logs.example.com/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entries),
    });
  }
}
