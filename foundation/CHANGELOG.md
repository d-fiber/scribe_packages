# foundation

## 1.0.0

BREAKING:

- [BREAKING]: drop every deno.json, since package.yaml is the manifest (5c37b5c)
- [BREAKING]: read the cluster's provisioning from provisioning/db/ (1501aee)
- [BREAKING]: publish auth by subject too (bb512b5)
- [BREAKING]: publish foundation by subject, as a Flutter package does (955ef9a)
- [BREAKING]: let each package declare its own extension slot (a0672c5)
- [BREAKING]: follow the framework renaming host to engine (82605f7)
- [BREAKING]: answer an outcome from a write, not a yes or a no (ec318a7)
- [BREAKING]: say which way each published generic varies (f8be777)
- [BREAKING]: take from alchemy what this package declared twice (f72aa14)
- [BREAKING]: lay the protocol flat, and call the cache a cache (0d1b063)
- [BREAKING]: scope an owned table on the caller, not on a kind of account (1ae79b2)
- [BREAKING]: write the vocabulary @scribe/alchemy 2.1.23 publishes (e269428)
- [BREAKING]: lay foundation out the way every package has to be (4d7b712)
- [BREAKING]: put the packages under the Mozilla Public License 2.0 (565286d)
- [BREAKING]: construct an engine instead of calling a define function (54e76ef)
- [BREAKING]: lay foundation out as a package of its own (753dea8)

SECURITY:

- [SECURITY]: keep one caller's suffix out of another declaration's bucket (fd35227)
- [SECURITY]: narrow an embedded table to the caller (abd793d)
- [SECURITY]: read no row of an owned table when nothing proved a caller (33c58f8)
- [SECURITY]: stop publishing the way around the two guards (f643747)
- [SECURITY]: refuse a filter keyword the is operator cannot take (2b3000d)
- [SECURITY]: drop the per-caller postgrest clients nothing ever called (82186eb)

DEV:

- [DEV]: start and stop what this package owns, itself (667e130)
- [DEV]: publish what the host answers a database call with (adb75cc)
- [DEV]: declare what each package may import (fbf40ee)
- [DEV]: name every directory foundation hands the stack (43b10ae)
- [DEV]: answer the last two ports, so all eight are driven (78aa1df)
- [DEV]: answer the six ports this package carries a driver for (5acff85)
- [DEV]: answer the clock and the logger slots this package reads (1a8e0a8)
- [DEV]: let the rest capability carry several queries at once (93d6f5c)
- [DEV]: have foundation name the framework it accepts (34bc950)
- [DEV]: add call examples to every package (b3be10a)
- [DEV]: add the trigger module, from the outbox to the runner (c9a9355)
- [DEV]: move the rate limiter into foundation, keyed by caller (7bfbaaf)
- [DEV]: give foundation an isolate primitive (e1a995e)
- [DEV]: give the outgoing HTTP client a request timeout (0af1d94)
- [DEV]: take in an http client in the shape of the dart package (73b4b27)
- [DEV]: take in the containers the cache, the queue and the engine need (cbfa4b2)
- [DEV]: take in the cache, the queue, the cron and the hook (5985c8f)
- [DEV]: take in the PostgREST engine as the foundation package (6f40a43)

BUGFIX:

- [BUGFIX]: repair the placeholders deno fmt had pulled apart (151c685)
- [BUGFIX]: mount the ops fragments from packages/, not engine/packages/ (d4a78fa)
- [BUGFIX]: declare the contracts foundation imports (950c16c)
- [BUGFIX]: hold a timer handle as what setTimeout returns (c49b62e)
- [BUGFIX]: let a cron be declared before the host binds the clock (000676f)
- [BUGFIX]: read a write as the rows it wrote, not as a truthy result (ed60690)
- [BUGFIX]: count a delayed job as promoted by the pass that removed it (11164bc)
- [BUGFIX]: refuse a transition whose two bounds name the same value (5e5a3b9)
- [BUGFIX]: print the level in the line, not only in the console method (ae0ed04)
- [BUGFIX]: leave the http client by one exception (8025d77)
- [BUGFIX]: stop a hook handler from parking the request that emitted it (bb47f3b)
- [BUGFIX]: answer the local file port the way the port says (e5adf3c)
- [BUGFIX]: drop the postgrest client when its settings go (a4b0261)
- [BUGFIX]: refuse a cron declaration on the line that writes it (2ec488b)
- [BUGFIX]: hold the cache to what its port promises (25d0333)
- [BUGFIX]: read the ops fragments from the package root, not from tests (4acf3b5)
- [BUGFIX]: hand back a message this process cannot place (aed5063)
- [BUGFIX]: bound a lease by what it names, not by the work it protects (1da7aef)
- [BUGFIX]: let a fresh database run its init and migrations (87ed3eb)
- [BUGFIX]: annotate the request body the way both type sets read it (6faac19)

PERF:

- [PERF]: answer a hook nobody listens to without allocating (0920d57)
- [PERF]: retry a failed job with the server instead of a redis round trip (eaf39cb)
- [PERF]: coalesce cache reads in process and refresh before expiry (0f90453)

REFACTO:

- [REFACTO]: name the port's shape apart from the package's (8db2e4e)
- [REFACTO]: name the framework files a package reaches, one by one (98ae879)
- [REFACTO]: let a package reach its own files by path, not by name (9b31a98)
- [REFACTO]: reach every other package through a named door (bd18fc7)
- [REFACTO]: put the shared address policy in contracts, not in redis (af674dd)
- [REFACTO]: put the redis primitives with the store they talk to (46e91c2)
- [REFACTO]: declare every specifier a package imports (5e6d31d)
- [REFACTO]: take QueueMessage from the vocabulary (9a3238f)
- [REFACTO]: declare a rate limit through the port, not the redis class (3910cea)
- [REFACTO]: take the http client from the vocabulary instead of holding one (58bebce)
- [REFACTO]: recognise a package by what it carries, not by a manifest (d63b4fa)
- [REFACTO]: give the package the primitive SQL every API needs (ed31c10)
- [REFACTO]: take the Postgres image and the db service into foundation (88d2fcd)
- [REFACTO]: take Redis, the settings and the harnesses into foundation (d6607f1)
- [REFACTO]: take in the PostgREST engine the framework kept outside a layer (6bd74f8)
- [REFACTO]: say out loud what the cron loop does with an occurrence (7c1905e)

DOC:

- [DOC]: document every field of an exported structure (6cdf13a)

TEST:

- [TEST]: bind every port in the cache harness (27c9396)
- [TEST]: check every port foundation wires against what it promises (9b9614e)
- [TEST]: give the package a harness that reaches no further than itself (7cc6567)
- [TEST]: keep the end-to-end database between runs (b380b31)
- [TEST]: run the end-to-end stack on the ops fragments a deployment ships (6892601)
- [TEST]: carry each case's intent in its name and assertions (09282e0)
- [TEST]: exercise the foundation subjects against real containers (5aaf5a8)

CHORE:

- [CHORE]: reflow the eight packages to the width the framework uses (245baad)
- [CHORE]: accept the framework from 1.0.0 (e4b535e)
- [CHORE]: run foundation on scribe 9 (25991fa)
- [CHORE]: rewrap nine files the editor reflowed (bfa02fc)
- [CHORE]: keep generated editor settings out of the package (6ac7285)

