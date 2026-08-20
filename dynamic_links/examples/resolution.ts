import { type LinkError, LinkOutcome, LinkPlatform, resolveLink } from "@scribe/dynamic_links/mod.ts";
import { invite } from "./declarations.ts";

/** Where a visitor holding a slug is sent, and what the card shows on the way. */
export interface Landing {
  /** The application route to open, null for a link that only redirects. */
  readonly route: string | null;

  /** The web address to send a browser to, null when the declaration names none. */
  readonly target: string | null;

  /** The title a messenger unfurls, null when the declaration computes no preview. */
  readonly title: string | null;
}

/**
 * Resolves one slug and records what became of the visit.
 *
 * The answer is cached for ten minutes, the absence of an answer included: a slug nobody ever
 * created is what an address scanner asks for, and caching only the links that exist would
 * send every one of those queries to Postgres.
 */
export async function land(slug: string): Promise<Landing | LinkError> {
  const hit = await resolveLink(slug);
  if (!hit.ok) return hit.error;

  const link = hit.data;
  await link.record(LinkOutcome.OpenedApp, { platform: LinkPlatform.IOS });

  return { route: link.route, target: link.target, title: link.preview?.title ?? null };
}

/**
 * Narrows a resolved link to one declaration, which types its parameters with it.
 *
 * Before the test `args` is a bag of strings; inside it, it is what the declaration's template
 * writes, so a typo in a parameter name does not compile.
 */
export async function codeOf(slug: string): Promise<string | null> {
  const hit = await resolveLink(slug);
  if (!hit.ok) return null;

  return hit.data.declaredBy(invite) ? hit.data.args.code : null;
}

/** The visits one slug collected, a page at a time. */
export async function visits(slug: string): Promise<number> {
  const page = await invite.statistics(slug, { offset: 0, size: 30 });
  return page.ok ? page.data.items.length : 0;
}
