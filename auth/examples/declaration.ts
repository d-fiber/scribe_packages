import { Failure, okay, type Result } from "@scribe/alchemy";
import { Channel } from "../lib/contracts/channel.ts";
import { Account, Optional, type ReadSelector, Required, type WriteSelector } from "@scribe/auth/declaration";

/** A row of the project's own table, named because the package knows nothing of its schema. */
interface ProfileRow {
  account_id: string;
  first_name: string;
  last_name: string;
  birthday: number | null;
  avatar_url: string | null;
}

/** Another one, filled at sign-up from what the request says about the device. */
interface SettingsRow {
  account_id: string;
  localization: string;
  theme_mode: string;
}

/** A table the account never writes, folded into a read because it hangs off the account. */
interface WalletRow {
  account_id: string;
  balance: number;
}

/** What this project refuses a sign-in for, beyond what the engine refuses on its own. */
export enum UserRefusal {
  /** The account exists but has not finished being set up. */
  OnboardingRequired = "onboarding_required",

  /** The account is fine but the country it is calling from is not served. */
  RegionUnavailable = "region_unavailable",
}

const SERVED = ["FR", "BE", "CH"];

/**
 * A role people sign themselves up for, through four doors.
 *
 * `signUp` says which rows a new account writes and which of their columns the caller fills;
 * `get` says what a read folds in and what it answers with. The two are apart on purpose: two
 * fields are asked for and four come back.
 */
export const user = Account("user", {
  channels: [Channel.Email, Channel.Phone, Channel.Google, Channel.Apple],

  signUp: (s) => ({
    profile: s.embed("app_user_profiles", (p: WriteSelector<ProfileRow>) => ({
      firstname: Required(p.first_name),
      lastname: Required(p.last_name),
      birthday: Optional(p.birthday),
    })),
    settings: s.embed("app_user_settings", (t: WriteSelector<SettingsRow>) => ({
      localization: Required(t.localization),
      theme_mode: Required(t.theme_mode),
    })),
  }),

  get: (s) => ({
    profile: s.embed("app_user_profiles", (p: ReadSelector<ProfileRow>) => ({
      firstname: p.first_name,
      lastname: p.last_name,
      birthday: p.birthday,
      avatar: p.avatar_url,
    })),
    settings: s.embed("app_user_settings", (t: ReadSelector<SettingsRow>) => ({
      theme: t.theme_mode,
      locale: t.localization,
    })),
    wallet: s.embed("app_user_wallets", (w: ReadSelector<WalletRow>) => ({ balance: w.balance })),
  }),

  signIn: ({ account, location }): Result<void, UserRefusal> => {
    if (!SERVED.includes(location.country)) return new Failure(UserRefusal.RegionUnavailable);
    if (account.profile === null) return new Failure(UserRefusal.OnboardingRequired);
    return okay;
  },
});

/**
 * A role somebody already inside creates, through one door.
 *
 * `Creation.Invited` is what says the address is taken on trust: there is nobody to send a
 * confirmation link to who is not already reachable by whoever typed it.
 */
export const operator = Account("operator", {
  channels: [Channel.Email],
  autoConfirm: true,

  signUp: (s) => ({
    profile: s.embed("app_operator_profiles", (p: WriteSelector<ProfileRow>) => ({
      firstname: Required(p.first_name),
      lastname: Required(p.last_name),
    })),
  }),

  get: (s) => ({
    profile: s.embed("app_operator_profiles", (p: ReadSelector<ProfileRow>) => ({
      firstname: p.first_name,
      lastname: p.last_name,
    })),
  }),
});

/**
 * A role that adds nothing to what the engine already holds.
 *
 * Two empty braces rather than two absent keys: they say the role asks for nothing and answers
 * nothing extra, where an absent key would read as a declaration nobody finished.
 */
export const guest = Account("guest", {
  channels: [Channel.Email],
  signUp: () => ({}),
  get: () => ({}),
});
