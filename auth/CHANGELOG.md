# auth

## 1.0.0

BREAKING:

- [BREAKING]: drop every deno.json, since package.yaml is the manifest (5c37b5c)
- [BREAKING]: read the cluster's provisioning from provisioning/db/ (1501aee)
- [BREAKING]: publish auth by subject too (bb512b5)
- [BREAKING]: publish foundation by subject, as a Flutter package does (955ef9a)
- [BREAKING]: let each package declare its own extension slot (a0672c5)
- [BREAKING]: let a project put its declarations where it likes (28ba2ef)
- [BREAKING]: name the extension slot after the package that reads it (98657fa)
- [BREAKING]: take the social provider from contracts, not a second copy (52103aa)
- [BREAKING]: follow the framework renaming host to engine (82605f7)
- [BREAKING]: lay auth out as package.yaml, lib and tests (d237f81)
- [BREAKING]: hand back what the identity service said, not two fields of it (15ffaff)
- [BREAKING]: write the vocabulary alchemy publishes (56feb10)
- [BREAKING]: lay foundation out the way every package has to be (4d7b712)
- [BREAKING]: put the packages under the Mozilla Public License 2.0 (565286d)

DEV:

- [DEV]: answer a worker from the package that owns the contract (5d31227)
- [DEV]: declare what each package may import (fbf40ee)
- [DEV]: add the auth package, from sign up to device trust (568d4a2)

BUGFIX:

- [BUGFIX]: answer deleteOne by whether a row was removed (7e125da)
- [BUGFIX]: read a write as the rows it wrote, not as a truthy result (ed60690)
- [BUGFIX]: open an outbound client through the http port (235bd64)
- [BUGFIX]: reach the cache through alchemy's port instead of Valkery (0c9747f)
- [BUGFIX]: follow foundation's layout where the packages drifted (bdaed8c)

REFACTO:

- [REFACTO]: name the framework files a package reaches, one by one (98ae879)
- [REFACTO]: let a package reach its own files by path, not by name (9b31a98)
- [REFACTO]: reach every other package through a named door (bd18fc7)
- [REFACTO]: put the redis primitives with the store they talk to (46e91c2)
- [REFACTO]: declare every specifier a package imports (5e6d31d)
- [REFACTO]: take the session and the sign-out scope from the framework (b375703)
- [REFACTO]: keep the row timestamps in the package that reads them (ffb2ff9)
- [REFACTO]: follow the base64 module where it was renamed (196b80b)
- [REFACTO]: declare a rate limit through the port, not the redis class (3910cea)
- [REFACTO]: take the http client from the vocabulary instead of holding one (58bebce)

TEST:

- [TEST]: let each package fill its own settings (b54dbb8)

CHORE:

- [CHORE]: reflow the eight packages to the width the framework uses (245baad)
- [CHORE]: accept the framework from 1.0.0 (e4b535e)
- [CHORE]: rewrap nine files the editor reflowed (bfa02fc)

