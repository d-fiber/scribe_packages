import { requestDevice } from "@scribe/runtime/device/device.ts";
import { SignUpError } from "@scribe/auth/lib/auth.ts";
import { operator, user } from "./declaration.ts";

/**
 * Creating an account with an address, which is the whole of what a route writes.
 *
 * `profile` and `settings` are the keys the declaration gave those tables. Their fields are the
 * ones it marked required, so a missing one is a compilation error rather than a row Postgres
 * refuses at three in the morning.
 */
export async function withEmail(email: string, password: string): Promise<string | SignUpError> {
  const device = await requestDevice();
  if (!device) return SignUpError.Unexpected;

  const created = await user.signUp.email({
    email,
    password,
    profile: { firstname: "Ada", lastname: "Lovelace" },
    settings: { localization: device.localization, theme_mode: device.theme_mode },
  });

  return created.ok ? created.data.device_token : SignUpError.Unexpected;
}

/** The same account through a number: only the credentials differ, the rows do not. */
export async function withPhone(phone: string, password: string): Promise<boolean> {
  const device = await requestDevice();
  if (!device) return false;

  const created = await user.signUp.phone({
    phone,
    password,
    profile: { firstname: "Ada", lastname: "Lovelace", birthday: 1815 },
    settings: { localization: device.localization, theme_mode: device.theme_mode },
  });

  return created.ok;
}

/** Through an identity Google vouched for, where there is no password to pick. */
export async function withGoogle(idToken: string, nonce: string): Promise<boolean> {
  const device = await requestDevice();
  if (!device) return false;

  const created = await user.signUp.google({
    idToken,
    nonce,
    profile: { firstname: "Ada", lastname: "Lovelace" },
    settings: { localization: device.localization, theme_mode: device.theme_mode },
  });

  return created.ok;
}

/**
 * A role with fewer tables asks for fewer keys, and one with none asks for none.
 *
 * Nothing here says which tables to write: the declaration did, and the input type came out of
 * it.
 */
export async function inviteOperator(email: string, password: string): Promise<boolean> {
  const created = await operator.signUp.email({
    email,
    password,
    profile: { firstname: "Grace", lastname: "Hopper" },
  });

  return created.ok;
}

/** What a caller is told when a sign-up is turned away. */
export function refusalOf(error: SignUpError): string {
  switch (error) {
    case SignUpError.EmailAlreadyExists:
      return "that address already has an account";
    case SignUpError.InvalidPassword:
      return "pick a longer password";
    case SignUpError.TooManyRequests:
      return "too many attempts, come back later";
    default:
      return "sign-up failed";
  }
}
