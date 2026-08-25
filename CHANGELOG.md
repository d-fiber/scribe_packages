# Changelog

## 1.0.0

The first version of the mountable packages of the scribe framework. Each one is a directory that stands on its own: its
own entry, its own contracts, its own SQL, its own containers, its own tests. A project mounts the ones it wants and
gets nothing else.

### The eight packages

`foundation` is the one a project cannot do without. It holds the PostgREST engine, the cache, the queue, the cron, the
hook, the outbound HTTP client, the rate limiter, the isolate and the trigger runner, and the other seven reach it
rather than reaching the host.

`auth` covers what an account is, from sign up to device trust: the providers, the sessions, the pending tokens, the
bans, the password and the identities.

`realtime` broadcasts a row's life to the callers a channel lets in. `storage` holds the objects, the buckets and the
derived images. `search` holds the full text index and the way it is asked. `dynamic_links` holds the short links, what
a declaration decides and what it measures. `remote_configs` holds the keys a project names in code, with their default
and their lifetime. `audience` holds the named set somebody belongs to, and the right that follows from it.

`_internal/` is not a package. It holds the scripts that bring up the stack the end to end tests need, and its name
would be refused as a package name anyway.

### What a package is made of

```
mod.ts          the one way in
register.ts     what the host runs when the package is mounted
contracts/      the pure types that cross the boundary, no behaviour
src/            the code, private by never being exported from mod.ts
testing/        what a consumer imports to stub this package
tests/          the tests that need nothing running
e2e_tests/      the tests that need the stack up, with the compose that brings it
examples/       what calling the package looks like
db/init/        the SQL played when the stack is built
ops/            the slices of the ops templates, when the package starts a container
protocol/       the .proto files, when the package speaks to a worker
```

`deno.json` names the package and lists what it exports. Nothing under `src/` is reachable from outside, because no
export points at it.

### Where this code runs

Nowhere on its own. A package's imports resolve only through the framework's import map, so a package is type checked,
linted and tested from a scribe checkout that holds it. `tool/test.sh` does exactly that: it copies the packages into a
checkout beside this one and runs the framework's own checks.

### How this file gets written

The CI writes it. `release` takes the version you are cutting, reads every commit since the last tag, groups them by
their tag, writes the section, commits it, and names that commit `vX.Y.Z`.

There is no version file here. The tags are the version history, and a package carries no version of its own: it ships
with the framework it sits in.
