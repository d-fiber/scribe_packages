# scribe_packages

The mountable packages of [scribe](https://github.com/d-fiber/scribe), kept in their own
repository so that adding one never touches the framework.

A package is what `scribe/host/dependencies/` used to hold: a folder with a `scribe.yaml`
manifest declaring what it costs — its containers, its gateway routes, its environment
variables, its SQL, its `.proto` and its package export.

```
database/    realtime, storage
features/    devops, messagings, observability, recommendation, searcher
security/    auth, rbac, vpn
geospatial/
```

## How the framework reaches it

This repository is mounted as a git submodule at `scribe/host/packages/`, so a checkout of
the framework needs one more step:

```
git clone --recurse-submodules git@github.com:d-fiber/scribe.git
```

An existing clone catches up with `git submodule update --init --recursive`.

## What stays in the framework

Postgres and Redis are always there, so what talks to them directly is not a package:
`core/runtime/redis/` and `host/dependencies/database/rest/` stay in `scribe`. So does
everything in `core/` — the HTTP kernel, the queue, the cron, the cache and the rate limiter
are primitives, not modules.

## Licence

PolyForm Shield 1.0.0, the same terms as the framework: source-available, not open source.
The full text is in `LICENSE`.
