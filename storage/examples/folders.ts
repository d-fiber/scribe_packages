import { Bytes, Storage, StorageVisibility } from "@scribe/storage/lib/storage.ts";

/**
 * A folder whose objects anyone holding their URL can read.
 *
 * The template carries its placeholders in the type, so every call below takes one argument
 * per placeholder, in the order they appear.
 */
export const users = Storage.public("users/{userId}");

/**
 * A picture stored under that folder, whose upload also derives a blur hash.
 *
 * The spec is what an upload is checked against: an extension the resource does not declare
 * and a file over the size are both refused before anything is written.
 */
export const avatar = users.image("avatar", {
  extensions: ["png", "jpg", "webp"],
  maxSize: Bytes.megabytes(5),
});

/** A video, whose blur hash is derived from its first frame. */
export const intro = users.video("intro", {
  extensions: ["mp4"],
  maxSize: Bytes.megabytes(200),
});

/**
 * A folder nested under the first, taking the arguments of both templates in order.
 *
 * A child writes to its parent's bucket unless it names another, which is what puts a whole
 * branch in one place without repeating it. It refuses a placeholder an enclosing folder
 * already writes, since two arguments would then land in the same position.
 */
export const documents = users.child("docs/{docId}", StorageVisibility.Private);

/**
 * Anything else stored under that folder, kept as the bytes it was given.
 *
 * A private folder is the one to reach for when the answer is not obvious: an object put in
 * the open bucket by mistake stays readable for as long as its key is guessable, and moving
 * it later does not unpublish what has already been fetched.
 */
export const contract = documents.file("contract", {
  extensions: ["pdf"],
  maxSize: Bytes.megabytes(20),
});
