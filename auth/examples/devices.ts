import { user } from "./declaration.ts";

/**
 * The devices one account signs in from.
 *
 * Nothing declares them: the engine records one on every sign-in, decides whether it is trusted,
 * and sends a code when it is not. A route only ever lists them and throws one out.
 */
export function devicesOf(accountId: string): Promise<{ device_id: string; model: string; trusted: boolean }[]> {
  return user.devices.of(accountId).then((devices) =>
    devices.map((device) => ({
      device_id: device.device_id,
      model: device.model,
      trusted: device.trusted,
    }))
  );
}

/** Where one device was last used, for a screen that shows a session list. */
export async function lastSeen(accountId: string, deviceId: string): Promise<string | null> {
  const device = await user.devices.get(accountId, deviceId);
  return device === null ? null : `${device.city}, ${device.country}`;
}

/** Throwing one device out, which takes every session it holds with it. */
export function kick(accountId: string, deviceId: string): Promise<boolean> {
  return user.devices.kick(accountId, deviceId);
}

/**
 * Throwing every device out, one at a time so each one is announced.
 *
 * A call that names an account of another role answers as if it had none, because the devices of
 * every role share one table and the declaration is what scopes the question.
 */
export function kickAll(accountId: string): Promise<void> {
  return user.devices.kickAll(accountId);
}
