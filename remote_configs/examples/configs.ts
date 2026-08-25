import { Duration } from "@scribe/alchemy";
import { RemoteConfig } from "@scribe/remote_configs";

/** What the banner key holds. */
interface Banner {
  /** The line shown at the top of the application. */
  readonly message: string;

  /** Whether the banner can be dismissed. */
  readonly dismissible: boolean;
}

/**
 * A key with a default, which is what makes `get` answer a value rather than a value or null.
 *
 * The default lives in the code that reads the key, so a project that has written nothing into
 * the table still runs, and the answer of an empty table is written down rather than inferred.
 */
export const banner = RemoteConfig.of<Banner>("banner", {
  default: { message: "", dismissible: true },
  ttl: Duration.hours(2),
});

/** A key without a default, whose absence the caller has to answer for. */
export const supportEmail = RemoteConfig.of<string>("support-email", { ttl: Duration.hours(2) });

/** The value, cached for the declared lifetime, never null because the declaration has one. */
export function currentBanner(): Promise<Banner> {
  return banner.get();
}

/** The same read on a key with no default, which answers null when nothing was written. */
export function currentSupportEmail(): Promise<string | null> {
  return supportEmail.get();
}

/** Writes the value, creating the row when it is not there yet. */
export async function raiseBanner(message: string): Promise<boolean> {
  const result = await banner.set({ message, dismissible: true });
  return result.ok;
}

/** Writes it for a lifetime this call decides rather than the one the declaration names. */
export async function raiseBannerForADay(message: string): Promise<boolean> {
  const result = await banner.set({ message, dismissible: false }, { ttl: Duration.days(1) });
  return result.ok;
}

/** Pushes the expiry out without touching the value. */
export async function keepBanner(): Promise<boolean> {
  const result = await banner.ttl(Duration.hours(5));
  return result.ok;
}

/** Drops the row, which sends the next read back to the declared default. */
export async function clearBanner(): Promise<boolean> {
  const result = await banner.delete();
  return result.ok;
}
