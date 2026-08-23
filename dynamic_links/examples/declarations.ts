import { Duration } from "@scribe/alchemy";
import { DynamicLink, Link, LinkPlatform } from "@scribe/dynamic_links/mod.ts";

/** What an invitation link carries to the application that opens it. */
export interface Invite {
  /** The code the invited account redeems. */
  code: string;

  /** The account that sent the invitation. */
  invitedBy: string;
}

/** What a share link carries to the page it lands on. */
export interface Shared {
  /** The page the share was made from. */
  from: string;

  /** The account that shared it. */
  sharedBy: string;
}

/**
 * A link the native application opens on a route.
 *
 * A row holds the name of the declaration and the data, and nothing else: where the link points
 * is decided here, so changing the route changes every link already handed out.
 */
export const invite = DynamicLink.deeplink<Invite>("invite", {
  path: "/invite/{code}",
  ttl: Duration.days(30),
});

/**
 * A link that sends a visitor to the address its template renders.
 *
 * Without a `ttl` it resolves forever, which is what a campaign address wants.
 */
export const partner = DynamicLink.redirect<Shared>("partner", {
  url: "https://partner.example/from/{from}",
  ttl: Duration.days(10),
});

/**
 * A link with no route and no data, which sends whoever has no application to its store.
 *
 * The application opens on its own root when it is installed, so nothing has to be named.
 */
export const install = DynamicLink.deeplink("install");

/**
 * A link whose destination is decided per visit rather than declared.
 *
 * It is the only declaration that carries code, and it reads what the page knows: the platform,
 * the country, whether a robot is asking. The server never learns whether the application is
 * installed, so the application is attempted and the fallback is what most visitors get.
 */
export const shared = DynamicLink.routed<Invite>("shared", {
  ttl: Duration.days(30),
  decide: (visit, data) =>
    visit.platform === LinkPlatform.Web
      ? Link.web(`https://example.app/i/${data.code}`)
      : Link.app(`/invite/${data.code}`, { fallback: Link.store() }),
});

/** Creates one link and answers the slug it took. */
export async function inviteFor(
  code: string,
  invitedBy: string,
): Promise<string | null> {
  const created = await invite.create({ code, invitedBy });
  return created.ok ? created.data.slug : null;
}

/** A link of its own lifetime, which overrides what the declaration says. */
export async function shortLivedInvite(
  code: string,
  invitedBy: string,
): Promise<string | null> {
  const created = await invite.create(
    { code, invitedBy },
    {
      expiresAt: Date.now() + Duration.hours(1).inMilliseconds,
    },
  );
  return created.ok ? created.data.slug : null;
}

/** Stops one slug from resolving, without touching the others of the same declaration. */
export async function cancel(slug: string): Promise<boolean> {
  const result = await invite.revoke(slug);
  return result.ok;
}
