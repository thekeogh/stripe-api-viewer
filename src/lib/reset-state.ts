let resetting = false;

export function pauseAppForReset() {
  resetting = true;
}

export function isAppResetting() {
  return resetting;
}

export function assertAppNotResetting() {
  if (resetting)
    throw new Error("The app is being reset. Reload before continuing.");
}
