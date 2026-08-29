// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
import "@scribe/testing/runner.ts";
import { equals, expect, expectLater, isNot, isNotNull, isTrue, same, Scribe, throwsA } from "@scribe/alchemy/test";
import { FileSystems } from "@scribe/alchemy";
import type { FileSystem } from "@scribe/alchemy";
import { MemoryFileSystem } from "@scribe/alchemy/test";
import { LocalFiles, LocalFileSystems } from "../../../lib/src/files/local_files.ts";

async function inADirectory(body: (disk: LocalFiles, root: string) => Promise<void>): Promise<void> {
  const disk = new LocalFiles();
  const root = await disk.temporaryDirectory();

  try {
    await body(disk, root);
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => {});
  }
}

Scribe.test("the driver hands out one disk, and mounting it fills the slot a package reads", () => {
  const driver = new LocalFileSystems();

  expect(driver.open(), same(driver.open()));
  expect(driver.open() instanceof LocalFiles, isTrue);

  const held = FileSystems.configured ? FileSystems.get() : null;
  FileSystems.use(driver);
  expect(FileSystems.get().open(), same(driver.open()));
  if (held === null) FileSystems.clear();
  else FileSystems.use(held);
});

Scribe.test("what was written is what is read back, as bytes and as text", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/a.txt`, "hello");
    await disk.write(`${root}/b.bin`, new Uint8Array([1, 2, 3]));

    expect(await disk.readText(`${root}/a.txt`), equals("hello"));
    expect(await disk.read(`${root}/b.bin`), equals(new Uint8Array([1, 2, 3])));
  });
});

Scribe.test("a path nothing is held at refuses a read and answers null to a description", async () => {
  await inADirectory(async (disk, root) => {
    await expectLater(() => disk.read(`${root}/absent`), throwsA(isNotNull));
    await expectLater(() => disk.readText(`${root}/absent`), throwsA(isNotNull));
    expect(await disk.describe(`${root}/absent`), equals(null));
  });
});

Scribe.test("a directory where a file was expected refuses the read rather than answering nothing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/held`);

    await expectLater(() => disk.read(`${root}/held`), throwsA(isNotNull));
    expect((await disk.describe(`${root}/held`))?.isDirectory, equals(true));
  });
});

Scribe.test("a file where a directory was expected refuses the listing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/leaf`, "x");

    await expectLater(() => disk.list(`${root}/leaf`), throwsA(isNotNull));
  });
});

Scribe.test("a file of zero bytes is a file, and says it holds nothing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/empty`, "");
    const found = await disk.describe(`${root}/empty`);

    expect(found?.isFile, equals(true));
    expect(found?.isDirectory, equals(false));
    expect(String(found?.size), equals("0 B"));
    expect(await disk.read(`${root}/empty`), equals(new Uint8Array(0)));
  });
});

Scribe.test("a name holding a line break is taken as written, and comes back the same", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/two\nlines`, "x");

    expect((await disk.describe(`${root}/two\nlines`))?.name, equals("two\nlines"));
    expect((await disk.list(root)).map((one) => one.name), equals(["two\nlines"]));
  });
});

Scribe.test("an empty directory lists nothing rather than refusing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/empty`);

    expect(await disk.list(`${root}/empty`), equals([]));
  });
});

Scribe.test("a listing names what a directory holds, files and directories alike", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/one.txt`, "abc");
    await disk.makeDirectory(`${root}/under`);

    const found = [...await disk.list(root)].sort((a, b) => a.name.localeCompare(b.name));

    expect(found.map((one) => one.name), equals(["one.txt", "under"]));
    expect(found.map((one) => one.isFile), equals([true, false]));
    expect(String(found[0].size), equals("3 B"));
  });
});

Scribe.test("making a directory that is already there costs nothing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/twice`);
    await disk.makeDirectory(`${root}/twice`);

    expect((await disk.describe(`${root}/twice`))?.isDirectory, equals(true));
  });
});

Scribe.test("removing a directory takes everything under it", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/deep/under`);
    await disk.writeText(`${root}/deep/under/a.txt`, "x");

    await disk.remove(`${root}/deep`);

    expect(await disk.describe(`${root}/deep`), equals(null));
  });
});

Scribe.test("two temporary files are two files, and neither holds anything", async () => {
  const disk = new LocalFiles();
  const first = await disk.temporaryFile();
  const second = await disk.temporaryFile();

  try {
    expect(first, isNot(equals(second)));
    expect(String((await disk.describe(first))?.size), equals("0 B"));
    expect((await disk.describe(second))?.isFile, equals(true));
  } finally {
    await disk.remove(first);
    await disk.remove(second);
  }
});

Scribe.test("two temporary directories are two directories, and both are empty", async () => {
  const disk = new LocalFiles();
  const first = await disk.temporaryDirectory();
  const second = await disk.temporaryDirectory();

  try {
    expect(first, isNot(equals(second)));
    expect(await disk.list(first), equals([]));
    expect((await disk.describe(second))?.isDirectory, equals(true));
  } finally {
    await disk.remove(first);
    await disk.remove(second);
  }
});

Scribe.test("writing under a directory nothing made yet makes it, as the port says a write does", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/made/on/the/way.txt`, "x");

    expect(await disk.readText(`${root}/made/on/the/way.txt`), equals("x"));
  });
});

Scribe.test("removing what is not there costs nothing, as the port says it does", async () => {
  await inADirectory(async (disk, root) => {
    await disk.remove(`${root}/never-was`);
  });
});

Scribe.test("a directory holds nothing of its own, and the port says its size is zero whatever the platform reports", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/sized`);

    expect(String((await disk.describe(`${root}/sized`))?.size), equals("0 B"));
  });
});

Scribe.test("a path written with a trailing slash is described under its last segment, not under an empty name", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/named`);

    expect((await disk.describe(`${root}/named/`))?.name, equals("named"));
  });
});

Scribe.test("a path under a file names nothing, so it is described as null rather than refused", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/leaf`, "x");

    expect(await disk.describe(`${root}/leaf/under`), equals(null));
  });
});

Scribe.test("the disk and the in-memory double of alchemy agree on what they were both asked", async () => {
  const memory: FileSystem = new MemoryFileSystem();

  await inADirectory(async (disk, root) => {
    const asked = async (fs: FileSystem, base: string): Promise<unknown[]> => {
      await fs.makeDirectory(`${base}/dir`);
      await fs.writeText(`${base}/dir/a.txt`, "abc");
      return [
        await fs.readText(`${base}/dir/a.txt`),
        (await fs.describe(`${base}/dir/a.txt`))?.isFile,
        String((await fs.describe(`${base}/dir/a.txt`))?.size),
        (await fs.list(`${base}/dir`)).map((one) => one.name),
        await fs.describe(`${base}/dir/absent`),
      ];
    };

    expect(await asked(disk, root), equals(await asked(memory, "/base")));
  });
});
