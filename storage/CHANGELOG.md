# storage

## 1.0.0

BREAKING:

- [BREAKING]: drop every deno.json, since package.yaml is the manifest (5c37b5c)
- [BREAKING]: publish auth by subject too (bb512b5)
- [BREAKING]: publish foundation by subject, as a Flutter package does (955ef9a)
- [BREAKING]: follow the framework renaming host to engine (82605f7)
- [BREAKING]: lay storage out as package.yaml, lib and tests (0774e13)
- [BREAKING]: write the vocabulary alchemy publishes (0fd7bf2)
- [BREAKING]: lay foundation out the way every package has to be (4d7b712)
- [BREAKING]: put the packages under the Mozilla Public License 2.0 (565286d)
- [BREAKING]: give storage a visibility per folder, not an access map (91e25ab)

DEV:

- [DEV]: answer a worker from the package that owns the contract (5d31227)
- [DEV]: declare what each package may import (fbf40ee)
- [DEV]: add call examples to every package (b3be10a)
- [DEV]: build the storage image instead of pulling it (bbbd38a)

BUGFIX:

- [BUGFIX]: repair the placeholders deno fmt had pulled apart (151c685)
- [BUGFIX]: mount the ops fragments from packages/, not engine/packages/ (d4a78fa)
- [BUGFIX]: read a write as the rows it wrote, not as a truthy result (ed60690)
- [BUGFIX]: open an outbound client through the http port (235bd64)
- [BUGFIX]: follow foundation's layout where the packages drifted (bdaed8c)

REFACTO:

- [REFACTO]: name the framework files a package reaches, one by one (98ae879)
- [REFACTO]: let a package reach its own files by path, not by name (9b31a98)
- [REFACTO]: reach every other package through a named door (bd18fc7)
- [REFACTO]: declare every specifier a package imports (5e6d31d)
- [REFACTO]: take the http client from the vocabulary instead of holding one (58bebce)
- [REFACTO]: recognise a package by what it carries, not by a manifest (d63b4fa)
- [REFACTO]: turn realtime and storage into packages of their own (4ace1c0)

TEST:

- [TEST]: let the storage harness default to what its tests expect (585a1eb)
- [TEST]: let each package fill its own settings (b54dbb8)

CHORE:

- [CHORE]: reflow the eight packages to the width the framework uses (245baad)
- [CHORE]: accept the framework from 1.0.0 (e4b535e)
- [CHORE]: rewrap nine files the editor reflowed (bfa02fc)

