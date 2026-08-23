import { stores, type StoreSearch } from "./declaration.ts";

/** What one result of the declared preview looks like. */
type StorePreview = { id: string; name: string };

/**
 * Runs a search and answers the page of previews, or nothing when the cluster refuses.
 *
 * The parameter type is the whole surface a caller sees, and it is read from the type the
 * declaration's query annotates its first argument with.
 */
export async function find(params: StoreSearch): Promise<StorePreview[]> {
  const result = await stores.search(params);
  return result.ok ? [...result.data.items] : [];
}

/** A page is asked for by offset and size, and the declaration decides the size left out. */
export function secondPage(text: string): Promise<StorePreview[]> {
  return find({ text, page: { from: 20, size: 20 } });
}

/**
 * What a set of parameters compiles into, without touching the cluster.
 *
 * It is what to look at when a search answers something unexpected, since it is the whole of
 * what travels.
 */
export function explain(params: StoreSearch): string {
  return JSON.stringify(stores.plan(params));
}

/** Queues one document for rebuilding, which is what a change on the source row calls for. */
export function reindex(id: string): Promise<boolean> {
  return stores.add(id);
}

/** The same for a group, in one write instead of one per identifier. */
export function reindexAll(ids: readonly string[]): Promise<boolean> {
  return stores.addMany(ids);
}

/** Queues one document for removal. */
export function unindex(id: string): Promise<boolean> {
  return stores.delete(id);
}
