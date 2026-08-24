# scribe packages

The mountable packages of the [scribe](https://github.com/d-fiber/scribe) framework.

Each one is a directory that stands on its own: its own entry, its own contracts, its own SQL, its
own containers, its own tests. A project mounts the ones it wants and gets nothing else.

## The eight

| Package | What it holds |
| --- | --- |
| `foundation` | the one a project cannot do without: the PostgREST engine, the cache, the queue, the cron, the hook, the outbound HTTP client, the rate limiter, the isolate, the trigger runner |
| `auth` | what an account is, from sign up to device trust: the providers, the sessions, the pending tokens, the bans |
| `realtime` | a row's life, broadcast to the callers a channel lets in |
| `storage` | the objects, the buckets and the derived images |
| `search` | the full text index, and the way it is asked |
| `dynamic_links` | the short links, what a declaration decides and what it measures |
| `remote_configs` | the keys a project names in code, with their default and their lifetime |
| `audience` | the named set somebody belongs to, and the right that follows from it |

The other seven reach `foundation` rather than reaching the host, which is why it is the one that
cannot be left out.

## What a package is made of

```
package.yaml    the name, the version, the framework it accepts, and what it hands the stack
lib/<name>.ts   the one way in: a list of re-exports, plus the `scribe` lifecycle
lib/contracts/  the pure types that cross the boundary, no behaviour
lib/src/        the code, private by never being named in the entry
tests/tests/    the tests that need nothing running
tests/testing/  what a consumer imports to stub this package
tests/e2e/      the tests that need the stack up, with the compose that brings it
examples/       what calling the package looks like
db/init/        the SQL played when the stack is built
ops/            the slices of the ops templates, when the package starts a container
protocol/       the .proto files, when the package speaks to a worker
```

`scribedev pkg create <name>` writes this, and `scribedev pkg analyze .` refuses a package that
departs from it. The entry is named after the package and is never declared: the manifest names
the package, the layout says where the entry sits, and a manifest able to point elsewhere would
only be a chance for the two to disagree.

Five things are mandatory: `package.yaml`, `.gitignore`, `lib/<name>.ts`, `lib/src/`, and a
`tests/` that carries a `tests/e2e/` and at least one `.test.ts`. The rest depends on what the
package does. A package that poses no SQL has no `db/`, and one that starts no container has no
`ops/`.

## Nothing here runs on its own

A package's imports resolve only through the framework's import map, so this repository cannot be
type checked or tested by itself:

```
$ deno check realtime/lib/realtime.ts
TS2307 [ERROR]: Import "@scribe/foundation/lib/src/database/table.ts" not a dependency
                and not in import map
```

`scribedev pkg get` resolves one package against a checkout and writes what every specifier
answers to, which is what `scribedev pkg test` then hands the runtime:

```sh
cd realtime && scribedev pkg get && scribedev pkg test
```

You verify the whole tree by putting these packages in a scribe checkout and checking that.
`tool/test.sh` does it for you:

```sh
bash tool/test.sh                       # uses ../scribe
SCRIBE_CHECKOUT=~/code/scribe bash tool/test.sh
```

That is also what the CI does, and what the sync does before it pushes.

## How this reaches the framework

You never copy anything by hand. When a version lands on `main`, the `sync` workflow puts these
packages into `scribe` at `host/packages/`, checks that the framework still type checks and
passes its suite with them, and only then commits to its `dev`.

What it leaves behind: this repository's own files. The licence, the four documents, `.github/`,
`.githooks/` and `tool/test.sh` belong to working here, not to the framework.

## The stack the end to end tests need

`tool/e2e/` brings up the containers one package needs, and takes them down.

```sh
bash tool/e2e/up.sh realtime
bash tool/e2e/down.sh realtime
bash tool/e2e/reset.sh realtime
```

Then the suite itself runs from the scribe checkout, with `deno task test:e2e:realtime`.

## Working on it

`CONTRIBUTING.md` says how a change is made and what it has to pass before it is opened.
`STYLE.md` says what the code has to look like, which is what a review is done against.
`TESTING.md` says what the proof has to look like. `CHANGELOG.md` says what each version holds.

## Licence

Mozilla Public License 2.0. The terms are in `LICENSE`, and each file carries the notice.
