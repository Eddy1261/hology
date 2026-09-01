// FE-8 P0: data-page state classification — loading / unavailable / empty /
// ready. Distinguishes "nothing there" from "can't know yet" (gateway down
// must NEVER render as an empty list).

export type DataState = "loading" | "unavailable" | "empty" | "ready";

export function dataState(
  loading: boolean,
  online: boolean,
  hasData: boolean,
): DataState {
  if (loading) return "loading";
  if (!online && !hasData) return "unavailable";
  if (!hasData) return "empty";
  return "ready";
}
