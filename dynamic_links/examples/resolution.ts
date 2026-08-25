import {
  type LinkDestination,
  type LinkError,
  LinkOutcome,
  LinkPlatform,
  resolveLink,
  type Visit,
} from "@scribe/dynamic_links";
import { invite } from "./declarations.ts";

/** What the page serving a slug answers, once it has decided. */
export interface Landing {
  /** Where the visitor is sent, as the declaration decided it. */
  readonly destination: LinkDestination;

  /** The title a messenger unfurls, null when no preview rule was declared. */
  readonly title: string | null;
}

/**
 * Resolves one slug and records what became of the visit.
 *
 * The answer is cached for ten minutes, the absence of an answer included: a slug nobody ever
 * created is what an address scanner asks for, and caching only the links that exist would
 * send every one of those queries to Postgres.
 */
export async function land(
  slug: string,
  visit: Visit,
): Promise<Landing | LinkError> {
  const hit = await resolveLink(slug);
  if (!hit.ok) return hit.error;

  const link = hit.data;
  await link.record(LinkOutcome.OpenedApp, { platform: LinkPlatform.IOS });

  return {
    destination: link.destination(visit),
    title: link.preview(visit.language)?.title ?? null,
  };
}

/**
 * Narrows a resolved link to one declaration, which types its data with it.
 *
 * Before the test `data` is any declaration's data; inside it, it is what the declaration named,
 * so a typo in a field name does not compile.
 */
export async function codeOf(slug: string): Promise<string | null> {
  const hit = await resolveLink(slug);
  if (!hit.ok) return null;

  return hit.data.declaredBy(invite) ? hit.data.data.code : null;
}

/** The visits one slug collected, a page at a time. */
export async function visits(slug: string): Promise<number> {
  const page = await invite.statistics(slug, { offset: 0, size: 30 });
  return page.ok ? page.data.items.length : 0;
}
