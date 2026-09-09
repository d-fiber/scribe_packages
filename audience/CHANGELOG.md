# audience

## 1.0.0

BREAKING:

- [BREAKING]: rename the cache port to Valkery across every package (9f6a5da)
- [BREAKING]: publish foundation through one door instead of eleven (861e5bf)
- [BREAKING]: partition audience by feature, and read and write it in bulk (d1a3f99)
- [BREAKING]: drop the scribe: manifest block (e528844)
- [BREAKING]: move everything the stack reads under deploy/ (f030f69)
- [BREAKING]: set up audience from the provisioning job (8e06597)
- [BREAKING]: drop the supabase prefix from the names scribe owns (a87985f)
- [BREAKING]: drop every deno.json, since package.yaml is the manifest (5c37b5c)
- [BREAKING]: publish auth by subject too (bb512b5)
- [BREAKING]: publish foundation by subject, as a Flutter package does (955ef9a)
- [BREAKING]: follow the framework renaming host to engine (82605f7)
- [BREAKING]: lay audience out as package.yaml, lib and tests (70bebdc)
- [BREAKING]: write the vocabulary alchemy publishes (3fc16fe)
- [BREAKING]: lay foundation out the way every package has to be (4d7b712)
- [BREAKING]: put the packages under the Mozilla Public License 2.0 (565286d)
- [BREAKING]: rename the two ways of declaring an audience (2038812)

DEV:

- [DEV]: put audience back at 1.0.0 until the framework itself ships (d048eff)
- [DEV]: qualify audiences' own tables and functions to its own schema (8186fde)
- [DEV]: bump audience to 2.0.1 (d1c88a6)
- [DEV]: bump audience to 2.0.0 (3fa47c1)
- [DEV]: stop naming an external specifier in dependencies: (5f567a7)
- [DEV]: declare what each package may import (fbf40ee)
- [DEV]: add call examples to every package (b3be10a)
- [DEV]: add the dynamic links, remote configs and audience packages (1013d40)

BUGFIX:

- [BUGFIX]: finish the QueuePort and HookPort rename in foundation (165519f)
- [BUGFIX]: mount the ops fragments from packages/, not engine/packages/ (d4a78fa)
- [BUGFIX]: read a write as the rows it wrote, not as a truthy result (ed60690)
- [BUGFIX]: reach the cache through alchemy's port instead of Valkery (0c9747f)
- [BUGFIX]: follow foundation's layout where the packages drifted (bdaed8c)

PERF:

- [PERF]: index audiences by member, covering the rest of the row (c60ef99)

REFACTO:

- [REFACTO]: register capabilities and extensions through a registrar (bcdfb8d)
- [REFACTO]: follow the engine's scholium and runtime-wiring renames (2a66161)
- [REFACTO]: speak Future and DateTime instead of Promise and Date across audience (beaf8a8)
- [REFACTO]: name the framework files a package reaches, one by one (98ae879)
- [REFACTO]: let a package reach its own files by path, not by name (9b31a98)
- [REFACTO]: reach every other package through a named door (bd18fc7)
- [REFACTO]: declare every specifier a package imports (5e6d31d)

DOC:

- [DOC]: rewrite audience's comments to answer why (ec70b6c)
- [DOC]: document the field left silent in audience's declaration (967fb98)

TEST:

- [TEST]: silence the logger where a claim collision is expected (b411957)
- [TEST]: point audience's Deno-backed runner at scholium (de14118)
- [TEST]: write audience's suite against Scribe, not Deno (21ccc83)
- [TEST]: give every package an e2e scenario, and tool/ just two scripts (5a3aebf)
- [TEST]: dispatch the e2e scenarios into the packages they test (5836eb6)
- [TEST]: let docker pick the host ports of an e2e stack (6b30d79)

CI:

- [CI]: drop the cache-to-valkery content the previous commit swept in (4017e5f)
- [CI]: refuse a push whose package.lock is behind its manifest (ff11031)

CHORE:

- [CHORE]: separate a package file's license header from its code (e54bbb7)
- [CHORE]: reflow the eight packages to the width the framework uses (245baad)
- [CHORE]: accept the framework from 1.0.0 (e4b535e)
