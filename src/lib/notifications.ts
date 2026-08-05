// P5R: notification preference — ON = operational notifications allowed,
// OFF = non-critical notifications suppressed. Critical auth/security
// errors are ALWAYS shown regardless of this preference (toast system is
// unchanged). Persisted locally; purely a UI preference.

const KEY = "aiconnect.notifications";

export function notifPref(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(KEY) !== "off";
}

export function setNotifPref(on: boolean): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(KEY, on ? "on" : "off");
  }
}
