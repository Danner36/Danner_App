export const PROVISIONING_WARNING_INSTRUCTION =
  'Connect to Wi-Fi and charge phone to fix';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WARNING_WINDOW_MS = 2 * DAY_MS;

export type ProvisioningWarning = {
  instruction: string;
  title: string;
};

export function getProvisioningWarning(
  expirationTimestamp: number | undefined,
  currentTimestamp: number,
): ProvisioningWarning | undefined {
  if (
    expirationTimestamp === undefined ||
    !Number.isFinite(expirationTimestamp) ||
    !Number.isFinite(currentTimestamp)
  ) {
    return undefined;
  }

  const remainingTime = expirationTimestamp - currentTimestamp;
  if (remainingTime > WARNING_WINDOW_MS) {
    return undefined;
  }

  let title: string;
  if (remainingTime <= 0) {
    title = 'App refresh needed';
  } else if (remainingTime < HOUR_MS) {
    title = 'Expires in less than 1 hour';
  } else if (remainingTime < DAY_MS) {
    const hours = Math.ceil(remainingTime / HOUR_MS);
    title = `Expires in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  } else {
    const days = Math.ceil(remainingTime / DAY_MS);
    title = `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
  }

  return {
    instruction: PROVISIONING_WARNING_INSTRUCTION,
    title,
  };
}
