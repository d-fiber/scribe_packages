# foundation

What every scribe project gets, whether or not it asks for it.

A package like any other — a `scribe.yaml`, a directory, a version — except that
`optional: false` means a project cannot leave it out. It holds what Postgres and Redis
being always present implies: the PostgREST engine every module queries through, and
whatever else turns out to be mandatory everywhere.

A project names it without a version constraint, so it always resolves to the latest and
the lock keeps whatever was resolved first:

```yaml
scribe:
  sdk: foundation

dependencies:
  security/auth: ^1.0.2
```

## What is in it

```
database/rest/    the PostgREST engine: the typed client, the generated row types,
                  and the `.proto` of the Rest capability a worker calls
```
