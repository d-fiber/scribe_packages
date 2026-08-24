# Coding style

I wrote this for whoever opens a package here without having written it. Every rule below is
followed by what it looks like when you get it wrong and when you get it right, because a rule you
have to interpret is a rule everybody interprets differently.

Read it once before your first change. After that, the examples are enough.

The first six points are what makes a package a package. The rest is TypeScript, and it holds
wherever you write it.

---

## 1. `lib/<name>.ts` is the whole surface, and it is a list

The entry re-exports, declares `scribe`, and does nothing else. No logic, no state, no side effect
outside the three lifecycle steps. Reading it should tell you what the package hands out and where
each piece lives.

```ts
// No: the entry does work, so importing the package does work.
export const transports = new TransportRegistry();
transports.use(new EventLogTransport());

// Yes: it names what exists, grouped by subject.
export { Realtime } from "./src/core/channel.ts";
export type { BroadcastOf } from "./src/core/channel.ts";

export { RealtimeTransports } from "./src/transport/registry.ts";
export { EventLogTransport } from "./src/transport/event_log.ts";
```

What is not in that list does not exist for anybody else. That is how `lib/src/` stays private: not
by a rule somebody enforces, but because no export points at it.

---

## 2. `scribe` is the only thing that runs at mount

The three moments belong there: `wires` at import, `starts` after boot, `stops` at shutdown. A
package that runs something at module scope runs it whether or not it was mounted. The member is
required, and a package that runs at none of the three writes it empty.

```ts
// No, in lib/src/: this fires the moment anything imports the file, connected or not.
RealtimeTransports.use(new EventLogTransport());
await syncDeclaredChannels();

// Yes, in the entry: the transport needs nothing, so it is wired at import.
export const scribe: LifecycleSteps = {
  wires: () => {
    RealtimeTransports.use(new EventLogTransport());
  },
  starts: () => syncDeclaredChannels(),
};
```

The rule that decides which of the two: if it needs the database, the cache or the network, it
cannot be wired at import.

---

## 3. `lib/contracts/` holds types and nothing else

No behaviour, no import of `lib/src/`, no dependency beyond `@scribe/core/contracts/`. They are what
crosses the boundary, so anything that executes makes them impossible to share.

```ts
// No: a contract that runs is a contract nobody can import from the other side.
export function isExpired(m: Membership): boolean { ... }

// Yes
/** Why a membership could not be written, retimed or removed. */
export enum AudienceError {
  /** This audience does not hold that member, so there is nothing to take out. */
  NotFound = "not_found",

  /** Postgres refused the query, or could not be reached. */
  Backend = "backend",
}
```

---

## 4. A package reaches `foundation`, never the host

`@scribe/core/` is the primitive layer, `@scribe/foundation/` is the engine. A package that imports
the host's own modules stops standing alone, and the lint plugin refuses it by name.

```ts
// No
import { serve } from "@scribe/host/core/host.ts";

// Yes
import { table } from "@scribe/foundation/database";
import type { Time } from "@scribe/core/contracts/common/time.ts";
```

---

## 5. `tests/testing/` is what a consumer stubs you with

It is a published surface, not a test helper. Somebody else's suite imports it, so it is documented
like the rest and it never reaches into another package's `lib/src/`.

```ts
/** A transport that keeps every row instead of sending it, so a test can read what was emitted. */
export class RecordingTransport implements RealtimeTransport {
  /** Every row handed over since this transport was installed, oldest first. */
  readonly rows: RealtimeRow[] = [];
}
```

---

## 6. Declaring is not doing

Most packages here are declared at module scope and act later: an audience, a channel, a link, a
search index. A declaration records what was asked for and touches nothing.

```ts
// No: the declaration reaches the database while the module is being evaluated.
export const editors = await Audience.keyed("project-editors").create();

// Yes: it records, and the entry's `starts` writes it once the database is reachable.
export const editors = Audience.keyed("project-editors");
```

A declaration that could be wrong should be refused by its type rather than at the first call. The
two ways of declaring an audience hand back two different types precisely so the compiler catches a
check that forgot its key.

---

## 7. Write like the file next to yours

The surrounding code decides the form. Naming, splitting, the way a fault is raised, the order of
declarations. A better answer that is foreign to the code it joins is still the wrong answer.

---

## 8. Name the thing, not its category

A name that could sit on anything names nothing.

```ts
// No
function process(data: Record<string, unknown>) { ... }
class ChannelManager { ... }
class StorageUtils { ... }

// Yes
export function syncDeclaredChannels(): Promise<void> { ... }
export function isValidTopic(topic: string): boolean { ... }
```

---

## 9. A function does the work its name promises, and nothing else

If the honest name contains "and", there are two functions. A function that reads changes nothing,
a function that checks writes nothing, and a function that answers a value leaves no file behind.

---

## 10. One level of abstraction per function

The function that orchestrates calls named steps. It does not build a query between two of them.

---

## 11. Past three parameters, a type is missing

And a boolean in a parameter list asks for two named functions. `AudienceOptions` exists for that
reason: it is what declaring takes beyond the name, and it is one thing to pass.

---

## 12. A class exposes what its name justifies

Read the name, then the list of members. A member that surprises belongs to another class.

State closes by default: `#private` fields, not the `private` keyword. `#` is enforced at runtime,
`private` is a compile-time promise anybody can cast away.

---

## 13. Two stars, not one

`/** */` is a documentation comment and the editor shows it on hover. `/* */` above the same
declaration is attached to nothing: the text is lost, and nothing warns you. One character apart.

```ts
/* No: invisible on hover, invisible in the generated docs, and it looks right. */
export function isValidTopic(topic: string): boolean { ... }

/** Yes: whoever types isValidTopic( sees this. */
export function isValidTopic(topic: string): boolean { ... }
```

---

## 14. Every export carries a `/** */`, and nothing here checks that it does

What is exported is the only surface a reader gets without opening the implementation, and
autocompletion shows them the signature and this comment and nothing else. No tool refuses an
undocumented export, so this one rests on you and on whoever reads your diff.

A one-sentence summary alone in its paragraph, and the tags after the prose.

---

## 15. Never write a type in a comment

TypeScript ignores `@type`, `@param {T}`, `@returns {T}` and the rest: the language already has
them, and it checks them. A type written in a comment is a type nobody verifies.

The tags worth writing are `@remarks`, `@throws`, `@example`, `@defaultValue`, `@see`, `{@link}`
and `@deprecated`, which is the only one the compiler acts on.

---

## 16. A function body carries no comment

What you were about to write in the middle goes up onto the declaration, where whoever calls it
will see it. The only `//` allowed inside a body is a directive a tool reads, glued to the line it
aims at, and always with its reason.

---

## 17. An exported interface documents every field, not the interesting ones

Two fields out of five documented reads as a claim that the other three have no unit, no range and
no provenance. The reader ends up distrusting all five.

---

## 18. A comment says why, never what

The what is on the line below, and it will still be true when the comment has stopped being so.

---

## 19. A test file carries no comment

The name of the case and the assertion message are what show up when the suite goes red. A comment
shows up nowhere. `TESTING.md` takes this further.

---

## 20. Write the way you would say it out loud

Everything you write here gets read by somebody: a comment, a commit message, a test name, an
assertion message, a log line. Write it in sentences, with a subject and a verb.

What gives away text that was not written for a person is punctuation doing the job of a word. An
arrow standing in for "gives", a row of equals signs standing in for a heading, a slash standing in
for "per".

```
No
0.412 ms/op -> 2427 ops/s
=== DONE! ===

Yes
0.412 ms per read, which is 2427 a second
the realtime stack is up
```

---

## 21. Say the real thing, in English

The words that sell something say nothing about it, and so do the phrases that describe code
without naming anything in it. Both survive forever, because there is nothing in them anybody could
prove wrong.

```
No
Handles the edge case for robustness.

Yes
Postgres sends the same notification twice when the connection is re-established, and the second
one must not re-broadcast, so the listener keys on the event identifier.
```

The source is in English, whatever language the work is discussed in: identifiers, comments, test
names, assertion messages, and whatever a script prints.

---

## What the tools hold you to

Nothing runs here. A package resolves only through the framework's import map, so the checks live
in a scribe checkout:

```sh
bash tool/test.sh
```

It copies these packages into the checkout beside this one, then runs the framework's own
`deno task check`, `deno lint` and `deno task test`. The licence headers and the release history
are checked here, by `.github/headers/check.sh` and `.github/version/check.sh`.

None of that judges whether the code is any good. That is what the twenty-one points above are for.
