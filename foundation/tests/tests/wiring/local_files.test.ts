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

import { FileSystems } from "@scribe/alchemy";
import type { FileSystem } from "@scribe/alchemy";
import { MemoryFileSystem } from "@scribe/alchemy/test";
import { LocalFiles, LocalFileSystems } from "../../../lib/src/files/local_files.ts";
import { assert, assertEquals, assertNotEquals, assertRejects, assertStrictEquals } from "@std/assert";

async function inADirectory(body: (disk: LocalFiles, root: string) => Promise<void>): Promise<void> {
  const disk = new LocalFiles();
  const root = await disk.temporaryDirectory();

  try {
    await body(disk, root);
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => {});
  }
}

Deno.test("the driver hands out one disk, and mounting it fills the slot a package reads", () => {
  const driver = new LocalFileSystems();

  assertStrictEquals(driver.open(), driver.open());
  assert(driver.open() instanceof LocalFiles);

  const held = FileSystems.configured ? FileSystems.get() : null;
  FileSystems.use(driver);
  assertStrictEquals(FileSystems.get().open(), driver.open());
  if (held === null) FileSystems.clear();
  else FileSystems.use(held);
});

Deno.test("what was written is what is read back, as bytes and as text", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/a.txt`, "hello");
    await disk.write(`${root}/b.bin`, new Uint8Array([1, 2, 3]));

    assertEquals(await disk.readText(`${root}/a.txt`), "hello");
    assertEquals(await disk.read(`${root}/b.bin`), new Uint8Array([1, 2, 3]));
  });
});

Deno.test("a path nothing is held at refuses a read and answers null to a description", async () => {
  await inADirectory(async (disk, root) => {
    await assertRejects(() => disk.read(`${root}/absent`));
    await assertRejects(() => disk.readText(`${root}/absent`));
    assertEquals(await disk.describe(`${root}/absent`), null);
  });
});

Deno.test("a directory where a file was expected refuses the read rather than answering nothing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/held`);

    await assertRejects(() => disk.read(`${root}/held`));
    assertEquals((await disk.describe(`${root}/held`))?.isDirectory, true);
  });
});

Deno.test("a file where a directory was expected refuses the listing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/leaf`, "x");

    await assertRejects(() => disk.list(`${root}/leaf`));
  });
});

Deno.test("a file of zero bytes is a file, and says it holds nothing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/empty`, "");
    const found = await disk.describe(`${root}/empty`);

    assertEquals(found?.isFile, true);
    assertEquals(found?.isDirectory, false);
    assertEquals(String(found?.size), "0 B");
    assertEquals(await disk.read(`${root}/empty`), new Uint8Array(0));
  });
});

Deno.test("a name holding a line break is taken as written, and comes back the same", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/two\nlines`, "x");

    assertEquals((await disk.describe(`${root}/two\nlines`))?.name, "two\nlines");
    assertEquals((await disk.list(root)).map((one) => one.name), ["two\nlines"]);
  });
});

Deno.test("an empty directory lists nothing rather than refusing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/empty`);

    assertEquals(await disk.list(`${root}/empty`), []);
  });
});

Deno.test("a listing names what a directory holds, files and directories alike", async () => {
  await inADirectory(async (disk, root) => {
    await disk.writeText(`${root}/one.txt`, "abc");
    await disk.makeDirectory(`${root}/under`);

    const found = [...await disk.list(root)].sort((a, b) => a.name.localeCompare(b.name));

    assertEquals(found.map((one) => one.name), ["one.txt", "under"]);
    assertEquals(found.map((one) => one.isFile), [true, false]);
    assertEquals(String(found[0].size), "3 B");
  });
});

Deno.test("making a directory that is already there costs nothing", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/twice`);
    await disk.makeDirectory(`${root}/twice`);

    assertEquals((await disk.describe(`${root}/twice`))?.isDirectory, true);
  });
});

Deno.test("removing a directory takes everything under it", async () => {
  await inADirectory(async (disk, root) => {
    await disk.makeDirectory(`${root}/deep/under`);
    await disk.writeText(`${root}/deep/under/a.txt`, "x");

    await disk.remove(`${root}/deep`);

    assertEquals(await disk.describe(`${root}/deep`), null);
  });
});

Deno.test("two temporary files are two files, and neither holds anything", async () => {
  const disk = new LocalFiles();
  const first = await disk.temporaryFile();
  const second = await disk.temporaryFile();

  try {
    assertNotEquals(first, second);
    assertEquals(String((await disk.describe(first))?.size), "0 B");
    assertEquals((await disk.describe(second))?.isFile, true);
  } finally {
    await disk.remove(first);
    await disk.remove(second);
  }
});

Deno.test("two temporary directories are two directories, and both are empty", async () => {
  const disk = new LocalFiles();
  const first = await disk.temporaryDirectory();
  const second = await disk.temporaryDirectory();

  try {
    assertNotEquals(first, second);
    assertEquals(await disk.list(first), []);
    assertEquals((await disk.describe(second))?.isDirectory, true);
  } finally {
    await disk.remove(first);
    await disk.remove(second);
  }
});

Deno.test({
  name: "writing under a directory nothing made yet makes it, as the port says a write does",
  async fn() {
    await inADirectory(async (disk, root) => {
      await disk.writeText(`${root}/made/on/the/way.txt`, "x");

      assertEquals(await disk.readText(`${root}/made/on/the/way.txt`), "x");
    });
  },
});

Deno.test({
  name: "removing what is not there costs nothing, as the port says it does",
  async fn() {
    await inADirectory(async (disk, root) => {
      await disk.remove(`${root}/never-was`);
    });
  },
});

Deno.test({
  name: "a directory holds nothing of its own, and the port says its size is zero whatever the platform reports",
  async fn() {
    await inADirectory(async (disk, root) => {
      await disk.makeDirectory(`${root}/sized`);

      assertEquals(String((await disk.describe(`${root}/sized`))?.size), "0 B");
    });
  },
});

Deno.test({
  name: "a path written with a trailing slash is described under its last segment, not under an empty name",
  async fn() {
    await inADirectory(async (disk, root) => {
      await disk.makeDirectory(`${root}/named`);

      assertEquals((await disk.describe(`${root}/named/`))?.name, "named");
    });
  },
});

Deno.test({
  name: "a path under a file names nothing, so it is described as null rather than refused",
  async fn() {
    await inADirectory(async (disk, root) => {
      await disk.writeText(`${root}/leaf`, "x");

      assertEquals(await disk.describe(`${root}/leaf/under`), null);
    });
  },
});

Deno.test("the disk and the in-memory double of alchemy agree on what they were both asked", async () => {
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

    assertEquals(await asked(disk, root), await asked(memory, "/base"));
  });
});
