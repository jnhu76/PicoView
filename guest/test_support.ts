// Shared guest test fixtures (post-release normalization C7).
//
// One home for the svc-line builders and the reducer fold every Current
// Item test module was re-declaring. Pure data + the pure reducer: no
// framework imports, so this file stays a helper (no tests of its own).

import {
  initialObserverState,
  reduceObserver,
  type ObserverState,
  type OpenIntent,
  type SvcLine,
} from "./observer.ts";

export function svcReady(
  g: number,
  handle: number,
  sw: number,
  sh: number,
  rw?: number,
  rh?: number,
  name = "a.jpg",
): SvcLine {
  const resourceW = rw ?? sw;
  const resourceH = rh ?? sh;
  return {
    t: "current-item",
    status: "ready",
    g,
    handle,
    sourceWidth: sw,
    sourceHeight: sh,
    resourceWidth: resourceW,
    resourceHeight: resourceH,
    fullResolution: sw === resourceW && sh === resourceH,
    name,
  };
}

export function svcLoading(g: number, intent: OpenIntent, name = "b.jpg"): SvcLine {
  return { t: "current-item", status: "loading", g, intent, name };
}

export function svcError(
  g: number,
  intent: OpenIntent,
  errorMsg = "could not decode image",
): SvcLine {
  return { t: "current-item", status: "error", g, intent, error: errorMsg };
}

/** Reduce a sequence of svc events from the initial state. */
export function fold(...events: SvcLine[]): ObserverState {
  let state = initialObserverState();
  for (const v of events) state = reduceObserver(state, v);
  return state;
}
