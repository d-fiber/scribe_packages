# Tests

Writing is not finishing. A change is done when it has run, not when it looks right, and "it should
work" is a hypothesis rather than a state.

`STYLE.md` says what the code has to look like. This says what the proof has to look like.

---

## 1. Nothing here runs on its own, so proving starts by leaving

A package's imports resolve only through the framework's import map. `deno test realtime/tests`
from this repository does not fail on your change, it fails on `not a dependency and not in import
map`, which teaches nothing.

```sh
bash tool/test.sh                       # uses ../scribe
SCRIBE_CHECKOUT=~/code/scribe bash tool/test.sh
```

It copies these packages into that checkout and runs the framework's own checks against them. That
is what the CI does, and what the sync does before it pushes, so it is the only signal worth
reading.

It also leaves the copy in place. What you just proved is what is now sitting in that checkout, so
discard it there when you are done.

---

## 2. Three kinds of test live here, and they are not reached the same way

```
tests/tests/    needs nothing running        scribedev pkg test, from the package
tests/e2e/      needs the containers up      deno task test:e2e:<package>, in scribe/host
tests/testing/  is not a test at all         it is what a consumer stubs you with
```

`tests/tests/` is where most of the proof belongs: a declaration, a key, a mapper, a refusal. No
container, no clock, no network.

`tests/e2e/` is for what only the real stack can answer: a notification that actually crosses
Postgres, an object that actually lands in the bucket, an index that actually returns a hit. Its
files end in `.e2e.ts`, so `scribedev pkg test` walks past them.

`tests/testing/` is a published surface. It is documented like the rest, and its own correctness is
proved by a case in `tests/tests/` that uses it, since somebody else's suite will.

---

## 3. Bringing the stack up is one command per package

```sh
bash tool/e2e/up.sh realtime
```

Then run the suite from the scribe checkout:

```sh
deno task test:e2e:realtime
```

And take it down when you are done, because a stack left running is a stack the next suite inherits:

```sh
bash tool/e2e/down.sh realtime
bash tool/e2e/reset.sh realtime     # and forget what Postgres kept
```

An end to end test that passes against a stack somebody else left up has proved nothing about a
fresh one.

---

## 4. A test is written when its absence would let the problem come back

Not every change needs one, and pretending otherwise makes the suite noise.

```
It needs one
A fault you found                      it comes back otherwise, and nothing will say so
A rule, a refusal, a limit             ordinary use never walks that path
A declaration that decides something   so that nobody undoes the decision by accident
A function with branches               many cases for very little setup

It does not
A rename the compiler checks entirely
A change of wording
A move with no change of behaviour
```

When you are unsure, the question is who will tell you if this breaks in six months. When the
answer is nobody, write the test.

---

## 5. Take the cheapest test that proves the thing

An end to end test costs a stack, a minute, and a flake you will chase later. Reach for it only
when the answer genuinely depends on the real thing being there.

```ts
// No: a container brought up to prove that a key is built from a name and a scope.
Deno.test("e2e: a keyed audience builds its key", async () => { ... });

// Yes: the same proof, with nothing running.
Deno.test("a keyed audience narrows its key by the scope it was given", () => {
  assertEquals(keyOf("project-editors", "p1"), "audience:project-editors:p1");
});
```

---

## 6. A test you have never seen fail proves nothing

See it red before you see it green. A test written after the fix, passing first time, has
demonstrated nothing and may be checking nothing at all.

It also tends to describe what the code does rather than what it should do, bug included, because
you copied the output into the expectation. Decide the expected value before looking at the result.

---

## 7. When a test goes red, the code is wrong until proven otherwise

Adjusting the expectation removes the only warning you had.

---

## 8. The name of the case and the assertion message are the whole documentation

They are what shows up when the suite is red. A comment shows up nowhere, so a test file carries
none.

```ts
// No
Deno.test("audience", async () => {
  // somebody who joined should belong
  ...
});

// Yes
Deno.test("somebody who joined an audience belongs to it", async () => {
  assert(await belongs("beta", "ada"), "ada joined beta and does not belong to it");
});
```

The name says the case and what is expected of it. The message says what distinguishes this
assertion from the others in the same case.

---

## 9. Assert on the part of the sentence that carries the meaning

Otherwise every reword turns the suite red for nothing, and teaches nobody anything when it does.

```ts
// No
assertEquals(error.message, "This audience does not hold that member, so there is nothing to take out.");

// Yes
assertEquals(error.kind, AudienceError.NotFound, "the refusal is not the one that was expected");
```

---

## 10. Setup that needs explaining wants a name

```ts
// No
const a = await declare("x-" + crypto.randomUUID()); // unique so the suites do not collide

// Yes
const editors = audienceForThisRun("editors");
```

A helper shared by the cases of one file lives at the top of that file. A helper several files
share belongs in `tests/testing/`, and being shared makes it code like any other: its surface is
documented.

---

## 11. An end to end test names its own run

The stack is shared between the cases of a package, and sometimes between two runs. A fixture with
a fixed name passes alone and fails the moment anything else is on the same Postgres.

```ts
const editors = Audience.keyed(`e2e-editors-${RUN_ID}`);
```

---

## 12. Take away what you made to test

Rows, buckets, indexes, containers, and the copy `tool/test.sh` left in the scribe checkout. Left
behind, they become a state somebody will eventually take for real.

Delete by looking at what you delete. List first, name what goes, and never delete a pattern.

---

## 13. Say what you ran, and say what you did not

A verification you announce without having done it is worse than one you skipped, because it hands
over confidence that rests on nothing.

```
No
Tested, everything passes.

Yes
tool/test.sh is green: the framework type checks with these packages and its 1064 tests pass.
I brought up the realtime stack and ran test:e2e:realtime, 12 cases. I did not run the storage
end to end suite, so the bucket change is unverified against a real MinIO.
```

When something fails, report it with the real output. A failure described from memory loses exactly
the detail that would have explained it.

---

## What runs it

```sh
bash tool/test.sh                    # headers, version, then the framework's checks with these packages
bash .github/headers/check.sh        # the licence notice on every source file
bash .github/version/check.sh 1.1.0  # whether that version is free to cut

bash tool/e2e/up.sh <package>        # the containers one package needs
bash tool/e2e/down.sh <package>
```

Green on all of them is the floor, not the finish. What the suite cannot tell you is whether the
thing was worth writing that way, and `STYLE.md` is where that gets decided.
