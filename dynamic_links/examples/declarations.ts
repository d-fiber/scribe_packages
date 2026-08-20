import { Time } from "@scribe/core/contracts/common/time.ts";
import { DynamicLink } from "@scribe/dynamic_links/mod.ts";

/**
 * A link the native application opens on a route, with an address for a browser beside it.
 *
 * The template carries its parameters in the type, so a call that forgets one does not
 * compile. A row holds the name of the declaration and those parameters, and nothing else:
 * where a link points is decided here, in code, rather than copied into every row when it was
 * created.
 */
export const invite = DynamicLink.deeplink("invite", "/invite/{code}", {
  web: ({ code }) => `https://example.app/invite/${code}`,
  preview: ({ code }) => ({ title: `Invitation ${code}` }),
  ttl: Time.days(30),
});

/**
 * A link that sends a visitor to the address its template renders.
 *
 * Without a `ttl` it resolves forever, which is what a campaign address wants.
 */
export const promo = DynamicLink.redirect("promo", "https://shop.example/{campaign}");

/**
 * Creates one link and answers the slug it took.
 *
 * Up to five slugs are drawn, because the table refuses one it already holds. Five collisions
 * in a row is not a collision, it is a table that stopped accepting the insert, so the failure
 * names the conflict rather than retrying forever.
 */
export async function inviteFor(code: string, userId: string): Promise<string | null> {
  const created = await invite.create({ code }, { userId });
  return created.ok ? created.data.slug : null;
}

/** A link of its own lifetime, which overrides what the declaration says. */
export async function shortLivedInvite(code: string): Promise<string | null> {
  const created = await invite.create({ code }, { expiresAt: Date.now() + Time.hours(1).ms });
  return created.ok ? created.data.slug : null;
}

/** Stops one slug from resolving, without touching the others of the same declaration. */
export async function cancel(slug: string): Promise<boolean> {
  const result = await invite.revoke(slug);
  return result.ok;
}
