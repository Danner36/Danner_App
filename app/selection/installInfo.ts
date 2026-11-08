// Android package times in epoch milliseconds. iPhone exposes no equivalent.
export type InstallTimes = {
  firstInstallTime: number;
  lastUpdateTime: number;
};

const UPDATED_IN_PLACE_AFTER_MS = 60_000;

export function updatedInPlace(times: InstallTimes | undefined): boolean {
  return (
    times !== undefined &&
    times.lastUpdateTime - times.firstInstallTime > UPDATED_IN_PLACE_AFTER_MS
  );
}
