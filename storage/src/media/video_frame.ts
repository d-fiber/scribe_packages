// Copyright (C) 2026 Fiber
//
// This file is part of scribe and is made available under the PolyForm Shield
// License 1.0.0. The full terms are in the LICENSE file at the root of this
// repository, and at https://polyformproject.org/licenses/shield/1.0.0
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
//
// The one thing you may not do:
// - Use it to provide any product that competes with scribe, or with any
//   product Fiber or its affiliates provide using scribe. Products compete
//   even when they are offered free of charge, through a different kind of
//   interface, or for a different technical platform.
//
// If you pass this software on:
// - Anyone who receives any part of it from you must also receive these terms,
//   or the URL above, together with the "Required Notice" line carried by the
//   LICENSE file.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE COMES AS IS, WITHOUT ANY WARRANTY OR
// CONDITION, AND THE LICENSOR WILL NOT BE LIABLE TO YOU FOR ANY DAMAGES ARISING
// OUT OF THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY KIND OF
// LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the
// LICENSE file, the LICENSE file governs.

import type { RgbaImage } from "./rgba.ts";

const BINARY = "ffmpeg";
const SAMPLE_COUNT = 5;
const DARK_LUMA = 16;

export const FRAME_SIZE = 32;

const FRAME_BYTES = FRAME_SIZE * FRAME_SIZE * 4;

function samplingArgs(source: string): string[] {
  return [
    "-v",
    "error",
    "-i",
    source,
    "-vf",
    `fps=1,scale=${FRAME_SIZE}:${FRAME_SIZE}`,
    "-frames:v",
    String(SAMPLE_COUNT),
    "-pix_fmt",
    "rgba",
    "-f",
    "rawvideo",
    "pipe:1",
  ];
}

function openingFrameArgs(source: string): string[] {
  return [
    "-v",
    "error",
    "-i",
    source,
    "-vf",
    `scale=${FRAME_SIZE}:${FRAME_SIZE}`,
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgba",
    "-f",
    "rawvideo",
    "pipe:1",
  ];
}

async function decodeFrames(args: string[]): Promise<Uint8Array | null> {
  try {
    const { code, stdout, stderr } = await new Deno.Command(BINARY, {
      args,
      stdout: "piped",
      stderr: "piped",
    }).output();

    if (code !== 0) {
      const reason = new TextDecoder().decode(stderr).split("\n")[0];
      console.error(`[video-frame] ffmpeg exited with ${code}: ${reason}`);
      return null;
    }

    return stdout;
  } catch (error) {
    console.error("[video-frame] could not run ffmpeg:", error);
    return null;
  }
}

function lumaOf(frame: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < frame.length; i += 4) {
    total += frame[i] * 0.299 + frame[i + 1] * 0.587 + frame[i + 2] * 0.114;
  }
  return total / (frame.length / 4);
}

export function pickPosterFrame(raw: Uint8Array): Uint8Array | null {
  const count = Math.floor(raw.length / FRAME_BYTES);
  if (count === 0) return null;

  let brightest = raw.subarray(0, FRAME_BYTES);
  let brightestLuma = lumaOf(brightest);

  for (let index = 1; index < count && brightestLuma < DARK_LUMA; index++) {
    const frame = raw.subarray(index * FRAME_BYTES, (index + 1) * FRAME_BYTES);
    const luma = lumaOf(frame);
    if (luma > brightestLuma) {
      brightest = frame;
      brightestLuma = luma;
    }
  }

  return brightest;
}

async function withTempFile<T>(
  file: File,
  use: (path: string) => Promise<T>,
): Promise<T | null> {
  let path: string;
  try {
    path = await Deno.makeTempFile({ prefix: "poster-" });
    await Deno.writeFile(path, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    console.error("[video-frame] could not stage the video on disk:", error);
    return null;
  }

  try {
    return await use(path);
  } finally {
    await Deno.remove(path).catch(() => {});
  }
}

export function extractPosterFrame(file: File): Promise<RgbaImage | null> {
  return withTempFile(file, async (source) => {
    const sampled = await decodeFrames(samplingArgs(source));
    const raw = sampled !== null && sampled.length >= FRAME_BYTES
      ? sampled
      : await decodeFrames(openingFrameArgs(source));

    const frame = raw === null ? null : pickPosterFrame(raw);
    if (frame === null) return null;

    return {
      width: FRAME_SIZE,
      height: FRAME_SIZE,
      data: new Uint8ClampedArray(frame),
    };
  });
}
