# Contributing to the scribe packages

This repository holds the mountable packages of the scribe framework. What you change here reaches every project that
mounts the package you touched, so a package that half works is worse than one that does not exist yet.

## Contributor License Agreement

Every pull request needs a signed CLA before it can be merged. It is one agreement for the whole
framework and one signature per contributor: signing once covers the five repositories, and there
is nothing to sign again here.

The reason is narrow and worth stating plainly: the licence lets you change your own copy, but it
does not give Fiber any right to your changes. Without a CLA, a patch cannot legally be merged
however good it is.

The agreement and the way to sign it are in
[the framework's `.github/cla/CLA.md`](https://github.com/d-fiber/scribe/blob/dev/.github/cla/CLA.md).
CI checks every commit author of a pull request against the register that repository holds, so a
signature added there takes effect here the moment it lands.

If you cannot sign it, open an issue describing the change instead. A clear description of the
problem is often more useful than the patch anyway.

## The licence, in one paragraph

This repository is under the Mozilla Public License 2.0. You may use it, change it, distribute it, and combine it with
files under any other licence, including a proprietary one. What you owe in return is per file: the source of every file
covered by these terms that you distribute, including the ones you changed, stays available under the same terms. The
full text is in `LICENSE`, and every file carries the notice.

By opening a pull request you are offering your change under those terms.

## Getting set up

You need Deno 2, and a scribe checkout beside this one. The second is not optional: a package resolves only through the
framework's import map, so there is no way to check or run one from here.

```
Fiber/scribe/
  scribe/            the framework
  scribe_packages/   this repository
```

```sh
git config core.hooksPath .githooks
bash tools/test.sh
```

The hooks line is worth the five seconds: `pre-push` runs what CI runs, so a fault stays in your terminal instead of
turning up somewhere it blocks a release. `git push --no-verify` skips it when you know what you are doing.

`tools/test.sh` copies these packages into the checkout beside this one and runs the framework's own `deno task check`,
`deno lint` and `deno task test` against them. Name another checkout with
`SCRIBE_CHECKOUT=~/code/scribe bash tools/test.sh`.

It leaves the copy in place. What you just proved is what is now sitting in that checkout, so discard it there when you
are done.

## Where your work goes

Everybody pushes to `dev`. There is no feature branch to make and no pull request to open, unless you are working from a
fork, in which case the pull request targets `dev` too.

`main` is the default branch, so that whoever lands here sees what is released rather than what is being written. That
also means GitHub offers `main` as the base of a new pull request, and it is the wrong one: change it to `dev`. Nothing
reaches `main` except a promotion.

## Before you push

Read `STYLE.md` first. Its first six points are what makes a package a package, and they are what your change is
reviewed against. `TESTING.md` says what the proof has to look like.

CI runs three checks, and the `pre-push` hook runs the same before your push leaves:

```
verify    these packages, put in a scribe checkout, type check, lint and pass its suite
headers   every source file carries the licence notice
commits   every message is tagged and under 72 characters
```

A file you add carries the licence notice, copied from the file next to it, before anything else in the file. That is
what `headers` refuses, and without the hook it refuses it after you pushed rather than before.

### Run what you wrote

Not the suite alone. If your change touches what only the real stack can answer, bring it up. Every package carries a
self-contained shell scenario that starts the stack, exercises it and tears it down:

```sh
bash storage/tests/e2e/scenario.sh   # one package
bash tools/e2e.sh                      # every package, then a sweep of whatever was left
```

An end to end suite that was never run is a claim, not a proof, and it is the half of the testing that the CI cannot do
for you.

### Write the test that would have caught it

A fault you found gets a test, written before the fix and failing without it. A rule, a refusal or a limit gets one too:
those paths are never walked by ordinary use, so nothing will report the day they stop working.

`TESTING.md` says when a test is owed, and which of the three kinds here it should be.

## Adding a package

A package is a directory carrying a `package.yaml`, and nothing else says so. `scribe create --package <name>` writes the
mandatory layout, and `scribe analyze .` reads every package here and reports what is wrong with each.

```
<name>/package.yaml   the name, the version, the framework it accepts, what it hands the stack
<name>/.gitignore     what the tools write, kept out of your commits
<name>/lib/<name>.ts  a list of re-exports, plus the `scribe` lifecycle
<name>/lib/contracts/ the types that cross the boundary, no behaviour
<name>/lib/src/       the code
<name>/tests/         the cases that need nothing running, plus tests/testing/ and tests/e2e/
<name>/deploy/        everything the stack reads, and nothing lives anywhere else
CHANGELOG.md          nothing to write, the CI writes it from your commit messages
```

Everything the stack consumes sits under `deploy/`, and only there:

```
deploy/
  configuration.yaml   the settings a project tunes, and the resources it requires
  db/{provisioning,init,migrations}/   the SQL, each played at its own moment
  services/<service>/   a service's compose fragments: docker-compose.yaml, capacity.yaml, resources.yaml, ...
  recipes/<type>/<class>.yaml   what answers a resource this package requires
  overlay.yaml          the minimal case: mounts db/ into a socle service
```

Fill in `description:`, which the skeleton leaves as an instruction, then the dependencies and the `scribe:` block. Its
paths point into `deploy/`: `db.init: ./deploy/db/init/`, and `services: [./deploy/services/<service>/]` for a package
that starts a container. `configuration.yaml`, `recipes/` and `overlay.yaml` are found where they sit and are not
declared.

Then, in the scribe checkout, the package gets one `imports` entry mapping `@scribe/<name>/` to its directory. It is not
a `workspace` member: a member needs a `deno.json`, and a package carries none.

A package's `tests/e2e/` holds a `scenario.sh` and its own copy of the harness: `support/stack.sh` and the
`fixtures/mini/` project. `tools/test.sh` runs every package's suite, `tools/e2e.sh` runs every package's scenario.

## Commit messages

```
[TAG]: message
```

In English, imperative, no full stop, subject under 72 characters. The eleven tags: `DEV`, `BUGFIX`, `REFACTO`, `DOC`,
`TEST`, `CI`, `PERF`, `SECURITY`, `BREAKING`, `REVERT`, `CHORE`. A merge commit is taken as it is, since its message
starts with `Merge`.

A message names something you can go and check in the diff. It is read in six months by somebody looking for why a line
exists, and what they need is the fact, not what you thought of your work that afternoon.

```
No
[DEV]: various improvements
[DEV]: add comprehensive audience validation
[BUGFIX]: fix bug

Yes
[BREAKING]: rename the two ways of declaring an audience
[DEV]: let a link route each visit, and declare its preview
[BUGFIX]: stop a channel from broadcasting to an audience it never named
```

If you cannot write the message in one line, the commit holds two things and wants splitting.

**One commit, one subject.** A working tree almost always holds unrelated things at once, and that is two commits rather
than one. It is what makes the history readable, `git revert` usable, and `git bisect` able to name a culprit.

**One commit, one package**, wherever that is possible. A change that genuinely spans two of them, because one declares
what the other reads, is one commit; a change that touches two because you were in the neighbourhood is two.

## Versions and releases

There is no version file here. **The tags are the version history**, and a package carries no version of its own: it
ships with the framework it sits in.

You do not write the changelog either. The `release` workflow takes the version you are cutting, reads every commit
since the last tag, groups them by their tag, writes the section, commits it to `dev`, and names that commit `vX.Y.Z`.

```
## 1.1.0

BREAKING:

- [BREAKING]: rename the two ways of declaring an audience (a1b2c3d)

DEV:

- [DEV]: let a link route each visit, and declare its preview (e4f5a6b)
```

The headings come in the order somebody reading it cares about: what breaks them, what they have to upgrade for, what
they gain, what stopped hurting, and the rest behind it. The commits that only write the changelog are left out, since
they are the bookkeeping rather than the work.

A tag never moves. `release` refuses a version that already exists rather than pointing it somewhere else.

## How this reaches the framework

`main` moves when the owner decides it moves, and nobody else. The `promote` workflow is run by hand, refuses anybody
else who asks, and refuses a version that was never tagged. Then it merges and writes the release from the changelog
sections `main` had not yet seen.

The arrival on `main` fires `sync`, which puts these packages into `scribe` at `engine/packages/`, checks that the
framework still type checks and passes its suite with them, and only then commits to its `dev`. It leaves this
repository's own files behind: the licence, the four documents, `.github/`, `.githooks/` and `tools/test.sh` belong to
working here, not to the framework.

You never copy anything into `scribe` by hand. Two copies of the same code, one of them edited, is the one failure this
arrangement exists to avoid.

Your work is done when it is on `dev` and the CI is green.

## Where the work stops

Some things are not yours to decide alone. Stop, and say what you found.

```
A secret in the diff              a token, a key, a .env, a long base64 in a config file
A generated file about to ship    tests/e2e/.generated and .postgres are ignored for a reason
A debugging leftover              a console.log in lib/src/, a suite narrowed with a filter
A container left running          a stack up on your machine is not a stack up on the runner
A change you cannot explain       a file you did not touch, modified, and you do not know why
```
