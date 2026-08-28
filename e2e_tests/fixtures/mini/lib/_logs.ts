import { type LoggedEntry, LogSink, printEntry } from "@scribe/sdk";

/**
 * Where the entries no node took go.
 *
 * An entry looks for its own node's sink first and lands here only when that
 * node declared none, so a node holding a `_logs.ts` of its own never reaches
 * this file. What is left is two things: the nodes that declared nothing, and
 * the entries that belong to no node at all, which nothing else can take.
 *
 * Deleting this file is what makes those two silent.
 */
export class ProjectLogs extends LogSink {
  protected override each(entry: LoggedEntry): void {
    printEntry(entry);
  }
}
