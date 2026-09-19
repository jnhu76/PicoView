// Guest → Native command channel (PICOVIEW-REAL-VIEWER-TRAIN-1).
//
// The guest sends bounded JSON command lines to native via the PocketJS
// svcSend host op. Native drains them in Runtime::tick before the guest
// frame and processes them in the Product request phase.
//
// Wire protocol: {"t":"pv","cmd":"<name>",...args}
// All payloads are bounded scalars — no pixel bytes, no arrays.

import { getOps } from "@pocketjs/framework/host";

let channelConfirmed = false;

/** Check whether the native Picoview command channel is available.
 *  A false answer is never memoized: the host can install its command
 *  channel after guest boot (late host install), so availability keeps
 *  being re-probed until it answers true once. The cost is one bounded
 *  host op per unanswered user command. */
function ensureChannel(): boolean {
  if (channelConfirmed) return true;
  const ops = getOps();
  channelConfirmed = !!ops.svcOpen?.("picoview");
  return channelConfirmed;
}

/** Send a raw command object to native. Returns true if sent. */
function send(cmd: Record<string, unknown>): boolean {
  if (!ensureChannel()) return false;
  const ops = getOps();
  const line = JSON.stringify({ t: "pv", ...cmd });
  ops.svcSend?.(line);
  return true;
}

/** Navigate to the previous image in the directory. */
export function cmdPrevious(): boolean {
  return send({ cmd: "previous" });
}

/** Navigate to the next image in the directory. */
export function cmdNext(): boolean {
  return send({ cmd: "next" });
}

/** Refresh the current image (re-decode from disk). */
export function cmdRefresh(): boolean {
  return send({ cmd: "refresh" });
}

/** Ask the host to show a native Open File dialog (Windows UI thread). */
export function cmdPickFile(): boolean {
  return send({ cmd: "pick-file" });
}
