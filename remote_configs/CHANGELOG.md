# remote_configs

## 1.0.0

BREAKING:

- [BREAKING]: drop every deno.json, since package.yaml is the manifest (5c37b5c)
- [BREAKING]: publish auth by subject too (bb512b5)
- [BREAKING]: publish foundation by subject, as a Flutter package does (955ef9a)
- [BREAKING]: follow the framework renaming host to engine (82605f7)
- [BREAKING]: lay remote_configs out as package.yaml, lib and tests (4826e5d)
- [BREAKING]: write the vocabulary alchemy publishes (37ad08b)
- [BREAKING]: lay foundation out the way every package has to be (4d7b712)
- [BREAKING]: put the packages under the Mozilla Public License 2.0 (565286d)

DEV:

- [DEV]: declare what each package may import (fbf40ee)
- [DEV]: add call examples to every package (b3be10a)
- [DEV]: add the dynamic links, remote configs and audience packages (1013d40)

BUGFIX:

- [BUGFIX]: mount the ops fragments from packages/, not engine/packages/ (d4a78fa)
- [BUGFIX]: read a write as the rows it wrote, not as a truthy result (ed60690)
- [BUGFIX]: reach the cache through alchemy's port instead of Valkery (0c9747f)
- [BUGFIX]: follow foundation's layout where the packages drifted (bdaed8c)

REFACTO:

- [REFACTO]: name the framework files a package reaches, one by one (98ae879)
- [REFACTO]: let a package reach its own files by path, not by name (9b31a98)
- [REFACTO]: reach every other package through a named door (bd18fc7)
- [REFACTO]: declare every specifier a package imports (5e6d31d)

CHORE:

- [CHORE]: reflow the eight packages to the width the framework uses (245baad)
- [CHORE]: accept the framework from 1.0.0 (e4b535e)

