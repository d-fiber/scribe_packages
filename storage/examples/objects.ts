import type { StorageImage, StorageObject } from "@scribe/storage/mod.ts";
import { avatar, contract, documents, users } from "./folders.ts";

/**
 * Uploads a picture, and answers where it is served from and the blur hash it derived.
 *
 * The arguments after the file are the placeholders of the folder that declared the resource,
 * in the order the template writes them.
 */
export async function setAvatar(userId: string, file: File): Promise<StorageImage | null> {
  const result = await avatar.upload(file, userId);
  return result.ok ? result.data : null;
}

/** A resource of a nested folder takes the placeholders of both levels. */
export async function fileContract(userId: string, docId: string, file: File): Promise<boolean> {
  const result = await contract.upload(file, userId, docId);
  return result.ok;
}

/** Where an object is served from, without asking the index. */
export function avatarUrl(userId: string): string | null {
  return avatar.url(userId);
}

/** Removes one object. */
export async function dropAvatar(userId: string): Promise<boolean> {
  const result = await avatar.remove(userId);
  return result.ok;
}

/**
 * What a folder holds, in path order, whichever bucket each object is in.
 *
 * The answer comes from the index this package keeps rather than from a walk of the buckets,
 * so it carries the size, the media type and the blur hash of every object, which a listing
 * of keys cannot give.
 */
export async function documentsOf(userId: string, docId: string): Promise<StorageObject[]> {
  const result = await documents.list(userId, docId);
  return result.ok ? result.data : [];
}

/** Empties a whole folder, the nested ones included. */
export async function eraseUser(userId: string): Promise<boolean> {
  const result = await users.clear(userId);
  return result.ok;
}
